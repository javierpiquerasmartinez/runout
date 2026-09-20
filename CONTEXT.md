# Runout

A web room where a small study group replays the same poker hand together, in real time, while talking over their own voice channel. Everything in code and docs is in English; the UI is localised (Spanish by default, English too).

## Language

### People and roles

**Participant**:
A person present in a Room. Always has an identity bound to their browser, even without an account; an account only carries that identity to other devices.
_Avoid_: User, player, member, anonymous user

**Master**:
The one Participant who controls Playback in a Room. The Room's creator starts as Master; the role is handed over, never requested back as a right.
_Avoid_: Host, anfitrión, owner, admin, creator

**Guest**:
Any Participant who is not the Master.
_Avoid_: Invitado (UI only), spectator, viewer

**Display Name**:
The name a person is shown under inside Runout. One per person, reused across Rooms, editable at any time.
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
The person whose Screen Name is the Hero's; when none matches, the Importer. The Master can reassign it.
_Avoid_: Owner, uploader

**Importer**:
The Participant who brought a Hand into Runout. Recorded for audit only; carries no meaning for attribution.
_Avoid_: Author

**Note**:
A written conclusion attached to a Hand, with its writer and date. Visible wherever the Hand is seen, but only the Master of a Room the Hand is in can edit or delete it; outside a Room it is read-only.
_Avoid_: Comment, annotation

**Tag**:
A label attached to a Hand, visible to everyone who can see that Hand.
_Avoid_: Category, group tag

**Mark**:
A private flag a person puts on a Hand to find it again. Only they see it.
_Avoid_: Favourite, bookmark, star

**Library**:
The Hands a person can reach outside a Room: those they are Author of, plus those that were in the Queue of any Room they were in.
_Avoid_: Shared with me, collection, archive

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
A Hand placed in a Room's Queue, with its position. Removing it leaves the Hand intact.

**Playback**:
The Room's shared replay state: which Hand is loaded, which Action it is on, and whether Hide Opponent Names is on. Only the Master changes it; there is no automatic play.
_Avoid_: Player state, reproduction, speed, autoplay

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
