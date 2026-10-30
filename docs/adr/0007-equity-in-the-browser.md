# 0007 · Equity between Ranges is worked out in the browser

Date: 2026-10-30 · Status: accepted

An Analysis shows the Equity of one Range against another, preflop or on any Board. Enumerating every pair of Combos over every completion of the Board is exact but far too slow before the river: preflop it is about a million Combo pairs times 1.7 million boards. The Equity is worked out in the person's own browser, in a Web Worker, by sampling random deals and showing the result as it converges with its margin of error ("±0.1 %"), and by exact enumeration whenever the work is small enough (on the turn and the river). The hand evaluator the server uses for All-in EV moves into a package both apps share, so the two never disagree on who wins a showdown.

Running it on the server would give one place to cache results, but every Analysis would cost server time for something that belongs to one person, a slow connection would freeze the numbers, and the Lab already computes everything else in the browser. Exact enumeration everywhere, with precomputed tables, was set aside as too large to ship to a browser.

## Consequences

- Equity before the river is an estimate. The screen says so and shows how precise it is; it keeps refining while nothing changes.
- Changing either Range or the Board restarts the work; the screen never shows a number for something it no longer holds.
- All-in EV stays exact: a Hand's showdown has known hole cards, and keeps using exact enumeration on the server.
- The evaluator leaves `apps/server` for a shared workspace package.
