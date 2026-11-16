# How PokerTracker 4 filters hands

Research note, 2026-11-16. Sources were read on 2026-11-16.

**About the sources.** PokerTracker's official guide (now at docs.pokertracker.com) has one page on filters. It explains the filter window's mechanics and its top-level sections, but it does not list the tree below them. The tree in this note comes from two other kinds of source:

- **Screenshots of the actual filter dialog** in an MIT OpenCourseWare lecture deck on PT4 (2015, PT4 v4.x, Tournament Filters window). These show real UI labels, read off the images.
- **Filter paths quoted by PokerTracker support staff** on the official forums (pokertracker.com/forums), mostly from 2019 to 2026. Staff write paths as `Section -> Sub-section -> Option`, and the "Current / Active Filters" panel writes them as text such as `(Raise Opportunity Type Raise Float Bet Opportunity)`. Both are reproduced here as they were written.

No source lists every leaf. A label marked **UNCONFIRMED** was inferred, for example from another street's equivalent or from a single user post. The screenshots are from the tournament window. The guide says the cash window has the same sections plus **Session Details**, and its **Game Details** leaves differ (no tournament items).

Abbreviations used for sources:

- **[GF]**: Official guide, "Global Filters aka 'More Filters'", https://docs.pokertracker.com/pt4/tutorials/reports-stats-and-filters/global-filters-aka-more-filters/
- **[MR]**: Official guide, "Creating My Reports", https://docs.pokertracker.com/pt4/tutorials/reports-stats-and-filters/creating-my-reports/
- **[RO]**: Official guide, "Configure Reporting Options", https://docs.pokertracker.com/pt4/tutorials/reports-stats-and-filters/configure-reporting-options/
- **[CR]**: Official guide, "Configuring Reports", https://docs.pokertracker.com/pt4/tutorials/reports-stats-and-filters/configuring-reports/
- **[MIT]**: MIT OCW 15.S50 (IAP 2015), Lecture 2 "Analysis" slides, PT4 screenshots on pp. 18–37, https://live.ocw.mit.edu/courses/15-s50-poker-theory-and-analytics-january-iap-2015/9ebe68c1fa1e9346c4cd74e120e680e8_MIT15_S50IAP15_L2_Analysis.pdf
- **[F:t]**: PokerTracker forum topic `t`, at `https://www.pokertracker.com/forums/viewtopic.php?t=<t>`. The answers cited are by PokerTracker support staff unless marked *(user)*.
- **[HM3]**: Holdem Manager 3 KB, "HM3 Report Filters", https://kb.holdemmanager.com/knowledge-base/article/hm3-report-filters
- **[H2N-*]**: Hand2Note 4 help: [H2N-cf] https://hand2note.com/Help/Features/custom-filter-in-reports, [H2N-rep] https://hand2note.com/Help/Features/reports, [H2N-nav] https://hand2note.com/Help/Features/report-navigation, [H2N-board] https://hand2note.com/Help/Other/creating-board-categories

---

## 1. How PT4 filters work

### 1.1 Three layers of filtering

