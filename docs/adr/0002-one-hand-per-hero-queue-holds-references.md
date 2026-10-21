# 0002 · One Hand per Hero; the Queue holds references

Date: 2026-09-18 · Status: accepted

A Hand is identified by the poker site's hand ID **and** its Hero, so the same real-world hand imported from two seats becomes two Hands, each with its own hole cards; re-importing the same ID from the same Hero is a duplicate and is ignored. Merging both views into one Hand was rejected because it would mix hidden information that each Hero never saw at the table.

A Room's Queue holds Queue Entries that reference Hands rather than copies of them, so Notes and tags live on the Hand and stay the same whether it is seen in a Room or in someone's Library, and removing a Queue Entry never deletes the Hand.

## Consequences

- Deduplication on import keys on (Poker Site, hand ID, Hero Screen Name), not on hand ID alone; the Hero's seat joined the key on 2026-10-21 (see below).
- The Queue may show that two Hands are the same real-world hand, but they are never merged.

## Amendment, 2026-10-21: Poker Sites that hide the Hero's Screen Name

CoinPoker writes the Hero as `Hero` and gives every opponent a different hashed name in each Hand, so the Hero's Screen Name is never in the Hand History. The Hero's **seat** now tells them apart: deduplication keys on (Poker Site, hand ID, Hero Screen Name, Hero's seat), which still keeps one Hand per point of view. Asking the Importer for their Screen Name on import was rejected as friction for a value the file can't confirm; keying on `Hero` alone was rejected because two people at the same table would collide. The Screen Name stays in the key so that Hands already stored twice from one seat under two names (a fixture imported before and after anonymising) are kept as they are rather than folded together.

No Screen Name can match, so the Author of these Hands is always the Importer until the Master reassigns it.

## Amendment, 2026-10-21: Libraries hold references too

A Hand is still stored once per (Poker Site, hand ID, Hero Screen Name, Hero's seat), but it is no longer anyone's: Libraries hold references to it the same way Queues do (ADR 0004). Two people who import the same Hand from the same seat share it, Notes included; deduplication only tells each person that the Hand is already in their own Library. Tags stop living on the Hand and become per person, like Marks, because in a repository they classify one person's Hands rather than record the group's conclusions.
