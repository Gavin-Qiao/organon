# Human Factors in Pre-LLM Scientific Writing

An analysis of what makes acclaimed pre-2022 papers read as unmistakably human, written to enrich the `humanizer` skill. Every excerpt below is verbatim from the cited source.

## Why this analysis exists

The current `humanizer` skill (v2.5.1) is a catalogue of 29 things to *remove*: significance inflation, em-dash overuse, the rule of three, "delve," sycophancy, and so on. That is the right half of the job. But a text can pass all 29 checks and still read like nothing a person would write, because removing tics does not add judgment, stance, or a point of view.

The gap is positive models. So I assembled a small corpus of papers written well before large language models existed (1945 to 1974), all of them famous partly *for how they are written*, and read them for the opposite question: not "what tells on the machine" but "what does a human writer actually do that a model tends not to."

Pre-LLM is the point. Nothing here can have been contaminated by the patterns the skill is trying to strip out. These are control samples of human prose.

## The corpus (round 1)

| Source | Year | Field | Why it's a good model |
|---|---|---|---|
| A. M. Turing, "Computing Machinery and Intelligence," *Mind* | 1950 | Philosophy / CS | First-person reasoning; engages nine counterarguments by name; dry wit |
| J. D. Watson & F. H. C. Crick, "Molecular Structure of Nucleic Acids," *Nature* | 1953 | Biology | ~800 words; the most famous understatement in science |
| Wilkins, Stokes & Wilson, and Franklin & Gosling (companion *Nature* papers) | 1953 | Biophysics | Hedging calibrated precisely to the evidence |
| E. W. Dijkstra, "Go To Statement Considered Harmful," *CACM* | 1968 | CS | A strong thesis defended; names his own influences and his own mistake |
| Vannevar Bush, "As We May Think," *The Atlantic* | 1945 | Popular science | Concrete imagined detail; sober, non-triumphant close |
| R. P. Feynman, "Cargo Cult Science," Caltech address | 1974 | Popular science | Anecdote as argument; plain words; a moral spine |

Four are academic papers, two are science writing for a general audience. The balance leans academic, as requested.

## The eleven human factors

Each factor below has the same shape: the principle, the AI tell it counters, a verbatim model, and a note on how to apply it.

### 1. Calibrated confidence (the single most important one)

**Principle.** Human experts vary their certainty sentence by sentence. They commit hard where the evidence is strong and hedge precisely where it is weak, and they tell you which is which. The hedging is *local and earned*, not a reflex sprayed over everything.

**AI tell it counters.** The skill's pattern 24 ("excessive hedging") and pattern 1 ("significance inflation"). Models tend to do both at once: every claim is simultaneously over-qualified ("it could potentially be argued") and over-inflated ("a pivotal, transformative moment"). Confidence never varies, so it carries no information.

**Model (Wilkins, Stokes & Wilson, 1953):**
> "While the X-ray evidence cannot, at present, be taken as direct proof that the structure is helical, other considerations discussed below make the existence of a helical structure highly probable."

One sentence names exactly what is *not* proven and exactly what is nonetheless *probable*. The hedge is doing real work.

**Model (Turing, 1950), on the limits of his own case:**
> "The reader will have anticipated that I have no very convincing arguments of a positive nature to support my views. If I had I should not have taken such pains to point out the fallacies in contrary views."

**How to apply.** When humanizing, don't just delete hedges. Re-sort them: strip the reflexive ones, then make sure the genuinely uncertain claims are still marked as uncertain and the solid ones are stated plainly. A document where confidence rises and falls with the evidence reads human; a document at one constant pitch reads generated.

### 2. A first-person thinker is visibly present

**Principle.** A real author owns the claims. The reasoning belongs to an "I" or "we" who is willing to be wrong.

**AI tell it counters.** Pattern 13 (passive voice and subjectless fragments) and the general agentless fog of model prose.

**Model (Turing, 1950):**
> "I propose to consider the question, 'Can machines think?'"

> "It will simplify matters for the reader if I explain first my own beliefs in the matter."

