#!/usr/bin/env bun
/**
 * Compare Promptus's current lexical retriever with dense and hybrid rankings.
 *
 * This is deliberately outside the shipped plugin. It reads the current derived
 * search index, fetches authoritative unit text, and writes only a disposable
 * embedding cache under .promptus/cache/. Remote use is explicit because the
 * free providers tested here are not Zero Data Retention endpoints.
 */

import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseFrontmatter } from "../promptus/scripts/lib/frontmatter.ts";
import { derivedDir, findProjectRoot } from "../promptus/scripts/lib/paths.ts";
import {
  SEARCH_INDEX_SCHEMA, searchIndex, type SearchDocument, type SearchIndex,
} from "../promptus/scripts/lib/search.ts";
import { unitText } from "../promptus/scripts/lib/units.ts";

export const BENCHMARK_SCHEMA = "promptus.retrieval-benchmark.v1" as const;
const CACHE_SCHEMA = "promptus.embedding-benchmark-cache.v1" as const;
const DEFAULT_MODEL = "nvidia/nemotron-3-embed-1b:free";
const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/embeddings";
const DEFAULT_MAX_BYTES = 1_400;
const DEFAULT_BATCH_SIZE = 32;
const INACTIVE = new Set(["SUPERSEDED", "REFUTED", "RETIRED", "UNTRUSTED"]);

interface ModelProfile {
  queryPrefix: string;
  documentPrefix: string;
  maxBytes: number;
}

function modelProfile(model: string): ModelProfile {
  if (model.startsWith("nvidia/nemotron-3-embed-1b")) {
    return { queryPrefix: "query: ", documentPrefix: "passage: ", maxBytes: DEFAULT_MAX_BYTES };
  }
  if (model.startsWith("nvidia/Nemotron-3-Embed-8B") || model.startsWith("nvidia/nemotron-3-embed-8b")) {
    return { queryPrefix: "query: ", documentPrefix: "passage: ", maxBytes: DEFAULT_MAX_BYTES };
  }
  if (model.startsWith("liquid/lfm-2.5-embedding-350m")) {
    // A byte ceiling is conservative for the provider's 512-token route and
    // avoids repeating the first trial's 554-token rejection.
    return { queryPrefix: "query: ", documentPrefix: "document: ", maxBytes: 384 };
  }
  throw new Error(`no query/document prefix profile for model: ${model}`);
}

export interface RetrievalCase {
  query: string;
  relevant: string[];
}

interface BenchmarkSuite {
  schema: typeof BENCHMARK_SCHEMA;
  name: string;
  description?: string;
  requireActiveTargets?: boolean;
  cases: RetrievalCase[];
}

interface CacheEntry {
  hash: string;
  vector: number[];
}

interface EmbeddingCache {
  schema: typeof CACHE_SCHEMA;
  model: string;
  entries: Record<string, CacheEntry>;
}

interface EmbedItem {
  key: string;
  text: string;
}

interface RankedDocument {
  key: string;
  score: number;
}

interface Metrics {
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  inactiveAt10: number;
}

interface Options {
  root: string;
  cases: string;
  model: string;
  endpoint: string;
  batchSize: number;
  maxBytes: number;
  queryPrefix: string;
  documentPrefix: string;
  dryRun: boolean;
  remotePolicy: "none" | "public" | "zdr";
  localModel?: string;
  python: string;
  dimensions: number;
  refresh: boolean;
}