1. **Sidebar ("simple") filters.** The left sidebar of *View Stats* has dropdowns that are always visible. The tournament sidebar shows **Game, Date** (with *Between Dates* and two date pickers), **Blind, Bet Type, Type, Flags** (SNG, DON, BOUNTY, SHOOTOUT…), **Speed, Buyin**, a *Clear All Filters Above* link, the **Quick:** dropdown (default "No Quick Filter"), and the **More Filters…** button [MIT p.18, p.21]. The guide calls the date presets *Today* and *Yesterday* "simple filters", and they respect the *My Day Starts At* option [RO]. For the cash sidebar, staff mention dropdowns for **Game / Stakes / Table Size / Bet Type** (in LeakTracker's header) [F:97934]. The exact list of cash sidebar dropdowns is **UNCONFIRMED**.
2. **Global filters ("More Filters…").** This is the tree-structured filter builder described in section 2. They are called "global" because they apply across the whole application. The exceptions are reports that can't be filtered, such as LeakTracker, and *My Reports* reports that carry their own saved filter [GF].
3. **Report filters in My Reports.** Each custom report has a *Filters* link with two choices [MR]:
   - **Add New Simple Filters**: the same tree as More Filters. The guide recommends it "in the vast majority of situations".
   - **Add New Expression Filters**: a free-form boolean expression. You *Insert* statistics, database columns and operators, then *Validate* it. Examples on the forum are SQL-like, e.g. `cash_hand_player_statistics.amt_before / cash_limit.amt_bb <= 35` [F:98186]. This is where the **Filter on Active Player** checkbox lives (section 1.4).

   When a report has its own filter saved, the global More Filters are ignored inside that report. When it has none, the global filters stay in effect [MR]. *My Reports → Advanced* also takes an expression for **row colouring** and a *Has Summary* footer row [MR].

There is **no separate "stat filter" UI** in the global tree. Filtering by a statistic (for example "players with VPIP < 40") is done only through expression filters in a custom report. On the forum, VPIP-of-villain style questions get custom expressions or the answer "there isn't an equivalent report or filter" [F:105314], [F:105304].

### 1.2 Building and combining conditions

- **Navigation.** The window has a fixed left column, *Filter By:*, listing the sections. The right pane drills down: rows with `>` open a sub-page, and a `< Parent` button goes back up. Leaf rows are **ON/OFF toggles**, **checklists** (a grey group header with its own toggle, then options of which one is ticked, e.g. "Any Straight / Non-Nut / Nut"), **dropdowns** (e.g. *Made Straight On: Any Street*), or **numeric ranges** ("Between x and y", "Exactly n"). *Add to Filter* commits everything switched on in that pass [MIT p.23, p.29–30], [GF].
- **Default combination is AND.** Each committed condition becomes a line in the **Current / Active Filters** list, and lines are ANDed [GF].
- **Grouping.** Select several lines (Ctrl/Shift/Cmd-click), then press **'AND' Selected** or **'OR' Selected** to merge them into one parenthesised line. Conditions added in a single *Add to Filter* pass arrive already grouped (as AND). **Ungroup** splits a group back into lines. A red **X** deletes a line or group [GF], [MIT p.33–34].
- **Negation.** **'NOT' Selected** wraps the selected line or group in `NOT (…)` [GF]. NOT is used heavily as a primitive. Examples: "untagged hands" = `NOT (Tags: Any Tag)` [F:93847]; "open-shove" = raised all-in AND `NOT (Second Preflop Action Any Action)` [F:104561]; "walks" = BB AND `NOT (First Action Any Action)` [F:59202].
- **Nesting.** Groups can be nested, giving arbitrarily deep boolean trees. Forum filters show three or four levels of parentheses, e.g. `(((Raised Preflop Any 3Bet) AND (Raised All-In Preflop)) AND (First Preflop Action Raise)) AND (NOT (Second Preflop Action Any Action))` [F:104561], [F:94336].
- **Generated text.** The filter's text label is generated and sometimes ambiguous. Some labels do not name the street (for example *Raise Opportunity Type Raise CB Opportunity*), which staff acknowledged [F:90288], [F:57343]. Some single selections expand into an OR group. Picking *One Pair → Made One Pair On Flop + Top Pair* produced `(Made One Pair On Flop) OR (Made One Pair On Flop Using One Hole Card Top Pair)`, so users have to re-group it by hand [F:92711], [F:43896].
- **Applying.** *Save & Apply Filters* applies the list. *Clear All* empties it. The *Currently Active* pane in the sidebar shows the applied filter text, and the text can be copied from there [GF], [F:57343].

### 1.3 Saved filters: "Quick Filters"

In PT4, a **Quick Filter is a named, saved global filter**. HM3 uses the same term for built-in presets; PT4 does not.

- From the Active Filters window, **Save as Quick Filter** saves the current list as a new Quick Filter or overwrites an existing one [GF].
- The sidebar **Quick:** dropdown applies a saved one [GF], [MIT p.21].
- **Edit Quick Filters** lists them, previews the selected one's conditions, and offers *Rename*, *Delete*, *Load Filters* (load into the active list to edit, then overwrite) and *Close* [GF].
- PT4 ships no built-in library of Quick Filters. They are user-created only (inferred from [GF]).
- Custom reports, with their saved filters, can be exported and imported as `.pt4rpt` files, duplicated, or converted between cash and tournament [MR]. This is how "filter libraries" get shared in practice. The forum and the Download Warehouse distribute `.zip`'d reports for this purpose [F:39998].

### 1.4 Point of view: Active Player, Hero, opponents

This is the most important semantic rule, and the source of most forum confusion.

- **Every simple filter is evaluated from the point of view of the *Active Player***: the player chosen in the sidebar *Player:* box, normally the hero [MIT p.31], [F:92303], [F:55108]. "Bet Flop Donk Bet" means *the active player* donk-bet. To find hands where an opponent donk-bet into you, filter for *facing* a donk bet (*Raise Donk Bet Opportunity*, or *Facing Flop Bet → Flop Donk Bet*) [F:104917], [F:92303].
- **Player is Hero** is an ON/OFF toggle under Hand Details [MIT p.24]. `NOT (Player is Hero)` is used for pool/population analysis, but it returns nothing while a hero is the active player [F:55108], [F:95827].
- **Every player's point of view.** In a custom *Hand Report*, open Expression Filters and untick **Filter on Active Player**. The filter is then applied from every player's perspective, so a hand appears if *any* player matches [MR], [F:105696], [F:105243].
- **No "versus a specific villain" simple filter.** The workarounds are to select the villain as the active player [F:103236], or to write a subquery expression filter on the opponent's `player_name` and flags (e.g. both VPIP'd) [F:39998]. A *Villain Name (Heads Up)* custom stat exists only for hands with two players dealt in [F:104899].
- NoteTracker (automatic notes) reuses the same filter tree with separate *Player* and *Opponent* filter sets, so it can express both sides of a spot [F:46067] *(user)*. Whether this two-sided model exists anywhere outside NoteTracker is **UNCONFIRMED**.

