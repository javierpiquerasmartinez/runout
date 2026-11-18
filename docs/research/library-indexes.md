# The Library's indexes at a million Hands

Research note, 2026-11-18. It measures the Library's list, Results Graph, Stats and hand ids on one Library of a million Hands, with the criteria players use most, and chooses the indexes from those numbers. The spec asks for this under "Indexes" (the facts layer); the ticket is Advanced Filters 11.

**Outcome.** One index is added, `hands_played_at_idx` on `hands (played_at, id)` (migration `0045_hands_played_at_index`). A month's queries with no criterion or one become 2 to 5 times faster (texture, which already keeps only 1.3% of the Hands, about the same), and the list's page of Hands 3 to 15 times faster. No index on `hand_facts` is added: every criterion measured already answers within the unfiltered time without one, and the few gains such indexes gave did not pay for six more indexes written at every import. No query reached the 60 s cap. The slowest single query took 4.4 s under load: the list's query of the Sites, Heroes and Stakes the Library offers, which ignores the Filter. Of the queries that apply the Filter, the slowest took 2.1 s without the index (the list's page, no Filter) and 1.6 s with it (the Results Graph's running sums, no Filter, which the index doesn't change).

## How it was measured

**The Library.** `pnpm --filter @runout/server db:seed-library -- --hands 1000000` (`apps/server/scripts/seed-library.ts`). It needs the server running in Test mode (`DEV_SIGN_IN=true`). It signs in as the persona `bench`, takes out of the database every Hand that persona imported before, and imports the import fixtures through the API (27 Hands across PokerStars, GGPoker, CoinPoker and Winamax), so their Hands, facts and Stats are stored as any import stores them. Then it copies those rows in SQL, in 100,000-Hand transactions, with new ids and site hand IDs, until the Library holds a million Hands. It took under a minute. The copies are played at even steps over the three years before 2026-11-01, so one month holds about 28,000 Hands. A fixture Hand the Hero folded preflop is copied seven times as often as any other, so three Hands in four are folded preflop, as in a real Library. The criteria then keep about these shares of the Library:

| Criterion (as the address writes it) | Short name | Share kept |
|---|---|---|
| `pot-type:single-raised` | pot | 61% |
| `hero-position:BTN` | position | 21% |
| `flop-ip:true` | ip | 12% |
| `preflop-role:opener` | role | 8% |
| `flop-cbet-chance:true` | cbet-chance | 8% |
| `flop-cbet-did:true` | cbet | 5% |
| `flop-suits:monotone` | texture | 1.3% (one fixture Hand) |

Copying 27 Hands has one known artefact: combinations of facts that none of those Hands has keep no Hand at all. The texture criterion matches one fixture Hand, a 5-bet pot in which the Hero is in the HJ, out of position, called a 4-bet and had no C-bet chance. So every pair with texture keeps nothing, where a real Library would keep thousands of Hands. That makes those pairs the worst case for a plan that walks an index looking for its first matches (see Findings).

**The database.** Postgres 18.4 from `embedded-postgres` (what `db:local` runs), with its default settings (128 MB shared buffers, 4 MB work_mem), on a 10-core Apple Silicon laptop with 24 GB of memory. At a million Hands `hands` takes 2.2 GB (1.8 GB of it the table itself), `hand_facts` 347 MB and `library_entries` 166 MB. Every table was analyzed after seeding.

**The views.** `pnpm --filter @runout/server db:library-bench` (`apps/server/scripts/library-bench.ts`) times each view through HTTP, the median of five requests after one to warm up: the list (`GET /api/library/hands`, first page of 50), the Results Graph (`/results`, 500 points), the Stats (`/stats`) and the hand ids (`/hand-ids`, every id the Filter keeps). Then it runs the services' own queries, caught from Drizzle's logger, under `EXPLAIN (ANALYZE, BUFFERS)`, and writes every plan to a file. Each criterion is measured alone and with every other one (two at a time), over all time and over October 2026, plus the Stat criterion `stat=vpip:taken`. Queries are capped at 60 s (`statement_timeout`, and a timeout on each request); one that takes the cap is recorded with its plan instead of a time. With `--toggle hands_played_at_idx` it measures each case without the index and then with it, back to back.

