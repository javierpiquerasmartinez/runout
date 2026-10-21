# 0004 · The Library is what you imported

Date: 2026-10-21 · Status: accepted

Runout becomes the place each person keeps their own Hands, replacing a Tracker's database, as well as a room for studying them together. A person's Library is exactly the Hands they imported into it, whatever their Hero, and their Results Graph is drawn from it. Importing into a Library and importing into a Room are parallel: Hands imported into a Room go to nobody's Library, and a Library Hand can be added to any Room's Queue as itself.

We rejected tying the Library and the Results Graph to the Author, or to the person's Screen Names, because the Author is reassigned by the Master and Screen Names can be claimed by anyone; either would let other people move Hands into or out of someone's results. Filtering by Hero covers the case of a Library that holds other people's Hand Histories. The Author survives only as what a Room shows.

## Consequences

- A Hand belongs to no one. Libraries and Queues reference it, so several Libraries can share one Hand and its Notes (ADR 0002 amendment). Removing a Hand from a Library only removes that reference.
- A Room Hand (in nobody's Library) is discarded with its Notes when its Room closes; the Room warns before closing. Keeping it somewhere was left for later.
- Importing into a Room a Hand already in the Importer's Library queues the Library Hand, so Notes from the review are not lost.
- Notes on a Library Hand can be edited outside a Room by anyone who has it in their Library; inside a Room only the Master edits them.
- The Library needs an Account (ADR 0005).
- Imports into a Library use the same flow and 20 MB limit as Room imports; a background import for whole Tracker databases is a separate component, left for later.
- All existing data (identities, Rooms, Hands) is wiped rather than migrated.
