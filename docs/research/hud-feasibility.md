# HUD feasibility for PokerStars and iPoker

Research note, 2026-10-26. Sources were read on 2026-10-26 unless a claim says otherwise. Anything marked **Unverified** could not be confirmed from a primary source.

## Verdict

- **A real-time HUD drawn over the poker client cannot be built in Runout as it is, a browser SPA.** A web page cannot draw over another application's native windows, and it cannot find those windows. Chrome also blocks the folders where the poker clients save Hand Histories by default (`%LOCALAPPDATA%`, `%APPDATA%`, `~/Library`). Firefox and Safari do not implement the folder APIs at all.
- **It can be built as a companion desktop app (Electron or Tauri).** The companion would read the Hand History folder as hands are written, compute stats, and draw transparent always-on-top windows lined up with each table. That is a second product: native window tracking per OS and per client, packaging and signing, and a parser per client. On PokerStars it is allowed, within limits. On iPoker the policy is unclear.
- **The biggest blocker is policy, not technology: a *shared* HUD is out on PokerStars.** The policy permits in-game stats "only" from "information that you have accumulated through your own play". It also prohibits "the mass sharing of hands, private results or playing statistics for the purpose of analysis of opponents". A HUD fed by the study group's pooled Libraries breaks both rules. A personal HUD (only hands whose Hero is the person) fits within them.
- **What fits Runout best: post-session stats in the Library and the Room.** These are opponent and Hero stats computed from the Library and shown while a Hand is replayed. No real-time integration is needed, and no live-play rule applies while the client is closed. The sharing clause is still a caution for group views of opponent stats (see §5).

## 1. PokerStars

**Policy on HUDs and real-time stats.** The *Third-Party Tools and Services Policy* lists four permitted categories. One of them is "Tools or services that monitor and display numerical-based statistics in-game", provided they "make use of only information that you have accumulated through your own play". The displayed stats must not be split by card values, and must not change automatically based on the game state or the opponent's tendencies. ([pokerstars.com, Prohibited Programs, Tools and Services](https://pokerstars.com/poker/room/prohibited/?no_redirect=1), accessed 2026-10-26)