**Noise.** Other work shared the laptop, so absolute times moved by up to 2× between runs. The table below comes from one `--toggle` run, so the two sides of each cell were measured within a minute of each other; compare within a cell, not across rows measured far apart. An earlier pair of runs on a quieter machine (no index, then the index) gave the same picture with lower times: with no Filter over all time, the list 2,356 ms, the Results Graph 1,324 ms, the Stats 615 ms and the hand ids 712 ms; with no Filter over one month, 1,727, 229 → 77, 234 → 159 and 108 → 32 ms.

## What was tried

1. **No index (today).** Every query reads the whole Library: a parallel sequential scan of `hands`, hashed against `library_entries` (and `hand_facts` when a criterion asks). A month is filtered after reading all of `hands`, so it costs nearly as much as all time, and with a fact criterion the planner reads `hand_facts` first and probes `hands` for the month, which was slower still (the Results Graph, `position` over one month: 501 ms against 229 ms with no Filter). The list sorts the whole Library for its page of 50 (1.5 s, a top-N heapsort of a million wide rows).
2. **`hands (played_at, id)`.** The month becomes an index range of 28,000 Hands. The list's default order (date, newest first, ties by id) reads the index backwards and stops at 50 Hands. Building it took under a second at a million Hands; it takes 39 MB.
3. **Also one index per fact on `hand_facts`** (`hero_position`, `preflop_role`, `flop_cbet_did`, `flop_suits`, `pot_type`, `flop_ip`; 6.8 MB each). Measured on 14 cases, median of three, against step 2:

   | Case | Results Graph | Stats | Hand ids |
   |---|---|---|---|
   | position, all time | 601 → 598 | 401 → 381 | 158 → 153 |
   | cbet, all time | 362 → 209 | 221 → 142 | 170 → 98 |
   | texture, all time | 142 → 85 | 93 → 57 | 76 → 40 |
   | pot+cbet, all time | 396 → 221 | 245 → 148 | 191 → 100 |
   | position+role, all time | 426 → 267 | 267 → 188 | 202 → 127 |
   | position+role, one month | 381 → 214 | 193 → 108 | 46 → 44 |
   | cbet+texture, all time | 148 → 3 | 90 → 2 | 90 → 2 |

   They help only a selective criterion (under about 10% of the Library), and there only by a factor of about 2, on queries already well inside the unfiltered times. A criterion that keeps a fifth of the Library or more (pot, position) reads most of `hand_facts` anyway, and a sequential scan of it costs about 25 ms per worker. Facts are many (over 200 columns), any of them can be a criterion, and every index is written at each import and each re-derive. So none is kept; this table is what to start from if a selective criterion turns out to matter.

## Before and after

HTTP medians in ms, without the index → with it; below each, the database's own time for the queries that read the filtered Hands (the sum of their EXPLAIN ANALYZE execution times). For the list those are its count and its page; its other two queries, the Sites, Heroes and Stakes the whole Library offers to filter by (1.5 to 3 s here) and its Marked count (0.5 to 0.9 s), ignore the Filter, run alongside, and are most of the list's HTTP time.

