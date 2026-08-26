/**
 * Disposable lexical retrieval index for Promptus.
 *
 * Markdown remains the source of truth. kb-index derives this compact BM25-style
 * index so kb-find does not rescan every unit for every query. No database and no
 * embeddings are involved.
 */

export const SEARCH_INDEX_SCHEMA = "promptus.lexical-search.v2" as const;

export interface SearchSourceDocument {
  substrate: string;
  status: string;
  title: string;
  path: string;
  text: string;
  id?: string;
  links: string[];
  cold?: boolean;
}

export interface SearchDocument {
  key: string;
  substrate: string;
  status: string;
  title: string;
  path: string;
  id?: string;
  links: string[];
  cold: boolean;
  length: number;
}

type Posting = [document: number, bodyTf: number, titleTf: number, pathTf: number];

export interface SearchIndex {
  schema: typeof SEARCH_INDEX_SCHEMA;
  catalogHash: string;
  averageLength: number;
  documents: SearchDocument[];
  postings: Record<string, Posting[]>;
}

export interface SearchOptions {
  substrate?: string;
  status?: string;
  history?: boolean;
  all?: boolean;
  includeInactive?: boolean;
}

export interface SearchHit {
  document: SearchDocument;
  score: number;
  matchedTerms: string[];
}

const INACTIVE = new Set(["SUPERSEDED", "REFUTED", "RETIRED"]);
const UNCERTAIN = new Set(["CONJECTURED", "CONFOUNDED", "PROVISIONAL", "CONTESTED", "UNTRUSTED"]);
const STRONG = new Set(["VALIDATED", "RESOLVED", "CITE"]);
const HISTORY_TERMS = new Set(["deadend", "failed", "failure", "history", "refuted", "retired", "superseded", "overturned"]);

/**
 * Stable IDs own modern result identity. Legacy units have no ID, so their full
 * address is the project-relative path plus title: ledger timestamps are only
 * second-granular and valid historical batches can share one anchor.
 */
export function searchResultKey(
  source: Pick<SearchSourceDocument, "id" | "path" | "title">,
): string {
  const id = source.id?.trim();
  return id || `legacy:${JSON.stringify([source.path, source.title])}`;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function searchTokens(value: string): string[] {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

function counts(tokens: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const token of tokens) result.set(token, (result.get(token) ?? 0) + 1);
  return result;
}

export function buildSearchIndex(
  sources: SearchSourceDocument[],
  catalogHash: string,
): SearchIndex {
  const documents: SearchDocument[] = [];
  const postings = new Map<string, Posting[]>();
  let totalLength = 0;

  sources.forEach((source, documentIndex) => {
    const body = counts(searchTokens(source.text));
    const title = counts(searchTokens(source.title));
    const path = counts(searchTokens(source.path));
    const length = Math.max(1, [...body.values()].reduce((sum, value) => sum + value, 0));
    totalLength += length;
    documents.push({
      key: searchResultKey(source),
      substrate: source.substrate,
      status: source.status,
      title: source.title,
      path: source.path,
      ...(source.id ? { id: source.id } : {}),
      links: source.links,
      cold: Boolean(source.cold),
      length,
    });
    const terms = new Set([...body.keys(), ...title.keys(), ...path.keys()]);
    for (const term of terms) {
      const posting: Posting = [
        documentIndex,
        body.get(term) ?? 0,
        title.get(term) ?? 0,
        path.get(term) ?? 0,
      ];
      const existing = postings.get(term);
      if (existing) existing.push(posting);
      else postings.set(term, [posting]);
    }
  });

  return {
    schema: SEARCH_INDEX_SCHEMA,
    catalogHash,
    averageLength: documents.length ? totalLength / documents.length : 1,
    documents,
    postings: Object.fromEntries([...postings.entries()].sort(([left], [right]) => left.localeCompare(right))),
  };
}

function queryParts(query: string): { terms: string[]; required: Set<string>; phrases: string[] } {
  const phrases: string[] = [];
  const withoutPhrases = query.replace(/"([^"]+)"/g, (_match, phrase: string) => {
    const normalized = normalizeSearchText(phrase);
    if (normalized) phrases.push(normalized);
    return " ";
  });
  const required = new Set<string>();
  const plain: string[] = [];
  for (const raw of withoutPhrases.split(/\s+/).filter(Boolean)) {
    const isRequired = raw.startsWith("+");
    const tokens = searchTokens(isRequired ? raw.slice(1) : raw);
    for (const token of tokens) {
      plain.push(token);
      if (isRequired) required.add(token);
    }
  }
  return { terms: [...new Set(plain)], required, phrases };
}

