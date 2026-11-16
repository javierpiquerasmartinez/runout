# How PokerTracker 4 stores per-hand facts in PostgreSQL

Research note, 2026-11-16. Sources were read on 2026-11-16. It looks at PT4's database to inform how Runout stores derived facts per Hero hand (Postgres + Drizzle, Libraries up to 10M hands, filters from the Hero's point of view only). See also `pt4-hand-filters.md` for the filter UI.

**About the sources.** PokerTracker has **never published a PT4 schema** (section 5). Column names below therefore come from three kinds of source:

1. **Open-source tools that query a live PT4 database.** Their SQL holds real table and column names, and some were introspected against a live DB.
2. **Answers by PokerTracker forum moderators** (kraada, WhiteRider, Flag_Hippo) on pokertracker.com/forums, which quote column names in custom-stat expressions.
3. **PokerTracker's official guides** at docs.pokertracker.com, which describe caching and housekeeping but name almost no columns.

A claim with no source that confirms it is marked **Unverified**.

Source abbreviations:

- **[TAL]**: Tal-McMahon/pt4-research, a schema knowledge base "live verified 2026-05-20" against a PT4 DB on Postgres 18.2. https://github.com/Tal-McMahon/pt4-research (files under `references/schema/`)
- **[FPDB]**: jejellyroll-fr/fpdb-3, a list of PT4 columns "taken from the column references in PT4's own Data/Stats/StatDefinitions.pt4" plus PT4's `Data/Schemas/schema.postgres.sql`. https://github.com/jejellyroll-fr/fpdb-3/blob/HEAD/tests/fixtures/pt4_schema_columns.txt
- **[RH]**: RHilly86/no-limit-holdem-analysis, dbt models over PT4 tables. https://github.com/RHilly86/no-limit-holdem-analysis/tree/HEAD/nlh_data/models (`pt4_sources.yml`, `cash/hand_player_statistics.sql`, `cash/hand_player_combos.sql`, `lookup/hand_ranks.sql`, `lookup/holecards.sql`)
- **[GTO]**: Mister-Kitty/GTOHelper, the PT4 data manager. https://github.com/Mister-Kitty/GTOHelper/blob/HEAD/src/main/java/com/gtohelper/pt4datamanager/PT4HandDataDM.java and `PT4LookupDM.java` in the same folder
- **[OH]**: OpenHoldem's PT4 query definitions (vglad mirror). https://github.com/vglad/PokerTracker4_CPP_DLL/blob/HEAD/PokerTracker_Queries_Version_4.h
- **[SLOW]**: DarraghGeo/slowHUD, which reads `cash_cache`. https://github.com/DarraghGeo/slowHUD/blob/HEAD/app/main/stats/queries/summary.ts
- **[S47]**: stat4701/2014, which reads `cash_cache`. https://github.com/stat4701/2014/blob/HEAD/projects/jsp2014/StageB/PYTHON/extractdata.py
- **[NOAR]**: noarones/PokerParser, a script that derives `id_action_*` by correlating hand histories with PT4 exports. https://github.com/noarones/PokerParser/blob/HEAD/services/import-worker/scripts/derive_action_ids.py
- **[DOC-CACHE]**: Official guide "Database Caching Guide". https://docs.pokertracker.com/pt4/tutorials/database-management/database-caching-guide/
- **[DOC-HK]**: Official guide "Database Housekeeping". https://docs.pokertracker.com/pt4/tutorials/database-management/database-housekeeping/
- **[DOC-DBM]**: Official guide "Database Management Guide". https://docs.pokertracker.com/pt4/tutorials/database-management/database-management-guide/
- **[DOC-TUNE]**: Official guide "PostgreSQL Performance Tuning". https://docs.pokertracker.com/pt4/databases/postgresql-performance-tuning/
- **[DOC-CS]**: Official guide "Custom Statistics Guide". https://docs.pokertracker.com/pt4/tutorials/reports-stats-and-filters/custom-statistics-guide/
- **[DOC-GF]**: Official guide "Global Filters aka 'More Filters'". https://docs.pokertracker.com/pt4/tutorials/reports-stats-and-filters/global-filters-aka-more-filters/
- **[F:t]**: PokerTracker forum topic `t`, at `https://www.pokertracker.com/forums/viewtopic.php?t=<t>`. Quotes are by moderators unless marked *(user)*.

---

## 1. The tables

### 1.1 Table list

