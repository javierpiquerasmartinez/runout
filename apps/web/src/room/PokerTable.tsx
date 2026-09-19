import type { CSSProperties } from 'react'
import { useI18n } from '../i18n'
import { Card, CardBack, CardSlot } from '../ui/Card'
import { asPercent, cachedBetCentres, seatCentre } from './tableLayout'
import type { SeatView, TableView } from './tableView'

/*
 * The top-down table of the "Sala" boards, laid out at 820 × 606: the felt,
 * the board and pot in the middle, and the seats around it, each bet placed
 * clear of everything else. It doesn't scale as one drawing yet (issue 19).
 */

export function PokerTable({ view }: { view: TableView }) {
  const { t } = useI18n()
  const bets = cachedBetCentres(view.slots, view.seats)
  return (
    <div className="poker-table">
      <div className="poker-table__felt" />

      <div className="poker-table__middle">
        <div className="poker-table__board" role="group" aria-label={t('room.table.board')}>
          {view.board.map((card, index) =>
            card ? (
              <Card key={index} card={card} size="community" />
            ) : (
              <CardSlot key={index} size="community" label={t('room.card.empty')} />
            ),
          )}
        </div>
        <div className="poker-table__pot">
          <span className="poker-table__pot-label ro-mono">{t('room.table.pot')}</span>
          <span className="poker-table__pot-value ro-mono">{view.pot}</span>
        </div>
      </div>

      {view.seats.map((seat) => (
        <Seat key={seat.screenName} seat={seat} style={asPercent(seatCentre(seat.slot, view.slots))} />
      ))}
      {view.seats
        .filter((seat) => seat.bet)
        .map((seat) => (
          <span
            key={seat.screenName}
            className="poker-table__bet ro-mono"
            style={asPercent(bets.get(seat.slot)!)}
          >
            <span className="poker-table__bet-chip" />
            {seat.bet}
          </span>
        ))}
    </div>
  )
}

function Seat({ seat, style }: { seat: SeatView; style: CSSProperties }) {
  const { t } = useI18n()
  const status = seat.toAct ? t('room.table.toAct') : seat.folded ? t('room.table.folded') : null
  const cards = seat.cards ? (
    <span className="seat__cards">
      {seat.cards.map((card) => (
        <Card key={card} card={card} size={seat.hero ? 'hero' : 'opponent'} />
      ))}
    </span>
  ) : (
    <span className="seat__cards" role="img" aria-label={t('room.table.hiddenCards')}>
      <CardBack size="opponent" />
      <CardBack size="opponent" />
    </span>
  )

  return (
    <div
      className="seat"
      role="group"
      aria-label={seat.screenName}
      data-hero={seat.hero || undefined}
      data-to-act={seat.toAct || undefined}
      data-folded={seat.folded || undefined}
      style={style}
    >
      {/* The Hero's cards sit below the plate, everyone else's above it. */}
      {!seat.hero && cards}
      {seat.hero && status && <span className="seat__status ro-mono">{status}</span>}
      <div className="seat__plate">
        <div className="seat__line">
          <span className="seat__name">{seat.screenName}</span>
          {seat.hero && <span className="seat__hero">{t('room.table.hero')}</span>}
          <span className="seat__position ro-mono">{seat.position}</span>
        </div>
        <span className="seat__stack ro-mono">{seat.stack}</span>
        {seat.dealer && (
          <span className="seat__dealer ro-mono" role="img" aria-label={t('room.table.dealer')}>
            D
          </span>
        )}
      </div>
      {seat.hero && cards}
      {!seat.hero && status && <span className="seat__status ro-mono">{status}</span>}
    </div>
  )
}
