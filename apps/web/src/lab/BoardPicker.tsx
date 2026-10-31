import { useState } from 'react'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { Card, CardSlot } from '../ui/Card'
import { guardLocked, lockedProps } from '../ui/locked'
import { SegmentedControl } from '../ui/SegmentedControl'
import {
  DECK,
  FLOP_CARDS,
  formatBoard,
  MAX_BOARD_CARDS,
  MAX_DEAD_CARDS,
  parseBoard,
  parseDeadCards,
  randomFlop,
  toggleCard,
  toggleDeadCard,
  withRandomCard,
  type BoardProblem,
  tenAs10,
  type DeadCardsProblem,
} from './board'


/**
 * The Analysis's Board and Dead Cards: their cards picked from one grid of 52,
 * switched between the two, a card picked again taken off, or each typed as
 * text, refused whole with what is wrong. A card is never both. Random deals
 * never repeat a card in use nor deal a Dead Card.
 */
export function BoardPicker({
  board,
  dead,
  withDead,
  onChange,
  onDeadChange,
}: {
  board: readonly string[]
  dead: readonly string[]
  /** Whether Dead Cards are offered: not with two sides, where each side is a Range rather than an own Combo. */
  withDead: boolean
  onChange: (board: string[]) => void
  onDeadChange: (dead: string[]) => void
}) {
  const { t } = useI18n()
  /** Which cards the grid picks. */
  const [picking, setPicking] = useState<'board' | 'dead'>('board')
  const target = withDead ? picking : 'board'
  /** The text field while it is being typed in; null shows the Board's. */
  const [typed, setTyped] = useState<string | null>(null)
  /** What was wrong with the last text, until it is edited or the Board changes. */
  const [problem, setProblem] = useState<BoardProblem | null>(null)
  /** The Dead Cards' text field while it is being typed in; null shows theirs. */
  const [typedDead, setTypedDead] = useState<string | null>(null)
  /** What was wrong with the last Dead Cards' text, until it is edited or they change. */
  const [deadProblem, setDeadProblem] = useState<DeadCardsProblem | null>(null)
  const full = board.length >= MAX_BOARD_CARDS
  const deadFull = dead.length >= MAX_DEAD_CARDS
  const toFlop = board.length > 0 && board.length < FLOP_CARDS ? FLOP_CARDS - board.length : 0

  const change = (next: string[]) => {
    setProblem(null)
    setTyped(null)
    onChange(next)
  }

  const changeDead = (next: string[]) => {
    setDeadProblem(null)
    setTypedDead(null)
    onDeadChange(next)
  }

  const commitTyped = () => {
    if (typed === null) return
    const parsed = parseBoard(typed, dead)
    if ('problem' in parsed) setProblem(parsed.problem)
    else change(parsed.board)
  }

  const commitTypedDead = () => {
    if (typedDead === null) return
    const parsed = parseDeadCards(typedDead, board)
    if ('problem' in parsed) setDeadProblem(parsed.problem)
    else changeDead(parsed.dead)
  }

  /** Why the grid cannot pick this card for what it is picking, if it cannot. */
  const lockedReason = (card: string): string | undefined => {
    if (target === 'board') {
      if (dead.includes(card)) return t('lab.analysis.dead.isDead')
      return !board.includes(card) && full ? t('lab.analysis.board.full') : undefined
    }
    if (board.includes(card)) return t('lab.analysis.dead.onBoard')
    return !dead.includes(card) && deadFull ? t('lab.analysis.dead.full') : undefined
  }

  const cardLabel = (card: string) =>
    t('room.card.label', { rank: tenAs10(card).slice(0, -1), suit: t(`room.card.suit.${card[1] as 's' | 'h' | 'd' | 'c'}`) })

  return (
    <section className="analysis__board" aria-label={t('lab.analysis.board')}>
      <span className="lab__label">{t('lab.analysis.board')}</span>
      {/* The text fields name the cards; this is the picture of them. */}
      <div className="analysis__board-cards" aria-hidden="true">
        {Array.from({ length: MAX_BOARD_CARDS }, (_, slot) =>
          board[slot] ? <Card key={slot} card={tenAs10(board[slot])} size="hero" /> : <CardSlot key={slot} size="hero" />,
        )}
        {withDead && (
          <span className="analysis__dead-cards">
            {Array.from({ length: MAX_DEAD_CARDS }, (_, slot) =>
              dead[slot] ? <Card key={slot} card={tenAs10(dead[slot])} size="hero" /> : <CardSlot key={slot} size="hero" />,
            )}
          </span>
        )}
      </div>
      {toFlop > 0 && (
        <p className="lab__muted analysis__board-hint">
          {t(toFlop === 1 ? 'lab.analysis.board.toFlop.one' : 'lab.analysis.board.toFlop.other', { count: toFlop })}
        </p>
      )}
      {withDead && (
        <SegmentedControl
          label={t('lab.analysis.pickFor')}
          options={[
            { value: 'board', label: t('lab.analysis.board') },
            { value: 'dead', label: t('lab.analysis.dead') },
          ]}
          value={target}
          onChange={setPicking}
        />
      )}
      <div className="analysis__deck" role="group" aria-label={t('lab.analysis.board.picker')}>
        {DECK.map((card) => {
          const picked = (target === 'board' ? board : dead).includes(card)
          const reason = lockedReason(card)
          return (
            <button
              key={card}
              type="button"
              className="analysis__deck-card"
              aria-pressed={picked}
              aria-label={cardLabel(card)}
              {...lockedProps(cardLabel(card), reason)}
              onClick={guardLocked(reason, () =>
                target === 'board' ? change(toggleCard(board, card)) : changeDead(toggleDeadCard(dead, card)),
              )}
            >
              <Card card={tenAs10(card)} size="list" />
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
              : problem.kind === 'dead'
                ? t('lab.analysis.board.dead', { card: problem.card })
                : t('lab.analysis.board.size', { count: problem.count })}
        </p>
      )}
      {withDead && (
        <>
          <input
            className="analysis__board-field ro-mono"
            value={typedDead ?? formatBoard(dead)}
            spellCheck={false}
            autoComplete="off"
            placeholder={t('lab.analysis.dead.placeholder')}
            aria-label={t('lab.analysis.dead.text')}
            onChange={(event) => {
              setTypedDead(event.target.value)
              setDeadProblem(null)
            }}
            onBlur={commitTypedDead}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              commitTypedDead()
            }}
          />
          {deadProblem && (
            <p className="lab__failure" role="alert">
              {deadProblem.kind === 'unknown'
                ? t('lab.analysis.dead.unknown', { piece: deadProblem.piece })
                : deadProblem.kind === 'repeated'
                  ? t('lab.analysis.dead.repeated', { card: deadProblem.card })
                  : deadProblem.kind === 'on-board'
                    ? t('lab.analysis.dead.onBoardProblem', { card: deadProblem.card })
                    : t('lab.analysis.dead.size', { count: deadProblem.count })}
            </p>
          )}
        </>
      )}
      <div className="analysis__board-actions">
        <Button variant="secondary" size="compact" onClick={() => change(randomFlop(Math.random, dead))}>
          {t('lab.analysis.board.randomFlop')}
        </Button>
        <Button
          variant="secondary"
          size="compact"
          disabledReason={board.length < FLOP_CARDS ? t('lab.analysis.board.flopFirst') : full ? t('lab.analysis.board.full') : undefined}
          onClick={() => change(withRandomCard(board, Math.random, dead))}
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
