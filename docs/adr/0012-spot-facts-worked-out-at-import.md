# 0012 · What the Hero did and faced in a Hand is worked out at import, one row per Hand

Date: 2026-11-16 · Status: accepted · Supersedes the `hand_stats` rows of the Hero's Stats

Filters on Spots (the pot type, the Hero's Position against the opener or the 3-bettor, whether they were in position on the flop, whether they faced a c-bet, what they held and what the board looked like) have to answer over Libraries of up to 10 million Hands. They cannot be worked out by reading each Hand's stored `content` when a Filter is applied, so every fact a Filter or a Stat can ask about is worked out once, when the Hand is stored, into one row per Hand with typed columns (booleans, small integers, numbers and a short line of the Hero's own Actions per Street). Each Hand row already belongs to exactly one Hero, so this row describes that Hero only.

The model is PokerTracker 4's, as `docs/research/pt4-database-schema.md` records it: each named Action has columns for "the Hero did it", "the Hero had the chance" and "the Hero faced it", plus how they answered. A Filter and a Stat read the same columns, a Stat being the Hands that did it out of those that had the chance. So the Stats move from the sparse `hand_stats` rows to this row. The catalogue aims to cover what PT4 offers for Hold'em cash games from the Hero's point of view. It is written in Runout's own names and definitions (`docs/research/hero-stats.md`), not PT4's.

Unlike PT4, Runout also stores what PT4 works out at query time: board texture per Street, and the Positions of the opener, the 3-bettor and the preflop aggressor. Every row also carries the version of the rules that worked it out. When a rule changes or a fact is added, a job works the stale rows out again from the stored `content`, which every Hand has even when its Hand History was not kept. PT4 can only add facts through a reimport.

## Considered options

- **Working facts out on query, from `content`.** Rejected: a full scan of the JSONB for every Filter over millions of Hands.
- **One row per fact (the `hand_stats` shape).** Rejected: combining several criteria becomes one join per criterion, and boolean facts cost a row each.
- **One row per player per Hand, as PT4 does.** Rejected: Filters and Stats are only ever about the Hero (CONTEXT.md, Spot). What the opponents did is stored as what the Hero faced, at about a sixth of the rows in 6-max.

## Consequences

- A new Filter on something the row does not hold yet is a new column, a new rule version and a re-run of the job, never a reimport.
- Filtering by a particular opponent or by an opponent's Stats is out of reach of this row, by design.
