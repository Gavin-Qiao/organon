#!/usr/bin/env bun
/**
 * check-pr-title.ts — enforce scoped Conventional Commit syntax for PR titles.
 *
 * Usage: bun promptus/scripts/check-pr-title.ts "feat(scope): concise subject"
 */

export const PR_TITLE_PATTERN = /^(feat|fix|docs|refactor|perf|test|build|ci|chore|revert)\([a-z0-9][a-z0-9._/-]*\): \S(?:.*\S)?$/;

export function prTitleProblem(title: string): string | null {
  if (!title.trim()) return "PR title is empty";
  if (!PR_TITLE_PATTERN.test(title)) {
    return (
      `PR title must match type(scope): subject; got ${JSON.stringify(title)}. ` +
      "Allowed types: feat, fix, docs, refactor, perf, test, build, ci, chore, revert."
    );
  }
  return null;
}

export function main(argv: string[]): number {
  const title = argv.join(" ").trim();
  const problem = prTitleProblem(title);
  if (problem) {
    console.error(`check-pr-title: ${problem}`);
    return 1;
  }
  console.log(`check-pr-title: ok — ${title}`);
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
