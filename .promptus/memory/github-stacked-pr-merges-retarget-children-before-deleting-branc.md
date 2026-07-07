---
name: github-stacked-pr-merges-retarget-children-before-deleting-branc
description: delete-branch cascade-closes stacked PRs; safe merge protocol for release chains
type: project
status: validated
---

Merging a STACKED PR chain on GitHub (learned releasing 0.6.2/0.4.0, 2026-07-07): merging a PR with --delete-branch CASCADE-CLOSES any open PR whose base was the deleted branch — and a closed PR cannot be retargeted (reopen is blocked when its base is gone); the recovery is a fresh PR from the same branch (same commits, same green SHA). Safe protocol: merge WITHOUT --delete-branch -> gh pr edit <child> --base main -> gh pr update-branch <child> (branch protection requires up-to-date) -> wait checks -> merge; delete all branches at the END. Checks bind to the head SHA, so retargeting alone keeps them green; update-branch mints a new SHA and re-runs (~1 min).
