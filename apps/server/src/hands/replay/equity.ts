import { cardCode, strength } from '@runout/poker';

/**
 * A player's share of each pot, worked out over every board left to deal
 * (exact enumeration): a pot won outright counts whole, a split counts its
 * share, and each board counts the same.
 *
 * `holes` names every contestant's hole cards; `board` is what is already
 * dealt. Returns, for each pot in `pots` (its contestants), the fraction of
 * it that `player` can expect to take.
 */
export function potShares(
  player: string,
  holes: ReadonlyMap<string, readonly string[]>,
  board: readonly string[],
  pots: readonly (readonly string[])[],
): number[] {
  const names = [...holes.keys()];
  const known = [...board, ...[...holes.values()].flat()].map(cardCode);
  const deck = [...Array(52).keys()].filter((code) => !known.includes(code));
  const toDeal = 5 - board.length;
  // Each player's seven cards: hole cards, then the board, the rest of which
  // is dealt into place for every runout.
  const hands = names.map((name) => [
    ...holes.get(name)!.map(cardCode),
    ...board.map(cardCode),
    ...Array<number>(toDeal).fill(0),
  ]);
  const potIndexes = pots.map((contestants) =>
    contestants.map((name) => names.indexOf(name)),
  );
  const playerIndex = names.indexOf(player);
  const shares = pots.map(() => 0);
  const strengths = names.map(() => 0);
  let runouts = 0;

  const dealt = Array.from({ length: toDeal }, () => 0);
  const settle = () => {
    for (let i = 0; i < hands.length; i++) {
      for (let j = 0; j < toDeal; j++) hands[i][7 - toDeal + j] = dealt[j];
      strengths[i] = strength(hands[i]);
    }
    potIndexes.forEach((contestants, pot) => {
      if (!contestants.includes(playerIndex)) return;
      let best = -1;
      let tied = 0;
      for (const index of contestants) {
        if (strengths[index] > best) {
          best = strengths[index];
          tied = 1;
        } else if (strengths[index] === best) tied++;
      }
      if (strengths[playerIndex] === best) shares[pot] += 1 / tied;
    });
    runouts++;
  };
  const deal = (from: number, slot: number) => {
    if (slot === toDeal) {
      settle();
      return;
    }
    for (let i = from; i <= deck.length - (toDeal - slot); i++) {
      dealt[slot] = deck[i];
      deal(i + 1, slot + 1);
    }
  };
  deal(0, 0);

  return shares.map((share) => share / runouts);
}