### 1.5 Where filters apply

Global filters apply "across the entire application" [GF]: View Stats reports (Results, Statistics, the Holdem Hand Range Visualizer), the hand lists under each report, graphs, and so on. The exceptions are LeakTracker and My Reports that have their own filter [GF]. Hand lists also have three local controls: a **"No Tags Selected"** tag picker, **Show Marked Hands Only**, and a **Most Recent N** limit [MIT p.18], [F:92917]. Reports have a right-click menu (configure, replay, export, notes) and double-click drill-down to more detail. Selecting a report row shows its hands in the lower pane ("Hands for Selected Description") [MIT p.12–14, p.21].

---

## 2. The More Filters tree

Section order is as it appears in the window: **Game Details, Hand Details, [Session Details — cash only], Hand Values, Board Texture, Actions and Opportunities** [GF], [MIT p.22], [F:96305].

Notation: `>` means a sub-page; [T] means an ON/OFF toggle; ranges are "Between x and y" or "Exactly n".

### 2.1 Game Details

"Filters at the game level" [MIT p.22]. These are things like stakes, sites, game types and date ranges [GF].

The screenshot is of the **tournament** window [MIT p.22]:

- **Dates >**. Includes **day of week** [F:90928]. Hour-of-day exists as a *graph* option [F:43346]. Hour-of-day as a filter leaf is **UNCONFIRMED**.
- **Game & Bet Types >**
- **Currencies >**
- **Sites >**
- **Blinds >**. For cash this is stakes, labelled "Stakes" in the cash sidebar. The cash label of this leaf is **UNCONFIRMED**.
- Tournament only: **Tournament Flags >, Tournament Speed >, Tournament Buy-Ins >, Tournament Descriptions >, Tournament Tables >, Tournament Table Size >, Tournament Blinds & Antes >**

For cash, *Table Size* is filterable (it is in the sidebar and LeakTracker [F:97934]). Whether it also has its own row in the cash Game Details page is **UNCONFIRMED**.

### 2.2 Hand Details

"Filters about the hand as a whole" [MIT p.24]. Rows as shown, in their visual groups [MIT p.24]:

**Preflop pot type**

- **Maximum Preflop Raise That Occurred >**: the largest raise level in the hand, for any player. Options include an unraised level, **2Bet, 3Bet, 4Bet, 5Bet+** [F:105610], [F:103775], [F:99859]. This is PT4's **pot-type** filter: "single raised pot" = Maximum Raise 2Bet [F:105383], [F:104427]. Open-shoves are not distinguished [F:101491] *(user)*.
- **Preflop Limping That Occurred >**: **Number of Limpers Exactly n** (or a range) [F:104456], [F:104534], [F:104741].

**Stacks, players, position**

- **Pot Size & Stack Depth >**. Organised by street: **Preflop / Flop / Turn / River** [F:102044], [F:98186]. Leaves include:
  - **Actual Stack Size** (in big blinds; tournaments also have **M**) [F:98186], [F:100134], [F:104197].
  - **Effective stack**. PT4 defines effective stack as the most the player can lose *as of their first action in the hand*. So if the SB folds first, its effective stack is unrelated to the rest of the action [F:100690], [F:105069].
  - **Pot size** (chips/BB) [F:55697] *(user)*.
  - **Stack To Pot Ratio** (per street; whole numbers only, hence requests for decimals) [F:102044], [F:102235].
  - Only the active player's own stack can be filtered here. Another player's stack needs an expression subquery [F:105116], [F:103754].
