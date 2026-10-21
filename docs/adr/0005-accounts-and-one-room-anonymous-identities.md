# 0005 · Accounts with Google; anonymous identities last one Room

Date: 2026-10-21 · Status: accepted · Supersedes ADR 0003

Once Runout is where people keep their Hands (ADR 0004), what lasts has to be tied to something that survives a browser: an Account, signed in with Google. The Library, Screen Names, Display Name, Preferences, Marks and Tags all belong to an Account. Joining a Room still takes no registration: a person who doesn't sign in gets an anonymous identity that exists for that one Room, and it is lost when the Room closes. Creating a Room needs an Account.

ADR 0003 kept anonymous identities forever so that a Guest's Hands would not vanish with the Room. That reason is gone: Hands that last live in a Library, and a Library needs an Account. Keeping anonymous identities around would only leave orphaned Preferences and Screen Names behind, and would need a merge rule for signing in on a browser that already holds one.

Google was chosen over a magic link or email and password because it needs no email delivery and no stored passwords, and every member of a small group already has a Google account.

## Consequences

- No merge rule is needed: signing in simply replaces whatever anonymous identity the browser held for a Room.
- An anonymous Participant's Room Hands, Marks and choices are lost with the Room, as their Room Hands already are (ADR 0004).
- Notes an anonymous Participant wrote on a Library Hand outlive them and keep their writer's Display Name.
- Kicking an anonymous Participant blocks that identity only; rejoining anonymously from a fresh browser is possible. Acceptable for small groups who trust each other.
- All existing data is wiped (ADR 0004), so no current identity needs to become an Account.
