#!/usr/bin/env bun
/**
 * changelog.ts — read the section for a version out of a CHANGELOG.
 *
 *   bun changelog.ts extract <version> [changelog]   print the section body (release notes)
 *   bun changelog.ts check   <version> [changelog]   assert the section exists and is non-empty
 *
 * <version> may be given with or without a leading "v" (release tags are
 * <plugin>-vX.Y.Z; the changelog heading is "## [X.Y.Z]"). [changelog] is a path
 * resolved from the working directory (e.g. editio/CHANGELOG.md) and defaults to
 * this plugin's own CHANGELOG.md. Exits non-zero when the section is absent or
 * empty — the release-note sanity gate the release workflow relies on.
 */
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, rawVersion, fileArg] = process.argv.slice(2);

if (!cmd || !["extract", "check"].includes(cmd) || !rawVersion) {
  console.error("usage: changelog.ts <extract|check> <version> [changelog-path]");
  process.exit(2);
}

const version = rawVersion.replace(/^v/, "");
const changelog = fileArg ? resolve(process.cwd(), fileArg) : join(root, "CHANGELOG.md");
const lines = readFileSync(changelog, "utf8").split(/\r?\n/);

const headRe = new RegExp(`^## \\[${version.replace(/\./g, "\\.")}\\]`);
const start = lines.findIndex((l) => headRe.test(l));
if (start === -1) {
  console.error(`${changelog} has no "## [${version}]" section — add one before releasing.`);
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^## /.test(lines[i]) || /^\[[^\]]+\]:/.test(lines[i])) {
    end = i;
    break;
  }
}

const body = lines.slice(start + 1, end).join("\n").trim();
if (!body) {
  console.error(`${changelog} section "## [${version}]" is empty — write the release notes before releasing.`);
  process.exit(1);
}

if (cmd === "extract") {
  process.stdout.write(body + "\n");
} else {
  console.log(`${changelog} [${version}] is present and non-empty (${body.split("\n").length} lines).`);
}
