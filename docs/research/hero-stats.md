# Hero Stats: definitions, sample sizes and feasibility

Research note, 2026-11-06. Sources were read on 2026-11-06 unless a claim says otherwise. Anything marked **Unverified** could not be confirmed from a primary source.

## Verdict

- **Every standard Stat can be computed from a stored Hand.** Seats, Starting Stacks, `sittingOut`, button seat, posts, ordered Actions per Street with amounts and `allIn`, `showdown` and `collected` cover the numerator and the opportunity of each Stat in §1. Only the Hero's own Actions matter, so the fact that opponents' hole cards are known only when shown does not block any of them (§5).
- **The trackers do not publish a formal definition per Stat.** PT4 shows each built-in Stat's formula only inside the app (Configure → Statistics → Details). Online, the sources are PT3's *Statistical Reference Guide* and answers from PT4 forum moderators. HM3's knowledge base names its Stats but does not define them, and HM's forums return 403. Definitions below come from those sources. Where they say nothing, the edge case is marked **Unverified** and a rule is proposed.
- **The trackers agree on the core, and differ on aggression.** Both compute VPIP and PFR over opportunities: walks are left out, and so are spots where a raise is impossible. PT4 measures aggression with AF and AFq. HM measures it with "Agg%", per Street. Runout should use AFq: AF is a ratio, not a frequency, so it does not fit CONTEXT.md's definition of a Stat.
- **No tracker publishes sample-size thresholds.** The numbers commonly quoted come from blogs. Runout should show each Stat's opportunity count next to it and dim the Stat below a threshold (§3), rather than claim it is "reliable".
- **Recommended first screen: 15 Stats plus the Hand count** (§6). That is VPIP, PFR, 3-bet, Fold to 3-bet, Attempt to Steal, Fold BB to Steal, Cold Call, Flop C-bet, Turn C-bet, Fold to Flop C-bet, Flop Check-raise, AFq, WTSD, W$SD and WWSF.

## 1. The standard Stats, prioritised

**What the trackers show by default:**
- PT4's default cash HUD shows VPIP, PFR, 3Bet, Flop CB, Fold vs Flop CB and Hands. ([PT4, Basic HUD Guide](https://docs.pokertracker.com/pt4/tutorials/the-hud/basic-hud-guide/), 2026-11-06)
- HM3's "Cash – HM3 Standard" HUD shows VPIP, PFR, Agg, 3Bet, Fold to 3Bet, Raise First In (RFI) by Position, Flop/Turn/River CBet and Fold vs CBet. "HM3 Advanced" adds 3Bet and Fold to 3Bet in and out of position, WTSD%, W$SD%, W$WSF, and CBet and Fold vs CBet in and out of position. ([HM3 KB, HUD Profiles New In Holdem Manager 3](https://kb.holdemmanager.com/knowledge-base/article/hud-profiles-new-in-holdem-manager-3), 2026-11-06)

The tiers below follow those defaults. They are the same for 6-max and full ring; only the Position breakdown differs (§4).

| Tier | Stats |
|---|---|
| **Must-have** | VPIP, PFR, 3-bet, Fold to 3-bet, Attempt to Steal (ATS), Fold to Steal (BB, SB), Flop C-bet, Fold to Flop C-bet, WTSD, W$SD, WWSF, AFq, RFI by Position |
| **Nice-to-have** | 4-bet, Fold to 4-bet, Cold Call, Limp, Squeeze, Turn and River C-bet, Fold to Turn C-bet, Raise C-bet, Check-raise (flop), AF |
| **Later** | Fold to River C-bet, Check-raise turn and river, donk bet, float, probe, 3-bet vs steal, Fold to Squeeze, 5-bet |

## 2. Definitions and edge cases

### 2.1 Definitions