**Model (Dijkstra, 1968):**
> "My first remark is that... My second remark is that our intellectual powers are rather geared to master static relations and that our powers to visualize processes evolving in time are relatively poorly developed."

**How to apply.** Where the context allows a voice, let the author appear. "I think the second explanation is weaker" beats "It could be argued that the second explanation may be less robust." This is register-dependent: some journals forbid "I," in which case the ownership shows up as committed assertion rather than the pronoun.

### 3. Engage the strongest counterargument, not a strawman

**Principle.** Human argument is dialectical. The writer raises the best objection to their own position, sometimes concedes it is strong, then answers it.

**AI tell it counters.** The frictionless, one-sided summary that never meets resistance. (The skill's pattern 6, formulaic "Challenges" sections, is the hollow version of this; real engagement is the cure.)

**Model (Turing, 1950).** The paper's spine is a list of nine objections answered one by one ("The Theological Objection," "The Mathematical Objection," "Lady Lovelace's Objection," and so on). He steelmans before he strikes:
> "This objection is a very strong one, but at least we can say that if, nevertheless, a machine can be constructed to play the imitation game satisfactorily, we need not be troubled by this objection."

And about extrasensory perception, which cut against him:
> "This argument is to my mind quite a strong one."

**How to apply.** If a draft argues for X with no visible opposition, it reads like marketing. Insert the real counter, give it its due, then respond. The friction is what signals a mind at work.

### 4. Concrete examples and worked detail

**Principle.** Humans reach for the specific instance. Abstractions get cashed out in something you can picture.

**AI tell it counters.** Patterns 4 and 1: promotional abstraction ("vibrant," "transformative") standing in for any actual detail.

**Model (Feynman, 1974)** explaining publication bias not as a definition but as a story:
> "Millikan measured the charge on an electron by an experiment with falling oil drops and got an answer which we now know not to be quite right... if you plot them as a function of time, you find that one is a little bigger than Millikan's, and the next one's a little bit bigger than that... until finally they settle down to a number which is higher."

**Model (Dijkstra, 1968)** explaining why a variable's value is meaningless without the progress of the process:
> "If we wish to count the number, n say, of people in an initially empty room, we can achieve this by increasing n by 1 whenever we see someone entering the room; in the in-between moment that we have observed someone entering the room but have not yet performed the subsequent increase of n, its value equals the number of people in the room minus one!"

**How to apply.** When a sentence makes a general claim, ask what concrete case would show it. Replace one abstract assertion per paragraph with the example a person would actually give.

### 5. Analogies that do explanatory work

**Principle.** A good analogy carries the reader from something familiar to something new. It earns its place by explaining, not decorating.

**AI tell it counters.** The decorative-metaphor habit behind patterns 1 and 4: "tapestry," "landscape," "beacon," "symphony": imagery that adds warmth but no information.

**Model (Turing, 1950):**
> "Presumably the child brain is something like a notebook as one buys it from the stationer's. Rather little mechanism, and lots of blank sheets."

He also reaches for an atomic pile below critical size to explain why some minds spark a chain reaction of ideas and others do not.

**Model (Bush, 1945)** on why our indexing systems fail us:
> "The human mind does not work that way. It operates by association. With one item in its grasp, it snaps instantly to the next that is suggested by the association of thoughts."

**How to apply.** Keep analogies that would let a reader *predict* something about the target. Cut analogies that only set a mood.

### 6. Plain words for big ideas

**Principle.** The larger the idea, the plainer the diction tends to be. Anglo-Saxon verbs, short nouns, concrete subjects.

**AI tell it counters.** Pattern 7, the "AI vocabulary" cluster (delve, intricate, interplay, leverage, underscore).

**Model (Watson & Crick, 1953).** The opening sentence of the paper that founded molecular biology:
> "We wish to suggest a structure for the salt of deoxyribose nucleic acid (D.N.A.). This structure has novel features which are of considerable biological interest."

Not "we propose a novel architectural paradigm." Just "we wish to suggest a structure."

**Model (Feynman, 1974):**
> "The first principle is that you must not fool yourself—and you are the easiest person to fool."

**How to apply.** Prefer the shorter, older word. If a sentence's importance seems to depend on its vocabulary, the vocabulary is probably hiding a thin idea.

### 7. Real rhythm, including the nerve to be short

**Principle.** Human paragraphs vary. Long, qualified sentences sit next to very short ones. Brevity is used as emphasis.

**AI tell it counters.** The "soulless writing" warning in the skill ("every sentence is the same length and structure"). Models default to an even, mid-length cadence.

**Model (Feynman, 1974)** on cargo-cult ritual:
> "They're doing everything right. The form is perfect. It looks exactly the way it looked before. But it doesn't work. No airplanes land."

A run of short declaratives lands the point harder than any adjective could.

**Model (Watson & Crick, 1953).** The whole paper is about one page. It says what it has to and stops. Length itself was a stylistic choice.

**How to apply.** After humanizing, read for cadence. If every sentence is 15 to 25 words, break some to five and let one run to forty. Put the shortest sentence where the emphasis should be.

### 8. Earned understatement

**Principle.** When the finding is genuinely big, human writers often *under*play it. The restraint signals confidence; the reader supplies the awe.

**AI tell it counters.** Pattern 1 (significance inflation) and pattern 25 (generic positive conclusions). This is their exact mirror image.

**Model (Watson & Crick, 1953).** Having just described the structure of DNA, they note its world-changing implication in a single dependent clause:
> "It has not escaped our notice that the specific pairing we have postulated immediately suggests a possible copying mechanism for the genetic material."

That is the entire victory lap. No "groundbreaking," no "paradigm shift," no "stands as a testament."

**How to apply.** When tempted to tell the reader something is important, try stating the thing plainly and deleting the label. If it *is* important, it survives without the adjective.

### 9. Dry humor and a willing personality

**Principle.** Real writers are occasionally funny, irritated, or self-deprecating. Personality leaks through, and that leakage is a strong human signal.

**AI tell it counters.** The flat, relentlessly pleasant register flagged by patterns 20 and 22 (collaborative artifacts, sycophancy).

**Model (Turing, 1950)** admitting his own sloppiness:
> "Machines take me by surprise with great frequency. This is largely because I do not do sufficient calculation to decide what to expect them to do, or rather because, although I do a calculation, I do it in a hurried, slipshod fashion, taking risks."

**Model (Dijkstra, 1968),** opening with a barb:
> "Since a number of years I am familiar with the observation that the quality of programmers is a decreasing function of the density of go to statements in the programs they produce."

**How to apply.** You can't bolt on humor, but you can stop sanding it off. Keep the wry aside, the mild exasperation, the honest "I rushed this." Don't neutralize a draft into pleasantness.

### 10. Specific intellectual generosity

**Principle.** Humans credit people by name and disagree with them by name. Sources are particular, and so are debts.

**AI tell it counters.** Pattern 5 (vague attributions: "experts argue," "studies show," "observers have noted").

**Model (Watson & Crick, 1953)** crediting a rival they are about to contradict:
> "A structure for nucleic acid has already been proposed by Pauling and Corey. They kindly made their manuscript available to us in advance of publication... In our opinion, this structure is unsatisfactory for two reasons."

**Model (Dijkstra, 1968)** in his closing acknowledgment:
> "It is hard to end this article with a fair acknowledgement: am I to judge by whom my thinking has been influenced?... To a modest extent I blame myself for not having then drawn the consequences of his remark."

**How to apply.** Replace "experts believe" with the actual name and year. If you can't name the source, that is a signal the claim needs checking, not softening.

### 11. Connective tissue that tracks real reasoning

**Principle.** Human transitions report the logic: *because*, *therefore*, *but*, *for two reasons*. The joins between sentences mean something.

**AI tell it counters.** Pattern 3 (superficial "-ing" phrases like "highlighting," "underscoring") and pattern 28 (signposting like "let's dive in"). Both imitate connection without supplying any.

**Model (Watson & Crick, 1953):**
> "In our opinion, this structure is unsatisfactory for two reasons: (1) We believe that the material which gives the X-ray diagrams is the salt, not the free acid... (2) Some of the van der Waals distances appear to be too small."

The structure is "here is a claim, here are the two reasons." The scaffolding is the argument, not an ornament on it.

**Model (Dijkstra, 1968):** "My first remark is that... My second remark is that... Let us now consider... The main point is that..." Each transition advances the case.

**How to apply.** Replace participial filler ("...reflecting the broader trend") with the real connective the logic needs ("...which matters because"). If a transition could be deleted with no loss of meaning, it was decoration.

## Cross-map: what to remove ↔ what to add

The positive factors line up against the skill's existing negative patterns. Removing a tic and installing its human counterpart is more effective than removing alone.

| Existing pattern to remove | Positive factor to install |
|---|---|
| 1. Significance inflation | 8. Earned understatement |
| 3. Superficial "-ing" analyses | 11. Connective tissue that tracks reasoning |
| 4. Promotional language | 6. Plain words for big ideas |
| 5. Vague attributions | 10. Specific intellectual generosity |
| 6. Formulaic "Challenges" sections | 3. Engage the strongest counterargument |
| 10 & 12. Rule of three / false ranges | 4. Concrete examples and worked detail |
| 13. Passive / subjectless fragments | 2. A first-person thinker is present |
| 20 & 22. Chatbot artifacts / sycophancy | 9. Dry humor and personality |
| 24. Excessive hedging | 1. Calibrated confidence |
| 25. Generic positive conclusions | 8. Earned understatement (again) |
| "Soulless writing" (uniform rhythm) | 7. Real rhythm, including brevity |

## Round 2: broadening across fields and into the 2010s

A second pass added six more sources, chosen to leave the mid-century hard sciences behind and reach other fields and later decades, up to 2015.

| Source | Year | Field | What it adds |
|---|---|---|---|
| George A. Miller, "The Magical Number Seven..." (*Psychological Review*) | 1956 | Cognitive psychology | A personal, funny opening to a technical paper |
| George E. P. Box, "Science and Statistics" (*JASA*) | 1976 | Statistics | The load-bearing aphorism ("all models are wrong...") |
| Gould & Lewontin, "The Spandrels of San Marco..." (*Proc. R. Soc. B*) | 1979 | Evolutionary biology | Coining terms; sustained metaphor as argument |
| David Chalmers, "Facing Up to the Problem of Consciousness" (*JCS*) | 1995 | Philosophy of mind | Naming and defining a problem ("the hard problem") |
| Hal Varian, "How to Build an Economic Model in Your Spare Time" | 1997 | Economics | Process honesty; humor; relentless simplicity |
| Paul Graham, "Write Like You Talk" | 2015 | Essay on writing | The spoken-language test, stated outright |

There are two findings.

**First, the original eleven factors recur in every new field.** That is the main result: they are not artifacts of 1950s science prose. A few examples:

- *Plain words for big ideas (P6)*, economics: Varian's "keep it simple, stupid. Write down the simplest possible model you can think of... If it does, then make it even simpler."
- *First-person thinker (P2) and dry humor (P9)*, psychology: Miller opens a technical paper with "My problem is that I have been persecuted by an integer. For seven years this number has followed me around..."
- *Analogies that explain (P5)*, economics: Varian on revision as sculpture: "most of the work in building a model doesn't consist of adding things, it consists of subtracting them."
- *Calibrated confidence (P1)*, statistics: Box's essay turns on "Since all models are wrong the scientist must be alert to what is importantly wrong."
- *Engage the target by name (P3, P10)*, evolutionary biology: Gould and Lewontin name and attack "the adaptationist programme" rather than a vague "some researchers."

**Second, the new fields surface three genuinely new factors**, now added as P12–P14:

- **P12. Coin and define your terms.** Chalmers isolates and names the thing: "The really hard problem of consciousness is the problem of experience," separating it from the "easy problems." Gould and Lewontin coin "spandrels" for byproducts of construction and "the Panglossian paradigm" (after Voltaire's Dr. Pangloss, who held that "everything is made for the best purpose. Our noses were made to carry spectacles, so we have spectacles") for the reflex of treating every trait as optimal. A named concept travels; a vague description evaporates. It is the constructive opposite of synonym cycling (pattern 11): name the thing once, then reuse the name.
- **P13. Earn an aphorism.** Box compresses a philosophy of modeling into "Since all models are wrong the scientist must be alert to what is importantly wrong. It is inappropriate to be concerned about mice when there are tigers abroad" (later distilled to "all models are wrong, but some are useful"). Graham lands "Informal language is the athletic clothing of ideas." A real aphorism is compressed truth, which is what separates it from the AI "generic positive conclusion" (pattern 25).
- **P14. Write like you talk.** Graham states the test the whole skill implies: read it aloud and fix everything that doesn't sound like conversation, "because... the harder the subject, the more informally experts speak." Varian models the honesty that goes with it: "In reality the process is much more haphazard than my description would suggest." This is now also a step in the skill's process.

The positive patterns grew from eleven to fourteen, and the calibration corpus from six sources to twelve, spanning nine fields.

## What changed in the skill

The enriched `SKILL.md` adds, on top of the existing 29 removal patterns:

1. A **"Positive Human Patterns" section** with fourteen factors (P1–P14), each carrying a verbatim model excerpt so the skill ships with its own examples of good prose.
2. A **calibrated-confidence step**, since reflexive de-hedging can flatten a text as badly as the hedging did.
3. A **positive pass** in the workflow: after removing AI tics, check that a few human factors are actually present, and add them if not.
4. A **read-it-aloud step** (the spoken-language test): replace anything you would not say to a friend.
5. A **calibration corpus** of twelve pre-LLM sources across nine fields, listed at the end of the skill.

## Sources

- A. M. Turing, "Computing Machinery and Intelligence," *Mind* 59 (1950): 433–460. [Full text PDF](https://courses.cs.umbc.edu/471/papers/turing.pdf)
- J. D. Watson & F. H. C. Crick, "Molecular Structure of Nucleic Acids: A Structure for Deoxyribose Nucleic Acid," *Nature* 171 (1953): 737–738. [Nature](https://www.nature.com/articles/171737a0)
- M. H. F. Wilkins, A. R. Stokes & H. R. Wilson, and R. E. Franklin & R. G. Gosling, companion papers, *Nature* 171 (1953): 738–741. [Reprint PDF](https://www.mskcc.org/teaser/1953-nature-papers-watson-crick-wilkins-franklin.pdf)
- E. W. Dijkstra, "A Case against the GO TO Statement" (EWD215); published as "Go To Statement Considered Harmful," *CACM* 11 (1968): 147–148. [EWD Archive](https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD215.html)
- Vannevar Bush, "As We May Think," *The Atlantic*, July 1945. [W3C reprint](https://www.w3.org/History/1945/vbush/vbush-all.shtml)
- R. P. Feynman, "Cargo Cult Science," Caltech commencement address, 1974; *Engineering and Science* 37 (1974). [Caltech library](https://calteches.library.caltech.edu/51/2/CargoCult.htm)
- George A. Miller, "The Magical Number Seven, Plus or Minus Two," *Psychological Review* 63 (1956): 81–97. [Classics in the History of Psychology](https://psychclassics.yorku.ca/Miller/)
- George E. P. Box, "Science and Statistics," *Journal of the American Statistical Association* 71 (1976): 791–799. [PDF](https://gwern.net/doc/statistics/decision/1976-box.pdf)
- S. J. Gould & R. C. Lewontin, "The Spandrels of San Marco and the Panglossian Paradigm," *Proc. R. Soc. London B* 205 (1979): 581–598. [PDF](https://joelvelasco.net/teaching/167win10/gould%20lewontin%2079%20-%20spandrels.pdf)
- David J. Chalmers, "Facing Up to the Problem of Consciousness," *Journal of Consciousness Studies* 2(3) (1995): 200–219. [consc.net](https://consc.net/papers/facing.html)
- Hal R. Varian, "How to Build an Economic Model in Your Spare Time" (1997). [PDF](https://people.ischool.berkeley.edu/~hal/Papers/how.pdf)
- Paul Graham, "Write Like You Talk" (2015). [paulgraham.com](https://paulgraham.com/talk.html)