- **Number of Players >**: **Players Dealt Into Hand, Players Seeing Flop, Players on Turn, Players on River, Players at Showdown** [F:104164]. This is how heads-up versus multiway is expressed, e.g. *Players Seeing Flop Between 2 and 2* [F:103611], [F:97413]. There is no "number of players who VPIP'd" [F:104164].
- **Player Position >**. Organised by street [F:101138]:
  - **Preflop**: **Position of Active Player** and **Position of First Raiser** [F:99952], [F:96462], [F:105424]. Each is set as "Position of Selected Exactly n / Between a and b". The UI phrase "Player Preflop Position → Position = First Raiser" suggests a role dropdown [F:102411] *(user)*. Whether roles other than Active Player and First Raiser (e.g. 3-bettor, limper) exist is **UNCONFIRMED**. Users have asked for limper and 3-bettor positions [F:99078] *(user)*, which suggests they were missing at least at one point.
  - **Position numbering**: by seat relative to the button, **0 = BTN, 1 = CO, 2 = HJ…, 8 = BB, 9 = SB**. Evidence: BTN is "Exactly 0" [F:99952]; first raiser "Exactly 9" = facing a **SB** steal [F:102411]; "BB" is 8 [F:59385], [F:41752]. So "UTG" is a different number depending on players dealt, and covering every table size needs grouped filters [F:102539].
  - **Flop / Turn / River**: **Active Player Position Relative To All Opponents → Is In Position / Is Out of Position**, and **Active Player Position Relative To First Raiser → Is In / Out of Position** (the first raiser *on that street*) [F:98160], [F:102429], [F:105633], [F:103187]. This is PT4's **IP/OOP** filter.
- **Player is Hero** [T] [MIT p.24].

**Tags and notes**

- **Hand is Tagged As >**: specific tags or **Any Tag** [F:103038], [F:93847].
- **Hands with Notes** [T] [MIT p.24].

**Results**

- **Win / Loss >**: **Player Won Hand**, **Player Lost Hand**, **Amount Won/Lost** (range) [GF], [F:98316], [F:104486].
- **Amount Contributed to Pot >**
- **Hands Went to Showdown** [T]
- **Hand Was a Split Pot** [T]
- **Hand Has Straddle** [T]

All-in situations have no Hand Details row. They are expressed through Actions and Opportunities (e.g. *Raised All-In Preflop*, *Faced All-In on River*, *Called … all-in*) [F:104561], [F:94336], [F:102607]. The All-In Adjusted ("EV") figures are report columns, not filters [MIT p.18].

### 2.3 Session Details (cash only)

These filters are for table-session data: amount won/lost in the table session (BB range, e.g. 0 to 9999 for winning sessions) and **Table Session Duration** [GF], [F:56216], [F:59215]. A "table session" is time at one table in one seat [F:59215]. Hands-into-the-session filtering also exists [F:90928]. Its exact label is **UNCONFIRMED**. The number of tables played concurrently is *not* available [F:90928].

### 2.4 Hand Values

"Hole cards, hand strength or draw strength" [MIT p.25]. Rows [MIT p.25]:

- **Hole Cards Range Selection >**
  - **Holdem Hand Range**: a 13×13 grid (pairs on the diagonal, suited above, offsuit below). It has a "% hands selected" read-out and text box, a **Model** dropdown (e.g. *Sklansky-Karlson*) with an **Include** slider for "top x%" selection, **Group Select** (e.g. *Suited*, pairs, broadways) and **Clear** [MIT p.26], [F:103735], [F:46630].
  - An Omaha range selector exists for PLO. It is not covered here.
- **Made Hands >**: **High Card, One Pair, Two Pair, Three of a Kind, Straight, Flush, Full House, Four of a Kind, Straight Flush, Low Hand (Omaha Only)** [MIT p.27]. Each page has the same shape. The *Straight* page shows [MIT p.28]:
  - **Made [hand] On**: a street dropdown (*Any Street*, Flop, Turn, River) [T]
  - **Using Hole Card(s) Filter**: *Using Any / Two / One / No Hole Cards*
  - **[Hand] Strength**: *Any / Non-Nut / Nut*
  - **Backdoor [hand] Completed**
  - **One Pair** adds sub-types. Under *Using Two Hole Cards* there is **Overpair** (and, presumably, the lower pocket-pair classes). Under *Using One Hole Card* there are **Top Pair, Middle Pair**, and others, with **Kicker Strength** (*Top Kicker … Third or Worse Kicker*) [F:44439], [F:95269], [F:43896], [F:99266]. The full list of pair classes is **UNCONFIRMED**. PT4's database groups for the "Made Hand Flop" stat go down to "High Card 2 Overs" [F:103668].
  - **Two Pair** distinguishes *Using Two Hole Cards (No Pocket Pair)* [F:104421].
  - **High Card** has an "on all three streets" option [F:42131].
