# 0011 · Every Account has a Plan, kept apart from being an Administrator

Date: 2026-11-16 · Status: accepted · Amends ADR 0008 and ADR 0010

Runout is about to invite people to try it, and will later be sold, so what an Account may do can no longer be the same for everyone. Every Account is now on one Plan: Beta, for the people invited to try Runout, with everything except a Library of at most 20,000 Hands; or Pro, with everything and only Runout's own limits. Paid Plans, a free trial, promotional codes and gifted subscriptions will come later and will be more Plans and more ways of changing one.

A Plan is not a role in a ladder with Administrator at the top. Whether someone pays has nothing to do with whether they run Runout, and once Plans follow subscriptions they will change on their own, which an Administrator's powers must never do. So being an Administrator stays exactly as ADR 0008 left it: given by the server's configuration only, never from the panel, so that a compromised Administrator cannot make more of them. Administrators are not limited by their own Plan; while Impersonating, the Account they act as is, since its Library is the one filling up.

Which Plan an Account is on is stored, and every change of it is recorded with when, by whom and how it was made (today an Administrator or an Invitation, and for the Accounts that existed before Plans, the migration that put them on Pro; later a subscription, a code or a gift). An Invitation names the Plan its Account starts on, Beta unless the Administrator picks another. Accounts that existed before Plans start on Pro, so that nobody loses what they had.

What each Plan allows is defined in the code, behind one module that everything else asks, not in the database. A new kind of limit (fewer parts of Runout, a cap on Stakes) needs code to enforce it whichever way it is stored, and adding or removing a Plan needs a migration of its Accounts either way; storing the numbers would only spare a deploy when one changes, at the cost of keeping a table and the code that reads it in agreement. Per-Account exceptions were rejected: an Account that needs more moves to another Plan.

## Consequences

- A Library's limit counts the Hands in it now, as ADR 0010's 10 million did; removing Hands makes room again. That 10 million is now Pro's limit.
- Moving an Account to a Plan whose limit it is already over deletes nothing: it keeps its Hands and cannot import more until it is under it.
- A Bulk Import checks the limit in force as each batch runs, so a Plan lowered mid-import ends it early, counting the Hands that did not fit.
- Hands uploaded straight into a Room's Queue never count: they are in no Library.
- Plans that end on a date are not modelled yet; they will come with subscriptions and gifts.
