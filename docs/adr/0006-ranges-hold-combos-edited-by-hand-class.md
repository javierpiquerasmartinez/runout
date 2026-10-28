# 0006 · A Range holds Combos, edited by Hand Class

Date: 2026-10-28 · Status: accepted

A Range is stored as a Frequency for each of its Combos (up to 1326), even though the Lab only lets a person edit one Frequency per Hand Class (169 cells). We want Frequencies from the first release and expect the Lab to grow towards board analysis, where card removal and suit-specific Combos matter (A♠K♠ on a spade flop is not A♥K♥). Text that names exact Combos (`AhKh`) can already be imported and must survive a round trip. Storing one value per Hand Class would be simpler now, but every Range saved that way would need migrating, and some information would be lost for good, the day suits become editable.

## Consequences

- A Hand Class whose Combos have different Frequencies is shown as mixed. Painting it with the brush sets all its Combos to one Frequency.
- Combo counts and percentages are always computed from the Combos, weighted by Frequency, never from the cells.
- A suit editor per cell can be added later without changing what is stored.
