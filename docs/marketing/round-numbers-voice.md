# Round Numbers Editorial Voice

**Created:** 2026-07-19 (distilled from Mike's live edits on the letdowns article)
**Applies to:** Round Numbers data articles and any Good Fights editorial aimed at journalists/press. The app-copy voice lives separately in `Good_Fights_Voice_Guide.docx` (root); this doc governs the data-journalism register only.
**How to use:** Read before drafting or revising any Round Numbers piece. After each of Mike's review rounds, append what changed to the Decisions Log at the bottom. This doc is the source of truth for the voice and is meant to evolve.

## The target in one line

A professional data-desk reporter writing for other professionals: clear facts, real insights, no drama, no wasted words. The reader is an MMA journalist looking for a story; the article's job is to help them do theirs.

## How we got here (calibration by counterexample)

The letdowns article went through three registers before landing:

1. **Fan-emotional (rejected):** "the most predictable outcome in MMA... before their couch cushions warmed up", "starched", "slept-on", "the unicorn". Too much flare, too much fandom.
2. **Clinical (rejected):** "The 4.4 rating measures that experience, not the execution", "a technically sound performance that produced few of the exchanges the 7.5 hype score anticipated". Accurate but inhuman, lifeless, dead.
3. **Professional reporter (landed):** "Seventeen seconds: takedown, mount, armbar, tap. The predicted outcome, cleanly executed, and still almost nothing to score." Human, factual, to the point.

When revising, check drift in BOTH directions: not a fan, not a lab report.

## Rules

### Substance
- **Lead with the point.** The first sentence of a section states the finding; evidence follows. (Mike explicitly reordered "One-Sided or Slow" to open with "Fights disappoint in one of two ways...".)
- **Every section should hand the reader a quotable insight**, e.g. "Fans don't penalize an early ending that arrives as decisive action. What drags a rating down is the absence of action, not the absence of rounds."
- **Numbers do the talking.** Tie every claim to data; disclose sample sizes inline; never let a superlative outrun the table (we shipped-then-caught "most hyped fight of the year" when our own table showed a higher score elsewhere — a journalist would have found it).
- **Explain the platform from zero.** Assume the reader has never heard of Good Fights. The canonical explanation: two scores from the same fans, excitement before and quality after, on the same 1-10 scale; the difference measures how a fight compared to expectations. Simple sentences, a worked example ("An 8 before and a 3 after is a letdown").
- **Think like the journalist reading it.** What story could they write from this? Surface those angles (letdown card of the year, hype-doesn't-predict-quality) rather than making them dig.

### Style
- **Fewest words that stay human.** Cut qualification clauses, trailing explanations, and restated numbers. "High stakes, low output." beats three sentences of the same.
- **Plain language, no idioms or slang.** Assume a diverse audience that doesn't share cultural shorthand. Banned by example: "cherry-picking", "what the hype was buying", "different commodities / priced the difference", "under its billing", "a fight nobody had circled", "guaranteed fireworks", "the rating tracked it".
- **Drama-free narration of events.** What happened, in order, with times and scores. No "blew out his knee", no "the whole building could see it".
- **A first-person author aside is allowed, sparingly**, clearly marked as opinion: "...and to this author it is no surprise that Justin Gaethje was in it. Always entertaining." At most one or two per piece.
- **Short, punchy section titles** in plain words: "One-Sided or Slow", "Hype Doesn't Predict Quality".

### Mechanics (inherited, non-negotiable)
- No em dashes anywhere. No "honest", no "hype tax". No AI-tell phrasing.
- Stat lines formatted one metric per line (Hyped / Rated / Gap), `<br>` breaks — the blog's `marked` renderer collapses single newlines.
- TLDR box up top ("The short version"); full data table on-page; limitations section; republish-with-credit note for journalists.
- Draft + stop for Mike's review before any publish (`draft: true` until he approves).

## Decisions Log

- **2026-07-20** — Publish round. Added "The Netflix Card" section and a 5th TLDR bullet; skipped the comeback-fights angle (definition attackable, counterexample on the same card) and the Van vs Taira counterpoint. **New rule learned:** the "never let a superlative outrun the table" check must be re-run over *derivative* copy (pitch emails, social, TLDRs), not just the article body. Two claims that were correct in the article were overstated in the pitch emails and had to be caught at send time. Also: spell out promotion names on first use ("Most Valuable Promotions", not "MVP") — the explain-from-zero rule covers org abbreviations too.
- **2026-07-19** — Initial doc, distilled from three revision rounds on `2026-07-18-biggest-fight-letdowns-2026.md` (commits `ed261bff` → `35f6dc49`). Key calls: reporter register over clinical; lead with the point; word-economy pass; plain-language sweep replacing idioms; platform explained from zero at the top of the piece; Gaethje author-aside precedent set.