| Criteria | List | Results Graph | Stats | Hand ids |
|---|---|---|---|---|
| no Filter, all time | 3100 → 2953 <sub>(2273 → 156)</sub> | 1442 → 2030 <sub>(1668 → 2344)</sub> | 902 → 1344 <sub>(957 → 1551)</sub> | 914 → 970 <sub>(691 → 697)</sub> |
| no Filter, one month | 3439 → 3387 <sub>(295 → 44)</sub> | 516 → 142 <sub>(463 → 190)</sub> | 460 → 347 <sub>(565 → 377)</sub> | 244 → 69 <sub>(241 → 66)</sub> |
| pot, all time | 4316 → 3345 <sub>(2452 → 343)</sub> | 1987 → 1840 <sub>(2211 → 2017)</sub> | 1372 → 1274 <sub>(1367 → 1343)</sub> | 931 → 723 <sub>(751 → 573)</sub> |
| pot, one month | 3398 → 3148 <sub>(331 → 79)</sub> | 540 → 190 <sub>(513 → 242)</sub> | 258 → 118 <sub>(262 → 124)</sub> | 235 → 89 <sub>(251 → 96)</sub> |
| position, all time | 3278 → 3232 <sub>(718 → 208)</sub> | 1143 → 1152 <sub>(1254 → 1243)</sub> | 840 → 827 <sub>(859 → 906)</sub> | 556 → 305 <sub>(495 → 269)</sub> |
| position, one month | 3471 → 3311 <sub>(735 → 72)</sub> | 905 → 162 <sub>(958 → 212)</sub> | 471 → 99 <sub>(486 → 114)</sub> | 461 → 84 <sub>(477 → 98)</sub> |
| ip, all time | 3295 → 3190 <sub>(473 → 155)</sub> | 860 → 790 <sub>(901 → 1094)</sub> | 633 → 628 <sub>(658 → 611)</sub> | 431 → 254 <sub>(446 → 249)</sub> |
| ip, one month | 3252 → 2817 <sub>(470 → 75)</sub> | 696 → 125 <sub>(696 → 192)</sub> | 310 → 89 <sub>(349 → 101)</sub> | 334 → 78 <sub>(342 → 89)</sub> |
| role, all time | 3147 → 2980 <sub>(435 → 168)</sub> | 762 → 729 <sub>(789 → 815)</sub> | 474 → 525 <sub>(470 → 555)</sub> | 366 → 271 <sub>(321 → 272)</sub> |
| role, one month | 3219 → 3024 <sub>(510 → 61)</sub> | 709 → 138 <sub>(872 → 229)</sub> | 382 → 117 <sub>(361 → 136)</sub> | 345 → 115 <sub>(369 → 111)</sub> |
| cbet-chance, all time | 3391 → 3231 <sub>(451 → 167)</sub> | 834 → 766 <sub>(869 → 764)</sub> | 544 → 503 <sub>(553 → 581)</sub> | 384 → 287 <sub>(374 → 299)</sub> |
| cbet-chance, one month | 3240 → 2812 <sub>(516 → 59)</sub> | 741 → 127 <sub>(699 → 185)</sub> | 329 → 83 <sub>(344 → 94)</sub> | 356 → 73 <sub>(537 → 86)</sub> |
| cbet, all time | 2897 → 2957 <sub>(375 → 156)</sub> | 620 → 604 <sub>(595 → 622)</sub> | 362 → 376 <sub>(432 → 392)</sub> | 280 → 281 <sub>(283 → 286)</sub> |
| cbet, one month | 2988 → 3018 <sub>(402 → 63)</sub> | 603 → 127 <sub>(566 → 184)</sub> | 332 → 83 <sub>(358 → 95)</sub> | 404 → 76 <sub>(328 → 116)</sub> |
| texture, all time | 3250 → 3152 <sub>(147 → 81)</sub> | 302 → 268 <sub>(330 → 324)</sub> | 180 → 168 <sub>(186 → 179)</sub> | 137 → 126 <sub>(147 → 137)</sub> |
| texture, one month | 3283 → 3322 <sub>(166 → 85)</sub> | 278 → 258 <sub>(342 → 318)</sub> | 133 → 129 <sub>(146 → 140)</sub> | 163 → 80 <sub>(184 → 91)</sub> |
| pot+position, all time | 3443 → 3376 <sub>(400 → 126)</sub> | 783 → 743 <sub>(810 → 672)</sub> | 556 → 531 <sub>(561 → 492)</sub> | 371 → 217 <sub>(333 → 223)</sub> |
| pot+position, one month | 3675 → 3300 <sub>(466 → 69)</sub> | 678 → 153 <sub>(704 → 243)</sub> | 363 → 98 <sub>(366 → 113)</sub> | 334 → 89 <sub>(330 → 98)</sub> |
| pot+ip, all time | 3464 → 3295 <sub>(365 → 153)</sub> | 725 → 703 <sub>(657 → 753)</sub> | 464 → 507 <sub>(532 → 496)</sub> | 362 → 234 <sub>(330 → 225)</sub> |
| pot+ip, one month | 3398 → 3818 <sub>(403 → 94)</sub> | 630 → 203 <sub>(750 → 358)</sub> | 363 → 132 <sub>(333 → 151)</sub> | 308 → 111 <sub>(327 → 143)</sub> |
| pot+role, all time | 6376 → 3490 <sub>(709 → 196)</sub> | 1191 → 904 <sub>(1101 → 917)</sub> | 751 → 587 <sub>(718 → 608)</sub> | 511 → 425 <sub>(458 → 424)</sub> |
| pot+role, one month | 3427 → 3403 <sub>(606 → 73)</sub> | 870 → 176 <sub>(794 → 233)</sub> | 419 → 108 <sub>(425 → 115)</sub> | 387 → 89 <sub>(409 → 100)</sub> |
| pot+cbet-chance, all time | 3796 → 3672 <sub>(557 → 240)</sub> | 901 → 899 <sub>(983 → 915)</sub> | 577 → 572 <sub>(610 → 611)</sub> | 466 → 450 <sub>(426 → 418)</sub> |
| pot+cbet-chance, one month | 3777 → 3603 <sub>(643 → 77)</sub> | 839 → 181 <sub>(875 → 268)</sub> | 454 → 117 <sub>(469 → 115)</sub> | 455 → 89 <sub>(443 → 101)</sub> |
| pot+cbet, all time | 3678 → 3542 <sub>(484 → 212)</sub> | 744 → 745 <sub>(776 → 822)</sub> | 456 → 478 <sub>(477 → 490)</sub> | 349 → 384 <sub>(359 → 477)</sub> |
| pot+cbet, one month | 3668 → 3509 <sub>(535 → 80)</sub> | 702 → 181 <sub>(740 → 261)</sub> | 380 → 118 <sub>(379 → 130)</sub> | 322 → 98 <sub>(344 → 103)</sub> |
| pot+texture, all time | 3637 → 4058 <sub>(83 → 1419)</sub> | 123 → 182 <sub>(176 → 173)</sub> | 100 → 94 <sub>(86 → 84)</sub> | 126 → 76 <sub>(122 → 70)</sub> |
| pot+texture, one month | 3663 → 3590 <sub>(77 → 168)</sub> | 119 → 125 <sub>(161 → 151)</sub> | 102 → 89 <sub>(87 → 81)</sub> | 85 → 97 <sub>(83 → 100)</sub> |
| position+ip, all time | 3619 → 3484 <sub>(407 → 166)</sub> | 807 → 857 <sub>(835 → 824)</sub> | 558 → 629 <sub>(491 → 560)</sub> | 383 → 372 <sub>(356 → 383)</sub> |
| position+ip, one month | 3511 → 3430 <sub>(537 → 78)</sub> | 679 → 164 <sub>(701 → 225)</sub> | 350 → 105 <sub>(360 → 122)</sub> | 334 → 90 <sub>(365 → 100)</sub> |
| position+role, all time | 3598 → 3799 <sub>(484 → 207)</sub> | 823 → 832 <sub>(806 → 820)</sub> | 519 → 542 <sub>(568 → 545)</sub> | 507 → 456 <sub>(446 → 406)</sub> |
| position+role, one month | 3614 → 3089 <sub>(475 → 66)</sub> | 660 → 735 <sub>(717 → 711)</sub> | 352 → 361 <sub>(311 → 442)</sub> | 302 → 101 <sub>(343 → 105)</sub> |
| position+cbet-chance, all time | 3480 → 3352 <sub>(421 → 207)</sub> | 728 → 791 <sub>(697 → 843)</sub> | 499 → 518 <sub>(442 → 532)</sub> | 330 → 371 <sub>(318 → 345)</sub> |
| position+cbet-chance, one month | 3421 → 3344 <sub>(575 → 72)</sub> | 709 → 707 <sub>(741 → 732)</sub> | 358 → 359 <sub>(387 → 347)</sub> | 347 → 84 <sub>(365 → 98)</sub> |
| position+cbet, all time | 3428 → 3321 <sub>(503 → 204)</sub> | 773 → 779 <sub>(733 → 771)</sub> | 459 → 456 <sub>(471 → 465)</sub> | 358 → 357 <sub>(329 → 352)</sub> |
| position+cbet, one month | 3410 → 3202 <sub>(439 → 65)</sub> | 684 → 677 <sub>(673 → 610)</sub> | 335 → 316 <sub>(329 → 327)</sub> | 331 → 82 <sub>(328 → 94)</sub> |
| position+texture, all time | 3089 → 3620 <sub>(58 → 1350)</sub> | 85 → 141 <sub>(150 → 139)</sub> | 85 → 68 <sub>(76 → 64)</sub> | 79 → 64 <sub>(69 → 61)</sub> |
| position+texture, one month | 3204 → 3053 <sub>(63 → 88)</sub> | 87 → 84 <sub>(131 → 108)</sub> | 72 → 85 <sub>(67 → 68)</sub> | 71 → 93 <sub>(65 → 95)</sub> |
| ip+role, all time | 3274 → 3080 <sub>(396 → 157)</sub> | 695 → 687 <sub>(640 → 638)</sub> | 427 → 367 <sub>(419 → 363)</sub> | 326 → 285 <sub>(300 → 270)</sub> |
| ip+role, one month | 3238 → 2972 <sub>(384 → 68)</sub> | 632 → 607 <sub>(585 → 577)</sub> | 288 → 289 <sub>(316 → 273)</sub> | 296 → 80 <sub>(288 → 93)</sub> |
| ip+cbet-chance, all time | 3270 → 2930 <sub>(563 → 184)</sub> | 901 → 800 <sub>(824 → 769)</sub> | 578 → 471 <sub>(574 → 494)</sub> | 423 → 373 <sub>(364 → 440)</sub> |
| ip+cbet-chance, one month | 3021 → 2865 <sub>(538 → 62)</sub> | 716 → 671 <sub>(685 → 662)</sub> | 341 → 335 <sub>(342 → 365)</sub> | 332 → 74 <sub>(337 → 89)</sub> |
| ip+cbet, all time | 2898 → 2786 <sub>(409 → 155)</sub> | 617 → 616 <sub>(588 → 609)</sub> | 364 → 362 <sub>(377 → 385)</sub> | 292 → 294 <sub>(289 → 278)</sub> |
| ip+cbet, one month | 2918 → 2830 <sub>(411 → 63)</sub> | 602 → 598 <sub>(551 → 539)</sub> | 281 → 277 <sub>(278 → 280)</sub> | 274 → 74 <sub>(279 → 85)</sub> |
| ip+texture, all time | 2836 → 3211 <sub>(78 → 948)</sub> | 117 → 135 <sub>(153 → 154)</sub> | 82 → 75 <sub>(76 → 70)</sub> | 78 → 70 <sub>(76 → 68)</sub> |
| ip+texture, one month | 3109 → 2640 <sub>(86 → 91)</sub> | 130 → 104 <sub>(146 → 135)</sub> | 75 → 70 <sub>(66 → 72)</sub> | 65 → 70 <sub>(66 → 81)</sub> |
| role+cbet-chance, all time | 2800 → 2522 <sub>(352 → 148)</sub> | 554 → 557 <sub>(531 → 538)</sub> | 330 → 331 <sub>(341 → 393)</sub> | 275 → 303 <sub>(245 → 244)</sub> |
| role+cbet-chance, one month | 2731 → 2414 <sub>(359 → 59)</sub> | 504 → 487 <sub>(465 → 475)</sub> | 238 → 237 <sub>(240 → 241)</sub> | 235 → 61 <sub>(235 → 72)</sub> |
| role+cbet, all time | 2513 → 2417 <sub>(233 → 116)</sub> | 370 → 368 <sub>(391 → 387)</sub> | 218 → 218 <sub>(220 → 219)</sub> | 184 → 188 <sub>(181 → 180)</sub> |
| role+cbet, one month | 2501 → 2411 <sub>(251 → 61)</sub> | 360 → 341 <sub>(379 → 386)</sub> | 194 → 179 <sub>(189 → 177)</sub> | 190 → 60 <sub>(180 → 70)</sub> |
| role+texture, all time | 2454 → 2832 <sub>(142 → 954)</sub> | 202 → 258 <sub>(234 → 244)</sub> | 116 → 119 <sub>(112 → 114)</sub> | 112 → 115 <sub>(104 → 114)</sub> |
| role+texture, one month | 3964 → 2914 <sub>(160 → 205)</sub> | 299 → 406 <sub>(316 → 345)</sub> | 186 → 143 <sub>(143 → 142)</sub> | 140 → 84 <sub>(199 → 97)</sub> |
| cbet-chance+cbet, all time | 2981 → 2750 <sub>(358 → 151)</sub> | 637 → 601 <sub>(591 → 579)</sub> | 375 → 356 <sub>(398 → 379)</sub> | 293 → 283 <sub>(281 → 270)</sub> |
| cbet-chance+cbet, one month | 2812 → 2936 <sub>(407 → 67)</sub> | 589 → 739 <sub>(542 → 686)</sub> | 278 → 354 <sub>(288 → 358)</sub> | 276 → 90 <sub>(276 → 100)</sub> |
| cbet-chance+texture, all time | 4459 → 4031 <sub>(196 → 1728)</sub> | 413 → 392 <sub>(413 → 325)</sub> | 168 → 181 <sub>(162 → 236)</sub> | 166 → 137 <sub>(165 → 131)</sub> |
| cbet-chance+texture, one month | 2896 → 2660 <sub>(161 → 202)</sub> | 269 → 353 <sub>(286 → 270)</sub> | 136 → 142 <sub>(134 → 122)</sub> | 135 → 66 <sub>(128 → 76)</sub> |
| cbet+texture, all time | 2742 → 2667 <sub>(161 → 161)</sub> | 275 → 276 <sub>(272 → 276)</sub> | 140 → 137 <sub>(131 → 135)</sub> | 125 → 123 <sub>(123 → 122)</sub> |
| cbet+texture, one month | 2711 → 2673 <sub>(161 → 139)</sub> | 272 → 273 <sub>(272 → 272)</sub> | 140 → 140 <sub>(128 → 125)</sub> | 125 → 65 <sub>(122 → 75)</sub> |
| stat vpip:taken, all time | 2945 → 2685 <sub>(659 → 159)</sub> | 1037 → 995 <sub>(1139 → 1177)</sub> | 740 → 702 <sub>(755 → 728)</sub> | 501 → 300 <sub>(465 → 264)</sub> |