A dbt sources file lists the tables of a PT4 database [RH `pt4_sources.yml`]. The cash ones are `cash_hand_summary`, `cash_hand_player_statistics`, `cash_hand_player_combinations`, `cash_hand_histories`, `cash_limit`, `cash_table`, `cash_table_session_summary`, `cash_cache` and `cash_custom_cache`. The lookups are `lookup_actions`, `lookup_positions`, `lookup_hole_cards`, `lookup_hand_ranks`, `lookup_hand_groups`, `lookup_suits_omaha`, `lookup_sites`, `lookup_tags` and `lookup_tourney_type`. The rest are `player`, `notes`, `notes_auto`, `tags`, `settings`, the `live_*` tables, and a `tourney_*` mirror of each cash table. [TAL] counts 38 tables in schema `public`.

General facts:

- **No foreign keys are declared.** Joins are by convention only [TAL README].
- **PT3 → PT4.** PT3 had `holdem_*` and `omaha_*` tables. PT4 merged them into `cash_*` and added `id_gametype` to tell games apart. kraada said "most columns that were in PT3 are in PT4" [F:37063].
- **Tournament tables are column-parallel.** `tourney_hand_player_statistics` mirrors `cash_hand_player_statistics` (242 vs 247 columns) [TAL README]. WhiteRider said most `xxx_hand_player_statistics` fields are the same [F:51879].

### 1.2 `cash_hand_summary`: one row per hand

[TAL `cash_hand_summary.md`] lists all 43 columns:

