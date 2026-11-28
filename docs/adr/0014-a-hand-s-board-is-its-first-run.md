# 0014 · A Hand's board is its first Run

Date: 2026-11-28 · Status: accepted

Some Hands are run more than once after an all-in: CoinPoker deals the board again, with its own Showdown, and each Run pays out its share of the pots. Until now these Hands were discarded at import. A Hand held a single `board`, and the Result, All-in EV, the facts, board texture, the timeline and the Hand Summary all read it as the whole board.

We keep `board` as the full board of the first Run and add `runs` next to it, holding the full board of every Run. `runs` is there only when the Hand was run more than once, and its first entry repeats `board`. Each `collected` entry also records which Run paid it. Anything that reads `board` keeps working unchanged and sees Run 1. That is what we want for the facts and Filters too: they hold one value per Hand, and the cards dealt before the all-in are the same in every Run.

## Considered Options

- **`board` holds only the shared cards, and each Run holds what it adds.** This repeats nothing, but every reader of `board` would have to learn about Runs, and a Hand run once would have a `board` that ends early. Hands are stored as jsonb, so the shape is costly to change once Hands are saved this way.

## Consequences

- `runs[0]` must equal `board`. The corpus checks it, so the two never drift.
- Code that needs every Run (Playback, the Hand Summary, the Result) reads `runs`. Everything else keeps reading `board`, and a reader who forgets about Runs gets Run 1, not something wrong.
- A Filter on the board only ever matches Run 1.
