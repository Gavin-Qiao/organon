import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
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

export function checkArtifact(root: string, spec: ArtifactSpec): ArtifactCheck {
  const project = realpathSync(resolve(root));
  const file = resolve(root, spec.path);
  if (!existsSync(file)) return { ...spec, ok: false, outcome: "missing" };
  const realFile = realpathSync(file);
  if (realFile !== project && !realFile.startsWith(project + sep)) return { ...spec, ok: false, outcome: "outside-root" };
  if (!statSync(realFile).isFile()) return { ...spec, ok: false, outcome: "not-file" };
  if (!spec.sha256) return { ...spec, ok: true, outcome: "ok" };
  const actualSha256 = createHash("sha256").update(readFileSync(realFile)).digest("hex");
  return actualSha256 === spec.sha256
    ? { ...spec, actualSha256, ok: true, outcome: "ok" }
    : { ...spec, actualSha256, ok: false, outcome: "hash-mismatch" };
}
