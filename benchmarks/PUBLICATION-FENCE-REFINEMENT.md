# Publication fence: reuse the existing amendment publication

Post-initial-trial refinement; does not rewrite PUBLICATION-FENCE.md or the
sealed thinker round. The initial numeric receipt and original gate source
are retained under results/.

The first trial passed source/index parity but exposed duplicated maintenance:
kb-amend already rebuilds the complete index inside its writer lease, while the
initial fence rebuilt again on the next read. On the Windows 9p synthetic trial,
median amend -> find -> get was 2.995 s baseline versus 5.761 s fenced.

The isolated runtime now calls a completion hook immediately after kb-amend's
existing successful full-index call, still under that same lease. It hashes the
completed components and publishes CLEAN last. This is not an inference from a
changed file or a receipt from a different process. Additions still leave DIRTY
until the reader rebuilds. A failing completion hook cannot acknowledge success.

Re-run the same synthetic protocol with a fresh fixture and a separate receipt.
Add regressions for no redundant post-amend rebuild, failed amendment completion,
quiescent whole-cache loss and interrupted multi-file memory addition. Keep the
original failing-cost observation. These are development comparisons, not a
fresh relevance holdout or a statistical causal study. No new dependency or
production behavior changes.
