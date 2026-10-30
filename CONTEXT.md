# Runout

A web room where a small study group replays the same poker hand together, in real time, while talking over their own voice channel. Everything in code and docs is in English; the UI is localised (Spanish by default, English too).

## Language

### People and roles

**Account**:
A person's lasting identity in Runout, signed in with Google. Everything that outlives a Room belongs to one: their Library, Screen Names, Display Name, Preferences, Marks and Tags.
_Avoid_: User, profile, login

**Sign-in**:
One browser holding a bearer token for an identity. An Account has one per browser it signed in with; signing out ends that one only. The code calls it a session (the `sessions` table, `/api/sessions`), and the UI says "iniciar/cerrar sesión"; anywhere else, "session" on its own means neither this nor a Room.
_Avoid_: Session (outside the code and those UI phrases), login

**Participant**:
A person present in a Room: either with their Account, or anonymously, with an identity that exists for that one Room and is lost when it closes. Being anonymous says nothing about being Master or Guest; the UI offers it as entering "sin cuenta", never "como invitado".
_Avoid_: User, player, member, anonymous user

**Master**:
The one Participant who controls Playback in a Room. The Room's creator starts as Master; the role is handed over, never requested back as a right.
_Avoid_: Host, anfitrión, owner, admin, creator

**Guest**:
Any Participant who is not the Master.
_Avoid_: Invitado (UI only), spectator, viewer

**Display Name**:
The name a person is shown under inside Runout. One per Account, reused across Rooms, editable at any time; an anonymous Participant picks one for their Room only.
_Avoid_: Alias, nickname, username

**Screen Name**:
A name a person plays under on a Poker Site. One person can have several; they are how a Hand's Hero is matched to a person.
_Avoid_: Alias, nick, player name

**Poker Site**:
The operator where hands are actually played (PokerStars, GGPoker…).
_Avoid_: Poker room, sala, room

### Hands

**Hand History**:
The raw text a Tracker or poker site exports describing one or more hands.
_Avoid_: Historial (UI only), log, file