const HELP = `promptus-retrieval — benchmark lexical vs dense vs hybrid retrieval
usage:
  bun benchmarks/promptus-retrieval.ts [--dry-run | --allow-public-remote | --require-zdr]
      [--root <dir>] [--cases <json>] [--model <id>]
      [--local-model <checkpoint>] [--python <path>] [--dimensions <n>]
      [--batch-size <n>] [--max-bytes <n>] [--refresh]

safety:
  --dry-run             inspect cases, lexical metrics, chunks, and planned calls; no network or writes
  --allow-public-remote assert the corpus is public/non-sensitive; its provider may retain or train
  --require-zdr         send only through an endpoint OpenRouter marks Zero Data Retention
  --local-model <path>  run the model locally; no text or vectors leave this machine
  --refresh             ignore cached vectors and request them again

credentials:
  OPENROUTER_API_KEY is read from the environment. From this repo root, Bun also
  loads the gitignored .env.local file automatically. Local mode needs no key.`;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function finitePositive(value: string | undefined, fallback: number, flag: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function parseArgs(argv: string[]): Options | "help" {
  if (argv.includes("--help") || argv.includes("-h")) return "help";
  const values = new Map<string, string>();
  const switches = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`unexpected positional argument: ${arg}`);
    if (["--dry-run", "--allow-public-remote", "--require-zdr", "--refresh"].includes(arg)) {
      switches.add(arg);
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) throw new Error(`${arg} requires a value`);
    values.set(arg, next);
    i++;
  }
  const known = new Set([
    "--root", "--cases", "--model", "--local-model", "--python", "--dimensions",
    "--batch-size", "--max-bytes",
  ]);
  for (const key of values.keys()) if (!known.has(key)) throw new Error(`unknown flag: ${key}`);
  const root = findProjectRoot(values.get("--root") ?? process.cwd());
  const casesArg = values.get("--cases") ?? join(import.meta.dir, "retrieval-cases.json");
  const localModel = values.get("--local-model");
  const model = values.get("--model")
    ?? (localModel ? "nvidia/Nemotron-3-Embed-8B-BF16" : DEFAULT_MODEL);
  const profile = modelProfile(model);
  const publicRemote = switches.has("--allow-public-remote");
  const requireZdr = switches.has("--require-zdr");
  if (publicRemote && requireZdr) throw new Error("choose one remote policy, not both");
  if (localModel && (publicRemote || requireZdr)) throw new Error("local mode cannot be combined with a remote policy");
  return {
    root,
    cases: isAbsolute(casesArg) ? casesArg : resolve(process.cwd(), casesArg),
    model,
    endpoint: DEFAULT_ENDPOINT,
    batchSize: finitePositive(values.get("--batch-size"), DEFAULT_BATCH_SIZE, "--batch-size"),
    maxBytes: finitePositive(values.get("--max-bytes"), profile.maxBytes, "--max-bytes"),
    queryPrefix: profile.queryPrefix,
    documentPrefix: profile.documentPrefix,
    dryRun: switches.has("--dry-run"),
    remotePolicy: publicRemote ? "public" : requireZdr ? "zdr" : "none",
    localModel: localModel ? resolve(localModel) : undefined,
    python: resolve(values.get("--python")
      ?? join(derivedDir(root), "retrieval-benchmark", "venv", "bin", "python")),
    dimensions: finitePositive(values.get("--dimensions"), 4_096, "--dimensions"),
    refresh: switches.has("--refresh"),
  };
}

function loadSuite(path: string): BenchmarkSuite {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<BenchmarkSuite>;
  if (parsed.schema !== BENCHMARK_SCHEMA || typeof parsed.name !== "string" || !Array.isArray(parsed.cases)) {
    throw new Error(`invalid benchmark suite: ${path}`);
  }
  for (const [index, item] of parsed.cases.entries()) {
    if (!item || typeof item.query !== "string" || !item.query.trim()
      || !Array.isArray(item.relevant) || !item.relevant.length
      || item.relevant.some((target) => typeof target !== "string" || !target.trim())) {
      throw new Error(`invalid benchmark case at index ${index}`);
    }
  }
  return parsed as BenchmarkSuite;
}