## Findings

**Against today's unfiltered times.** Today's unfiltered times, in the same run, are the first row's left-hand numbers: 3,100 ms for the list, 1,442 for the Results Graph, 902 for the Stats and 914 for the hand ids. With the index:

- The Results Graph, the Stats and the hand ids answer within them for every criterion, alone or paired, over all time or a month, but one: `pot` over all time keeps 61% of the Library and costs what no Filter costs (1,840 and 1,274 ms here, against 1,987 and 1,372 without the index in the same case). The first row's own right-hand numbers (2,030 and 1,344) are noise: those queries have the same plan with and without the index, a full scan.
- The list's Filtered queries (its count and its page) take 44–343 ms in every case (against 2,273 ms without the index and no Filter) but the empty texture pairs (gap 1). Its HTTP time is its two Filter-free queries, which took 3.1–4.5 s as the machine's load rose through the run; with the index it was at or below the same case without it in all but four cases, three of them texture pairs.
- Over one month every single criterion comes down to 125–260 ms on the Results Graph, 83–130 ms on the Stats and 73–115 ms on the hand ids, from 278–905, 133–471 and 163–461 ms without the index.

**Gaps, with their reasons.**

1. *A list whose criteria keep (almost) no Hand, over all time.* The page query walks `hands_played_at_idx` backwards, newest first, testing each Hand's facts row, until it has 50 Hands. When the criteria keep none, it walks the whole Library: 58–196 ms became 950–1,730 ms for five of the six texture pairs, all empty in this seed (`cbet+texture` kept its earlier plan, 161 ms). The plan, `pot+texture`, all time:

   ```
   Limit (rows=50) (actual time=1375.808..1378.402 rows=0)
     ->  Gather Merge (rows=8155) (actual rows=0)
           ->  Nested Loop (rows=3398) (actual rows=0 loops=3)
                 ->  Nested Loop (rows=3398) (actual rows=0 loops=3)
                       ->  Parallel Index Scan Backward using hands_played_at_idx on hands (rows=416667) (actual time=0.125..422.356 rows=333333 loops=3)
                       ->  Index Scan using hand_facts_pkey on hand_facts (actual rows=0 loops=1000000)
                             Filter: ((version >= 1) AND (version >= 2) AND (pot_type = 'single-raised') AND (flop_suits = 'monotone'))
                 ->  Index Only Scan using library_entries_identity_id_hand_id_pk on library_entries (never executed)
   Execution Time: 1378.442 ms
   ```

   The planner expected 8,155 Hands (61% × 1.3%, as if the facts were independent), so 50 of them early in the walk. It is bounded by one pass over the Library (about 1.4 s here) and runs alongside the list's Filter-free queries, which take longer; the list's HTTP time for those pairs grew by 0.4–0.5 s, to 2.8–4.1 s against 3.1 s for today's unfiltered list. The Results Graph, Stats and hand ids for the same criteria don't walk. In a real Library the same pairs keep thousands of Hands and the walk stops early, so it is left as it is. If it shows up with real Libraries, the measured fix is an index on the selective fact (with the per-fact indexes above the planner starts from `hand_facts`: `cbet+texture`'s count and page took 1 ms each). An unmeasured one is to order the page by an expression the index doesn't cover when a criterion is selective, which keeps the planner off the walk.
2. *Two correlated criteria over one month.* `position+role`, `position+cbet-chance`, `position+cbet`, `ip+role`, `ip+cbet-chance`, `ip+cbet`, `role+cbet-chance`, `role+cbet` and `cbet-chance+cbet`, over one month: the Results Graph (340–740 ms) and the Stats (180–360 ms) don't improve with the index. The Results Graph stays above the unfiltered month (142 ms), though well below the unfiltered all time. The planner multiplies the two shares as if independent (the BTN and opening, for example, go together far more than that), estimates fewer Hands from `hand_facts` than the month's 28,000, and so scans `hand_facts` and probes `hands` for the month instead of reading the month off the index. The hand ids for the same cases, a simpler query, do read the index (60–100 ms). Extended statistics (`create statistics … on hero_position, preflop_role from hand_facts`) would correct the estimate for a pair, but not for the many pairs a Filter can combine. Left as it is: the times are within today's unfiltered all-time times.
3. *No Filter, all time.* The Results Graph (1.3–2 s), Stats (0.6–1.3 s) and hand ids (0.6–1 s) read every Hand of the Library. No index changes that; they are today's times.

**Facts and results.** The index adds no column and changes no row; the e2e specs pass with it.

## Re-running

```sh
# A Postgres (db:local, or any other) and the server in Test mode on it:
pnpm --filter @runout/server db:local
DEV_SIGN_IN=true pnpm --filter @runout/server dev
# A million Hands in the persona `bench`'s Library, replacing an earlier seeding:
pnpm --filter @runout/server db:seed-library -- --hands 1000000
# Each case without the index and with it, back to back:
pnpm --filter @runout/server db:library-bench -- --toggle hands_played_at_idx --out bench.json --plans plans.txt
```

`--server` points both at another address (`http://localhost:3000` by default), `--only <regex>` measures only the matching cases (`'^pot'`), and `--runs` sets how many requests the median is taken over. Seeding never touches another Account's Hands, but it is meant for a database kept for measuring; signing in as `dev-sign-in|bench` shows the Library in the web.
