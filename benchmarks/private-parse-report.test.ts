import { expect, test } from "bun:test";
import { analyze, stats } from "./private-parse-report.ts";
test("analysis preserves failures and refuses unsupported stratification", () => {
  expect(analyze({ schema: "organon.private-parse-trial.v1", projects: [{ label: "psi", passed: false, failure: "cache-budget" }] })).toEqual([{ label: "psi", passed: false, failure: "cache-budget" }]);
  expect(() => analyze({ schema: "organon.private-parse-trial.v1", projects: [{ passed: true, arms: { full: { queryCases: 10 } } }] })).toThrow();
});
test("median and mean remain distinct and invalid samples are rejected", () => {
  expect(stats([1, 2, 9])).toEqual({ n: 3, medianMs: 2, meanMs: 4 });
  expect(stats([1, 2, 3, 8]).medianMs).toBe(2.5);
  expect(() => stats([])).toThrow(); expect(() => stats([NaN])).toThrow();
});
