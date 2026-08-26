import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

export interface ArtifactSpec {
  role: string;
  path: string;
  sha256?: string;
}

export function parseArtifactSpec(value: string): ArtifactSpec {
  const fields = value.split("|").map((field) => field.trim());
  if (fields.length < 2 || fields.length > 3 || !fields[0] || !fields[1]) {
    throw new Error(`artifact must be role|relative/path|sha256-or--: ${value}`);
  }
  const [role, path, hash = "-"] = fields;
  if (!/^[a-z][a-z0-9_-]*$/i.test(role)) throw new Error(`invalid artifact role "${role}"`);
  if (isAbsolute(path) || path.split(/[\\/]+/).includes("..")) throw new Error(`artifact path must stay inside the project: ${path}`);
  if (hash !== "-" && !/^[a-f0-9]{64}$/i.test(hash)) throw new Error(`artifact hash must be 64 hexadecimal SHA-256 characters or '-': ${hash}`);
  return { role, path: path.replace(/\\/g, "/"), ...(hash === "-" ? {} : { sha256: hash.toLowerCase() }) };
}

export function serializeArtifactSpec(spec: ArtifactSpec): string {
  return `${spec.role}|${spec.path}|${spec.sha256 ?? "-"}`;
}

export type ArtifactCheck = ArtifactSpec & {
  ok: boolean;
  outcome: "ok" | "missing" | "not-file" | "outside-root" | "hash-mismatch";
  actualSha256?: string;
};

/** Exact SHA-256 with bounded resident memory. */
export function hashArtifactFile(path: string, bufferBytes = 1024 * 1024): string {
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(bufferBytes);
  const hash = createHash("sha256");
  try {
    while (true) {
      const bytes = readSync(descriptor, buffer, 0, buffer.byteLength, null);
      if (!bytes) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

/**
 * Verify every owner while resolving each declared path and hashing each
 * canonical regular file at most once. Result order matches input order.
 */
export function checkArtifacts(root: string, specs: ArtifactSpec[]): ArtifactCheck[] {
  const project = realpathSync(resolve(root));
  const results = new Array<ArtifactCheck>(specs.length);
  const resolvedByPath = new Map<string, { outcome: "missing" | "not-file" | "outside-root" } | { realFile: string }>();
  const groups = new Map<string, number[]>();

  for (const [index, spec] of specs.entries()) {
    let resolved = resolvedByPath.get(spec.path);
    if (!resolved) {
      const file = resolve(root, spec.path);
      if (!existsSync(file)) resolved = { outcome: "missing" };
      else {
        const realFile = realpathSync(file);
        if (realFile !== project && !realFile.startsWith(project + sep)) resolved = { outcome: "outside-root" };
        else if (!statSync(realFile).isFile()) resolved = { outcome: "not-file" };
        else resolved = { realFile };
      }
      resolvedByPath.set(spec.path, resolved);
    }
    if ("outcome" in resolved) {
      results[index] = { ...spec, ok: false, outcome: resolved.outcome };
      continue;
    }
    const group = groups.get(resolved.realFile);
    if (group) group.push(index);
    else groups.set(resolved.realFile, [index]);
  }

  for (const [realFile, indices] of groups) {
    const needsHash = indices.some((index) => Boolean(specs[index].sha256));
    const actualSha256 = needsHash ? hashArtifactFile(realFile) : undefined;
    for (const index of indices) {
      const spec = specs[index];
      if (!spec.sha256) results[index] = { ...spec, ok: true, outcome: "ok" };
      else if (spec.sha256 === actualSha256) results[index] = { ...spec, actualSha256, ok: true, outcome: "ok" };
      else results[index] = { ...spec, actualSha256, ok: false, outcome: "hash-mismatch" };
    }
  }
  return results;
}

export function checkArtifact(root: string, spec: ArtifactSpec): ArtifactCheck {
  return checkArtifacts(root, [spec])[0];
}