function statusWeight(status: string, historyIntent: boolean, includeInactive: boolean): number {
  const normalized = status.replace(/^[★⚠↩]/, "").trim().toUpperCase();
  if (INACTIVE.has(normalized)) return historyIntent || includeInactive ? 1 : 0.45;
  if (UNCERTAIN.has(normalized)) return 0.85;
  if (STRONG.has(normalized)) return 1.1;
  return 1;
}

export function searchIndex(
  index: SearchIndex,
  query: string,
  options: SearchOptions,
  textOf: (document: SearchDocument) => string,
): SearchHit[] {
  const { terms, required, phrases } = queryParts(query);
  const candidates = new Map<number, { score: number; matched: Set<string> }>();
  const visible = (document: SearchDocument): boolean =>
    (options.history || !document.cold)
    && (!options.substrate || document.substrate === options.substrate)
    && (!options.status || document.status === options.status);

  if (!terms.length) {
    index.documents.forEach((document, documentIndex) => {
      if (visible(document)) candidates.set(documentIndex, { score: 1, matched: new Set() });
    });
  }

  const numberOfDocuments = Math.max(1, index.documents.filter(visible).length);
  const averageLength = Math.max(1, index.averageLength);
  const k1 = 1.2;
  const b = 0.75;
  for (const term of terms) {
    const postings = index.postings[term] ?? [];
    const visiblePostings = postings.filter(([documentIndex]) => visible(index.documents[documentIndex]));
    const documentFrequency = visiblePostings.length;
    if (!documentFrequency) continue;
    const inverseDocumentFrequency = Math.log(
      1 + (numberOfDocuments - documentFrequency + 0.5) / (documentFrequency + 0.5),
    );
    for (const [documentIndex, bodyTf, titleTf, pathTf] of visiblePostings) {
      const document = index.documents[documentIndex];
      const tf = bodyTf + 2.5 * titleTf + 0.5 * pathTf;
      const denominator = tf + k1 * (1 - b + b * document.length / averageLength);
      const contribution = inverseDocumentFrequency * (tf * (k1 + 1)) / denominator;
      const current = candidates.get(documentIndex) ?? { score: 0, matched: new Set<string>() };
      current.score += contribution;
      current.matched.add(term);
      candidates.set(documentIndex, current);
    }
  }

  const historyIntent = terms.some((term) => HISTORY_TERMS.has(term));
  const results: SearchHit[] = [];
  for (const [documentIndex, candidate] of candidates) {
    const document = index.documents[documentIndex];
    if ([...required].some((term) => !candidate.matched.has(term))) continue;
    if (options.all && terms.some((term) => !candidate.matched.has(term))) continue;
    const normalizedText = phrases.length
      ? normalizeSearchText(`${document.title}\n${textOf(document)}`)
      : "";
    if (phrases.some((phrase) => !normalizedText.includes(phrase))) continue;
    let score = candidate.score;
    for (const phrase of phrases) {
      score += normalizeSearchText(document.title).includes(phrase) ? 8 : 3;
    }
    score *= statusWeight(document.status, historyIntent, Boolean(options.includeInactive));
    results.push({ document, score, matchedTerms: [...candidate.matched] });
  }

  return results.sort(
    (left, right) => right.score - left.score
      || left.document.cold.toString().localeCompare(right.document.cold.toString())
      || left.document.title.localeCompare(right.document.title),
  );
}
