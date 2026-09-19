/** Why a piece of Hand History text did not become a Hand. */
export type DiscardReason =
  | 'unrecognised-format'
  | 'not-cash-holdem'
  | 'too-many-seats'
  | 'no-hero'
  | 'malformed';

/** Thrown by a format parser when a Hand can't be read. */
export class Discard extends Error {
  constructor(readonly reason: DiscardReason) {
    super(reason);
    this.name = 'Discard';
  }
}
