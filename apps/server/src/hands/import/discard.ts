/** Why a piece of Hand History text did not become a Hand. */
export type DiscardReason =
  | 'unrecognised-format'
  | 'not-cash-holdem'
  | 'too-many-seats'
  | 'no-hero'
  | 'malformed'
  /** The board was run more than once: one board is all a Hand holds. */
  | 'run-it-twice'
  /** Already imported: same Poker Site, hand ID, Hero and seat (ADR 0002). */
  | 'duplicate';

/** Thrown by a format parser when a Hand can't be read. */
export class Discard extends Error {
  constructor(readonly reason: DiscardReason) {
    super(reason);
    this.name = 'Discard';
  }
}