function loadFreshIndex(root: string): SearchIndex {
  const cacheDir = derivedDir(root);
  const catalogPath = join(cacheDir, "CATALOG.md");
  const searchPath = join(cacheDir, "search.json");
  if (!existsSync(catalogPath) || !existsSync(searchPath)) {
    throw new Error("derived retrieval cache missing; run `bun promptus/scripts/kb-index.ts` first");
  }
  const catalog = readFileSync(catalogPath, "utf8");
  const index = JSON.parse(readFileSync(searchPath, "utf8")) as SearchIndex;
  if (index.schema !== SEARCH_INDEX_SCHEMA || index.catalogHash !== sha256(catalog)) {
    throw new Error("derived retrieval cache is stale; run `bun promptus/scripts/kb-index.ts` first");
  }
  return index;
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function splitLong(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    if (utf8Bytes(word) > maxBytes) {
      if (current) { chunks.push(current); current = ""; }
      let hard = "";
      for (const point of word) {
        if (utf8Bytes(point) > maxBytes) throw new Error("--max-bytes cannot hold one Unicode code point");
        if (hard && utf8Bytes(hard + point) > maxBytes) { chunks.push(hard); hard = point; }
        else hard += point;
      }
      if (hard) chunks.push(hard);
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (utf8Bytes(candidate) <= maxBytes) current = candidate;
    else { chunks.push(current); current = word; }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Create byte-bounded passage inputs while retaining the unit title on every chunk. */
export function documentChunks(
  document: Pick<SearchDocument, "key" | "title">,
  markdown: string,
  maxBytes = DEFAULT_MAX_BYTES,
  documentPrefix = "passage: ",
): EmbedItem[] {
  const prefix = `${documentPrefix}${document.title}\n`;
  if (utf8Bytes(prefix) >= maxBytes) throw new Error(`--max-bytes is too small for title: ${document.title}`);
  const room = maxBytes - utf8Bytes(prefix);
  const body = parseFrontmatter(markdown).body
    .replace(/^#\s+.*(?:\r?\n|$)/, "")
    .trim();
  const paragraphs = body
    .split(/\n\s*\n/)
    .flatMap((paragraph) => splitLong(paragraph.replace(/\s+/g, " "), room));
  const packed: string[] = [];
  let current = "";
  for (const paragraph of paragraphs.length ? paragraphs : [document.title]) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (utf8Bytes(candidate) <= room) current = candidate;
    else {
      if (current) packed.push(current);
      current = paragraph;
    }
  }
  if (current) packed.push(current);
  return packed.map((chunk, index) => ({
    key: `document:${document.key}:${index}`,
    text: `${prefix}${chunk}`,
  }));
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) throw new Error("embedding dimensions do not match");
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i++) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  if (!leftNorm || !rightNorm) throw new Error("embedding vector has zero norm");
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function reciprocalRankFusion(rankings: string[][], constant = 60): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((key, index) => scores.set(key, (scores.get(key) ?? 0) + 1 / (constant + index + 1)));
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key]) => key);
}

/**
 * Fixed, lifecycle-aware candidate policy registered before the local benchmark:
 * reserve five top-10 slots for each retriever by alternating active lexical and
 * active dense candidates, then append the active reciprocal-rank-fused tail.
 */
export function lifecycleAwareCandidateUnion(
  lexical: string[],
  dense: string[],
  documents: Map<string, Pick<SearchDocument, "status">>,
  perRoute = 5,
): string[] {
  const active = (ranking: string[]) => ranking.filter((key) =>
    !INACTIVE.has((documents.get(key)?.status ?? "").toUpperCase()));
  const lexicalActive = active(lexical);
  const denseActive = active(dense);
  const prefix: string[] = [];
  for (let index = 0; index < perRoute; index++) {
    for (const ranking of [lexicalActive, denseActive]) {
      const key = ranking[index];
      if (key && !prefix.includes(key)) prefix.push(key);
    }
  }
  const seen = new Set(prefix);
  const tail = reciprocalRankFusion([lexicalActive, denseActive]).filter((key) => !seen.has(key));
  return [...prefix, ...tail];
}

