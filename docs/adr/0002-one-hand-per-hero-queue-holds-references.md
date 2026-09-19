# 0002 · One Hand per Hero; the Queue holds references

Date: 2026-09-18 · Status: accepted

A Hand is identified by the poker site's hand ID **and** its Hero, so the same real-world hand imported from two seats becomes two Hands, each with its own hole cards; re-importing the same ID from the same Hero is a duplicate and is ignored. Merging both views into one Hand was rejected because it would mix hidden information that each Hero never saw at the table.

A Room's Queue holds Queue Entries that reference Hands rather than copies of them, so Notes and tags live on the Hand and stay the same whether it is seen in a Room or in someone's Library, and removing a Queue Entry never deletes the Hand.

## Consequences

- Deduplication on import keys on (Poker Site, hand ID, Hero Screen Name), not on hand ID alone.
- The Queue may show that two Hands are the same real-world hand, but they are never merged.
