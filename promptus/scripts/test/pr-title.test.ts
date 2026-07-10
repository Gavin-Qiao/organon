import { describe, expect, test } from "bun:test";
import { prTitleProblem } from "../check-pr-title.ts";

describe("scoped Conventional PR titles", () => {
  test("accepts conventional titles with a non-empty scope", () => {
    expect(prTitleProblem("feat(codex): add cross-platform hooks")).toBeNull();
    expect(prTitleProblem("fix(kb-find/graph): preserve anchored identity")).toBeNull();
    expect(prTitleProblem("docs(release-notes): document the adapter")).toBeNull();
    expect(prTitleProblem("chore(release): x")).toBeNull();
  });

  test("rejects a missing scope", () => {
    expect(prTitleProblem("feat: add hooks")).toContain("type(scope): subject");
  });

  test("rejects an unknown type, uppercase scope, or empty subject", () => {
    expect(prTitleProblem("feature(codex): add hooks")).not.toBeNull();
    expect(prTitleProblem("feat(Codex): add hooks")).not.toBeNull();
    expect(prTitleProblem("feat(codex): ")).not.toBeNull();
  });
});