function resolveRelevant(
  cases: RetrievalCase[],
  documents: SearchDocument[],
  requireActiveTargets = false,
): Array<Set<string>> {
  return cases.map((item, caseIndex) => new Set(item.relevant.map((target) => {
    const matches = documents.filter((document) =>
      document.key === target || document.id === target || document.path === target || document.title === target);
    if (matches.length !== 1) {
      throw new Error(`case ${caseIndex + 1} target ${JSON.stringify(target)} resolved to ${matches.length} units`);
    }
    if (requireActiveTargets && INACTIVE.has(matches[0].status.toUpperCase())) {
      throw new Error(
        `case ${caseIndex + 1} target ${JSON.stringify(target)} is lifecycle-inactive (${matches[0].status})`,
      );
    }
    return matches[0].key;
  })));
}

function firstRelevantRank(ranking: string[], relevant: Set<string>): number | null {
  const index = ranking.findIndex((key) => relevant.has(key));
  return index < 0 ? null : index + 1;
}

export function evaluateRankings(
  rankings: string[][],
  relevant: Array<Set<string>>,
  documents: Map<string, Pick<SearchDocument, "status">>,
): Metrics {
  if (rankings.length !== relevant.length || !rankings.length) throw new Error("rankings and cases must align");
  let hits5 = 0;
  let hits10 = 0;
  let reciprocal = 0;
  let inactive = 0;
  let top10 = 0;
  rankings.forEach((ranking, index) => {
    const rank = firstRelevantRank(ranking, relevant[index]);
    if (rank !== null && rank <= 5) hits5++;
    if (rank !== null && rank <= 10) hits10++;
    if (rank !== null) reciprocal += 1 / rank;
    for (const key of ranking.slice(0, 10)) {
      top10++;
      if (INACTIVE.has((documents.get(key)?.status ?? "").toUpperCase())) inactive++;
    }
  });
  return {
    recallAt5: hits5 / rankings.length,
    recallAt10: hits10 / rankings.length,
    mrr: reciprocal / rankings.length,
    inactiveAt10: top10 ? inactive / top10 : 0,
  };
}

function emptyCache(model: string): EmbeddingCache {
  return { schema: CACHE_SCHEMA, model, entries: {} };
}

function loadCache(path: string, model: string): EmbeddingCache {
  if (!existsSync(path)) return emptyCache(model);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as EmbeddingCache;
    return parsed.schema === CACHE_SCHEMA && parsed.model === model ? parsed : emptyCache(model);
  } catch {
    return emptyCache(model);
  }
}

function saveCache(path: string, cache: EmbeddingCache): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(cache)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

async function requestEmbeddings(
  endpoint: string,
  apiKey: string,
  model: string,
  inputs: string[],
  remotePolicy: Options["remotePolicy"],
): Promise<number[][]> {
  const body: Record<string, unknown> = { model, input: inputs, encoding_format: "float" };
  if (remotePolicy === "zdr") body.provider = { zdr: true, data_collection: "deny" };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`embedding request failed (${response.status}): ${raw.slice(0, 500)}`);
  const parsed = JSON.parse(raw) as { data?: Array<{ index?: number; embedding?: number[] }> };
  const rows = [...(parsed.data ?? [])].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  if (rows.length !== inputs.length || rows.some((row) => !Array.isArray(row.embedding))) {
    throw new Error(`embedding response returned ${rows.length} vectors for ${inputs.length} inputs`);
  }
  return rows.map((row) => row.embedding!);
}

