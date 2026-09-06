#!/usr/bin/env bun
/** Independently verify the bounded fresh-agent continuation against its frozen fixture receipt. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { assertDisposableWorkspace } from "./promptus-continuity.ts";
import { collectUnits } from "../promptus/scripts/lib/read-store.ts";
import { loadVocab } from "../promptus/scripts/lib/vocab.ts";
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== "--fixture" || args[2] !== "--output") throw Error("usage: continuation-failure-verify --fixture <frozen receipt> --output <new receipt>");
const input = resolve(args[1]), output = resolve(args[3]);
if (existsSync(output) || dirname(output) !== join(import.meta.dir, "results")) throw Error("new output must be in benchmarks/results");
const r = JSON.parse(readFileSync(input, "utf8")), hash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
if (r.schema !== "organon.continuation-failure-fixture.v1") throw Error("unknown fixture receipt");
assertDisposableWorkspace(r.root, r.fixtureHash);
const units = collectUnits(r.root, loadVocab(r.root));
const preserved = r.preservedUnits.map((p: any) => {
  const u = units.find(u => u.id === p.id);
  return { id: p.id, exact: !!u && hash(u.text) === p.textHash,
    // Canonical slices include the final append sentinel; adding a ledger entry
    // relocates that delimiter without changing the former final entry's bytes.
    sentinelRelocationOnly: !!u && u.substrate === "ledger" && hash(u.text + "<!-- kb:append-point -->\n") === p.textHash };
});
const execute = (script: string) => {
  const process = spawnSync(globalThis.process.execPath, [join(import.meta.dir, "../promptus/scripts", script), "--root", r.root, ...(script === "promptus-check.ts" ? ["--strict"] : ["--artifacts"]), "--json"], { encoding: "utf8" });
  return { status: process.status, report: JSON.parse(process.stdout) };
};
const health = execute("promptus-check.ts"), preflight = execute("promptus-session-doctor.ts");
const readiness = readFileSync(join(r.root, "work/readiness.md"), "utf8"), newUnits = units.filter(u => !r.preservedUnits.some((p: any) => p.id === u.id));
const checks = { oldBodiesPreserved: preserved.every((p: any) => p.exact || p.sentinelRelocationOnly), oneOpenHandoff: newUnits.length === 1 && newUnits[0].status === "OPEN", sourceArtifactStillMissing: !existsSync(join(r.root, r.missingArtifact)), resultStillAbsent: !existsSync(join(r.root, "work/replication-result.json")), freshHandoff: health.report.now.fresh === true, artifactHealthStillRed: health.status === 1 && health.report.artifactFailures.length === 1 && health.report.artifactFailures[0].outcome === "missing", artifactPreflightStillRed: preflight.status === 1 && preflight.report.issues.some((i: any) => i.code === "ARTIFACTS_FAIL_NOW") };
const passed = Object.values(checks).every(Boolean);
writeFileSync(output, JSON.stringify({ schema: "organon.gpt6-interrupted-continuation.v1", created: new Date().toISOString(), agent: "/root/gpt6_interrupted_continuation", model: "gpt-6-astra", freshContext: true, fixture: r.root, preparedReceipt: input, preparedReceiptHash: hash(readFileSync(input)), verifierHash: hash(readFileSync(import.meta.path)), passed, checks, preserved, newUnits: newUnits.map(u => ({ id: u.id, status: u.status, title: u.title })), readiness, readinessHash: hash(readiness), health, preflight, limitations: ["One synthetic fresh-agent task, not a replicated behavior comparison.", "Agent reports bounded process inspection; external process liveness was not proved.", "Parent verifies source custody and final outputs; not a full tool transcript."] }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, passed, checks })); if (!passed) process.exitCode = 1;