Each Stat counts the Hands where the Hero did X (numerator) out of the Hands where the Hero had the chance (opportunity). The quotes below are from PT3's guide (v3.10, 2013-10-25) unless they say PT4. PT3's guide is the only public per-Stat reference; PT4 says to read each formula in the app ([PT4 Quick Start Guide](https://docs.pokertracker.com/pt4/general/pokertracker-4-quick-start-guide/), 2026-11-06).

| Stat | Numerator | Opportunity | Source |
|---|---|---|---|
| **VPIP** | Hero put money in voluntarily preflop: called, raised or completed. Posting a blind does not count. | PT4: "all hands minus walks". PT3 used all Hands. | [PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide); kraada (PT4 moderator), 2013-04-21, [forum](https://www.pokertracker.com/forums/viewtopic.php?f=64&t=47852) |
| **PFR** | Hero made any preflop raise: an open, an isolation raise, a 3-bet or more. | PT4: Hands where the Hero "could raise in preflop (so it excludes walks and open shoves)". | kraada, 2013-04-21, [forum](https://www.pokertracker.com/forums/viewtopic.php?f=64&t=47852) |
| **RFI** | Hero opened the pot with a raise. | Hero was first to act voluntarily: everyone before them folded. | Named in [HM3 KB](https://kb.holdemmanager.com/knowledge-base/article/hud-profiles-new-in-holdem-manager-3) but not defined there. **Unverified** beyond the name. |
| **3-bet** | "re-raised a raiser". | Hero faced exactly one raise (a 2-bet) and could still raise. | [PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide); opportunity **Unverified** |
| **Fold to 3-bet** | Hero folded to a 3-bet. | Hero raised and then faced a 3-bet. | [PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide) |
| **4-bet** | "raised a 3-Bet or higher". | Hero faced a 3-bet and could still raise. | [PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide) |
| **Fold to 4-bet** | Hero folded to a 4-bet or a higher raise. | Hero 3-bet and then faced a 4-bet or more. | [PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide) |
| **Attempt to Steal** | An open raise from CO, BTN or SB, "regardless of the size of the raise", so open shoves count. | Folded to the Hero in CO, BTN or SB. | kraada, 2013-01-01, [forum](https://pt4.pokertracker.com/forums/viewtopic.php?f=61&t=45906) |
| **Fold to Steal (SB / BB)** | Hero folded the SB (or BB) to a steal. | Hero in the SB (or BB) facing a steal raise. When the SB calls or raises, the BB no longer faces a steal. | [PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide); the SB/BB rule is from search snippets of PT forum threads, **Unverified** |
| **Cold Call** | Hero called a raise with no money already in the pot at that level. "The blinds cannot cold call a 2bet", but they can cold call a 3-bet. | Hero faced a raise with nothing invested at that level. | WhiteRider and kraada (PT moderators), 2016-04-26, [forum](https://www.pokertracker.com/forums/viewtopic.php?f=58&t=91590) |
| **Limp** | Hero called one big blind preflop with no raise before them. | Hero was first in, or faced only limps. | [Hand2Note glossary](https://hand2note.com/Help/Other/glossary). PT4's own Limp formula: **Unverified** |
| **Squeeze** | A re-raise when "in front of him there has been a raise and a call". | Hero faced a raise and at least one caller, and could still raise. | kraada, 2010-08-18, [forum](https://www.pokertracker.com/forums/viewtopic.php?t=30291); [Hand2Note glossary](https://hand2note.com/Help/Other/glossary) |
| **Flop C-bet** | Hero bet the flop. | Hero made the last preflop raise, and "nobody in front of you has bet". | kraada, 2014-05-29, [forum](https://www.pokertracker.com/forums/viewtopic.php?f=58&t=54179) |
| **Turn / River C-bet** | Hero bet again. | Hero c-bet the previous Street, and no one has bet in front of them on this one. "You can only CBet if you also CBet the previous street." | WhiteRider, 2014-05-29, [same thread](https://www.pokertracker.com/forums/viewtopic.php?f=58&t=54179) |
| **Fold to C-bet** (per Street) | Hero folded to a c-bet. | Hero faced a c-bet on that Street. | [PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide) |
| **Raise C-bet** | Hero raised a c-bet. | Hero faced a c-bet. | [PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide) |
| **Check-raise** (per Street) | Hero checked, then raised. | Hero checked and then faced a bet on that Street. | [PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide) (glossary only); opportunity **Unverified** |
| **AF** | "(Bets + Raises) / Calls", per Street or postflop total. Check-raises count as raises. It has no opportunity: 0 when there are calls but no bets or raises, ∞ when there are no calls. | n/a | kraada, 2014-11-05, [forum](https://www.pokertracker.com/forums/viewtopic.php?f=58&t=55969); kraada, 2013-03-27, [forum](https://pt4.pokertracker.com/forums/viewtopic.php?t=47731) |
| **AFq** | "(Bets + Raises) / (Bets + Raises + Calls + Folds)". Checks are not counted. | n/a: a share of Actions | kraada, 2014-11-05, [forum](https://www.pokertracker.com/forums/viewtopic.php?f=58&t=55969) |
| **WTSD** | Hero reached Showdown. | Hero saw the flop. | [PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide) |
| **W$SD** | Hero won money at Showdown, "including split pots". | Hero reached Showdown. | [PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide). PT4's built-in Stat is named "WSD" (search snippet, **Unverified**). |
| **WWSF** | Hero "won money after seeing the flop". | Hero saw the flop. | [PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide) (as W$WSF) |

### 2.2 Edge cases

- **Walks:** a walk is not a VPIP opportunity: "if you get a walk in the big blind you have no chance to put money in the pot". It still counts as a Hand. ([kraada, 2016-04-07](https://www.pokertracker.com/forums/viewtopic.php?f=61&t=91436); [WhiteRider, 2013-03-26](https://pt4.pokertracker.com/forums/viewtopic.php?t=47731))
- **Blinds:** "Calling from the blinds counts towards VPIP" ([kraada, 2016-04-07](https://www.pokertracker.com/forums/viewtopic.php?f=61&t=91436)). Checking the BB option in a limped pot is not voluntary, so it is not VPIP (PT3 guide: VPIP "does not include posting any blind money").
- **All-in for more than the Hero's Stack:** the Hero has a VPIP opportunity but no PFR opportunity, so PFR can exceed VPIP. (WhiteRider, 2013-03-31, [forum](https://www.pokertracker.com/forums/viewtopic.php?f=64&t=47852))
  - HM made the same change in about 2012: facing all-ins no longer counts as a missed PFR opportunity. That is from search snippets of forums.holdemmanager.com threads ([t=328812](https://forums.holdemmanager.com/showthread.php?t=328812), [t=528181](https://forums.holdemmanager.com/showthread.php?t=528181)), which return 403. **Unverified** at the source.
- **An all-in raise smaller than a full raise, which does not reopen the betting:** **Unverified.** No source found on whether it counts as a 3-bet, or whether it gives the Hero a 4-bet opportunity. Proposed rule: it counts as a raise for the player who made it, and it gives the Hero a raise opportunity only if the betting is reopened for them.
- **Preflop all-ins in WTSD and WWSF:** they count, because "those stats are based on flops seen, not based on flops seen when not all-in". So "an all in will always increase WTSD". (kraada, 2014-03-07, [forum](https://www.pokertracker.com/forums/viewtopic.php?f=61&t=53063))
- **Straddles:** **Unverified.** No tracker source says how a straddle counts. Proposed rule: a straddle is a forced post, not VPIP, and the straddle is the first bet for counting 3-bets. Straddled Hands could also be left out of Position-based preflop Stats in v1.
- **Antes:** **Unverified.** No explicit source was found. They follow the "compulsory bets" logic for blinds, so they are not VPIP.
- **Dead blinds / small-and-big posts:** **Unverified.** PT forum users disagree on whether they count toward VPIP. Treat them as forced.
- **Multiway pots:** **Unverified.** No source says whether C-bet or Fold to C-bet is limited to heads-up pots. PT4's rule ("nobody in front of you has bet") applies whatever the number of players. Proposed: count multiway pots, and offer a heads-up vs multiway breakdown (§4).
- **Hands where the Hero sat out:** not a tracker question for Runout. The import discards a Hand with no `Dealt to <Hero> [cards]` line (`readHero` throws `Discard('no-hero')` in `apps/server/src/hands/import/stars-layout.ts`), so such Hands never reach a Library.

### 2.3 Where PT4 and HM3 disagree

- **Aggression:**
  - PT4 uses AF and AFq, both counted per Action (kraada, cited above).
  - HM's "Agg%" is counted per Street: one Street is one opportunity, and any bet or raise on it is a success. HM forum posts describe it as (Bets + Raises) / (Bets + Raises + Calls + Checks), but their worked examples also count per Action. This is from search snippets of forums.holdemmanager.com ([t=61131](https://forums.holdemmanager.com/manager-general/61131-aggression-frequency-aggression-percentage-2.html)), which returns 403. **Unverified.**
- **Showdown naming:** PT4 has WSD; HM has W$SD%. Both are described as winning at Showdown out of Showdowns reached. **Unverified** whether they differ on hands where the Hero won only a side pot.
- **Cold call from the blinds:** PT4 does not count a blind's call of a 2-bet as a cold call. HM's rule: **Unverified**.

## 3. Sample sizes

- **No primary source gives thresholds.**
  - PT4's HUD guide shows only the Hand count ([Basic HUD Guide](https://docs.pokertracker.com/pt4/tutorials/the-hud/basic-hud-guide/)).
  - HM3's KB says nothing on sample size.
  - Hand2Note's glossary does not define it ([glossary](https://hand2note.com/Help/Other/glossary)).
  - HM's dynamic-HUD PDF returned 403.
- **Secondary (blog, fallback):** the blog post quotes Hands, not opportunities. It also advises at least 5 opportunities, ideally 10, before reading any Stat. ([BlackRain79, Poker HUD Stat Sample Sizes](https://www.blackrain79.com/2017/11/poker-hud-stat-sample-size.html), 2026-11-06)

| Stat | Hands quoted |
|---|---|
| VPIP, PFR | 20 |
| AF, 3-bet, Fold to 3-bet, Flop C-bet, Attempt to Steal, Fold to Steal | 100 |
| Turn C-bet | 300 |
| 4-bet, Fold to 4-bet | 500 |
| River C-bet, Fold to River C-bet | 1,000 |

- **Computed, not sourced:** a frequency p over n opportunities has a 95 % margin of about ±1.96·√(p(1−p)/n).

| Stat | Opportunities | Margin |
|---|---|---|
| VPIP 25 % | 100 | ±8.5 pts |
| VPIP 25 % | 1,000 | ±2.7 pts |
| 3-bet 8 % | 100 | ±5.3 pts |
| 3-bet 8 % | 500 | ±2.4 pts |
| Flop C-bet 60 % | 100 | ±9.6 pts |

  A Hero with 10,000 Hands has plenty of VPIP opportunities but may have few for River C-bet or Fold to 4-bet. That is why the opportunity count, not the Hand count, should drive any "low sample" styling.

## 4. Standard breakdowns

- **By Position:** standard in both trackers.
  - HM3's default HUDs show RFI for EP, MP, CO, BTN and SB ([HM3 KB](https://kb.holdemmanager.com/knowledge-base/article/hud-profiles-new-in-holdem-manager-3)).
  - PT4 can limit any Stat to one Position through the HUD item's "Position" property (kraada, 2014-10-29, [forum](https://pt4.pokertracker.com/forums/viewtopic.php?f=61&t=45906)).
  - Full ring adds UTG+1, MP and LJ to the 6-max Positions. Runout's `positions()` already names both sets (`apps/server/src/hands/replay/positions.ts`).
- **In position vs out of position:** standard in HM3 Advanced, for 3Bet, Fold to 3Bet, CBet and Fold vs CBet ([HM3 KB](https://kb.holdemmanager.com/knowledge-base/article/hud-profiles-new-in-holdem-manager-3)).
- **By Street:** standard for C-bet, Fold to C-bet, Raise C-bet, Check-raise and AF ([PT3 guide](https://pt4.pokertracker.com/guides/PT3/general/statistical-reference-guide)).
- **Single-raised vs 3-bet pots:** **Unverified** as a built-in breakdown in either tracker's public docs. Both are widely used as filters in practice.
- **Heads-up vs multiway:** **Unverified** as a built-in breakdown. Hand2Note defines a multiway pot as "more than two players are involved in a hand on the flop" ([glossary](https://hand2note.com/Help/Other/glossary)).

## 5. Feasibility against Runout's Hand

The source is `apps/server/src/hands/hand.ts`. Position comes from `positions()`.

| Need | From | Status |
|---|---|---|
| Hero's Position | `seats`, `buttonSeat`, the BB post → `positions()` | Yes. Dead button handled. See caveat 1 |
| Walk | Hero is BB, has no preflop Action, and all others folded | Yes |
| Voluntary money preflop vs forced | `posts` (blinds, straddle, ante, small-and-big) apart from `actions` | Yes |
| Facing raise / limp / call count before Hero | Ordered preflop `actions` | Yes |
| Whether the Hero can raise (facing all-in ≥ Stack) | `startingStack`, `posts`, `amount`/`to`, `allIn` | Yes: derive the Hero's remaining Stack |
| Whether an incomplete all-in raise reopens betting | `to` vs the previous full raise size | Yes, once the rule is fixed (§2.2) |
| Preflop aggressor, c-bet chances | Last preflop `raise`; flop Actions in order | Yes |
| IP / OOP postflop | Postflop acting order from Positions | Yes |
| Single-raised / 3-bet pot, heads-up / multiway | Count of preflop raises; players not folded when the flop is dealt | Yes |
| Saw flop | Hero did not fold preflop, and `board.length ≥ 3` | Yes |
| Reached Showdown | `showdown && !heroFolded` | Yes: already stored as `heroReachedShowdown` (`hero-result.ts`, `schema.ts`) |
| Won money (W$SD, WWSF) | `collected` has the Hero with amount > 0 | Yes. Split pots count as won |
| Hero sat out | `seats[].sittingOut` | Never imported (§2.2) |
| Opponents' hole cards | `shown` only | Not needed for any Stat in §1 |

**Caveats:**
1. **A late BB post:** `positions()` takes the first `big-blind` post. A Hand where a newcomer also posts a big blind (`posts big blind` from a non-BB seat) may hold two. **Unverified** whether the parser tells them apart. Check the corpus before trusting Position Stats.
2. **Mixing Heroes:** a Library holds Hands "whatever their Hero" (CONTEXT.md, Library). Hero Stats must follow the Results Graph's Hero filter, or they mix different players.
3. **Mixing Stakes and limits:** `stake.limit` can be pot-limit or fixed-limit. Stats are only comparable within No-Limit Hold'em, so filter on `limit === 'no-limit'`.
4. **Storage:** the per-Hand Hero columns already computed at import (`heroResult`, `heroReachedShowdown`) suggest one pattern: store per-Hand opportunity and action flags at import, the way PT4's cache columns do (`cnt_vpip`, `cnt_walks`, `flg_p_squeeze_opp`). Aggregating them is then a SQL sum. Hands imported earlier would need a backfill.
5. **Not computable:** nothing in §1. Only Stats about time (time bank, session length per table) or about opponents' unshown cards would be out of reach, and neither is in scope.

## 6. Recommended starting set

Fifteen Stats plus the Hand count, in three short groups. Each shows its opportunity count, dimmed below the thresholds in §3.

**Preflop (7):** VPIP, PFR, 3-bet, Fold to 3-bet, Attempt to Steal, Fold BB to Steal, Cold Call.
- The first five are the core of both default HUDs (§1).
- Fold BB to Steal and Cold Call cover blind defence and flatting, the two most common preflop leaks a post-session review looks for.
- 4-bet waits: it needs the largest sample of any preflop Stat (§3).

**Postflop (5):** Flop C-bet, Turn C-bet, Fold to Flop C-bet, Flop Check-raise, AFq.
- C-bet and Fold vs CBet are in both default HUDs.
- AFq is a frequency, as CONTEXT.md requires of a Stat; AF is a ratio that can be ∞.

**Showdown (3):** WTSD, W$SD, WWSF.
- These are HM3 Advanced's showdown trio. They connect to Runout's existing Showdown Result and Non-showdown Result lines.

A Position breakdown (rows UTG…BB, columns VPIP / PFR / RFI / 3-bet) is the natural second view. It should not go on the first screen.
