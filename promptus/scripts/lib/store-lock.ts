/**
 * Cross-process serialization for Promptus source mutations.
 *
 * Markdown remains authoritative, so a write is a short transaction: acquire one
 * project-local lease in the disposable cache, re-read the current source, replace
 * it atomically, update derived read surfaces, and release. The lock lives under
 * cache/ so it never enters source fingerprints or the committed store.
 */
import { randomUUID } from "node:crypto";
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync,
  unlinkSync, writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { derivedDir } from "./paths.ts";

interface LockOwner { pid: number; token: string; acquiredAt: string }
// Synchronous nested operations (amend -> index) share the already-owned lease.
const held = new Set<string>();

const pause = (milliseconds: number) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
};

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

/** Bun on Windows can surface an existing `wx` lock as EPERM/EACCES. */
export function isStoreLockContention(code: string | undefined, platform = process.platform): boolean {
  return code === "EEXIST"
    || (platform === "win32" && (code === "EPERM" || code === "EACCES"));
}

export function withStoreLock<T>(
  root: string,
  action: () => T,
  options: { timeoutMs?: number } = {},
): T {
  root = resolve(root);
  if (held.has(root)) return action.call(undefined);
  const timeoutMs = options.timeoutMs ?? 30_000;
  const lockDir = join(derivedDir(root), ".locks");
  const lockPath = join(lockDir, "store.lock");
  const deadline = Date.now() + timeoutMs;
  const owner: LockOwner = { pid: process.pid, token: randomUUID(), acquiredAt: new Date().toISOString() };
  mkdirSync(lockDir, { recursive: true });

  for (;;) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      try { writeFileSync(fd, `${JSON.stringify(owner)}\n`); }
      finally { closeSync(fd); }
      break;
    } catch (error) {
      if (!isStoreLockContention(errorCode(error))) throw error;
      if (Date.now() >= deadline) {
        let heldBy = "unknown writer";
        try {
          const current = JSON.parse(readFileSync(lockPath, "utf8")) as Partial<LockOwner>;
          heldBy = `pid ${String(current.pid ?? "unknown")} since ${String(current.acquiredAt ?? "unknown")}`;
        } catch { /* an incomplete lease is still fail-closed */ }
        throw new Error(`timed out after ${timeoutMs} ms waiting for Promptus writer ${heldBy}; verify no writer is active before clearing the disposable cache lock`);
      }
      pause(10);
    }
  }

  held.add(root);
  try {
    return action();
  } finally {
    held.delete(root);
    try {
      const current = JSON.parse(readFileSync(lockPath, "utf8")) as Partial<LockOwner>;
      if (current.token === owner.token) unlinkSync(lockPath);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
  }
}

/** Replace one file atomically, keeping temporary bytes outside the source fingerprint. */
export function atomicStoreWrite(root: string, path: string, content: string | Uint8Array): void {
  const transactionDir = join(derivedDir(root), ".transactions");
  mkdirSync(transactionDir, { recursive: true });
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(transactionDir, `${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { flag: "wx" });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}
