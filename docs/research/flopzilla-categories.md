# How Flopzilla classifies a range's Combos on a board

Research note, 2026-10-30. Sources were read on 2026-10-30.

**About the sources.** Flopzilla has never published a full specification of its statistics. The current site (flopzilla.com) has only a marketing page and a video manual. The primary written sources are the original *written manual* (Flopzilla v1, still hosted under `/oldwebsite/`), the FlopzillaPro pages under the same folder, and the screenshots those pages embed. Several answers below are **read off those official screenshots**: the numbers in them can be added up to test a hypothesis. Every claim cites the page or image it comes from.

The Two Plus Two "Flopzilla" thread, where the developer answered questions, is behind a Cloudflare bot challenge. It could not be read directly, and it has no Wayback snapshots. Claims from that thread come only from search-engine extracts of the page and are marked **Forum (search extract)**. Treat them as weaker than the manual.

Anything not settled by a source is marked **UNCONFIRMED**.

Abbreviations used for sources:

- **[M]**: Flopzilla written manual, https://www.flopzilla.com/oldwebsite/written.html
- **[M-img/x]**: a screenshot embedded in [M], https://www.flopzilla.com/oldwebsite/tmp_files/manual/x.png
- **[FP]**: FlopzillaPro page, https://www.flopzilla.com/oldwebsite/flopzillapro.html
- **[FP-img/x]**: a FlopzillaPro screenshot, https://www.flopzilla.com/oldwebsite/pics/x.png
- **[FP-ex1]**: https://www.flopzilla.com/oldwebsite/fpro_example1.html (preflop breakdown)
- **[FP-ex2]**: https://www.flopzilla.com/oldwebsite/fpro_example2.html (flop breakdown tool)
- **[FP-ex3]**: https://www.flopzilla.com/oldwebsite/fpro_example3.html (custom stats)
- **[FP-cl]**: FlopzillaPro change list, https://www.flopzilla.com/oldwebsite/flopzillapro_changelist.html
- **[Home]**: https://www.flopzilla.com/ ; **[Videos]**: https://www.flopzilla.com/videos/

---

## 1. The categories, in display order

The statistics panel has three blocks, coloured by type: "Made hands (blue)", "Draws (green)", and "Combinations of made hands and draws (purple)" [M].

**Only categories that are possible on the current board are listed.** This is inferred from the screenshots. On unpaired, non-monotone flops the made-hand list starts at "straight", with no flush, full house or quads rows [M-img/statistics], [M-img/zoomin], [FP-img/fpgroup]. Where a flush is possible, the list starts with ">=str. flush" and "flush" [M-img/tab]. The full preflop list (no board) starts at ">=quads" [M-img/cumulative], [FP-img/fptoppair]. That rows are hidden rather than shown at 0% is an inference, not a documented rule.

### 1a. Classic Flopzilla (v1)

**Made hands, postflop, best first.** Assembled from several screenshots: [M-img/tab], [M-img/zoomin], [M-img/overlap], [M-img/screenshot1].

1. `>=str. flush`
2. `flush`
3. `straight`
4. `set`
5. `two pair`
6. `overpair`
7. `top pair`
8. `pp below tp` (pocket pair below top pair)
9. `middle pair`
10. `weak pair`
11. `ace high`
12. `no made hand`

The names on paired boards (trips, full house, quads) are **UNCONFIRMED**. No postflop v1 screenshot on a paired board was found. The preflop list below suggests `>=quads`, `full house` and `3 of a kind`.

The earliest manual screenshot has no `pp below tp` row: straight, set, two pair, overpair, top pair, middle pair, weak pair, ace high, no made hand [M-img/statistics]. That row was apparently added in a later v1 build. **UNCONFIRMED**: the exact version.

One v1 screenshot shows indented sub-rows `-flushdraw` / `-no flushdraw` under `overpair` [M-img/tab]. Whether that is a built-in split or a user customisation is **UNCONFIRMED**.

**Made hands, preflop (no board, averaged over all flops).** Classic: `>=quads, full house, flush, straight, 3 of a kind, two pair, overpair, top pair, pp below tp, middle pair, weak pair, ace high, no made hand` [M-img/cumulative].

**Draws, flop.**

1. `flushdraw`
2. `OESD`
3. `gutshot`
4. `overcards`
5. `2crd bckdr fd.` (two-card backdoor flush draw)