**Tracker**:
Desktop software that records played hands and exports Hand Histories (PokerTracker 4, Hold'em Manager 3, Hand2Note).

**Hand**:
One dealt hand as recorded from one Hero's seat. The same real-world hand seen from two different seats is two Hands.
_Avoid_: Game, spot, deal

**Hero**:
The seat from whose point of view a Hand was recorded, as stated by the Hand History itself.

**Author**:
The person whose spot a Hand is, as a Room shows it: the Participant whose Screen Name is the Hero's, or else whoever brought the Hand into the Room. The Master can reassign it. It means nothing outside a Room and never decides what is in anyone's Library.
_Avoid_: Owner, uploader

**Importer**:
The Participant who brought a Hand into Runout. Recorded for audit only; carries no meaning for attribution.
_Avoid_: Author

**Note**:
A written conclusion attached to a Hand, with its writer and date. Visible wherever the Hand is seen. Inside a Room any Participant writes one, but only the Master edits or deletes it; outside a Room, anyone who has the Hand in their Library can write, edit or delete.
_Avoid_: Comment, annotation

**Tag**:
A label a person puts on a Hand in their own Library, or on a Range in their Lab, to classify it. Only they see it. The Library's Tags and the Lab's are separate sets: a Tag lives in one of the two and never labels anything in the other.
_Avoid_: Category, group tag

**Mark**:
A private flag a person puts on a Hand to find it again. Only they see it.
_Avoid_: Favourite, bookmark, star

**Library**:
A person's own repository: the Hands they imported into it, whatever their Hero, and nothing else. Several Libraries can hold the same Hand. Hands seen in other people's Rooms are not in it.
_Avoid_: Shared with me, collection, archive, database

**Room Hand**:
A Hand in a Room's Queue that is in nobody's Library. It is discarded, with its Notes, when the Room closes, unless the Queue of another open Room still holds it: then it goes when the last of those closes.

### Results

**Result**:
What the Hero won or lost in a Hand, after rake.
_Avoid_: Profit, winnings, net

**All-in EV**:
The Hero's Result with luck taken out: when an all-in leaves no betting before the river with the Hero still in (all-in themselves, or covering whoever is) and every opponent still in has shown their cards, their share of each pot by equity instead of what they actually won. Otherwise it equals the Result.
_Avoid_: EV (alone), expected value, adjusted

**Showdown Result**:
The Hero's Result in Hands where the Hero reached Showdown. The rest is their **Non-showdown Result**, even when the Hand itself went to Showdown without them.
_Avoid_: Red line, blue line

**Results Graph**:
The running total over a person's Library, Hand by Hand: Result, All-in EV, Showdown Result and Non-showdown Result. Filtered the same way as the Library's list of Hands (period, Poker Site, Hero, Stake, Marks, Tags), and shown in big blinds unless every Hand in the period shares one currency.
_Avoid_: Chart, winrate graph

**Win Rate**:
A Result line per 100 Hands, in big blinds whatever the currency, over the Hands the Results Graph shows: the Result's, and the All-in EV's. Written as BB/100.
_Avoid_: bb/100 (as a name), winnings rate

### Room and queue

**Room**:
The shared space for exactly one study session: Participants, a Queue and the Playback. Closes only when its Master closes it, or after 30 minutes with nobody connected; a closed Room never reopens.
_Avoid_: Session, study session, table, lobby, group

**Kick**:
Taking a Participant out of a Room for good. Only the Master does it: the person leaves at once, the Room Code stops working for them, and the Queue Entries they brought stay where they are.
_Avoid_: Ban, expel, expulsar (UI only), remove

**Room Code**:
The short code that lets a person join a Room. Valid only while the Room is open.
_Avoid_: Invite code, PIN, room ID

**Queue**:
The ordered list of Hands a Room is going to review.
_Avoid_: Playlist, cola (UI only)

**Queue Entry**:
A Hand placed in a Room's Queue, with its position and its Author in that Room. Removing it leaves the Hand intact.

**Playback**:
The Room's shared replay state: which Hand is loaded, which Action it is on, and whether Hide Opponent Names is on. Only the Master changes it; there is no automatic play.
_Avoid_: Player state, reproduction, speed, autoplay

**Revision**:
Where a Room is in its own history: a number that goes up by one with every change to its shared state, and that every change is sent carrying. It belongs to one session and identifies nothing.
_Avoid_: Version, sequence number, event id

**Snapshot**:
The Room as it stands right now, at one Revision, sent whole. A Participant who missed a Revision, or who was away, takes one and drops everything they held.
_Avoid_: State dump, refresh, full sync

**Presence**:
How well a Participant is following the Room, read from their Heartbeats: connected, unstable, or away once they have been silent for over 30 seconds. Separate from being in the Room at all.
_Avoid_: Status, online, idle

**Heartbeat**:
What a Participant's browser sends every few seconds: that it is there, the Revision it has applied, and the round trip it last measured.
_Avoid_: Ping, keepalive

**Sync**:
Whether what one Participant has on screen is the Room as it stands: synced, recovering (a Revision was missed, or the connection has just come back) or offline. About their own screen, where Presence is about how the Room sees them.
_Avoid_: Connected, online, up to date

**Hide Opponent Names**:
A Playback switch, off whenever a Hand is loaded, that shows seats by Position instead of Screen Name unless the Screen Name belongs to a Participant of the Room.
_Avoid_: Anonymise, hide nicks

**Action**:
One player decision in a Hand (fold, check, call, bet, raise). The unit Playback steps by. Posting blinds and antes and dealing the board are not Actions.
_Avoid_: Step, event, move

### Table

**Street**:
A betting round: preflop, flop, turn or river.
_Avoid_: Calling showdown a street

**Showdown**:
The point after the last Street where remaining hands are revealed and pots awarded. Not a Street.

**Final Street**:
The last Street a Hand reached (preflop, flop, turn or river). Whether it went to Showdown is recorded separately, never as a Final Street value.
_Avoid_: Last street, "street where the action died"

**Stake**:
The blind level a Hand was played at, as stated in its Hand History. A property of the Hand, never of a Room.

**Position**:
A seat's name relative to the button (UTG, UTG+1, MP, LJ, HJ, CO, BTN, SB, BB), derived from how many players were dealt in. Tables of 2 to 9 seats.

**Splash**:
Money the Poker Site adds to a pot that no player put in. It is in the pot from the Initial State and is won like any other chip.
_Avoid_: Bonus, house money

**Initial State**:
The table as the Hand begins: Starting Stacks, blinds and antes already posted, hole cards dealt. Playback's position before the first Action.

**Starting Stack**:
The chips a player has in front of them when the Hand begins.

**Stack**:
The chips a player has in front of them at the current point of Playback.

**Amount**:
A quantity exactly as the Hand History states it, in its currency (money in cash games).
_Avoid_: Chips, fichas

**Display Unit**:
A person's choice of how quantities are shown: in big blinds, as Amounts, or both.
One of the Preferences.

### Preferences

**Preferences**:
How one person reads the table and their Results Graph: Deck Style, four-colour classic deck, pot percentage on bets, Display Unit, Theme, Graph Colours and language. Personal and stored with their identity: they never change what anyone else in the Room sees. Hide Opponent Names is not one of them; it belongs to Playback.
_Avoid_: Settings (the screen, not the choices), options, profile

**Deck Style**:
How a person's cards are drawn: the classic ivory deck (four colours or two) or the full-suit deck, whose face is the suit's colour and which is always four-colour. Both share the same geometry.
_Avoid_: Skin, card theme

**Theme**:
The colour scheme a person's screens use: dark (the default), light, or following the operating system.
_Avoid_: Mode, appearance

**Graph Colours**:
The colour a person gives each line of their Results Graph (Result, All-in EV, Showdown Result, Non-showdown Result), picked from a fixed palette that reads in either Theme. A line keeps its colour wherever it shows: the line itself, its legend toggle, the hover box and its Win Rate. Each line has its own default, and they can go back to it.
_Avoid_: Chart colours, line colours, graph theme

### Lab

**Lab**:
The section where a person builds and studies Ranges on their own. It has nothing to do with Rooms or the Library: nothing in it comes from a Hand or goes into one.
_Avoid_: Laboratorio (UI only), tools, solver, Flopzilla

**Range**:
A named set of Combos a person builds and keeps in the Lab, each Combo in it at some Frequency. Belongs to one Account; nobody else sees it.
_Avoid_: Chart, preset, spot

**Combo**:
One of the 1326 two-card holdings a player can be dealt, with its exact suits (A♥K♥). The unit a Range is made of and counted in.
_Avoid_: Hand, holding, cards

**Hand Class**:
One of the 169 shapes a Combo has once suits are ignored, beyond whether they match: a pair (77, six Combos), suited (AKs, four) or offsuit (AKo, twelve). One cell of the matrix.
_Avoid_: Hand, starting hand, cell (outside the UI)

**Frequency**:
How much of a Combo a Range holds, from 0 to 100 %: AKo at 50 % counts as six of its twelve Combos. A Combo at 0 % is not in the Range.
_Avoid_: Weight, percentage (alone), mix

**Analysis**:
The Lab's screen where a person puts a Range on a Board, and later two Ranges against each other, to see how each one hits it. Nothing about it is kept: the Ranges and the Board it shows live in its address, and editing a Range there never changes the saved one unless it is saved as a new Range.
_Avoid_: Análisis (UI only), simulation, Flopzilla

**Board**:
The community cards a person picks or deals at random in an Analysis: none, a flop, a turn or a river. It removes the Combos that hold any of its cards. Unrelated to the board dealt in a Hand, though the word is the same.
_Avoid_: Flop (for the whole Board), runout

**Dead Cards**:
Up to two cards a person takes out of the deck in an Analysis of one Range without putting them on the Board, usually their own hole cards. Like the Board, they remove every Combo that holds one, and no Board is completed with them. When there are two, they are the person's own Combo, measured against the Range. An Analysis of two Ranges has none.
_Avoid_: Blockers, removed cards, muertas (UI only)

**Category**:
One row of how a Range hits a Board: how many of its live Combos, weighted by Frequency, fall into it. Each is either a Made Hand or a Draw.
_Avoid_: Bucket, hit, hand type

**Made Hand**:
A Category for what a Combo already makes on the Board, from straight flush down to nothing. Each live Combo is in exactly one: the best it makes.
_Avoid_: Hand (alone), made

**Draw**:
A Category for what a Combo can still become on later cards (flush draw, open-ended straight draw, gutshot, backdoor flush draw, overcards…). A Combo can be in several Draws, and in a Made Hand as well. Some Draws are combinations (a flush draw with a pair, with an open-ended straight draw…), and a Combo in one still counts in each Draw it combines. A Draw always uses at least one of the Combo's cards, and is never a draw to what the Combo already makes.
_Avoid_: Project, proyecto (UI only)

**Equity**:
The share of the pot one Range wins against another over every way the Board can be completed, ties split. Combos that share a card with each other never meet.
_Avoid_: EV, win rate, all-in EV
