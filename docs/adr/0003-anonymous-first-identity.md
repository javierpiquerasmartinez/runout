# 0003 · Anonymous-first identity, optional account

Date: 2026-09-19 · Status: accepted

Every Participant gets a real, server-side identity the first time their browser opens Runout, with no login: a token kept in the browser identifies them. Hands they author, their Marks, Screen Names, Display Name and preferences all belong to that identity and outlive the Room. An account is optional and only links that identity to other devices; creating one later keeps everything the anonymous identity already owns.

We rejected mandatory accounts because joining from a pasted link must take one step (confirm the Display Name), and we rejected throwaway anonymous sessions because a Guest's Hands would vanish when the Room closes, making anonymous Participants second-class.

## Consequences

- This amends ADR 0001's "no authentication" stance: the MVP needs identities persisted server-side as soon as Hands outlive a Room (E6). Accounts themselves can still come later.
- Clearing browser storage without an account loses the identity and its Library. The UI should say so.
- Kicking a Participant blocks that identity from the Room, not the person: rejoining from a fresh browser is possible. Acceptable for small groups who trust each other.
- Linking an account to a browser that already holds a different identity needs a merge rule, to be decided when accounts are built.
