# Stat breakdowns: how PT4 and HM3 split a player's Stats in their reports

Research note, 2026-11-18. Every source below was read on 2026-11-18. Anything marked **Unverified** could not be confirmed from a primary source. Stat definitions, sample sizes and HUD defaults are in [hero-stats.md](hero-stats.md) and are not repeated here.

## Verdict

- **The pattern is one row per Position and one column per Stat, with a totals row.** PT4 does this with the Summary report set to "Group By: Position". HM3 has a "By Position" report, and both trackers let the user choose which Stat columns it shows. Neither tracker builds IP/OOP or pot type into the report as an extra axis (§1, §2).
- **IP/OOP and pot type are handled in two ways: as filters on the whole report, or as separate named Stats.** PT4 staff say "You do not need separate stats for in and out of position": you apply a position filter. PT4 also ships a few named variants, such as "CBet Flop in 3Bet+ Pot" and "Fold to PF 3Bet After Raise IP/OOP". HM3 names whole families of Stats by spot, such as "Turn CBet-Fold IP/OOP SRP". For Runout, a few spot dimensions (Position, IP/OOP, SRP/3BP/4BP, HU/MW) can each be applied to the same Stat. That is cleaner than either tracker's approach (§1.3, §2.3).
- **Neither tracker has a general preflop IP/OOP.** PT4 says position is "harder to define preflop". In both trackers, the preflop IP/OOP variants exist only for 3-bet and Fold to 3-bet, and they mean relative to the opener or the 3-bettor. Runout should define IP/OOP relative to the opponent the Stat is about, and offer it only where that is meaningful (§1.3).
- **Drilling down: selecting a row shows its Hands underneath.** PT4's built-in Summary reports show the Hands for the selected row in the lower pane. PT4's custom reports cannot do this. HM3's reports have a hands grid, and its Situational Views open the Hand View when a Position is clicked. Runout's version: clicking a cell opens the Hand list filtered to that Stat's opportunities in that spot (§3).
- **Neither tracker shows opportunities per cell by default.** PT4 shows a Hands column. Its times/opportunities appear only in tooltips or in custom format strings. HM3 can show "Times/Opportunities", but that is a HUD option, and empty cells show "-". Runout should show the opportunity count in each cell and dim cells with a small sample, as hero-stats.md §3 proposes (§4).
- **Use six Position groups by default (EP, MP, CO, BTN, SB, BB), with a per-seat mode for full ring.** This is both trackers' convention: PT4 has "Position" and "Position (Full Ring)", HM3 has "Position" and "Position (FR)". EP and MP mean different seats depending on how many players are dealt in, so PT4 staff advise filtering by table size so that 6-max and full ring are not mixed (§5).

## 1. PokerTracker 4

