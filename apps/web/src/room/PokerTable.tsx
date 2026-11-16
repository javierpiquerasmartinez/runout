import type { CSSProperties } from 'react'
import { useI18n } from '../i18n'
import { Card, CardBack, CardSlot } from '../ui/Card'
import { Icon } from '../ui/Icon'
import { useNarrowScreen } from '../calendar/narrowScreen'
import { asPercent, betHeight, cachedPlaces, LANDSCAPE, portrait } from './tableLayout'
import { Secondary } from '../ui/Secondary'
import type { SeatView, TableView } from './tableView'

/*
 * The top-down table: the felt, the board and pot in the middle, and the
 * seats around it, with the dealer button and each bet beside their seat,
 * clear of everything else. Laid out as the "Sala" boards draw it, at
 * 820 × 606; on a phone the felt stands on its end with the Hero at the
 * bottom, as the phone boards draw it (tableLayout.ts has both drawings).
 * The page scales the drawing as one picture to fit (RoomPage.css).
 */

export function PokerTable({ view }: { view: TableView }) {
  const { t } = useI18n()
  const shape = useNarrowScreen() ? portrait(view.slots) : LANDSCAPE
  const places = cachedPlaces(view.slots, view.seats, betHeight(view.betLines), shape)
  const winning = new Set(view.winningCards)
  // The drawing's height, and where its middle is, for the portrait felt and board (RoomPage.css).
  const size = { '--table-h': `${shape.table.height}px`, '--table-mid': `${shape.middle[1].top + 28}px` } as CSSProperties
  return (
    <div className="poker-table" data-shape={shape.name} style={size}>
      <div className="poker-table__felt" />

      <div className="poker-table__middle">
        <div className="poker-table__board" role="group" aria-label={t('room.table.board')}>
          {view.board.map((card, index) =>
            card ? (
              <Card key={index} card={card} size="community" winning={winning.has(card)} />
            ) : (
              <CardSlot key={index} size="community" label={t('room.card.empty')} />
            ),
          )}
        </div>
        {view.sidePots ? (
          <div className="poker-table__pots">
            {view.sidePots.map((pot, index) => (
              <div key={index} className="poker-table__side-pot" data-main={index === 0 || undefined}>
                <span className="poker-table__side-pot-label ro-mono">{pot.label}</span>
                <span className="poker-table__side-pot-value ro-mono">
                  {pot.amount}
                  <Secondary value={pot.secondary} />
                </span>
                <span className="poker-table__side-pot-who ro-mono">{pot.contestants}</span>
              </div>
            ))}
            {view.potDetail && <span className="poker-table__pot-detail ro-mono">{view.potDetail}</span>}
          </div>
        ) : (
          <div className="poker-table__pot">
            <span className="poker-table__pot-label ro-mono">{t('room.table.pot')}</span>
            <span className="poker-table__pot-value ro-mono">
              {view.pot}
              <Secondary value={view.potSecondary} />
            </span>
            {view.potDetail && <span className="poker-table__pot-detail ro-mono">{view.potDetail}</span>}
          </div>
        )}
      </div>

      {view.seats.map((seat) => (
        <Seat key={seat.screenName} seat={seat} winning={winning} style={asPercent(shape.seatCentre(seat.slot, view.slots), shape)} />
      ))}
      {places.dealer && (
        <span className="poker-table__dealer ro-mono" role="img" aria-label={t('room.table.dealer')} style={asPercent(places.dealer, shape)}>
          D
        </span>
      )}
      {view.seats.map((seat) => {
        if (!seat.chip) return null
        // Below the amount, smaller: that it is all-in, the pot share, or else the Amount in the other unit.
        const below = (seat.chip.kind === 'all-in' ? t('room.table.allInBet') : seat.chip.potShare) ?? seat.chip.secondary
        return (
          <span
            key={seat.screenName}
            className="poker-table__bet ro-mono"
            data-kind={seat.chip.kind}
            style={asPercent(places.bets.get(seat.slot)!, shape)}
          >
            <span className="poker-table__bet-chip" />
            <span className="poker-table__bet-text">
              <span className="poker-table__bet-amount">{seat.chip.label}</span>
              {below && <span className="poker-table__bet-below">{below}</span>}
            </span>
          </span>
        )
      })}
    </div>
  )
}

function Seat({ seat, winning, style }: { seat: SeatView; winning: Set<string>; style: CSSProperties }) {
  const { t } = useI18n()
  // Whose turn it is, or that they folded, before what they last did.
  const status = seat.toAct ? t('room.table.toAct') : seat.folded ? t('room.table.folded') : seat.move
  const cards = seat.cards ? (
    <span className="seat__cards">
      {seat.cards.map((card) => (
        <Card
          key={card}
          card={card}
          size={seat.hero ? 'hero' : 'opponent'}
          winning={seat.winner && winning.has(card)}
          flip={seat.revealed}
        />
      ))}
    </span>
  ) : (
    <span className="seat__cards" role="img" aria-label={t('room.table.hiddenCards')}>
      <CardBack size="opponent" />
      <CardBack size="opponent" />
    </span>
  )
  // How the Hand ended for them, where their status would be.
  const outcome = seat.outcome && (
    <span className="seat__outcome" data-winner={seat.winner || undefined}>
      {seat.winner && <Icon name="success" size={12} />}
      {seat.outcome}
    </span>
  )

  return (
    <div
      className="seat"
      role="group"
      aria-label={seat.name}
      data-hero={seat.hero || undefined}
      data-to-act={seat.toAct || undefined}
      data-folded={seat.folded || undefined}
      data-all-in={seat.allInLabel ? true : undefined}
      data-winner={seat.winner || undefined}
      data-revealed={seat.revealed || undefined}
      style={style}
    >
      {/* The Hero's cards sit below the plate, everyone else's above it. */}
      {!seat.hero && cards}
      {seat.hero && status && <span className="seat__status ro-mono">{status}</span>}
      <div className="seat__plate">
        <div className="seat__line">
          <span className="seat__name">{seat.name}</span>
          {seat.hero && <span className="seat__hero">{t('room.table.hero')}</span>}
          {/* A hidden name is the Position already. */}
          {!seat.nameHidden && <span className="seat__position ro-mono">{seat.position}</span>}
        </div>
        <div className="seat__line seat__line--stack">
          <span className="seat__stack ro-mono">
            {seat.stack}
            <Secondary value={seat.stackSecondary} />
          </span>
          {seat.netResult && <span className="seat__note seat__note--won ro-mono">{seat.netResult}</span>}
          {seat.allInLabel && <span className="seat__note seat__note--all-in ro-mono">{seat.allInLabel}</span>}
        </div>
      </div>
      {seat.hero ? (
        <span className="seat__below">
          {cards}
          {outcome}
        </span>
      ) : (
        (outcome ?? (status && <span className="seat__status ro-mono">{status}</span>))
      )}
    </div>
  )
}