Sources: [M-img/zoomin], [M-img/overlap], [M-img/overlapmatrix]. On a later street the list also shows a `no flushdraw` row [M-img/screenshot1] (turn shown).

**Hidden, optional draws.** "Settings->One crd bckdr flushdraw on 2flush flops" adds `1 crd bdfd high` ("the highest card is the one making the backdoor flushdraw") and `1 crd bdfd low` ("it's the lowest") [M].

**Combo draws (purple block).**

1. `flushdraw+pair`
2. `flushdr.+oesd`
3. `flushdr.+gutsh.`
4. `oesd+pair`
5. `gutshot+pair`

Source: [M-img/statistics].

### 1b. FlopzillaPro: what changes

FlopzillaPro "appears to be identical to Flopzilla v1" at first glance and keeps the appearance "so that books/videos/etc still apply" [FP].

**Made hands, postflop.** Pro splits the pair ladder by board card. It replaces `weak pair` with explicit positions, and every pocket-pair rung gets its own row.

1. `straight`
2. `set`
3. `two pair`
4. `overpair`
5. `top pair`
6. `pp < top card`
7. `middle pair`
8. `pp < 2nd card`
9. `bottom pair`
10. `pp < board`
11. `no made hand`

Sources: [FP-img/fpgroup] on Q♦6♠4♦, and the custom-stat editor's "Made hands" list [FP-img/fpcustom2]. Flush and above appear when possible, as in v1.

There is **no `ace high` row in the Pro postflop screenshots** [FP-img/fpgroup], [FP-img/fpcustom2], although the Pro preflop list has one. **UNCONFIRMED**: whether Pro dropped ace high postflop or whether it is a setting.

**Made hands, Pro preflop.** `>=quads, full house, flush, straight, 3 of a kind, two pair, overpair, top pair, pp below tp, middle pair, pp below mp, third pair, pp below 3rd, ace high, no made hand` [FP-img/fptoppair].

**Draws, Pro.** Each straight and flush draw is split by how many hole cards it uses.

1. `flushdraw`
2. `no flushdraw`
3. `oesd (2 card)`
4. `oesd (1 card)`
5. `gutshot (2 crd)`
6. `gutshot (1 crd)`
7. `overcards`
8. `2 crd bckdr fd`
9. `1 crd bdfd high`
10. `1 crd bdfd low`

Sources: the editor list [FP-img/fpcustom2], and [FP-img/fpgroup] on the flop. The Pro preflop list instead shows `flushdr. (2 crd)`, `flushdr. (1 crd)`, `OESD (2crd)`, `OESD (1crd)`, `gutshot (2crd)`, `gutshot (1crd)`, `overcards` [FP-img/fptoppair].

**Combo draws, Pro default.**

1. `flushdraw+pair`
2. `flushdr.+oesd`
3. `flushdr.+gutsh.`
4. `flushdr.+overc.`

Source: [FP-img/fpgroup], [FP-img/fpcustom2]. Pro also has **user-built stats**: existing stats combined with AND, OR and NOT operators, plus a SUITS operator, saved to `/config/custom.txt` [FP-ex3]. The marketing page's example is "no pairs, no draws" [FP].

**Kicker splits.** No made-hand row in either version splits by kicker; there is no "top pair good kicker" row. Kicker quality appears only in the developer's forum wording, "top pair, top kicker" (see §3). **UNCONFIRMED**: whether any Pro view splits by kicker.

**Pro preflop breakdown.** Hovering a stat with no board gives the following [FP-ex1], [FP-img/fptoppair2]:

- a pair-property split: unpaired board, then + OESD, + gutshot, + no str.dr., then paired board;
- a flush-property split: rainbow, 2flush (+ flushdraw / + no flushdraw), monotone (+ flushdraw / + no flushdraw);
- a "flush data" grade table, `nut`, `2nd nut` … `10th nut`.

## 2. Exclusivity and overlap

- **The three blocks are independent and double-count.** The manual states it directly: "The three types of statistics are computed independently of each other. So this means that a statistic can be double-counted." Top pair plus a flush draw counts as top pair, as flushdraw, and as flushdraw+pair [M].
- **Made hands are mutually exclusive.** Each Combo lands in exactly one row, its best category. Checked arithmetically on official screenshots:
  - Pro on Q♦6♠4♦: 0+7+3+9+44+30+24+6+12+12+255 = 402, equal to "Total number of combos: 402" [FP-img/fpgroup].
  - Pro preflop percentages sum to 100.00% [FP-img/fptoppair].
  - v1 rows sum to 99.88%, with display rounding [M-img/statistics].
  - Cumulative mode is defined as "the chance of holding a certain hand or better", and its last row (`no made hand`) is 100% [M], [M-img/cumulative]. This only works if the rows partition the range.