- **Straight Draws >** (Holdem page) [MIT p.29]:
  - **Straight Draw On**: street dropdown [T]
  - **Gutshot Straight**: *Any / Nut / Non-Nut Gutshot Draw*
  - **Open-Ended / Double Gutshot Draw**: *Any*, *Draw with 8 Nut Outs*, *4 Nut and 4 Non-Nut Outs*, *8 Non-Nut Outs*
  - **Backdoor Straight Draw** [T]
  - **No Straight Draw on Any Street** [T]
- **Flush Draws >**: includes **Flush Draw On Flop** and **No Flush Draw** [F:103735], [F:97899]. Nut/non-nut and backdoor variants are likely, by analogy with straight draws, but **UNCONFIRMED**.
- **Low Draws (Omaha Only) >**

Combined made hand plus draw classes (e.g. "pair + flush draw") are not a category. They are expressed by ANDing a Made Hands filter and a Draws filter (inferred; no combo row is shown in [MIT p.25]).

### 2.5 Board Texture

"Filter based on the cards that came out on the flop, turn or river" [MIT p.30]. Rows [MIT p.30]. Each has per-street sub-pages (Flop / Turn / River):

- **Board Cards >**: specific cards per street. The Flop page has a **"Flop contains at least one"** rank selector (e.g. A, K, Q) and a count of broadway cards (**"two or more broadway"**) [F:56533], [F:104271], [F:49579]. This is how "A-high flop" or "high card" style textures are built.
- **Board Pairing >**: e.g. **Board paired on flop**, **Pair On Flop Board Pairs Top/Bottom Card**, **Any Pair** (turn), **Three of a Kind on Board**, **Four of a Kind on Board**, **Board Paired Any Street** [F:54579], [F:102868], [F:49171], [F:61007].
- **Board Suits >**: monotone / two-tone (flush-draw-possible) / rainbow flops, and turn/river cards such as **"Turn card is …"** (e.g. flush-completing or suit-changing) [F:97899], [F:46580], [F:49171]. Exact leaf labels are **UNCONFIRMED**.
- **Board Connectedness >**: per street, e.g. **Any Made Straight is Possible**, **All Four Cards Connected**, **Four Cards are Connected With One Gap**, **Five Card Straight** on board, and *Low Hand is Possible* (Omaha) [F:102957], [F:42942], [F:59411], [F:39174], [F:51261], [F:104306]. Staff have acknowledged a known issue with connectedness filters on boards that contain an ace [F:98623].

There is **no "dry / wet" or abstract texture class**. Textures are built by combining the four sub-sections, often with NOT [F:98283] *(user)*.

### 2.6 Actions and Opportunities

These filters cover actions the Active Player took *or opportunities they had*: bets (and sizing), raises faced (and sizing), calls, folds and opportunities of all kinds [MIT p.31]. There are four sub-pages: **Actions and Opportunities - Preflop / - Flop / - Turn / - River** [MIT p.31].

**Preflop page** [MIT p.32]:

