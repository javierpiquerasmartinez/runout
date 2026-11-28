# Hand History fixture corpus

`../corpus.spec.ts` runs every file here through the import module. Each file has one entry in its `CORPUS` table: the format it should be detected as, the Hands it should read and the reason each discarded entry gets. Every Hand that is read must also replay to the end and pay out exactly what was put in.

## Layouts and Trackers

PokerTracker 4, Hold'em Manager 3 and Hand2Note export each Hand in its Poker Site's own layout, so a format here is mostly a Poker Site's layout. A Poker Site may have more than one, each with its own row:

| Format       | Poker Site | Files              |
| ------------ | ---------- | ------------------ |
| `pokerstars` | PokerStars | `pokerstars-*.txt` |
| `ggpoker`    | GGPoker    | `ggpoker-*.txt`    |
| `winamax`    | Winamax    | `winamax-*.txt`    |
| `coinpoker`  | CoinPoker  | `coinpoker-*.txt`  |
| `ipoker`     | iPoker     | `ipoker-*.xml`     |
| `ipoker-pt4` | iPoker     | `ipoker-pt4-*.txt` |

`ipoker` is the XML session the iPoker client saves (Hold'em Manager's archive is the same XML): one file per table, a header, then a `<game>` per Hand. `ipoker-pt4` is PokerTracker 4's text export of the same Hands, a layout of PT4's own: `GAME #… Version:… Uncalled:Y` headers in GMT, each Hand on its own.

Other files are kept because they must be discarded: PokerTracker 4's forum layout (`pokertracker-forum.txt`) and layouts not read yet (`888poker-unsupported.txt`).

## Where the files come from

Screen Names, hand IDs and table names are anonymised. The GGPoker, Winamax, 10-max, pot-limit, PokerStars run-it-twice and 888poker files were written by hand, following each Poker Site's layout as closely as we know it, to cover edge cases: straddles, side pots, uncalled bets, 10-max tables, pot-limit Stakes, tournaments and other games. They are not real exports yet. `coinpoker-session.txt` is: seven Hands picked from a session exported by CoinPoker's own client, one per case its layout has (a Splash, a straddle, a run it twice…), left exactly as exported since the site already hashes every opponent and writes the Hero as `Hero`. `coinpoker-ante.txt` is too: two Hands from an NL25 table, where CoinPoker plays with an ante. The iPoker files (`ipoker-*.xml`) are written by hand too, modelled closely on the public iPoker samples of fpdb-3 and HHSmithy's PokerHandHistoryParser but never copied from them (fpdb-3 is AGPL-3 and HHSmithy's has no licence); their Screen Names, session codes and gamecodes are made up. `ipoker-showdown.xml` writes its Rake per player (`rakeamount`), `ipoker-session.xml` leaves it to be worked out. The others take one case each: a client older than version 20, which counts an uncalled bet in its maker's `win` (`ipoker-old-client.xml`); antes and players sitting out (`ipoker-antes.xml`); all-ins (`ipoker-all-ins.xml`); table sizes worked out from the table positions taken (`ipoker-heads-up.xml`, `ipoker-nine-max.xml`, `ipoker-ten-max.xml`); fast-fold (`ipoker-fast-fold.xml`); other games (`ipoker-other-games.xml`); and Hands discarded because their money doesn't add up (`ipoker-unbalanced.xml`) or they were run twice (`ipoker-run-it-twice.xml`). The PT4 files (`ipoker-pt4-*.txt`) are written by hand the same way, modelled on fpdb-3's PokerTracker 4 exports of iPoker; `ipoker-pt4-showdown.txt` is the Hand of `ipoker-showdown.xml`, so the two layouts can be checked to read as one Hand. No PT4 export of a Hand run twice has turned up, so the one in `ipoker-pt4-discarded.txt` guesses that PT4 writes a second board after the first. Add real exports from each Tracker next to them as they turn up: they are what proves the parser right.

## Adding a file

1. Anonymise the Screen Names. Keep everything else exactly as exported: line endings, blank lines, currency symbols.
2. Add an entry to `CORPUS`.
3. If the parser can't read it, keep the file anyway. Record the discard reason it gets now and open an issue. Never delete a fixture to make the tests pass.