- Prohibited at all times: real-time advice from reading the current game state; scraping table data into a calculator or database "(whether local, on a cloud or hosted externally)"; datamining; and mass sharing of hands or stats to analyse opponents. ([same page](https://pokerstars.com/poker/room/prohibited/?no_redirect=1), 2026-10-26)
- Prohibited while any PokerStars client is open, even with no tables open: advanced equity tools, GTO solutions and AI advice. ([same page](https://pokerstars.com/poker/room/prohibited/?no_redirect=1), 2026-10-26)
- The page defines datamining as "observing games without playing in order to build up a database of hand histories for future reference". ([same page](https://pokerstars.com/poker/room/prohibited/?no_redirect=1), 2026-10-26)
- The page shows no "last updated" date, and PokerStars says it does not notify players when the policy changes. Check it again before shipping anything.

**Jurisdictions.**
- **.es:** The Spanish page carries the same clauses: "hacen uso únicamente de la información que has acumulado con tu propio juego"; "compartir de forma masiva manos, resultados privados o estadísticas de juego con el objetivo de analizar a los rivales". ([pokerstars.es, Política sobre herramientas y servicios de terceros](https://www.pokerstars.es/poker/room/prohibited/), 2026-10-26)
- **.fr:** The English page on .fr is identical and has no France-specific clauses. ([pokerstars.fr](https://www.pokerstars.fr/en/poker/room/prohibited/?ooac=1), 2026-10-26)
- **.it:** **Unverified.** The page [pokerstars.it/poker/room/policy-di-utilizzo](https://www.pokerstars.it/poker/room/policy-di-utilizzo) exists but timed out when fetched. A PokerStars.it Learn blog post says tracking software is accepted for in-game stats from your own games, but that is editorial, not policy.
- No substantive differences between jurisdictions were found on the pages that could be read.

**Hand History written to local disk.**
- The client saves Hand Histories to disk only when Settings → Playing History → Hand History → "Save My Hand History" is on. The folder can be changed there; the help article suggests "Documents" if `Program Files` is write-protected. ([PokerStars help, Hand history not saving (Windows)](https://eur.pokerstars.com/help/articles/win-hh-not-saving-initial/), 2026-10-26)
- PokerStars archives all real-money Hand Histories on its servers; players request them via Tools → History & Stats → Get Hand History. ([same article](https://eur.pokerstars.com/help/articles/win-hh-not-saving-initial/), 2026-10-26)
- Trackers read the plain-text Hand Histories the client saves, which must be in English, with the client also installed in English. ([PokerTracker 4, PokerStars Configuration Guide](https://docs.pokertracker.com/pt4/site-configuration/pokerstars-configuration-guide/), 2026-10-26)
- In "Get Hands While Playing" mode, PT4 imports hands "automatically while you play" and starts the HUD. It is "the only import option for real-time play". ([PT4, Automated Hand History Importing](https://docs.pokertracker.com/pt4/tutorials/importing-and-migration/automated-hand-history-importing/); [PT4 Quick Start Guide](https://docs.pokertracker.com/pt4/general/pokertracker-4-quick-start-guide/), 2026-10-26)
- This is the same text format Runout already imports (`pokerstars-*.txt` fixtures).
- **Unverified:** the default folder. Commonly reported as `%LOCALAPPDATA%\PokerStars…\HandHistory\<Screen Name>` on Windows and `~/Library/Application Support/PokerStars/HandHistory` on macOS. Neither PokerStars nor PT4 states it; PT4 says to use "Auto Detect" or read "Where To Save" in the client.
- **Unverified:** how soon after a hand ends it is written to disk. PT4's real-time HUD implies that it is, but no primary source gives the timing.

## 2. iPoker (Playtech)

- **Local Hand Histories:** The client saves them when My Account → Settings → General → "Store Hand History Locally" is on. PT4's guide gives the path `%appdata%\Local\<iPoker Client>\data\<Screenname>\History\Data`. Each skin writes in its own time zone. The client must be in English. macOS support covers only some skins. ([PT4, iPoker Configuration Guide](https://docs.pokertracker.com/pt4/site-configuration/ipoker-configuration-guide/), 2026-10-26)
- **Format:** **Unverified.** PT4 calls them "text hand histories". iPoker files are widely reported to be XML, but no primary source confirms it.
- **Runout today:** iPoker is not an import format yet; the server rejects it as `invalid-format` (`apps/server/test/import.e2e-spec.ts`).
- **HUD policy:** **Unverified.** No Playtech or network-wide third-party tools policy could be found.
  - The bet365 game rules and help center returned HTTP 403. The search snippets indicate a ban on software that automates play or gives real-time help, but they say nothing about HUDs ([help.bet365.com/en/rules/rules-poker](https://help.bet365.com/en/rules/rules-poker), not readable).
  - Betfair's General Terms reportedly prohibit real-time advice, bots, datamining and mass sharing, with a carve-out for tools "expressly permitted for use with Poker Games". The poker sections of [betfair.com Terms](https://www.betfair.com/aboutUs/Terms.and.Conditions/) were truncated, and its support site returned 403.
  - A search result also titled a Betfair FAQ "PokerStars on Betfair" and noted that iPoker is discontinued for Betfair customers in Ireland. **Unverified** which network Betfair Poker runs on today.
  - Secondary press (RakeRace, Sept 2025) reports that iPoker said trackers like Hand2Note are "not prohibited but not recommended", and that iPoker ships a built-in "Player HUD". **Not primary**: confirm on each skin.
- **Anonymity and Screen Name changes:** **Unverified.** Secondary sources (WorldPokerDeals) report that since July 2020 iPoker hides opponents' nicknames ("Player1…") until the big blind is posted, and removed nickname lookup from the lobby. If this is accurate, a HUD can only attach stats once names appear. Whether nicknames can be changed periodically, which would break stats tied to a Screen Name, was not confirmed.
- **Spain (.es) iPoker skins:** no primary source found. **Unverified.**

## 3. How HUDs work, and what a browser can do

**How existing HUDs work.** Each step below is supported by the cited vendor or OS documentation; the PT4 docs do not describe the window mechanics.
1. Watch the client's Hand History folder and parse new hands as they are written. PT4 re-reads files left in the folder every time Auto Import starts, and some clients lock the files while the tables are open. ([PT4, Moving Processed Files](https://www.pokertracker.com/guides/PT4/troubleshooting/moving-processed-files-unable-to-get-hands-while-playing), 2026-10-26)
2. Find the client's table windows. Windows offers `EnumWindows`, which "Enumerates all top-level windows on the screen". ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumwindows), 2026-10-26) macOS offers `CGWindowListCopyWindowInfo`, which "Generates and returns information about the selected windows in the current user session". ([Apple Developer](https://developer.apple.com/documentation/coregraphics/cgwindowlistcopywindowinfo(_:_:)), 2026-10-26)
3. Draw panels on top of each table, following it as it moves. PT4 says the HUD "appears on your table after a hand or two", and its macOS setup asks for extra OS permissions (App Management on macOS 14+). ([PT4 Quick Start](https://docs.pokertracker.com/pt4/general/pokertracker-4-quick-start-guide/); [PT4 PokerStars guide](https://docs.pokertracker.com/pt4/site-configuration/pokerstars-configuration-guide/), 2026-10-26)
   - **Unverified:** whether macOS needs Screen Recording permission to read other apps' window titles. Apple's `kCGWindowName` doc only notes that "few applications set the Quartz window name".

**What a browser can do.**
- **Pick a folder:** `showDirectoryPicker()` is experimental, needs HTTPS and a user gesture, and is supported in Chrome/Edge 86+ but not in Firefox or Safari. ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker); [mdn/browser-compat-data](https://github.com/mdn/browser-compat-data/blob/main/api/Window.json), 2026-10-26)
- **Watch a folder:** `FileSystemObserver` is non-standard and experimental, and only in Chrome/Edge 133+; Firefox and Safari do not have it. ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver); [browser-compat-data](https://github.com/mdn/browser-compat-data/blob/main/api/FileSystemObserver.json); [Chrome 133 release notes](https://developer.chrome.com/release-notes/133), 2026-10-26)
  - Without it, a page can poll the directory handle while its tab is open.
- **Blocked folders:** Chromium refuses to share `DIR_LOCAL_APP_DATA`, `DIR_ROAMING_APP_DATA`, `DIR_COMMON_APP_DATA` and `Program Files` on Windows, and `~/Library` on macOS. ([Chromium source, `chrome_file_system_access_permission_context.cc`, `GenerateBlockPaths`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc), 2026-10-26)
  - The iPoker path PT4 documents is under `%LOCALAPPDATA%`, so Chrome blocks it.
  - On PokerStars, the player would first have to point "Save My Hand History" at a folder under Documents. The client allows that (§1).
- **Draw over the poker client:** no web API draws outside the page's own viewport or lists other apps' windows. A browser tab, even Picture-in-Picture, cannot follow and cover a native table window. **Unverified as a single citable statement**; it follows from the APIs above being the only file and window surface the web platform exposes.

**Companion desktop app.**
- **Electron** windows can be frameless and transparent, and support `setAlwaysOnTop(flag, level)` (levels up to `screen-saver`), `setIgnoreMouseEvents(ignore, {forward})` for click-through, and `focusable: false`. Electron has no API to list or measure other apps' windows; that needs native code (`EnumWindows`/`GetWindowRect`, `CGWindowList…`). ([Electron, BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window), 2026-10-26)
- **Tauri** can watch a folder through `tauri-plugin-fs` `watch`/`watchImmediate` (Cargo feature `watch`, permission `fs:allow-watch` plus a path scope). Window tracking would again be native Rust. ([Tauri v2, File System plugin](https://v2.tauri.app/plugin/file-system/), 2026-10-26)
- **Two shapes:**
  - (a) The companion draws the overlay itself: a full HUD, the most work.
  - (b) The companion only tails the folder and pushes new Hands to the Runout server, which adds them to the person's Library. That is a "background import", which ADR 0004 already leaves for later. No overlay and no live-play policy questions, and it unlocks §5 with no manual export.

## 4. Shared vs personal HUD: policy risk

- **PokerStars allows a personal HUD only.** In-game stats must "make use of only information that you have accumulated through your own play". ([pokerstars.com](https://pokerstars.com/poker/room/prohibited/?no_redirect=1), 2026-10-26)
- **A shared HUD is prohibited** under "Prohibited at all times": "the mass sharing of hands, private results or playing statistics for the purpose of analysis of opponents", and "the use of hands or private results acquired through datamining". ([same page](https://pokerstars.com/poker/room/prohibited/?no_redirect=1), 2026-10-26)
  - A HUD fed by other members' Libraries breaks both rules. **Unverified** where "mass" begins: the policy gives no threshold, so a small group should not assume it is exempt.
- **Runout already has the data needed to stay personal.** Under ADR 0004 a Library holds "the Hands they imported into it, whatever their Hero". A personal HUD would therefore have to compute stats only from Hands whose Hero is one of the person's own claimed Screen Names. Screen Names "can be claimed by anyone" (ADR 0004), so that check cannot be enforced inside Runout.
- **iPoker:** no primary text found (§2). Betfair's terms reportedly carry similar datamining and mass-sharing bans (unverified excerpt).

## 5. Alternative that fits Runout: post-session stats

- **The feature:** stats such as VPIP, PFR, 3-bet, WTSD and Win Rate for the Hero and for opponents, computed server-side from the Library and shown in the Library and next to seats during Playback. It reuses the existing import, parser and Library filters.
- **What the PokerStars policy says:** "permitted in-game statistics" covers tools used at the table, and a Runout Room used after the session is not one. The "prohibited while client open" list (equity, GTO and AI tools) does not include a stats view or a replayer, and the page does not mention hand replayers or post-session review at all. ([pokerstars.com](https://pokerstars.com/poker/room/prohibited/?no_redirect=1), 2026-10-26)
  - **Unverified:** that PokerStars treats post-session group review as permitted. The policy is silent on it.
- **Where the risk remains:** the mass-sharing clause is not tied to live play. If members share opponent stats across the group, especially built from other members' hands, or use them at the table, that falls within its wording ("playing statistics for the purpose of analysis of opponents").
- **Safest version:**
  - opponent stats in a person's view only from Hands where that person is the Hero;
  - group Rooms show the stats of the Hand being studied, not an opponent database pooled across members;
  - a note in the UI that stats are not to be used at the table.

## Open questions to settle before building

- **iPoker:** the current third-party tools policy of each skin the group plays (bet365, William Hill and others), including in the .es market. Ask support in writing.
- **iPoker:** whether nickname anonymity and changes still apply.
- **PokerStars:** whether a small group reviewing each other's hands counts as "mass sharing". Ask PokerStars support in writing.
- **Default folders:** the PokerStars Hand History folder on each OS, and the iPoker file format (XML?). Confirm on a real install.