- **Draws overlap made hands, and some draws overlap each other.** From the v1 overlap matrix [M-img/overlapmatrix]:
  - flushdraw ∩ OESD = 8.11% and flushdraw ∩ gutshot = 13.5%, so a flush draw and a straight draw can coexist;
  - OESD ∩ gutshot = 0%, so a Combo with an OESD is not also counted as a gutshot;
  - flushdraw ∩ 2crd bckdr fd = 0%, so a backdoor flush draw is not counted when a flush draw is held;
  - overcards ∩ top pair = 0%, and overcards fall only in ace high (40%) and no made hand (60%), so `overcards` requires no pair.
- **A made straight can also hold a flushdraw.** On 9♣7♥5♥ the flushdraw row (12.9%) breaks down as straight 0.37% + top pair 2.58% + ace high 3.32% + no made hand 6.64% = 12.91% [M-img/overlap].
- **Combo draws are subsets of the plain draws.** Each Combo is still counted in the plain draw row too [M]. In Pro group mode the Q♦6♠4♦ pie gives made hands 63 + draws 25 + combo draws 8 = 96 unique Combos. That is consistent with all 8 combo-draw Combos being among the 33 flushdraws, and the pie assigning each Combo to one group only [FP-img/fpgroup]. **UNCONFIRMED**: the pie's precedence rule.
- **What `flushdraw+pair` means by "pair"** (any pair, or top pair only) is **UNCONFIRMED**.

## 3. Paired boards, using K♠K♦7♣

**General rule: a pair that comes only from the board does not count for the Combo's pair and two-pair categories.**

- **Forum (search extract)**, 2020: Flopzilla "does not consider board pairs as being part of your hand", so "KT on T77 is considered to be top pair", not two pair. Source: https://forumserver.twoplustwo.com/167/poker-software/flopzilla-390299/index99.html
- **Forum (search extract)**, developer: AK on K22 counts as top pair (top kicker), AK on 322 as high card, AK on A22 as top pair. For AK to be two pair, both an A and a K must be on the flop. Source: https://forumserver.twoplustwo.com/167/poker-software/flopzilla-390299/index56.html
- Pro's preflop breakdown reports "top pair on a paired board" as its own figure (1.2335% in the example) [FP-ex1]. So top pair does exist on paired boards, which fits the rule.

Applied to K♠K♦7♣:

| Holding | Category | Status |
|---|---|---|
| AQ | `ace high`; no pair, because the board's KK is ignored | Follows from the 322 example above (forum). Pro postflop shows no ace-high row, so in Pro it would fall in `no made hand`: **UNCONFIRMED**. |
| 7x (x not K or 7) | One pair of 7s; the board's KK is ignored, so not two pair | **UNCONFIRMED**: whether the 7 counts as "top pair" (highest board rank the Combo can pair, as with KT on T77) or as a lower rung relative to the K. |
| Kx | Trips (one hole card). In the preflop list this is `3 of a kind`. | The postflop row name (`set`, `3 of a kind` or `trips`) is **UNCONFIRMED**. |
| KK | Quads, `>=quads` | **UNCONFIRMED** postflop name; preflop row is `>=quads` [M-img/cumulative]. |
| 88 | Not an overpair, because it is below the K. Most likely `pp below tp` (v1) or `pp < top card` (Pro). | **UNCONFIRMED**. |
| 77 | Full house (77 + 7, KK on board) | **UNCONFIRMED** by a source. The `full house` category exists and only arises on paired boards, so the board pair must count at full house and above. The board-pair exclusion applies to the pair and two-pair layer only (inference). |

## 4. Definitions

No official source defines any of these rows in words. What can be pinned down:

