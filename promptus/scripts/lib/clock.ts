/**
 * clock.ts — the script owns the timestamp; the LLM never types it.
 * This is the drift fix: freehand timestamps are how the old ledger lost a day.
 *
 * Contract:
 *   nowISO():        ISO-8601 UTC instant, e.g. "2026-06-28T00:12:34.000Z".
 *   stampUTC(iso?):  compact id-safe stamp derived from an ISO string,
 *                    e.g. "20260628T001234Z" (defaults to nowISO()).
 *   nowLocalStamp(): human ledger timestamp in LOCAL time, "YYYY-MM-DD HH:MM:SS"
 *                    — matches ledger-append.mjs and the operator's ledgers, which
 *                    declare "all timestamps below use [local TZ]". This is what the
 *                    visible `### [ts] KIND/STATUS — title` ledger header carries
 *                    (ids stay UTC-derived; only the display stamp is local).
 */

export function nowISO(): string {
  return new Date().toISOString();
}

export function stampUTC(iso: string = nowISO()): string {
  // "2026-06-28T00:12:34.000Z" -> "20260628T001234Z"
  return iso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

export function nowLocalStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}