async function fillEmbeddings(
  items: EmbedItem[],
  options: Options,
  cachePath: string,
): Promise<{ vectors: Map<string, number[]>; requested: number; requests: number }> {
  const cache = loadCache(cachePath, options.model);
  const vectors = new Map<string, number[]>();
  const missing: EmbedItem[] = [];
  for (const item of items) {
    const hash = sha256(`${options.model}\n${item.text}`);
    const cached = options.refresh ? undefined : cache.entries[item.key];
    if (cached?.hash === hash && cached.vector.length) vectors.set(item.key, cached.vector);
    else missing.push(item);
  }
  if (!missing.length) return { vectors, requested: 0, requests: 0 };
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is missing; put it in the gitignored .env.local file");
  let requests = 0;
  for (let offset = 0; offset < missing.length; offset += options.batchSize) {
    const batch = missing.slice(offset, offset + options.batchSize);
    let embedded: number[][];
    try {
      embedded = await requestEmbeddings(
        options.endpoint, apiKey, options.model, batch.map((item) => item.text), options.remotePolicy,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`batch ${offset + 1}-${offset + batch.length} of ${missing.length}: ${detail}`);
    }
    batch.forEach((item, index) => {
      const vector = embedded[index];
      const hash = sha256(`${options.model}\n${item.text}`);
      cache.entries[item.key] = { hash, vector };
      vectors.set(item.key, vector);
    });
    requests++;
    saveCache(cachePath, cache);
    console.log(`  embedded ${Math.min(offset + batch.length, missing.length)}/${missing.length} uncached inputs`);
  }
  return { vectors, requested: missing.length, requests };
}

interface LocalEmbeddingResponse {
  schema: "promptus.local-embedding-response.v1";
  model: string;
  dimensions: number;
  runtime: {
    device: string;
    gpu?: string;
    torch: string;
    transformers: string;
    sentenceTransformers: string;
    elapsedSeconds: number;
  };
  items: Array<{ key: string; vector: number[] }>;
}

function localCacheIdentity(options: Options): string {
  return `local:${options.model}:${options.localModel}:${options.dimensions}`;
}

