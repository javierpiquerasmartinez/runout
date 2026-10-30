import { useState } from 'react'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { Card, CardSlot } from '../ui/Card'
import { guardLocked, lockedProps } from '../ui/locked'
import {
  DECK,
  FLOP_CARDS,
  formatBoard,
  MAX_BOARD_CARDS,
  parseBoard,
  randomFlop,
  toggleCard,
  withRandomCard,
  type BoardProblem,
} from './board'

/** A card as the deck's sprites write it: tens as `10`. */
const spriteCard = (card: string) => (card[0] === 'T' ? `10${card[1]}` : card)

/**
 * The Analysis's Board: its cards picked in order from a grid of 52, a card
 * picked again taken off, or typed as text, refused whole with what is wrong.
 * Random deals never repeat a card in use.
 */
export function BoardPicker({ board, onChange }: { board: readonly string[]; onChange: (board: string[]) => void }) {
  const { t } = useI18n()
  /** The text field while it is being typed in; null shows the Board's. */
  const [typed, setTyped] = useState<string | null>(null)
  /** What was wrong with the last text, until it is edited or the Board changes. */
  const [problem, setProblem] = useState<BoardProblem | null>(null)
  const full = board.length >= MAX_BOARD_CARDS
  const toFlop = board.length > 0 && board.length < FLOP_CARDS ? FLOP_CARDS - board.length : 0

  const change = (next: string[]) => {
    setProblem(null)
    setTyped(null)
    onChange(next)
  }

  const commitTyped = () => {
    if (typed === null) return
    const parsed = parseBoard(typed)
    if ('problem' in parsed) setProblem(parsed.problem)
    else change(parsed.board)
  }

  const cardLabel = (card: string) =>
    t('room.card.label', { rank: spriteCard(card).slice(0, -1), suit: t(`room.card.suit.${card[1] as 's' | 'h' | 'd' | 'c'}`) })

  return (
    <section className="analysis__board" aria-label={t('lab.analysis.board')}>
      <span className="lab__label">{t('lab.analysis.board')}</span>
      {/* The text field names the cards; this is the picture of them. */}
      <div className="analysis__board-cards" aria-hidden="true">
        {Array.from({ length: MAX_BOARD_CARDS }, (_, slot) =>
          board[slot] ? <Card key={slot} card={spriteCard(board[slot])} size="hero" /> : <CardSlot key={slot} size="hero" />,
        )}
      </div>
      {toFlop > 0 && (
        <p className="lab__muted analysis__board-hint">
          {t(toFlop === 1 ? 'lab.analysis.board.toFlop.one' : 'lab.analysis.board.toFlop.other', { count: toFlop })}
        </p>
      )}
      <div className="analysis__deck" role="group" aria-label={t('lab.analysis.board.picker')}>
        {DECK.map((card) => {
          const picked = board.includes(card)
          const reason = !picked && full ? t('lab.analysis.board.full') : undefined
          return (
            <button
              key={card}
              type="button"
              className="analysis__deck-card"
              aria-pressed={picked}
              aria-label={cardLabel(card)}
              {...lockedProps(cardLabel(card), reason)}
              onClick={guardLocked(reason, () => change(toggleCard(board, card)))}
            >
              <Card card={spriteCard(card)} size="list" />
            </button>
          )
        })}
      </div>
      <input
        className="analysis__board-field ro-mono"
        value={typed ?? formatBoard(board)}
        spellCheck={false}
        autoComplete="off"
        placeholder={t('lab.analysis.board.placeholder')}
        aria-label={t('lab.analysis.board.text')}
        onChange={(event) => {
          setTyped(event.target.value)
          setProblem(null)
        }}
        onBlur={commitTyped}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          commitTyped()
        }}
      />
      {problem && (
        <p className="lab__failure" role="alert">
          {problem.kind === 'unknown'
            ? t('lab.analysis.board.unknown', { piece: problem.piece })
            : problem.kind === 'repeated'
              ? t('lab.analysis.board.repeated', { card: problem.card })
              : t('lab.analysis.board.size', { count: problem.count })}
        </p>
      )}
      <div className="analysis__board-actions">
        <Button variant="secondary" size="compact" onClick={() => change(randomFlop(Math.random))}>
          {t('lab.analysis.board.randomFlop')}
        </Button>
        <Button
          variant="secondary"
          size="compact"
          disabledReason={board.length < FLOP_CARDS ? t('lab.analysis.board.flopFirst') : full ? t('lab.analysis.board.full') : undefined}
          onClick={() => change(withRandomCard(board, Math.random))}
        >
          {t('lab.analysis.board.randomCard')}
        </Button>
        <span className="lab__spacer" />
        <Button
          variant="secondary"
          size="compact"
          disabledReason={board.length === 0 ? t('lab.analysis.board.empty') : undefined}
          onClick={() => change([])}
        >
          {t('lab.analysis.board.clear')}
        </Button>
      </div>
    </section>
  )
}