- **Voluntarily Put Money in Pot** [T]
- **Posted Blind / Ante** [T]: *Posted Any Blind or Ante / Small Blind / Big Blind / Ante*
- **Preflop Raises >**: **Raised Preflop → Any Raise / Any 2Bet / Any 3Bet / Any 4Bet / Raised Steal** (a 3-bet against a no-limper open) [F:98332], [F:41752], [F:97462]. Also **Raised First In** [F:99319], [F:97462] and **Raised All-In Preflop** [F:104561].
- **Preflop Calls >**: **Called 2Bet**, **Called 3Bet**, and so on [F:99214], [F:104741], [F:101255]. "Cold call" is not a separate leaf; it is expressed as *Called 2Bet* plus position or NOT filters [F:101255].
- **Preflop Folds >**: e.g. **Folded to 2 bet** [F:103172].
- **Preflop Opportunities >**:
  - **First Action → Opportunity to Open the Pot / Opportunity to raise limpers** [F:102347], [F:105045]
  - **3Bet (Facing 2bet)** and **4Bet** opportunities [F:101585], [F:103775]
  - **Squeeze Opportunity** (often NOT'd to mean "no caller between") [F:101585], [F:104741]
  - **Faced Steal Attempt → In Small Blind / In Big Blind (BB) / in Any Position** [F:103957], [F:97816]
- **Preflop Action Sequence >**: **First / Second / … Preflop Action = Fold / Check / Call / Raise / Any Action**. These are the active player's *own* successive actions, not the whole table's [F:97846], [F:101916], [F:104364]. *First Action Raise* AND *Second Action Call* = "raised, then called a 3-bet".
- **Preflop Bet Sizing >**: the size of the active player's own raise, e.g. **2Bet Size BB Between a and b**, **3Bet-Size Between X and Y** [MIT p.33], [F:99319], [F:99859]. Source: https://www.pokerstrategy.com/forum/pokertracker-1647/pt4-how-often-does-the-pool-fold-to-different-3bet-sizes-434466/ *(user)*.
- **Preflop Actions Encountered With Sizes >**: the size of the raise *faced*. **Sizes Calculated in Big Blinds →** *Preflop Action Faced With Size 2Bet Preflop Between a and b*, *Facing Steal Between x and y*, and others [MIT p.33], [F:103957], [F:104257]. The size faced is the **amount needed to call**. A BTN raise to 2.2bb is a 1.2bb raise faced from the BB [F:104257], [F:103957].

**Flop page** (and analogously **Turn** and **River**):

- **Saw Flop** [T] (Saw Turn, Saw River; River also has **Saw Showdown**) [GF], [F:101281], [F:56864].
- **Flop Bets >**: **Bet Flop → Any Flop Bet / Continuation Bet / Donk Bet** [GF], [F:105633], [F:57652]. On the turn and river this adds **Probe** and **Float** bets, plus Continuation and Donk [F:92654] *(user)*, [F:94336]. Selecting *Continuation Bet* also switches on *Bet Flop* automatically [GF].
- **Flop Raises >**: **Raise Flop** [F:105826] *(user)*. There is **no dedicated check-raise leaf** confirmed. Check-raise is built as *Checked Flop* AND *Raise Flop* [F:105826] *(user)*, or as *First Flop Action Check* plus a second-action raise.
- **Flop Calls >**: e.g. **Called Continuation Bet**, a **Called … all-in** variant [F:99378], [F:102607].
- **Flop Folds >**: e.g. **Folded to Continuation Bet** [F:90903] *(user)*.
- **Checked Flop** [T] [F:99378], [F:105826].
- **Flop Opportunities >**:
  - **Specific Bet Opportunity → Continuation Bet Opportunity, Donk Bet Opportunity** (turn/river add probe/float opportunities, **UNCONFIRMED** labels) [F:98114], [F:92218], [F:103187]
  - **Raise Opportunity Type → Raise Continuation Bet Opportunity / Raise Donk Bet Opportunity / Raise Float Bet Opportunity / Raise Probe Bet Opportunity** (= facing that bet type) [F:104917], [F:92704], [F:103926], [F:99378]
- **Flop Action Sequence >**: **First / Second Flop Action = Bet / Check / Call / Raise / Fold / Any Action**. These are the player's own actions, so "check, then check" is impossible as a sequence [F:103818], [F:104417], [F:102221]. `NOT (First Flop Action Any Action)` with *Saw Flop* = the player was all-in before the flop [F:104860], [F:105036].
- **Flop Bet Sizing >**: the size of the player's own bet [F:103574] *(user)*.
- **Flop Actions Encountered With Sizes >**: **Sizes Calculated in Percentage of the Pot** (or in BB) **→ Facing Flop Bet → Flop Bet / Flop Continuation Bet / Flop Donk Bet / Flop 2Bet …, Between a and b** [F:104917], [F:102221], [F:96889], [F:100944]. Pot percentage is computed on the **amount to call relative to the pot after the bet**. A pot-sized c-bet shows as 50%, not 100%. Users trip over this repeatedly [F:95827], [F:105308], [F:103799].
- River extras: **Faced All-In on River** [F:94336].

---

## 3. How PT4 expresses "spots"

PT4 has no first-class "spot" object. A spot is a conjunction of filters from the sections above. The building blocks are:

| Spot dimension | How PT4 expresses it |
|---|---|
| **Pot type**: limped / SRP / 3-bet / 4-bet+ | *Hand Details → Maximum Preflop Raise That Occurred* (unraised, 2Bet, 3Bet, 4Bet, 5Bet+), plus *Preflop Limping That Occurred* for limp counts [F:105383], [F:104534] |
| **Hero is preflop aggressor / caller** | Hero's own actions: *Raised First In*, *Raised Preflop Any 3Bet*, *Called 2Bet*, or *Preflop Action Sequence* (e.g. First = Raise, Second = Call). PT4 has no single "hero was last aggressor" leaf in the tree. The c-bet opportunity is the usual proxy for "aggressor and checked to" [F:98278], [F:98114] |
| **Who opened, from where** | *Player Position → Preflop → Position of First Raiser*, plus *Position of Active Player* [F:99952], [F:105424] |
| **IP / OOP** | *Player Position → {Flop/Turn/River} → Relative To All Opponents* or *Relative To First Raiser* [F:98160], [F:102429] |
| **Heads-up / multiway** | *Number of Players → Players Seeing Flop / Turn / River* (e.g. exactly 2) [F:103611] |
| **Stack depth / SPR** | *Pot Size & Stack Depth → {street} → Actual / Effective stack, SPR* [F:99952], [F:102044] |
| **Facing X** | *{Street} Opportunities → Raise Opportunity Type* or *{Street} Actions Encountered With Sizes* [F:104917] |
| **Not all-in preflop** | *First Flop Action → Any Action* (or NOT it for "was all-in") [F:101358], [F:104417] |

A worked example from support, "SB vs BB": first raiser 9 + active player 8 + *Called 2Bet* + `NOT Squeeze Opportunity` + *Number of Limpers Exactly 0* [F:104741], [F:100965].

### 3.1 "Actions and Opportunities" and statistics

- PT4 statistics are ratios of two columns: the number of times an action was taken, over the number of times there was an **opportunity** for it. Reports show configurable "No Opportunity Statistic Text" when the denominator is 0 [RO]. The MIT deck says most stats show how often a player took a specific action in a specific situation, displayed as a percentage [MIT p.38].
- The filter tree exposes **both halves** of most stats as separate leaves:
  - *Specific Bet Opportunity → Continuation Bet Opportunity* ≈ the **denominator** of "Flop CBet".
  - *Bet Flop → Continuation Bet* ≈ the **numerator**.
  - *Raise Opportunity Type → Raise CB Opportunity* = **facing** a c-bet (the denominator of "Fold to F CBet" and similar).

  So "filter by a stat" in PT4 means choosing either the *opportunity* leaf (every hand where the decision existed) or the *action* leaf (only the hands where it was taken). Support routinely steers users to the opportunity leaf, because filtering on "was last raiser" also catches hands where a c-bet was impossible, e.g. preflop all-ins [F:98114], [F:92218].
- Database flags behind these leaves surface in expression filters, e.g. `flg_p_3bet`, `flg_p_3bet_def_opp`, `flg_f_saw`, `flg_vpip`, `amt_f_effective_stack`, `val_f_bet_facing_pct` [F:105799], [F:23024], [F:39998], [F:94272], [F:103189]. The schema is not published for PT4 [F:103012].
- A custom report's stats are computed over the filtered hands, so "filter + stat" gives conditional frequencies. An example is a *Fold to F Float* stat inside 3-bet pots [F:92704]. The *Facing Preflop Action* report groups hands by what the hero faced (Unopened Pot, 1 Limper, 1 Raiser, …) with stats per row [MIT p.18].

---

## 4. Comparison: Holdem Manager 3 and Hand2Note

### 4.1 Holdem Manager 3 [HM3]

- **Typed filter bar with autocomplete.** "Build a Filter Here…" accepts text like `SawShowdown=True And WonHand=True` and suggests completions as you type. You can flip `True`/`False` in place, which works as NOT. PT4 has no typed entry for simple filters.
- **"Quick Filters" means built-in presets.** HM3's Quick Filters are made by the developers and stackable. **Recent Filters** and **Saved Filters** (user-saved, deletable) sit alongside. In PT4, "Quick Filter" means *user-saved*.
- **Editor categories** are organised differently. *Basic* has Tournament, Game Details, Common Filters (relative position, **relative 3-bet position**, tagged), **Position & Action** (Hero / Raiser / 3-Bettor / Limper / Caller *by position*, "Preflop Action Facing Hero", "Preflop Pot"), **Vs Player**, Showdown & Hand Info (pot size, win/loss, hero stack, effective stack, showdown, split), and Date ("Last" N hours, days or hands). Then come HoleCard Filters (Holdem, Omaha with a text syntax), Board Texture and Hand Value per street, and Action Filters (Betting Actions per street, Continuation Bet, All In, **Betting Lines** per street, Bet Sizing).
- **Differences from PT4.** HM3 has explicit role-by-position filters (3-bettor, limper, caller positions), a **Vs Player** filter, a named "Preflop Pot" type, and **betting lines** as a category. PT4 builds lines from per-player action sequences. HM3's KB describes AND/OR but not parenthesised grouping.

### 4.2 Hand2Note 4 [H2N-cf], [H2N-rep], [H2N-nav], [H2N-board]

- **Filter dialog** ("+ Filter") has tabs: **Quick Filters** (predefined situations such as 3-bet), **Hand Strength** (ranges), **Positions**, and **Custom Filter**. Filters can be saved to a file from the dialog [H2N-rep].
- **Custom Filter is a sequence-of-actions builder.** You add ordered actions per street, such as *Player Raises → Villain Calls → Flop → Player Bets*. Each action has options: *First raise on street*, *Last player's action on street*, *Bet size / Pot* range (e.g. 0.45–0.55), villain class (*Reg or Fish*), table state (*Initial player count* = 2) [H2N-cf]. **Both hero and villain actions are first-class** in one timeline, unlike PT4's single active-player perspective. H2N states that "a hands filter defines a stat", using the same builder as custom stats [H2N-cf].
- **Spot navigation instead of building.** Clicking a stat filters to the hands that hit it. Clicking preflop heat-map cells or postflop histogram bars filters further. The **Faced Next** report splits hands by what you faced next, and **Next Actions** by what you did next, so you drill from "BTN open" to "faced 3-bet" to "4-bet" to "turn barrel" without writing a filter [H2N-nav]. Reports can be **pinned** side by side to compare spots [H2N-rep].
- **Board categories are user-defined, named textures.** They are built in an editor from *High card / 2nd / 3rd card, Pairness, Suitness, Straightness* conditions with **And / Or / Not**, cloned from flop to turn/river, testable against your hands, up to 255 of them, and exportable as config [H2N-board]. PT4 has no named-texture library; textures are rebuilt from Board Texture leaves each time.
- How Custom Filter conditions combine with OR is not documented on the pages read (**UNCONFIRMED**).

---

## 5. Open design questions for an implementer

1. **Point of view.** Is every condition about the hero (PT4's Active Player model), or can a condition name *any* player (H2N's hero/villain timeline, PT4's "Filter on Active Player = off")? How is "facing X" expressed: as a hero opportunity, or as a villain action?
2. **Role-based positions.** Use PT4-style seat numbers (0 = BTN … 8 = BB, 9 = SB), named positions that depend on table size (UTG means different seats 6-max and 9-max), or HM3-style roles (opener / 3-bettor / caller position)?
3. **Pot type as a primitive.** Expose a single "pot type" (limped / SRP / 3BP / 4BP+), as HM3's "Preflop Pot" does, or compose it from max raise level plus limpers, as PT4 does? How are open-shoves and all-in 3-bets classified?
4. **Line vs. flags.** Represent actions as per-street sequences for the hero only (PT4's First/Second action), whole-table betting lines (HM3), or an ordered event pattern (H2N)?
5. **Opportunity vs. action.** Should every action filter have an explicit twin, "had the opportunity" versus "took it"? Should the stat definitions and the filter leaves share one source of truth, as H2N does ("a filter defines a stat")?
6. **Size semantics.** For bet sizes faced, is the percentage the bet as a fraction of the pot before it, or the amount to call as a fraction of the pot after it (PT4)? Is the preflop raise size total, or the increment to call (PT4 uses to-call)?
7. **Effective stack definition.** Is it at the start of the hand, at the player's first action (PT4), or per street versus the remaining opponents? Is SPR per street, and with decimal precision (PT4 allows only integers)?
8. **Made-hand taxonomy.** Reuse an existing classification (e.g. Flopzilla's, see `flopzilla-categories.md`) for Made Hands and Draws, or follow PT4's per-hand-class pages (using 0/1/2 hole cards, nut/non-nut, kicker)? How are combo classes such as "pair + flush draw" represented?
9. **Board textures.** Ship fixed leaves (paired / suits / connectedness / high card), as PT4 does, or user-defined named categories, as H2N does? Which preset textures ship by default?
10. **Boolean UI.** Support PT4's full grouping (AND/OR/NOT with nesting) or a flatter model? How is the generated label kept unambiguous? PT4's labels omit the street, and some single picks expand into OR groups.
11. **Saved filters.** Should they be per user, shareable or exportable (PT4's `.pt4rpt`, H2N's file save), built-in presets (HM3's Quick Filters), recents? Use one name for user-saved filters, since PT4 and HM3 use "Quick Filter" for opposite things.
12. **Scope of a filter.** Global across all views (PT4) or per view or report? What happens when a saved view carries its own filter: does it override the global one, as in PT4?
13. **Drill-down.** Should clicking a stat or a chart cell create a filter (H2N's spot navigation), and how does that interact with an explicitly built filter?
14. **Villain-specific filtering.** Should there be "hands vs. player X", and what counts as "vs" (dealt in, VPIP'd, saw flop, reached showdown)? PT4 makes this an expression subquery.
15. **Stat-threshold filters.** Should conditions on opponents' aggregate stats (e.g. villain VPIP > 40) be allowed? PT4 offers this only through expressions, and staff warn the queries are slow [F:102411].
16. **Session and time filters.** Table-session results and duration, day of week, hour of day, last N hands. Which of these matter for review, as opposed to results analysis?
