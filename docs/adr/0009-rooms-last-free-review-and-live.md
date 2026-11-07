# 0009 · Rooms last for days, in Free Review or Live

Date: 2026-11-07 · Status: accepted

A Room used to be one study session: everyone online at once, the Master driving the only Playback, and the Room closing after 30 minutes with nobody connected. Groups also want to review on their own time: someone builds a Queue, sends the link (Guests without an Account included), and people go through the Hands at their own pace, leaving Notes, before or instead of meeting. So a Room now lasts until its Master closes it or 14 days pass without anyone entering it, and it is always in one of two states. In **Free Review**, where every Room starts, each Participant replays the Queue alone and Runout remembers the Hand they were on. In **Live**, which the Master starts and ends as often as they like, everyone follows one Playback exactly as before. Live ends on its own once the Master has been away for 30 minutes, so a forgotten Live never strands the Room.

We rejected a separate "shared Queue" object for asynchronous review, because it would duplicate Participants, Notes, Authors and the Room Code just to drop the shared Playback, and a group would have to move its Hands from one to the other to go Live. We rejected keeping the 30-minute closure, because no link sent for later would survive it. We rejected ending Live after 30 minutes without the Master moving the Playback, because a long talk over one Hand would end it mid-discussion, and after 30 minutes with nobody connected, because Guests who leave a tab open would keep it Live forever.

## Consequences

- Room Hands and anonymous identities now live for days instead of minutes, but still die with the Room (ADR 0004, ADR 0005).
- Free Review gives each Participant their own Hide Opponent Names switch; the shared Playback, its Revisions and Sync only matter while the Room is Live.
- In Free Review people write Notes alone, so the writer edits and deletes their own Notes, and the Master any, in both states.
- An Account lists the open Rooms it is a Participant of. A Guest can Leave one; the Master closes it instead.
- The Master's role passes on by failover only while the Room is Live; in Free Review the Master keeps it however long they are away, so a Guest opening the link days later never becomes Master.
- Live ends on its own across restarts too: a Room Live when Runout comes back has no Master connected, so its 30 minutes and failover start then, or carry on from when its Master went away.
- An Administrator can end Live with no Master involved, exactly as the 30 minutes would, as a way out of a stuck Live that keeps the Room, its Room Hands and its Notes.
- Rooms open when this ships start in Free Review.
