import { useI18n } from '../i18n'
import { usePreferences } from '../preferences/context'
import type { DeckStyle } from '../preferences/preferences'
import { SUIT_PATHS, type Suit } from './suits'

/*
 * Card sprites from the "Cartas" board: the classic ivory deck (four colours
 * or two) and the full-suit deck, in their four sizes. Rank top left, suit
 * bottom right; tens read "10". Each reader sees the deck they chose.
 */

export type CardSize = 'community' | 'hero' | 'opponent' | 'list'

/** A card as the server writes it, rank then suit, tens as "10": "As", "10h". */
function parse(card: string): { rank: string; suit: Suit } {
  return { rank: card.slice(0, -1), suit: card.slice(-1) as Suit }
}

/** Which deck to draw a card in; the reader's own unless a preview says otherwise. */
export interface Deck {
  style: DeckStyle
  /** The classic deck in four colours; the full-suit deck always has them. */
  fourColour: boolean
}

/**
 * A card face up. `winning` outlines it as part of a winning hand; `flip`
 * turns it over as it appears, for cards shown at Showdown.
 */
export function Card({
  card,
  size,
  winning,
  flip,
  deck,
}: {
  card: string
  size: CardSize
  winning?: boolean
  flip?: boolean
  deck?: Deck
}) {
  const { t } = useI18n()
  const preferences = usePreferences()
  const { style, fourColour } = deck ?? { style: preferences.deckStyle, fourColour: preferences.fourColour }
  const { rank, suit } = parse(card)
  return (
    <span
      className={`ro-card ro-card--${size}`}
      data-deck={style}
      data-two-colour={(style === 'classic' && !fourColour) || undefined}
      data-suit={suit}
      data-ten={rank === '10' || undefined}
      data-winning={winning || undefined}
      data-flip={flip || undefined}
      role="img"
      aria-label={t('room.card.label', { rank, suit: t(`room.card.suit.${suit}`) })}
    >
      <span className="ro-card__rank" aria-hidden="true">
        {rank}
      </span>
      <svg className="ro-card__suit" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={SUIT_PATHS[suit]} fill="currentColor" />
      </svg>
    </span>
  )
}

/** A card dealt face down: the same back in both decks. */
export function CardBack({ size }: { size: CardSize }) {
  return (
    <span className={`ro-card ro-card--${size} ro-card--back`} aria-hidden="true">
      <svg className="ro-card__mark" viewBox="0 0 24 24" focusable="false">
        <path
          d="M3 17c3.4 0 3.4-10 6.8-10S13.2 17 16.6 17 20 11.5 21 9.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/** Where a card still to be dealt will go. */
export function CardSlot({ size, label }: { size: CardSize; label?: string }) {
  return <span className={`ro-card ro-card--${size} ro-card--empty`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
}
