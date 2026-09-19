import type { CSSProperties } from 'react'
import { useI18n } from '../i18n'
import { Card, CardBack, CardSlot } from '../ui/Card'
import type { SeatView, TableView } from './tableView'

/*
 * The top-down table of the "Sala" boards, drawn at 820 × 606 and scaled to
 * fit: the felt, the board and pot in the middle, and the seats around it.
 */

/** Where the seats' plates sit, as a share of the table's width and height. */
const RIM = { x: 40, y: 30 }
const CENTRE = { x: 50, y: 49 }
/** How far out from the centre a seat's bet is drawn, as a share of the way to the seat. */
const BET_REACH = 0.62

/** Slot 0 is the bottom centre; slots go clockwise, as players act. */
function around(slot: number, slots: number, reach = 1): { left: string; top: string } {
  const angle = Math.PI / 2 + (slot / slots) * 2 * Math.PI
  return {
    left: `${CENTRE.x + RIM.x * reach * Math.cos(angle)}%`,
    top: `${CENTRE.y + RIM.y * reach * Math.sin(angle)}%`,
  }
}

export function PokerTable({ view }: { view: TableView }) {
  const { t } = useI18n()
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
        <Seat key={seat.screenName} seat={seat} style={around(seat.slot, view.slots)} />
      ))}
      {view.seats
        .filter((seat) => seat.bet)
        .map((seat) => (
          <span
            key={seat.screenName}
            className="poker-table__bet ro-mono"
            style={around(seat.slot, view.slots, BET_REACH)}
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
