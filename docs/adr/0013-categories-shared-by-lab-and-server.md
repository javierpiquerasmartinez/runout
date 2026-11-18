# 0013 · The Lab's Categories are shared with the server

Date: 2026-11-18 · Status: accepted · Amends ADR 0001 and ADR 0007

Advanced Filters let a Filter ask for the Hero's Made Hand and Draws on each Street: "top pair on the flop", "a flush draw on the turn". The Lab already names those Categories for every Combo of a Range on a Board, and a player reads them there first. If the server worked out its own, the two would drift: an edge such as two pair with one card on a paired Board, or which backdoors count, could be "top pair" in the Lab and something else in the Library, and a Filter would keep Hands the Lab doesn't call by that name.

So the Made Hand and Draw Categories, and the function that classifies a Combo on a Board, move from `apps/web` into `@runout/poker`, next to the evaluator. The Lab and the server's facts (ADR 0012) both call them, and a Filter on "top pair" means exactly what the Lab means. Copying the definitions by hand, as ADR 0001 does for types, was set aside: a type that drifts fails to compile, a classification that drifts gives wrong Hands silently.

## Consequences

- The apps now share the evaluator, the Equity and the Categories, and still nothing else; types and catalogues are still copied by hand (ADR 0001).
- Changing a Category changes the Lab and the stored facts together: it needs a new facts rules version, so stored Hands are worked out again.
- What the Categories are named in the UI stays in each app: the package holds their keys, not their labels.