- **Overpair**: a pocket pair above every board card; standard usage. 88 on a rainbow board in the [Home] example. The exact rule on paired boards is **UNCONFIRMED**.
- **Top pair**: pairs the highest board card with one hole card. Board pairs are ignored, so KT on T77 is top pair (forum, §3). **UNCONFIRMED**: how "highest board card" is chosen when that card is the paired rank (7x on KK7).
- **Pocket pair below top pair** (`pp below tp`, Pro `pp < top card`): a pocket pair between the top and second board cards. Implied by Pro's ladder: top pair, pp<top card, middle pair, pp<2nd card, bottom pair, pp<board [FP-img/fpcustom2].
- **Middle pair**: pairs the second board card. Pro's preflop list adds `pp below mp`, `third pair` and `pp below 3rd` [FP-img/fptoppair].
- **Weak pair** (v1 only): Pro replaces it with bottom pair, pp < 2nd card and pp < board. It most likely covers those, i.e. any pair weaker than middle pair. **UNCONFIRMED**.
- **Ace high**: no pair, with an ace in hand. **UNCONFIRMED** (wording only). It is mutually exclusive with `no made hand` (0% overlap) [M-img/overlapmatrix].
- **Overcards** (a draw stat): both hole cards above the top board card, and no pair. In the Pro Q♦6♠4♦ example with A♥ dead, overcards = 12 = AK only (3 aces × 4 kings) [FP-img/fpgroup]. Overcards never coincide with top pair [M-img/overlapmatrix].
- **Dependence on rank order with board pairs**: board pairs are ignored for pair-level categories (§3). The exact position rules on paired boards are **UNCONFIRMED**.

The [FP-ex2] flop breakdown tool distinguishes "paired (top)" from "paired (bottom)" flops, e.g. AA2, KKT and 887 are top-paired. **UNCONFIRMED**: whether the hand categories use the same distinction.

## 5. Draw rules

- **At least one hole card.** Pro labels every straight and flush draw "(2 card)" or "(1 card)", with no zero-card variant [FP-img/fpcustom2]. v1 uses the same idea for backdoors ("1 crd bdfd") [M]. Inference: a draw must use at least one hole card. **UNCONFIRMED** as a stated rule.
- **Turn**: draws are computed on the turn. The manual's turn screenshot shows flushdraw 22.9% and no flushdraw 77.1% [M-img/screenshot1].
- **River**: whether draw rows appear on the river is **UNCONFIRMED**; logically there are none.
- **Backdoor draws on the flop only**: the backdoor rows appear in flop screenshots. Their behaviour on the turn is **UNCONFIRMED**.
- **1-card vs 2-card backdoor flush draw**:
  - `2crd bckdr fd` is shown by default;
  - one-card backdoors are hidden, added only "on 2flush flops" by a setting, and split into high and low by which hole card makes them [M];
  - **Forum (search extract)**: the developer mentioned a setting named "Settings->Include 1crd bckdr flushdraws in statistics" and said one-card backdoors were added in a later beta. Source: https://forumserver.twoplustwo.com/167/poker-software/flopzilla-390299/index22.html
- **Nut flush draw**:
  - neither version lists a postflop "nut flush draw" row;
  - Pro's preflop breakdown grades held flush draws from `nut` to `10th nut` [FP-ex1], [FP-img/fptoppair2];
  - how the grade is computed, and whether dead cards or board cards promote a draw to "nut", is **UNCONFIRMED**.
- **A made hand that also draws**: a made straight can count as a flushdraw (§2). Whether a made flush also counts as a draw, e.g. a straight-flush draw, is **UNCONFIRMED**.
- **Combo draws relative to plain draws**: they are counted again in the purple block and are not removed from the green rows [M]. FD+OESD is in both `flushdraw` and `OESD` (overlap 8.11%) [M-img/overlapmatrix].

## 6. Dead cards

- **Setting them.** A "Dead cards" card grid sits beside the board [FP-img/fpgroup]. Pro allows more than two (A♥ and Q♥ in that screenshot).
- **Two dead cards act as a hand.** "If you enter two specific holecards in the dead cards section, they will be considered as a starting hand" vs the range, giving equity and "best hand" percentages [M], [M-img/handisbest]. In Pro this is the "Data for hand" box [FP-img/fpgroup]. The hotness tool needs a flop and two dead cards [M].
- **Combo removal.** Dead cards remove Combos from the range. With 2c2d dead on 9h7h5h, the range shows "395 combos in range" [M-img/handisbest]. **UNCONFIRMED**: the exact recount.
- **Random board dealing.** Pro has a "Random" button [FP-img/fpgroup]. In v2.1.1, "random flops will be drawn from that subset" when a preflop subset is used [FP-cl]. Whether random boards avoid dead cards is **UNCONFIRMED**.
- **Bunching.** In v2.0.6 "a range can now be considered as being drawn from the deck, but dead" [FP-cl], i.e. folded ranges. [Home] also mentions bunching for equity.
- **Nut determination**: whether dead cards affect what counts as the nuts is **UNCONFIRMED**.

