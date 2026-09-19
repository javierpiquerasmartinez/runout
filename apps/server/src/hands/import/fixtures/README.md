# Hand History fixture corpus

`../corpus.spec.ts` runs every file here through the import module. Each file has one entry in its `CORPUS` table: the format it should be detected as, the Hands it should read and the reason each discarded entry gets. Every Hand that is read must also replay to the end and pay out exactly what was put in.

## Layouts and Trackers

PokerTracker 4, Hold'em Manager 3 and Hand2Note export each Hand in its Poker Site's own layout, so a format here is a Poker Site's layout:

| Format       | Poker Site | Files              |
| ------------ | ---------- | ------------------ |
| `pokerstars` | PokerStars | `pokerstars-*.txt` |
| `ggpoker`    | GGPoker    | `ggpoker-*.txt`    |
| `winamax`    | Winamax    | `winamax-*.txt`    |

Other files are kept because they must be discarded: PokerTracker 4's forum layout (`pokertracker-forum.txt`) and layouts not read yet (`888poker-unsupported.txt`).

## Where the files come from

Screen Names, hand IDs and table names are anonymised. The GGPoker, Winamax, 10-max and 888poker files were written by hand, following each Poker Site's layout as closely as we know it, to cover edge cases: straddles, side pots, uncalled bets, 10-max tables, tournaments and other games. They are not real exports yet. Add real exports from each Tracker next to them as they turn up: they are what proves the parser right.

## Adding a file

1. Anonymise the Screen Names. Keep everything else exactly as exported: line endings, blank lines, currency symbols.
2. Add an entry to `CORPUS`.
3. If the parser can't read it, keep the file anyway. Record the discard reason it gets now and open an issue. Never delete a fixture to make the tests pass.