### 1.1 Where the split reports live
- View Stats has five tabs: Results, Statistics, LeakTracker, My Reports and Graphs. "Use the filters and drop-down menus on the left of each tab to drill down." ([PT4 Quick Start Guide](https://docs.pokertracker.com/pt4/general/pokertracker-4-quick-start-guide/))
- **Statistics → Summary → Group By** is the main way to split Stats. It groups by Position, by Position (Full Ring), by Starting Hands, by Tournament and by other options. Staff answers:
  - "use the Statistics > Summary > Group by Position report to see your stats and hands separated by position". (WhiteRider, moderator, 2020-03-07, [forum t=98262](https://www.pokertracker.com/forums/viewtopic.php?f=61&t=98262))
  - "Overview > By Position" in the Results or Statistics tab is a second route. (WhiteRider, 2014-05-13, [forum t=53920](https://www.pokertracker.com/forums/viewtopic.php?t=53920); kraada, moderator, 2015-07-14, [forum t=58603](https://www.pokertracker.com/forums/viewtopic.php?f=61&t=58603))
  - The by-Holdings view is "Group by Starting Hands (Holdem)". To see Holdings within one Position, WhiteRider suggests filtering on that Position, because a report with Position × Hole Cards rows "may not be so easy to read". (WhiteRider, 2016-05-02, [forum t=91646](https://www.pokertracker.com/forums/viewtopic.php?f=58&t=91646))
- **My Reports:** a custom Player Report is set up in a wizard. After Next, the user picks how rows are grouped, for example by Player or by Position. "Each row in the report will contain information about a single player" when grouped by Player. ([Creating My Reports](https://docs.pokertracker.com/pt4/tutorials/reports-stats-and-filters/creating-my-reports/))
  - Adding the Position stat to a report also splits it: "add a Position stat to your report to break it up into a line per position". (WhiteRider, 2014-05-13, [forum t=53920](https://www.pokertracker.com/forums/viewtopic.php?t=53920))
- "Group By" stats exist only to split a report into rows. They are meant for reports, not HUDs. ([Database Caching Guide](https://docs.pokertracker.com/pt4/tutorials/database-management/database-caching-guide/))

### 1.2 Row and column shape
- Each row is a group, such as a Position. Each column is a Stat. A bottom row gives the totals ("the overall data is in the bottom summary row"). That quote is from a search snippet of a PT forum post. **Unverified** at the source, but it matches the docs' description of rows and columns.
- The user picks the columns: right-click → Configure Report, then double-click Stats to add or remove them and use the arrows to reorder them. A report can be exported as CSV. ([Configuring Reports](https://docs.pokertracker.com/pt4/tutorials/reports-stats-and-filters/configuring-reports/))

### 1.3 IP/OOP and pot type
- **Postflop IP/OOP is a filter or a property, not a separate Stat:**
  - "You do not need separate stats for in and out of position." In reports the user adds a filter, Hand Details → Player Position, and then "the normal stat will show the relevent percentage". (WhiteRider, 2016-05-06/07, [forum t=91670](https://www.pokertracker.com/forums/viewtopic.php?t=91670))
  - In the HUD, the same split is set with the Stat's "Has Position" property, for example on the built-in "CBet Flop in 3Bet+ Pot". (kraada, 2016-05-24, [same thread](https://www.pokertracker.com/forums/viewtopic.php?t=91670))
- **Preflop:** "There isn't a filter for in/out of position preflop as that is somewhat harder to define preflop." (Flag_Hippo, moderator, 2016-09-08, [forum t=92362](https://www.pokertracker.com/forums/viewtopic.php?f=58&t=92362))
  - The exception is a built-in pair, "Fold to PF 3Bet After Raise IP/OOP". It is split by IP/OOP but not by Position. (Flag_Hippo, 2021-05-25, [forum t=100556](https://www.pokertracker.com/forums/viewtopic.php?f=61&t=100556))
- **Pot type:** there are a few built-in variants, such as "CBet Flop in 3Bet+ Pot" (kraada, cited above). Otherwise there is no 3-bet-pot split. kraada's workaround is a custom stat that checks `char_length(cash_hand_summary.str_aggressors_p) = 3`, which he called "Not handy". (2016-05-26, [forum t=91670](https://www.pokertracker.com/forums/viewtopic.php?t=91670))
- **Heads-up vs multiway:** no built-in split was found. Flag_Hippo explained how to make IP and OOP versions of a "CBet Flop Multiway" stat using `flg_f_has_position` (2020-07-31, [forum t=99228](https://www.pokertracker.com/forums/viewtopic.php?t=99228&p=358209)). The stat itself is from the Download Warehouse. **Unverified** as a built-in.

## 2. Hold'em Manager 3

### 2.1 Reports
- HM3 groups its reports into Cash and Tournament. Report columns can be dragged to reorder them, hidden or shown with a right-click, and sorted by clicking a header. "Select Stats" (the Stats Picker) chooses the columns. Right-clicking a row offers CSV or HTML export and "Select all". ([HM3 KB, Reports](https://kb.holdemmanager.com/knowledge-base/article/hm3-reports))
- **Position grouping:** in 3.1.23.0 (2022-04-11), Position and Position (FR) were removed from the Stats Picker "as these are only used for reports groupings". That makes Position a grouping, not a Stat, and confirms a 6-max set and a full-ring set. ([HM3 Release Notes](https://kb.holdemmanager.com/knowledge-base/article/hm3-release-notes))
- **Other report groupings:** HM3 added a "Preflop Pot" report and "Preflop, Flop, Turn, and River Line reports" in 3.1.36.0 (2024-08-09). These group results by pot type and by action line. ([HM3 Release Notes](https://kb.holdemmanager.com/knowledge-base/article/hm3-release-notes)) Their exact columns: **Unverified**.
- A "By Position" report exists, among "over 25 default reports" ("By Position, By Session, By Stakes, By Stack Size"). This comes from a search snippet of holdemmanager.com/hm3, which returns 403. **Unverified** at the source.

### 2.2 Situational Views
These are graphical dashboards, not tables. They are the closest thing in either tracker to a "Stats by spot" screen. ([HM3 KB, Situational Views](https://kb.holdemmanager.com/knowledge-base/article/situational-views))

| View | Sub-views that split a Stat |
|---|---|
| 3-Bet | Results, **Position** (EP, MP, CO, BTN, SB, BB), Range, Success, Flop Hand Strength |
| C-Bet | Board Texture, **Position**, Hand Strength, **Heads-Up vs Multiway**, **In Position vs Out of Position**, Skipped CBet |
| River Play | Hole Cards, Hand Strength, Aggression %, Call/Bet Efficiency, Pot Size |
| Tournament All-In | Calling and raising by stack size, range and Position; "Vs Open" and "Vs 3-Bet" |

Each sub-view has a summary tile on the left and graphs in the main area. The views use the same filters as the reports.

### 2.3 IP/OOP and pot type
- **Filters:** "Relative Position & Relative 3-Bet Position" select IP or OOP: "In Position means you are last to act post flop." Pot type is set through "Preflop Action Facing Hero" and "Preflop Pot", or by giving each seat a role (Raiser, 3-Bettor, Limper or Caller). Quick Filters "can be stacked", for example 3Bet and then All-In On Flop. ([HM3 KB, Report Filters](https://kb.holdemmanager.com/knowledge-base/article/hm3-report-filters))
- **Named variants:** HM3 encodes the spot in the Stat's name. The release notes mention "Turn CBet-FOld IP/OOP SRP" (3.1.29.0) and "Skip Turn CB - Bet River SRP IP" (3.1.24.0). In 3.1.25.0 and 3.1.26.0, more Stats gained a Flop/Turn/River relative-position option and IP/OOP filtering in the HUD Editor. ([HM3 Release Notes](https://kb.holdemmanager.com/knowledge-base/article/hm3-release-notes)) Older HM HUD documents also use "SRP-" and "3BP-" prefixes with HU, IP and OOP splits ([AJA Dynamic HUD PDF](https://www.holdemmanager.com/hud_repository/docs/AJADynamicHUDDocumentationv1.2.pdf), not read, from a search snippet). **Unverified**.
- **Positional versions of Stats:** "Most stats in HM3 can be adjusted to be 'positional' stats" through Item Properties. HM3's example is a popup grid with rows "3Bet Vs EP / MP / …" and one column per 3-bettor Position. Impossible cells show "-". ([HM3 KB, Positional Stats popup](https://kb.holdemmanager.com/knowledge-base/article/create-popup-with-positional-stats))

## 3. Drilling from a number to its Hands

| Tracker | How |
|---|---|
| PT4 built-in reports | In Summary, clicking a row under By Position shows its Hands in the lower section. In Overview, the user double-clicks a row to drill down. Hands can then be replayed. (kraada, 2012-09-24, [forum t=43917](https://www.pokertracker.com/forums/viewtopic.php?f=58&t=43917)) WhiteRider: "Once you've selected the tournament … you will see its hands in the lower section". The lower section is capped by a "Last X Hands" setting, 100 by default. (2014-11-10, [forum t=56053](https://pt4.pokertracker.com/forums/viewtopic.php?f=58&t=56053&view=print)) |
| PT4 custom reports | "Drilling down isn't possible in custom reports". The workaround is a Hand Report with the same filters. (kraada, 2012-09-24, [forum t=43917](https://www.pokertracker.com/forums/viewtopic.php?f=58&t=43917)) |
| HM3 reports | Reports have a hands grid. Double-clicking a row in it opens the Replayer or the Hand Viewer, and "Row selection is now preserved when reopening a report" (3.1.25.0, 3.1.47.0, [Release Notes](https://kb.holdemmanager.com/knowledge-base/article/hm3-release-notes)). That the selected report row filters the grid: **Unverified**. The Hand View loads the last 1,000 to 100,000 Hands ([HM3 KB, Hand Views](https://kb.holdemmanager.com/knowledge-base/article/hand-views)). |
| HM3 Situational Views | Clicking a Position, a texture or a heat-map cell loads the Hand View, "so you can replay and mark hands for review" ([Situational Views](https://kb.holdemmanager.com/knowledge-base/article/situational-views)). |

Neither source says whether the drilled list holds every Hand in the row or only the Stat's opportunities. In PT4 it is the row's Hands (the row's filter), not the Hands behind one cell. **Unverified** for HM3.

## 4. Opportunities and sample size in split views

- **PT4:**
  - Reports show a Hands column, not opportunities per Stat.
  - Times/opportunities appear in a tooltip only when the Stat's value expression is exactly `(a / b) * 100`. This comes from a search snippet of [forum t=58403](https://www.pokertracker.com/forums/viewtopic.php?t=58403&p=287682). **Unverified** at the source.
  - Otherwise the counts appear only through a custom format string like "60% (12/20)" ([PT3 custom reports tutorial](https://pt4.pokertracker.com/guides/PT3/tutorials/using-custom-reports-and-statistics), secondary: PT3).
  - Each Stat is backed by a count column and an opportunity column, such as `cnt_p_3bet` and `cnt_p_3bet_opp` ([Database Caching Guide](https://docs.pokertracker.com/pt4/tutorials/database-management/database-caching-guide/)).
- **HM3:**
  - "Show Times/Opportunities" is optional on positional popups. Impossible combinations would show 0/0, so the article's author left it off ([Positional Stats popup](https://kb.holdemmanager.com/knowledge-base/article/create-popup-with-positional-stats)).
  - 3.1.25.0 added HUD options for showing times and opportunities, for a minimum number of opportunities before a Stat is shown, and for hiding opportunities above a value. 3.1.35.0 made the Opponents List hide Stats with few opportunities ([Release Notes](https://kb.holdemmanager.com/knowledge-base/article/hm3-release-notes)).
  - None of these options are documented for reports. **Unverified**.
  - Situational Views show counts only in places, such as "Hand Counts" and "Total Hands" ([Situational Views](https://kb.holdemmanager.com/knowledge-base/article/situational-views)).

## 5. Position groups, 6-max and full ring

- **PT4:**
  - "Position" gives six groups (EP/MP/CO/BTN/SB/BB). "Position (Full Ring)" gives one row per seat. "If you're using the Summary report you'll want to set it to group by Position (Full Ring) to see all individual positions." (kraada, 2014-05-03, [forum t=48596](https://pt4.pokertracker.com/forums/viewtopic.php?f=61&t=48596))
  - At 7 to 10 players, the seats before the CO are split into MP and EP: "the MP spots are the closest ones to the button". With 7 players that is 2 MP and 1 EP, with 9 players 3 MP and 2 EP. EP at full ring is therefore not 6-max UTG. (kraada, 2013-05-09/10, [same thread](https://pt4.pokertracker.com/forums/viewtopic.php?f=61&t=48596))
  - Position numbers depend on table size. The SB is always 9. EP is position 3 at 6-max and positions 5 and 6 at 9-max. ([Seating: Reports, Stats, and Preferred Seating](https://docs.pokertracker.com/pt4/tutorials/the-hud/seating-reports-stats-and-preferred-seating/))
  - Staff advise filtering by the number of players dealt in, "so you do not have 6 handed EP stats mixed with full ring EP stats". This is from a search snippet. **Unverified** at the source.
- **HM3:**
  - Has a "Position" grouping and a "Position (FR)" grouping ([Release Notes](https://kb.holdemmanager.com/knowledge-base/article/hm3-release-notes), 3.1.23.0).
  - Situational Views use EP, MP, CO, BTN, SB and BB. The 3-bet positional popup leaves out EP, because "you can't 3Bet from early position" ([Positional Stats popup](https://kb.holdemmanager.com/knowledge-base/article/create-popup-with-positional-stats)).
- **For Runout:** `positions()` already names both sets (hero-stats.md §4). Offer six groups by default and a per-seat view when the Library holds full-ring Hands, or split by table size.
