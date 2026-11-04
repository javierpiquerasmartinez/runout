# 0008 · Accounts by Invitation only, signed in with Google or a password

Date: 2026-11-04 · Status: accepted · Amends ADR 0005

While Runout is offered as a free trial, who gets an Account has to be decided by someone. A new Account is only created by accepting an Invitation: an Administrator sends it to one email address as a single-use link that expires after 7 days, and only that address can accept it, with Google or by choosing a password. The link proves the address is theirs, so there is no separate verification step. Accounts that existed before this keep working without one.

Joining a Room still takes no Account: the Invitation gates Accounts, not Rooms, so a trial member can bring a friend to a session without inviting them.

ADR 0005 picked Google alone so that Runout would send no email and store no passwords. Invitations need email anyway, and once email exists a password is cheap to offer to the people who would rather not use Google. One Account per email address: Google and a password are two ways into the same Account, never two Accounts.

Passwords follow NIST SP 800-63B: at least 12 characters, no composition rules, and common or leaked passwords refused. Requiring upper case, lower case, a digit and a symbol was considered and dropped, since it breeds predictable passwords that pass every rule. Failed attempts are slowed per email address with a growing wait, never locked out, so nobody can lock someone else out on purpose.

An Administrator is an Account marked as one by the server's configuration, never from the panel, so a compromised Administrator cannot make more of them. They can Suspend an Account (reversible, nothing deleted), but not themselves or another Administrator. They can Impersonate an Account, outside Rooms only and never over how it signs in, with each Impersonation recorded from start to end.

We rejected typed invitation codes because "invite code" already means nothing in Runout but trouble next to the Room Code, and a link carries the email address with it. We rejected deleting Accounts as the way to withdraw access, because a trial that ends should be able to resume.

## Consequences

- Runout now sends email (Invitations, password resets) through Resend; local development needs a way to see it without a real inbox.
- A Google sign-in for an address with no Account and no Invitation is refused and creates nothing.
- Suspending a Master moves the role on by the existing failover; an emptied Room closes as before.
- Recording an Account's last activity starts now, for the Administrator's statistics; nothing before this has it.
- Impersonation records start and end only, not what changed in between. Acceptable for a small group that trusts its Administrator.