async function fillLocalEmbeddings(
  items: EmbedItem[],
  options: Options,
  cachePath: string,
): Promise<{
  vectors: Map<string, number[]>;
  requested: number;
  requests: number;
  runtime?: LocalEmbeddingResponse["runtime"];
}> {
  if (!options.localModel || !existsSync(options.localModel)) {
    throw new Error(`local model checkpoint is missing: ${options.localModel ?? "(unset)"}`);
  }
  if (!existsSync(options.python)) throw new Error(`local Python is missing: ${options.python}`);
  const identity = localCacheIdentity(options);
  const cache = loadCache(cachePath, identity);
  const vectors = new Map<string, number[]>();
  const missing: EmbedItem[] = [];
  for (const item of items) {
    const hash = sha256(`${identity}\n${item.text}`);
    const cached = options.refresh ? undefined : cache.entries[item.key];
    if (cached?.hash === hash && cached.vector.length === options.dimensions) vectors.set(item.key, cached.vector);
    else missing.push(item);
  }
  if (!missing.length) return { vectors, requested: 0, requests: 0 };

  const temporaryDir = join(dirname(cachePath), "tmp");
  mkdirSync(temporaryDir, { recursive: true });
  const nonce = `${process.pid}-${Date.now()}`;
  const requestPath = join(temporaryDir, `request-${nonce}.json`);
  const responsePath = join(temporaryDir, `response-${nonce}.json`);
  writeFileSync(requestPath, `${JSON.stringify({
    schema: "promptus.local-embedding-request.v1",
    model: options.model,
    items: missing,
  })}\n`, { mode: 0o600 });

  try {
    const helper = join(import.meta.dir, "local-embed.py");
    const child = Bun.spawn([
      options.python, helper,
      "--model", options.localModel,
      "--input", requestPath,
      "--output", responsePath,
      "--batch-size", String(options.batchSize),
      "--dimensions", String(options.dimensions),
    ], {
      cwd: options.root,
      env: {
        ...process.env,
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        TOKENIZERS_PARALLELISM: "false",
      },
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await child.exited;
    if (exitCode !== 0) throw new Error(`local embedding helper exited ${exitCode}`);
    const response = JSON.parse(readFileSync(responsePath, "utf8")) as LocalEmbeddingResponse;
    if (response.schema !== "promptus.local-embedding-response.v1"
      || response.model !== options.model
      || response.dimensions !== options.dimensions
      || response.items.length !== missing.length) {
      throw new Error("local embedding helper returned an incompatible response");
    }
    const byKey = new Map(response.items.map((item) => [item.key, item.vector]));
    for (const item of missing) {
      const vector = byKey.get(item.key);
      if (!vector || vector.length !== options.dimensions || vector.some((value) => !Number.isFinite(value))) {
        throw new Error(`local embedding helper returned an invalid vector: ${item.key}`);
      }
      const hash = sha256(`${identity}\n${item.text}`);
      cache.entries[item.key] = { hash, vector };
      vectors.set(item.key, vector);
    }
    saveCache(cachePath, cache);
    return { vectors, requested: missing.length, requests: 1, runtime: response.runtime };
  } finally {
    rmSync(requestPath, { force: true });
    rmSync(responsePath, { force: true });
  }
}

function formatMetric(value: number): string {
  return value.toFixed(3);
}

function printMetrics(label: string, metrics: Metrics): void {
  console.log(
    `${label.padEnd(13)} R@5 ${formatMetric(metrics.recallAt5)} · R@10 ${formatMetric(metrics.recallAt10)}`
    + ` · MRR ${formatMetric(metrics.mrr)} · inactive/untrusted@10 ${formatMetric(metrics.inactiveAt10)}`,
  );
}

export async function main(argv: string[]): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (parsed === "help") { console.log(HELP); return 0; }
    const options = parsed;
    if (options.dryRun && options.remotePolicy !== "none") {
      throw new Error("choose either --dry-run or a remote policy, not both");
    }
    if (options.dryRun && options.localModel) {
      throw new Error("omit --local-model for a dry-run; use --model to inspect its profile");
    }
    if (!options.dryRun && options.remotePolicy === "none" && !options.localModel) {
      throw new Error("choose local inference or pass --allow-public-remote/--require-zdr explicitly");
    }

    const suite = loadSuite(options.cases);
    const index = loadFreshIndex(options.root);
    const documents = index.documents.filter((document) => !document.cold);
    const documentByKey = new Map(documents.map((document) => [document.key, document]));
    const relevant = resolveRelevant(suite.cases, documents, suite.requireActiveTargets ?? false);
    const textOf = (document: SearchDocument) => unitText(options.root, document.path, document.title);
    const lexicalRankings = suite.cases.map((item) =>
      searchIndex(index, item.query, {}, textOf).map((hit) => hit.document.key));
    const lexicalMetrics = evaluateRankings(lexicalRankings, relevant, documentByKey);
    const chunks = documents.flatMap((document) =>
      documentChunks(document, textOf(document), options.maxBytes, options.documentPrefix));
    const queryItems = suite.cases.map((item, index) => ({
      key: `query:${index}:${sha256(item.query).slice(0, 16)}`,
      text: `${options.queryPrefix}${item.query}`,
    }));
    const totalInputs = chunks.length + queryItems.length;
    const plannedRequests = Math.ceil(totalInputs / options.batchSize);

    console.log(`Promptus retrieval benchmark — ${suite.name}`);
    console.log(`root     ${options.root}`);
    console.log(`corpus   ${documents.length} live units · ${chunks.length} document chunks · ${suite.cases.length} queries`);
    console.log(`model    ${options.model}`);
    const policy = options.dryRun ? "dry-run" : options.localModel ? "local-only" : options.remotePolicy;
    console.log(`policy   ${policy}`);
    printMetrics("lexical", lexicalMetrics);

    if (options.dryRun) {
      console.log(`dry-run  ${totalInputs} embedding inputs · up to ${plannedRequests} request(s) at batch size ${options.batchSize}`);
      console.log("No network calls or files were written.");
      return 0;
    }

    const cacheIdentity = options.localModel ? localCacheIdentity(options) : options.model;
    const cacheName = `${sha256(cacheIdentity).slice(0, 16)}.json`;
    const cachePath = join(derivedDir(options.root), "retrieval-benchmark", cacheName);
    const embedded = options.localModel
      ? await fillLocalEmbeddings([...chunks, ...queryItems], options, cachePath)
      : await fillEmbeddings([...chunks, ...queryItems], options, cachePath);
    const chunksByDocument = new Map<string, string[]>();
    for (const document of documents) {
      chunksByDocument.set(document.key, chunks.filter((chunk) => chunk.key.startsWith(`document:${document.key}:`)).map((chunk) => chunk.key));
    }

    const denseRankings: string[][] = [];
    const denseActiveRankings: string[][] = [];
    const hybridRankings: string[][] = [];
    const candidateRankings: string[][] = [];
    suite.cases.forEach((item, caseIndex) => {
      const queryVector = embedded.vectors.get(queryItems[caseIndex].key);
      if (!queryVector) throw new Error(`missing query embedding for case ${caseIndex + 1}`);
      const dense: RankedDocument[] = documents.map((document) => {
        const scores = (chunksByDocument.get(document.key) ?? []).map((key) => {
          const vector = embedded.vectors.get(key);
          if (!vector) throw new Error(`missing document embedding: ${key}`);
          return cosineSimilarity(queryVector, vector);
        });
        return { key: document.key, score: Math.max(...scores) };
      });
      dense.sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));
      const denseKeys = dense.map((item) => item.key);
      denseRankings.push(denseKeys);
      denseActiveRankings.push(denseKeys.filter((key) =>
        !INACTIVE.has((documentByKey.get(key)?.status ?? "").toUpperCase())));
      hybridRankings.push(reciprocalRankFusion([lexicalRankings[caseIndex], denseKeys]));
      candidateRankings.push(lifecycleAwareCandidateUnion(
        lexicalRankings[caseIndex], denseKeys, documentByKey,
      ));
    });

    const denseMetrics = evaluateRankings(denseRankings, relevant, documentByKey);
    const denseActiveMetrics = evaluateRankings(denseActiveRankings, relevant, documentByKey);
    const hybridMetrics = evaluateRankings(hybridRankings, relevant, documentByKey);
    const candidateMetrics = evaluateRankings(candidateRankings, relevant, documentByKey);
    printMetrics("dense", denseMetrics);
    printMetrics("dense-active", denseActiveMetrics);
    printMetrics("hybrid", hybridMetrics);
    printMetrics("candidate", candidateMetrics);
    console.log(`embed    ${embedded.requested} uncached input(s) across ${embedded.requests} run/request(s)`);
    if (embedded.runtime) {
      console.log(
        `runtime  ${embedded.runtime.gpu ?? embedded.runtime.device} · torch ${embedded.runtime.torch}`
        + ` · transformers ${embedded.runtime.transformers} · sentence-transformers ${embedded.runtime.sentenceTransformers}`
        + ` · ${embedded.runtime.elapsedSeconds.toFixed(1)}s`,
      );
    }
    console.log(`cache    ${cachePath}`);
    console.log("");
    suite.cases.forEach((item, index) => {
      const lexical = firstRelevantRank(lexicalRankings[index], relevant[index]);
      const dense = firstRelevantRank(denseRankings[index], relevant[index]);
      const denseActive = firstRelevantRank(denseActiveRankings[index], relevant[index]);
      const hybrid = firstRelevantRank(hybridRankings[index], relevant[index]);
      const candidate = firstRelevantRank(candidateRankings[index], relevant[index]);
      console.log(
        `${index + 1}. lexical ${lexical ?? "—"} · dense ${dense ?? "—"}`
        + ` · dense-active ${denseActive ?? "—"} · hybrid ${hybrid ?? "—"}`
        + ` · candidate ${candidate ?? "—"} — ${item.query}`,
      );
    });
    return 0;
  } catch (error) {
    console.error(`promptus-retrieval: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
