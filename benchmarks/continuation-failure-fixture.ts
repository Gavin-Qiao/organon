#!/usr/bin/env bun
/** Mint a missing-evidence/interrupted-work fixture; never accepts a project root. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadContinuitySuite, runContinuityBenchmark, assertDisposableWorkspace } from "./promptus-continuity.ts";
import { collectUnits } from "../promptus/scripts/lib/read-store.ts";
import { loadVocab } from "../promptus/scripts/lib/vocab.ts";
import { hashStore } from "../promptus/scripts/lib/store-hash.ts";
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--output") throw Error("usage: continuation-failure-fixture --output <new receipt>");
const output = resolve(args[1]);
if (existsSync(output) || dirname(output) !== join(import.meta.dir, "results")) throw Error("receipt must be new and in benchmarks/results");
const suite = loadContinuitySuite(), report: any = runContinuityBenchmark(suite, { keepWorkspace: true });
const root = report.isolation.workspaceRoot;
assertDisposableWorkspace(root, sha(JSON.stringify(suite)));
const before = hashStore(root), units = collectUnits(root, loadVocab(root));
const retained = mkdtempSync(join(tmpdir(), "organon-retained-evidence-"));
renameSync(join(root, "artifacts/northbridge-run.txt"), join(retained, "northbridge-run.txt"));
mkdirSync(join(root, "work"));
writeFileSync(join(root, "work/replication.partial.json"), JSON.stringify({ job: "synthetic-blinded-replication", status: "started", completedBatches: 0, intendedBatches: 4, output: "work/replication-result.json", note: "Interrupted session checkpoint, not evidence of a live process or completed run." }, null, 2) + "\n");
const preflight = spawnSync(process.execPath, [join(import.meta.dir, "../promptus/scripts/promptus-session-doctor.ts"), "--root", root, "--artifacts", "--json"], { encoding: "utf8" });
if (preflight.status !== 1) throw Error("missing artifact did not fail preflight");
writeFileSync(output, JSON.stringify({ schema: "organon.continuation-failure-fixture.v1", created: new Date().toISOString(), root, retainedArtifactDirectory: retained, fixtureHash: sha(JSON.stringify(suite)), harnessHash: sha(readFileSync(import.meta.path)), before, prepared: hashStore(root), preservedUnits: units.map(u => ({ id: u.id, path: u.relPath, substrate: u.substrate, textHash: sha(u.text) })), missingArtifact: "artifacts/northbridge-run.txt", partial: "work/replication.partial.json", preflight: { status: preflight.status, report: JSON.parse(preflight.stdout) } }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, root, before, artifactPreflightExit: preflight.status }));