| Group | Columns |
|---|---|
| Identity | `id_hand` (PK), `id_gametype`, `id_site`, `id_limit`, `id_table`, `hand_no` (site's hand id, varchar), `date_played`, `date_imported` |
| Player counts | `cnt_players`, `cnt_players_lookup_position`, `cnt_players_f`, `cnt_players_t`, `cnt_players_r` |
| Money | `amt_pot`, `amt_rake`, `amt_jackpot_fee`, `amt_short_stack`, `amt_mgr`, `amt_pot_p`, `amt_pot_f`, `amt_pot_t`, `amt_pot_r` |
| Action strings | `str_actors_p/f/t/r`, `str_aggressors_p/f/t/r` |
| Winner | `id_win_hand`, `id_win_hand_lo`, `id_winner`, `id_winner_lo`, `button` |
| Board | `card_1`, `card_2`, `card_3` (flop in deal order), `card_4` (turn), `card_5` (river) |
| Marks | `flg_note`, `flg_tag`, `flg_autonote` |

**Board cards are smallints.** Flag_Hippo said card_1..card_3 are the flop cards in deal order, card_4 the turn and card_5 the river. He also said "% 13 maps each rank of card to a single number", and that `card_1 = 13` means the first flop card is an Ace [F:97401]. In a PT3 thread, 13, 26, 39 and 52 are the four aces [F:12946 *(user)*]. That fits 1..52 with `(card - 1) % 13` giving rank 0 (deuce) to 12 (ace). The suit order is **Unverified**.

**Action strings hold position codes.** `str_aggressors_p` lists, in order, the positions of the players who bet or raised. Preflop it always starts with `8`, because the big blind counts as the first aggressor. So a CO open is `81…` and an SB 3-bet over a BB… is matched with `'89%'` [F:51879, kraada]. kraada wrote: "Only raiser positions are stored in the aggressor string and always starts with an 8 preflop for the big blind." WhiteRider wrote: "Postflop the first character is the position of the bettor, if there was one." [F:p=287224, https://www.pokertracker.com/forums/viewtopic.php&p=287224]. WhiteRider said the value is text, not a number [F:51879]. GTOHelper replays a street by walking `str_actors_*` and `str_aggressors_*` one character at a time, one character per position [GTO]. OpenHoldem's stats test patterns such as `str_aggressors_p LIKE '81%' AND str_actors_p LIKE '1%'` [OH].

### 1.3 `cash_hand_player_statistics`: one row per player per hand

This is the central table: "one row per (hand × dealt-in player)", with 247 columns [TAL]. Only dealt-in players have rows [TAL]. Every opponent at the table gets a full row, not just the Hero. There is a `flg_hero` column [RH `cash/hand_player_statistics.sql`].

Column naming follows prefix + street + concept + suffix:

- **Prefix**: `flg_` boolean, `cnt_` small count, `amt_` money, `val_` numeric value or percentage, `enum_` one-character code, `id_` reference.
- **Street letter**: `p` preflop, `f` flop, `t` turn, `r` river.
- **Suffix**: `_opp` means "had the opportunity", the denominator. `_def_opp` means "faced it", the denominator for the defending side. `_action` (on `enum_`) records the response.

[TAL] warns: "divide by the count of opportunities, not by total hands." WhiteRider's PT3 tutorial uses the same prefixes but defines them in a post not included in the fetched pages [F:22599].

Real column names, grouped. Sources: [FPDB] (from PT4's StatDefinitions.pt4), [RH], [TAL], [OH] and [GTO]. [TAL] gives the meanings where it documents a column.

**Identity and context**

`id_hand`, `id_player`, `id_player_real` (canonical id when aliases exist), `id_limit`, `id_session`, `id_gametype`, `date_played`, `position`, `cnt_players`, `cnt_players_lookup_position`, `flg_hero`, `holecard_1`, `holecard_2` (`holecard_3`/`_4` for Omaha [FPDB]), `id_holecard`, `id_final_hand`, `val_curr_conv`.

**Stacks and money**

- Stack: `amt_before` (stack before the hand), `amt_p_effective_stack`, `amt_f_effective_stack`, `amt_t_effective_stack`, `amt_r_effective_stack`.
- Posted: `amt_blind`, `amt_ante`, `amt_straddle`.
- Put in per street: `amt_bet_p`, `amt_bet_f`, `amt_bet_t`, `amt_bet_r`, `amt_bet_ttl`.
- Result: `amt_won`, `amt_expected_won` (all-in EV), `val_equity`.
- Tournament payout: `amt_payout`, `amt_payout_fee`.

Flag_Hippo: "Effective stack in PokerTracker 4 is the maximum amount a player could lose in a pot as of their first action in a hand", and it "doesn't change" after that first action [F:100413].

**Preflop**

- Raising and calling: `flg_vpip`, `cnt_p_raise` (PFR is `cnt_p_raise > 0` [TAL]), `cnt_p_call`, `flg_p_first_raise`, `flg_p_limp`, `flg_p_fold`, `flg_p_ccall`.
- Facing: `flg_p_face_raise`, `cnt_p_face_limpers`.
- Open: `flg_p_open`, `flg_p_open_opp`.
- 3-bet: `flg_p_3bet`, `flg_p_3bet_opp`, `flg_p_3bet_def_opp`, `enum_p_3bet_action`.
- 4-bet: `flg_p_4bet`, `flg_p_4bet_opp`, `flg_p_4bet_def_opp`, `enum_p_4bet_action`.
- Squeeze: `flg_p_squeeze`, `flg_p_squeeze_opp`, `flg_p_squeeze_def_opp`, `enum_p_squeeze_action`.
- Steal and blind defence: `flg_steal_att`, `flg_steal_opp`, `flg_blind_def_opp`, `flg_blind_s`, `flg_blind_b`, `flg_blind_ds`, `flg_blind_db`, `flg_sb_steal_fold`, `flg_bb_steal_fold`.

kraada: `cnt_p_face_limpers` "contains the number of players who had limped at the time of that player's first preflop action" [F:51879].

**Preflop sizing**

`amt_p_raise_facing`, `amt_p_2bet_facing`, `amt_p_3bet_facing`, `amt_p_4bet_facing`, `amt_p_5bet_facing`, `amt_p_raise_made`, `amt_p_raise_made_2`, `val_p_raise_facing_pct`, `val_p_2bet_facing_pct`, `val_p_3bet_facing_pct`, `val_p_4bet_facing_pct`, `val_p_5bet_facing_pct`, `val_p_raise_made_pct`, `val_p_raise_made_2_pct`, `val_p_raise_aggressor_pos`.

Flag_Hippo: "amt_p_raise_made is the size of the first raise made by a player" [F:100413].

**Postflop, per street.** Shown for the flop (`f`). The same set exists for `t` and `r` unless noted.

- Presence and position: `flg_f_saw`, `flg_f_first`, `flg_f_has_position` (also `flg_r_has_position` [FPDB]).
- Actions: `flg_f_bet`, `flg_f_check`, `flg_f_fold`, `flg_f_check_raise`, `flg_f_face_raise`, `flg_f_first_raise`, `flg_f_open`, `flg_f_open_opp`, `cnt_f_raise`, `cnt_f_call`.
- C-bet: `flg_f_cbet`, `flg_f_cbet_opp`, `flg_f_cbet_def_opp`, `enum_f_cbet_action`.
- Donk: `flg_f_donk`, `flg_f_donk_opp`, `flg_f_donk_def_opp`, `enum_f_donk_action`.
- 3-bet and 4-bet: `flg_f_3bet`, `flg_f_3bet_opp`, `flg_f_3bet_def_opp`, `enum_f_3bet_action`, `flg_f_4bet`, `flg_f_4bet_opp`, `flg_f_4bet_def_opp`, `enum_f_4bet_action`.
- Float, turn and river only: `flg_t_float`, `flg_t_float_opp`, `flg_t_float_def_opp`, `enum_t_float_action` (and the `r` set).
- Sizing: `amt_f_bet_made`, `amt_f_bet_facing`, `amt_f_raise_facing`, `amt_f_2bet_facing`, `amt_f_3bet_facing`, `amt_f_4bet_facing`, `amt_f_raise_made`, `amt_f_raise_made_2`, `val_f_bet_made_pct`, `val_f_raise_facing_pct`, `val_f_2bet_facing_pct`, `val_f_3bet_facing_pct`, `val_f_4bet_facing_pct`, `val_f_raise_made_pct`, `val_f_raise_made_2_pct`, `val_f_raise_aggressor_pos`.

[TAL] checked `val_f_bet_made_pct` against live data: it is a percentage (100 = pot), "observed range 4.4 to 933.5, avg 47.8". [TAL] contradicts itself on this in its own gotchas, and the range settles it.

**Hand outcome**

`flg_showdown`, `flg_showed`, `flg_won_hand`, `enum_folded`, `enum_allin`, `enum_face_allin`, `enum_face_allin_action`.

WhiteRider's PT3 tutorial gives the street letters used in `enum_` fields: "P = Preflop, F = Flop, T = Turn, R = River, N = None" [F:22599]. That `enum_allin` and `enum_folded` hold a street letter is inferred from this and is **Unverified** for PT4.

**Per-street action references**

`id_action_p`, `id_action_f`, `id_action_t`, `id_action_r`, each joined to `lookup_actions.id_action` [GTO, OH, NOAR].

There are no `val_f_afq` or aggression-frequency columns per hand. AF and AFq are stat-level formulas over the `cnt_*` columns. That they are only stat-level is **Unverified**: no source lists such a column, and none says one is absent.

### 1.4 `lookup_actions`: the action sequence per street

- **What it holds.** Flag_Hippo described `lookup_actions` as the table "which records the players actions in order on each street" [F:100413]. One row is one distinct action string. A player's row in `cash_hand_player_statistics` points at one string per street via `id_action_*`.
- **Letters.** X = check, F = fold, C = call, B = bet, R = raise [F:22599, WhiteRider, PT3 tutorial].
- **Strings are concatenated per player per street.** WhiteRider notes that for "XR" (check-raise), grouping by the first character "will count that as a check" [F:58607]. GTOHelper filters on `action != 'F'`, `LIKE '%C'` and `NOT LIKE '%C'` [GTO]. [NOAR] rebuilds the mapping by concatenating a player's non-blind actions on a street (e.g. `XC`, `RC`), with `NONE` when the player did not act.
- **Example strings.** Exact strings such as `'CC'` or `'XRC'` are plausible from this but **Unverified** from a PT source.
- **In the stat editor.** The editor exposes the table as `lookup_actions_p`, `lookup_actions_f`, `lookup_actions_t` and `lookup_actions_r`, which are pre-joined aliases [DOC-CACHE]. Typical expressions are `lookup_actions_p.action LIKE '%R'` [F:100413] and `if[lookup_actions_f.action LIKE 'B%', 1, …]` [F:58607, kraada]. Staff use `substring(lookup_actions_f.action from 1 for 1)` to group by first action [F:58607].

**So PT4 stores both the derived booleans and a compact action-sequence string per player per street.** It stores the string as a small id into a dictionary of distinct strings, so many hands share one value. Anything the booleans do not cover is matched by `LIKE` on that string at query time.

### 1.5 `cash_hand_player_combinations`: made hands and draws per street

A separate table, keyed by `id_hand` and `id_player`, one row per player per hand [RH `cash/hand_player_combos.sql`]. Columns exist for each of `f`, `t` and `r`. Draw columns are flop and turn only.

| Group | Columns |
|---|---|
| Made-hand class | `flg_x_highcard`, `flg_x_1pair`, `flg_x_2pair`, `flg_x_threeoak`, `flg_x_straight`, `flg_x_flush`, `flg_x_fullhouse`, `flg_x_fouroak`, `flg_x_strflush` |
| Strength within class | `id_x_hand_strength`, `id_x_kicker_strength`, `val_x_hole_cards_used` |
| Draws (f, t) | `flg_x_flush_draw`, `flg_f_bflush_draw` (backdoor), `flg_x_straight_draw` (OESD), `flg_x_gutshot_draw`, `flg_x_2gutshot_draw` (double gutshot), `flg_f_bstraight_draw` (backdoor), `id_x_flush_draw_strength`, `val_x_straight_draw_nut_outs`, `val_x_straight_draw_nonnut_outs` |
| Blockers | `flg_x_nut_flush_blocker` |

Sources: [RH]; WhiteRider named the draw flags in [F:92990].

`id_x_hand_strength` is relative to the made-hand class, so it is read together with the class flag. kraada posted the list of values, "updated for PT4 values on 16/11/15" [F:17317]. Examples from it:

- One pair: "0 - Board Paired or low pocket pair (under the 3rd board card)" … "6 - Pocket Pair, overpair". Top pair is 3 [F:17317, F:96407 via search snippet].
- Two pair: up to "9 - Top two pair".
- Flush: 10 is the nut flush.

`id_x_kicker_strength`: "1 is top kicker, 2 is second" [F:92990]. Top pair is written `flg_f_1pair AND val_f_hole_cards_used = 1 …` and underpair is `flg_f_1pair and id_f_hand_strength = 0` [F:92990].

### 1.6 Other lookups

- **`lookup_positions`**, 69 rows covering table sizes 2–10 [TAL `lookup_positions.md`]. Columns: `cnt_players`, `position`, `absolute_position`, `description` (`BUTTON`, `SB`, `BB`, `CO`, `MP`, `UTG`…), `flg_sb`, `flg_bb`, `flg_ep`, `flg_mp`, `flg_co`, `flg_btn`. It is joined on `position` + `cnt_players_lookup_position`. Position codes count seats from the button: 0 = BTN, 1 = CO, 2 = HJ…, and **8 = BB, 9 = SB at every table size** [TAL; F:51879; OH uses `position = 0/1/8/9`]. The caching guide says to test `cash_hand_player_statistics.position` directly instead of joining `lookup_positions`, because that join cannot be cached [DOC-CACHE].
- **`lookup_hole_cards`**: `id_holecard`, `hole_cards`, `id_gametype`, `flg_h_suited`, `flg_h_connector`, `flg_h_1_gap`, `flg_h_2_gap` [RH `lookup/holecards.sql`]. Two guesses here are **Unverified**: that `id_holecard` is the 169-class preflop hand (e.g. "AKs") rather than the exact combo, and that `holecard_1/2` use the same 1..52 coding as the board.
- **`lookup_hand_ranks`**: `id_hand_rank`, `id_group`, `group_name`, `group_details` [RH `lookup/hand_ranks.sql`]. kraada pointed to it as listing 302 ranks. WhiteRider clarified that it holds "the hand ranks, not 'hand strength'" [F:17317]. That `id_final_hand` / `id_win_hand` join to it is **Unverified**.
- **`lookup_hand_groups`** exists [RH]. Its columns are **Unverified**.
- **Board texture.** **There are no board-texture tables or columns.** Asked how to build texture columns, Flag_Hippo said to add the built-in "Board Texture" filter to a report and read the SQL it generates from the PT4 log. The monotone-flop SQL is arithmetic on `cash_hand_summary.card_1..3`, of the form `card_1 - ((card_1 - 1) % 13)` compared across the three cards [F:105641]. Texture is computed per query.

### 1.7 `cash_limit`, `cash_hand_histories`, `cash_table_session_summary`, `player`

- **`cash_limit`** (14 columns): `id_limit`, `limit_name`, `id_gametype`, `limit_currency`, `amt_sb`, `amt_bb`, `flg_nlpl`, `flg_nl`, `flg_pl`, `flg_lo`, `flg_fr`, `flg_sh`, `flg_hu`, `id_filter` [TAL `cash_limit.md`].
- **`cash_hand_histories`**: `id_hand`, `history` (the raw text) [GTO `PT4LookupDM.java`].
- **`cash_table_session_summary`**: joined on `id_session` [TAL, GTO]. Its columns are **Unverified**, apart from `val_curr_conv` [TAL].
- **`player`**: `id_player`, `id_site`, `player_name`, `player_name_search` (lowercase), `id_player_alias`, `flg_note`, `flg_tag`, `flg_anonymous` [TAL `player.md`].
- **`tags`**: `id_tag`, `id_x` (hand id), `enum_type`, `flg_tournament`, `flg_auto`. **`notes`**: `id_note`, `id_x`, `note`… [FPDB, GTO].

### 1.8 `cash_cache` and `cash_custom_cache`

- **`cash_cache`** holds pre-aggregated counts per player. Its columns mirror the stat columns as sums: `cnt_hands`, `cnt_vpip`, `cnt_pfr`, `cnt_pfr_opp`, `cnt_walks`, `cnt_p_3bet`, `cnt_p_3bet_opp`, `cnt_p_3bet_def_opp`, `cnt_p_3bet_def_action_fold`, `cnt_steal_att`, `cnt_steal_opp`, `cnt_steal_def_opp`, `cnt_steal_def_action_fold`, `cnt_f_cbet`, `cnt_f_cbet_opp`, `cnt_f_cbet_def_opp`, `cnt_f_cbet_def_action_fold`, `cnt_p_raise`, `cnt_p_call`, `cnt_f_bet`, `cnt_f_call`, `cnt_t_bet`, `cnt_r_bet`, `cnt_wtsd`, `cnt_wtsd_won`, `amt_expected_bb_won`, keyed with `id_player` and `id_limit` [SLOW, S47]. Clients `SUM()` across rows [SLOW].
- **Grain, per kraada.** The cache "stores data in a fragmented way which is then added back together depending on your configuration". It is split by game type, limit, whether the player was in position on each postflop street, and "by week (for the last X weeks option)". WhiteRider added that it holds position *types*, not position numbers [F:55819]. The exact key columns are **Unverified**.
- **`cash_custom_cache`** holds cached custom columns. That it is the table that grows when users add custom stats, and that PostgreSQL's 1,600-column limit applies to each cache table, is reported by a staff answer seen only in a search snippet [F:97339, **Unverified** as not read in full]. Before PT4 4.11 custom columns could not be cached at all [DOC-CACHE].

---

## 2. Granularity, in short

| Fact | Where it lives | Grain |
|---|---|---|
| Hand metadata, board, pot per street, who acted and raised (as position strings) | `cash_hand_summary` | 1 row per hand |
| Every derived action fact (flags, `_opp`, counts, sizes, effective stacks, EV) | `cash_hand_player_statistics` | 1 row per dealt-in player per hand |
| A player's action sequence on a street | `id_action_x` → `lookup_actions.action` (shared dictionary of strings) | 1 id per player per street |
| Made hand, strength, kicker, draws per street | `cash_hand_player_combinations` | 1 row per player per hand |
| Board texture | Nowhere; arithmetic on `card_1..5` at query time | — |
| Position names and groups | `lookup_positions`, joined on `position` + `cnt_players_lookup_position` | lookup |
| Aggregated stat counts | `cash_cache` / `cash_custom_cache` | per player × game type × limit × in-position flags × week (per kraada) |

---

## 3. How filters and stats are written over these columns

- **Building blocks.** "Columns are the building blocks of statistics and are built directly from the information in the database." "Each column's expression is the SQL used to generate the column's value." [DOC-CS]
- **Columns.** A column is a SQL-like expression in PT's own syntax: `if[cond, a, b]` for CASE, plus `sum(...)`, `LIKE`, `SIMILAR TO` and `substring` [F:22599]. Fields are written fully qualified, e.g. `cash_hand_player_statistics.flg_f_cbet`. A count column is written like `sum(if[cash_hand_player_statistics.flg_p_3bet, 1, 0])`.
- **Stats.** A stat is a ratio of two columns, e.g. `cnt_p_3bet / cnt_p_3bet_opp` [DOC-CACHE names those two cached columns for "3Bet Preflop"].
- **A full example.** Flag_Hippo corrected one user's all-in column:

  ```
  sum(if[tourney_hand_player_statistics.id_blinds = tourney_blinds.id_blinds AND
         (tourney_hand_player_statistics.amt_before / tourney_blinds.amt_bb) > 10 AND
         tourney_hand_player_statistics.cnt_players > 4 AND
         tourney_hand_player_statistics.amt_bet_p >= tourney_hand_player_statistics.amt_p_effective_stack AND
         lookup_actions_p.action LIKE '%R', 1, 0])
  ```

  [F:100413]
- **Built-in filters.** The filter tree (Hand Values, Board Texture, Actions and Opportunities…) [DOC-GF] compiles to the same kind of SQL. Staff tell users to turn on logging (Configure → Options) and copy the SQL a built-in filter generates from `PokerTracker4.log` [F:105641, F:103331]. Filters are therefore WHERE-clauses over the per-player-hand row, its combinations row, the summary row and the action dictionary.
- **What can be cached.** A column can be cached only if it references `cash_hand_player_statistics`, which supplies "position, stake, and date details". A column that only touches `cash_hand_summary`, `cash_hand_player_combinations`, `cash_limit` or `cash_table_session_summary` cannot be cached. Subqueries, `lookup_positions` references and "Group By" stats cannot be cached [DOC-CACHE].
- **Uncached stats are slow.** "Reports and graphs, however, are not loaded in separate stages, so a single uncached stat slows the loading time of the entire report or graph." The guide's example: a 1 ms-per-player subquery costs "10 seconds per hand (unacceptable)" on a 10,000-player database [DOC-CACHE].
- **Filters bypass the cache.** "The cache is used for reports as well, where possible, but there are some report groupings where the cache can't be used" [F:55819]. Once a filter is applied, reports fall back to scanning base tables. That this is the main slow path is consistent with staff answers but stated firmly only in a search snippet, so it is **Unverified** as a rule.
- **Indexes.** No source documents which indexes PT4 creates. Housekeeping offers **Reindex** and **Cluster** [DOC-HK], so indexes exist and at least one table is clustered on one. The index list is **Unverified**. It can be read from PT4's own `Data/Schemas/schema.postgres.sql`, which ships with the app [FPDB header; F:47036 via search snippet].
- **Big databases.**
  - The official line is that the DB "was designed to handle millions of hands" and needs no splitting by site or stake [DOC-DBM].
  - "hard drives are therefore the number one cause of speed issues", and PostgreSQL's default memory settings are "far from optimum" [DOC-TUNE].
  - WhiteRider, on 3M hands: "if you're only using built-in stats (which are cached) then it shouldn't cause any significant problems". To keep observed hands out of reports he suggests a separate database [F:53893].
  - On a ~70 GB database, kraada suggested Cluster, warning it "may take quite a while (many hours if not days)" [F:91954].
  - Housekeeping is recommended when "importing has slowed down or reports load slower than they once did" [DOC-HK].

---

## 4. Schema evolution

- **No documented "recalculate" step.** PT4 has no documented step that recomputes derived columns of existing hands. The tools are Housekeeping (Tune / Reindex / Cluster / Vacuum-Analyze) [DOC-HK] and **Rebuild Cache** (Database Management → Rebuild Cache → Full Cache Rebuild; per database; time depends on DB size) [DOC-CACHE].
- **New per-hand facts need a reimport.** A PT4 release notice, quoted by a user in 2012, said: "A reimport is not required to continue to use PokerTracker 4, but it is advised … to take advantage of … some key stat calculations" (effective stack), because "the changes to the database must be made during a hand import" [F:42937 *(user, quoting a notice)*]. **Derived per-hand columns are computed only at import.** A version that adds a new derived column leaves old hands without it until they are re-imported from the raw files, which PT keeps in a Processed folder. The cache, by contrast, can be rebuilt from the base tables.
- **Version updates run a "database update."** Staff only note it blocks until pending notes are processed [F:94756]. What it changes is **Unverified**.
- **Custom stats sidestep the problem.** They are expressions evaluated over existing columns, so a new stat needs no reimport as long as the needed facts are already stored. When the facts are missing, users fall back to `lookup_actions` string matching or `str_aggressors` parsing [F:58607, F:51879].

---

## 5. Licensing and legal: what PokerTracker says

- **PT3 vs PT4.** PT published a schema document for PT3. For PT4: "While we haven't published the database schema for PokerTracker 4 the PokerTracker 3 schema is still mostly valid", and column descriptions are viewable in Configure → Statistics [F:47036, Flag_Hippo, 2017-04-02, https://www.pokertracker.com/forums/viewtopic.php?t=47036&p=337626]. He added: "I cannot make any promises with regards to the publishing of the PokerTracker 4 database schema" (2017-04-03, same thread).
- **Early promises.** In 2011 WhiteRider expected a schema "fairly soon" once the structure stabilised [F:37063]. In 2014: "I believe we plan to publish the PT4 database schema but I'm not sure when" [F:55098]. In 2023 Flag_Hippo repeated: "We have not published the schema like we did for PokerTracker 3", and declined to support querying the database directly, pointing users to the log files instead [F:103331].
- **Community document.** A user (beninu) assembled an unofficial PDF in 2017, hosted at pt4db.beninu.dk. In 2024 WhiteRider said it "was hosted by a third party and it isn't something I have a copy of" [F:47036 page 5, https://www.pokertracker.com/forums/viewtopic.php?f=58&t=47036&start=40&view=print]. It is no longer online.
- **No developer program.** No source found describes a developer program, licence or terms for third-party use of the schema. Whether PT's EULA (https://www.pokertracker.com/eula.php) addresses it was not checked: **Unverified**.
- **How this note uses it.** This note uses the schema only as design input. Whether Runout should ever read a PT4 database is a separate question that it does not answer.

---

## 6. Assessment for Runout: what maps to "one row per Hero hand"

**Maps cleanly to precomputed columns on one Hero-hand row.** PT4 already does these per player per hand at import:

- **Preflop and postflop booleans with `_opp` / `_def_opp` pairs and `enum_*_action` responses**, per street: VPIP, PFR, open, limp, cold-call, 3-bet, 4-bet, squeeze, steal, blind defence, c-bet, donk, float, check-raise, saw street, has position, showdown, won. This is the core idea worth copying. Every "Hero did X" filter has a sibling "Hero could have done X" column, so filters and frequency stats are single-row predicates.
- **Counts per street** (`cnt_x_raise`, `cnt_x_call`) and **sizes**, both absolute (`amt_*`) and as % of pot (`val_*_pct`), for made, facing, 2bet, 3bet and 4bet. Also effective stack per street, stack before, money in per street, won, all-in EV and equity.
- **Position** as a small int code (BTN = 0 … BB = 8, SB = 9) plus `cnt_players_lookup_position`. Named groups come from a 69-row lookup.
- **Made hand and draws per street** (class flags, strength-within-class, kicker rank, hole cards used, draw flags, nut outs, blockers). PT4 keeps these in a sibling table (`cash_hand_player_combinations`) with the same key, not in the stats row. For a Hero-only design they can sit on the same row or on a 1:1 side table.
- **Action sequence per street** as a small id into a dictionary of distinct strings (`'X'`, `'XR'`, `'RC'`…). It is cheap to store and serves as the escape hatch for any line the flags do not name, at the price of `LIKE` matching. A Postgres-native alternative is a short `text` column per street with a btree or trigram index. That choice is a design option, not something PT does.
- **Hand-level facts** (pot per street, players per street, board cards, aggressor order) sit once per hand. With Hero-only rows, Runout can fold them into the same row.

**PT4 computes these at query time:**

- **Board texture** (monotone, paired, connected, high card…): arithmetic on `card_1..5` inside the WHERE clause. With 10M rows this is a full scan unless indexed. Runout could instead precompute a few texture columns (suit pattern, paired, straightness, high rank per street), which costs little at import.
- **"Versus whom" and line-relative questions** (who opened, Hero's position relative to the aggressor, SB-vs-BB 3-bet pots): `LIKE` on `str_aggressors_p` / `str_actors_p` position strings. Only `val_x_raise_aggressor_pos` is precomputed.
- **Every stat value**: `sum(if[...]) / sum(if[..._opp])` over the filtered rows. Only the **cache** (per player × game type × limit × in-position × week) makes HUD and unfiltered reports fast. Filtered reports scan base tables.
- **Named position groups** via the `lookup_positions` join (uncacheable; staff advise testing `position` directly).
- **Custom columns**, including subqueries, evaluated on demand. Cacheable since 4.11 unless they use subqueries.

**Lessons for a 10M-hand Library with Hero-only filters:**

1. One row per Hero hand with a few hundred narrow columns (booleans, smallints, numerics) is what PT4 does per player, and it scales to millions of rows on commodity disks.
2. PT4's real speed comes from the pre-aggregated cache, not from the row design. Ad-hoc filters fall back to scanning, which staff call slow on big DBs.
3. PT4 never back-fills new derived columns. Adding one means a reimport from raw hand histories. Runout should keep raw hand text (as PT4 does in `cash_hand_histories`) and plan a re-derive job keyed by a derivation version per row. That job is a design recommendation, not a PT feature.
4. PT4's choices around foreign keys and texture leave room to do better: no FKs, opaque `str_*` encodings, and texture recomputed per query. Runout can add FKs, explicit columns for aggressor position and pot type, and stored texture columns at little cost.