## 7. Weights and percentages

- **Weights.**
  - v1 supports three adjustable weights on starting hands [M]. Pro shows a weight percentage [FP-img/fpgroup].
  - Weights can also apply to a statistic's filter [M].
  - Whether the category counts and percentages are weighted is **UNCONFIRMED**, though weights would be pointless otherwise. Whether fractional Combo counts are shown is also **UNCONFIRMED**.
- **Percentages are over live Combos after card removal.**
  - On 9♣7♥5♥ the hover header reads "top pair: 27.7%, 75 combos out of 271", and 75/271 = 27.68% [M-img/zoomin]. The matrix shows reduced per-hand counts, e.g. A9s with 3 Combos.
  - Pro reports "Total number of combos: 402" and "Combos that pass the filters: 96 (23.88%)" [FP-img/fpgroup].
  - TAB toggles between percentages and Combos [M].
  - When filters are ON, the stats are computed on the filtered range only [Home old], https://www.flopzilla.com/oldwebsite/index.html

## 8. Other features of the categories screen

- **Hover.** Hovering a stat lights its Combos in purple in the matrix. The panel then shows only that stat's hands, which reveals its overlap with other stats [M].
- **Right-click to pin.** Right-clicking pins the popup, and the overlap with a second stat is outlined in black [M].
- **Overlap matrix.** A hidden matrix reports P(stat Y | stat X) [M], [M-img/overlapmatrix].
- **"Hit" checkmarks (preflop).** Red checkmarks mark the stats that count as "hit", and the panel shows the % of hands passing at least one of them [M].
- **Absolute vs cumulative.** Cumulative mode shows "a certain hand or better" [M].
- **Filters (postflop).**
  - Left-click a stat to give it a blue filter; drag to select several; turn filters ON or OFF with a button [M].
  - A filter has three states: filter, delete, none.
  - "It only takes one statistic to give a hand permission to pass, as long as it's not deleted by another one" [M].
  - Filters can carry weights, and can be customised per starting hand or for a whole overlap (key 'B') [M].
  - Filtering moves the analysis to the turn and river [Videos], https://www.flopzilla.com/oldwebsite/video.html
- **Creating a range from the categories.**
  - Ctrl+Alt+T gives "a text string with all combos of whatever is displayed in the 'Statistics' section", postflop only [M].
  - Ctrl+T gives the stats as text [M].
  - Pro v2.0.2 added "invert postflop ranges" [FP-cl].
  - Pro group mode assigns coloured filters to groups, with a pie chart of Combos per group [FP], [FP-img/fpgroup].
  - Pro custom stats [FP-ex3].
- **Range filtering on the current site.** "Filter ranges by statistics, combine several filters, weight them, invert ranges, and output the result as text" [Videos].

## Open questions

1. Names and positions of the trips, full house and quads rows postflop on paired boards, in v1 and in Pro.
2. On K♠K♦7♣: is 7x "top pair" or a lower rung, and is 88 `pp below tp`?
3. Whether Pro postflop still has `ace high`, or folds it into `no made hand`.
4. The exact definition of `ace high` and of v1's `weak pair`.
5. Whether draw rows exist on the river, and whether backdoor rows are shown on the turn.
6. How the Pro "nut … 10th nut" flush-draw grade is computed, and whether board and dead cards affect it. Whether any version has a postflop nut-flush-draw row.
7. Whether a made flush also counts as a draw.
8. Whether category counts and percentages are weighted by starting-hand weights.
9. What "pair" means in `flushdraw+pair` (any pair or top pair only), and the precedence rule of the Pro group-mode pie.
10. Whether random boards exclude dead cards, and whether dead cards beyond a two-card hand are removed from the range.
11. All Two Plus Two claims (board pairs ignored; AK on K22 / 322 / A22; the one-card backdoor setting) should be re-read from the thread itself, which is behind a Cloudflare challenge. The developer's video manual (YouTube links on [Videos]) was not watched.
