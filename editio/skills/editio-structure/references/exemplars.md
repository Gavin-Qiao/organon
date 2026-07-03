# Exemplars — practices distilled from well-written papers

What follows is distilled *craft*, in our own words, from papers widely held up as exemplary.
Pointers only — read the originals; never lift their sentences. Each entry: the paper, what it
exemplifies, and the transferable move.

## Brevity as confidence — Watson & Crick 1953

*A Structure for Deoxyribose Nucleic Acid*, Nature 171 (1953), doi:10.1038/171737a0. One page.

- **The move:** state the finding in the opening paragraph, plainly, then spend the space on
  what the structure *implies*. No throat-clearing, no survey; the confidence is in the economy.
- **Apply:** if your introduction's first paragraph doesn't say what you found, everything
  before that sentence is a candidate for deletion.
- Famous understatement ("it has not escaped our notice…") — a *single* forward-looking
  sentence lands harder than a Future Work section that hedges five ways.

## Vocabulary before machinery — Shannon 1948

*A Mathematical Theory of Communication*, Bell System Technical Journal 27 (1948).

- **The move:** define every object (source, channel, code) in plain language *before* any
  theorem uses it, and escalate difficulty monotonically — a reader who stops at any section
  boundary still leaves with a consistent, complete picture.
- **Apply:** the notation table is not an appendix nicety; it is the contract. A symbol used
  before it is defined is a bug (editio-lint will treat it as one).
- Figure 1 (the communication-system diagram) carries the whole paper's ontology — one
  schematic, referenced throughout. Aim for *one* such figure per paper.

## Understandability as an explicit goal — Ongaro & Ousterhout 2014 (Raft)

*In Search of an Understandable Consensus Algorithm*, USENIX ATC '14.

- **The move:** the paper names understandability as a design criterion, *decomposes* the
  system along the lines a learner needs (leader election / log replication / safety), and
  argues each piece separately — the decomposition IS the contribution's proof.
- **Apply:** when a system is complex, structure sections around how a reader rebuilds it,
  not around your implementation history. Repetition of the invariant at each stage is a
  feature, not a fault.
- They *evaluated* understandability (a user study against Paxos). An unusual claim deserves
  an unusual evaluation — match the evaluation to the actual contribution.

## Economy of structure — Vaswani et al. 2017

*Attention Is All You Need*, NeurIPS 2017, arXiv:1706.03762.

- **The move:** one architecture figure + a handful of results tables carry the paper; the
  prose walks the figure top-to-bottom exactly once. Section names are boring on purpose —
  the novelty budget is spent on the idea, not the layout.
- **Apply:** if the reader must hold the architecture in mind, give it one canonical figure
  early and *keep referring to it* — never redraw it partially in words.
- Ablations get their own table with one variable per row; a claim per row, a row per claim.

## Multi-panel figures that argue — Jumper et al. 2021 (AlphaFold)

*Highly accurate protein structure prediction with AlphaFold*, Nature 596 (2021),
doi:10.1038/s41586-021-03819-2.

- **The move:** each figure is a self-contained argument — panel (a) the claim, panels (b–e)
  the evidence and the failure modes, caption title stating the finding as a sentence. A
  reader who only reads figures + captions gets the paper.
- **Apply:** write the caption's first sentence as the claim the figure must prove, *before*
  making the figure (editio's caption grammar scaffolds exactly this).
- Uncertainty is shown on the page (confidence bands, per-residue scores) — honesty rendered,
  which is editio's draft mode made publication-grade.

## The writing-craft canon (read once, apply forever)

- Gopen & Swan, *The Science of Scientific Writing* (American Scientist, 1990) — readers
  expect the action in the verb and the news at the end of the sentence; put known
  information first, new information last.
- Mensh & Kording, *Ten simple rules for structuring papers* (PLOS Comput Biol, 2017) — one
  paper = one contribution; the title is the claim; every paragraph answers "so what".
- Whitesides, *Whitesides' Group: Writing a Paper* (Adv. Mater., 2004) — outline first, data
  second, prose last; the outline is a living document you argue with your co-authors about.
- The Nature "summary paragraph" annotated template — the abstract formula editio-structure
  step 5 uses (context → problem → here-we-show → result-with-number → implication).
