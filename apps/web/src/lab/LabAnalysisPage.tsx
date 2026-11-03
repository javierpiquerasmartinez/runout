import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../backend/api'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { redirect, useSearch } from '../routing'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Toggle } from '../ui/Toggle'
import type { EquityRequest, EquityResult, SideEquity } from '@runout/poker'
import {
  combinationDraws,
  draws,
  FLOP_CARDS,
  madeHands,
  MAX_DEAD_CARDS,
  ownCombo,
  rangeOnStreet,
  selectionOf,
  tenAs10,
  type CategoryRow,
  type Narrowing,
  type OwnCombo,
} from './board'
import { AnalysisSideSection, type RangeSummary } from './AnalysisSideSection'
import { BoardPicker } from './BoardPicker'
import { useEquity } from './equity'
import {
  analysisStateFromSearch,
  EMPTY_SIDE,
  labAnalysisAddress,
  MAX_ANALYSIS_SIDES,
  moveAlongBoard,
  type AnalysisSide,
  type AnalysisState,
  type MovedAlongBoard,
} from './lab'
import { CategoriesTable } from './CategoriesTable'
import { LabNav } from './LabNav'
import { NarrowingTrail } from './NarrowingTrail'
import type { HandClass, Range } from './range'
import { Brush } from './RangeControls'
import './LabRangesPage.css'
import './LabAnalysisPage.css'

/** What a selection or a hover was made on: a change to any side's Range, the Board or the Dead Cards drops it. */
interface PickedOn {
  ranges: readonly Range[]
  board: readonly string[]
  dead: readonly string[]
}

/** Each side's Categories picked, in the order of the sides, on what they were picked on. */
interface PickedCategories extends PickedOn {
  categories: readonly ReadonlySet<string>[]
}

const NO_CATEGORIES: ReadonlySet<string> = new Set()

/** A cell of one side's matrix, under the pointer or the focus. */
interface HoveredCell {
  side: number
  handClass: HandClass
}

/** How long the address waits after the last change before it is written: browsers limit how often it may be replaced. */
const ADDRESS_DELAY_MS = 250

/**
 * What the Analysis shows, and how to change it. Changes apply at once and
 * reach the address a moment later, replacing it, so a drag across many
 * cells writes it once. An address changed from outside, by a link or going
 * back, is taken as it is.
 */
function useAnalysisState(): [AnalysisState, (next: (state: AnalysisState) => AnalysisState) => void] {
  const search = useSearch()
  const [state, setState] = useState(() => analysisStateFromSearch(search))
  // Read afresh by every change: a drag paints several cells before the screen renders again.
  const stateRef = useRef(state)
  /** The query this screen last wrote; any other came from outside. */
  const written = useRef(search)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (search === written.current) return
    written.current = search
    clearTimeout(timer.current)
    stateRef.current = analysisStateFromSearch(search)
    setState(stateRef.current)
  }, [search])

  // Written after leaving, it would replace another screen's address.
  useEffect(() => () => clearTimeout(timer.current), [])

  // Only refs and setters: the same function every render.
  const change = useCallback((next: (state: AnalysisState) => AnalysisState) => {
    stateRef.current = next(stateRef.current)
    setState(stateRef.current)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const address = labAnalysisAddress(stateRef.current)
      written.current = new URL(address, window.location.origin).search
      redirect(address)
    }, ADDRESS_DELAY_MS)
  }, [])
  return [state, change]
}

/**
 * The Lab's Analysis: one Range, or two against each other, loaded or painted,
 * studied without touching the saved ones. Its address holds what is
 * on screen, so reloading or going back keeps it.
 */
export function LabAnalysisPage() {
  const { t, formatNumber } = useI18n()
  const { token } = useIdentity()
  const [{ sides, board, dead }, change] = useAnalysisState()
  const [brush, setBrush] = useState<number>(100)
  /** The Account's saved Ranges, to load one; empty until they are read. */
  const [saved, setSaved] = useState<RangeSummary[]>([])
  const [picked, setPicked] = useState<PickedCategories | null>(null)
  /**
   * The Category under the pointer or the focus, lit up without being selected,
   * on what it was hovered on: a row that leaves with it sends no leave event.
   */
  const [hover, setHover] = useState<(PickedOn & { category: string }) | null>(null)
  /** Whether the Draws show the one-card backdoor flush draw: off by default, as in Flopzilla. */
  const [oneCardBackdoors, setOneCardBackdoors] = useState(false)
  const drawOptions = useMemo(() => ({ oneCardBackdoors }), [oneCardBackdoors])
  /** The matrix cell under the pointer or the focus, to show its Hand Class's Equity. */
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null)

  const two = sides.length > 1
  const changeSide = (index: number) => (next: (side: AnalysisSide) => AnalysisSide) =>
    change((state) => ({ ...state, sides: state.sides.map((side, at) => (at === index ? next(side) : side)) }))
  /** A second side takes the Dead Cards away: they are the person's own Combo, against one Range. */
  const addSide = () => change((state) => ({ ...state, sides: [...state.sides, EMPTY_SIDE], dead: [] }))
  const removeSide = () => change((state) => ({ ...state, sides: state.sides.slice(0, 1) }))
  const sideLabel = (index: number) => (two ? t('lab.analysis.sideNumber', { number: index + 1 }) : t('lab.analysis.side'))

  useEffect(() => {
    let cancelled = false
    api<RangeSummary[]>('/lab/ranges', { token })
      .then((ranges) => !cancelled && setSaved(ranges))
      // Loading is not offered without them; the Range can still be painted.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token])

  // Every Combo of the deck is classified to tell which Categories can happen: not on every render.
  /** Each side's Range on this Street, after its Narrowings: what the whole Analysis studies. */
  const narrowedRanges = useMemo(
    () => sides.map((side) => rangeOnStreet(side.range, board, dead, side.narrowings, { oneCardBackdoors })),
    [sides, board, dead, oneCardBackdoors],
  )
  // Each side's rows count only its own Range, whatever the other holds.
  const madeHandRows = useMemo(() => narrowedRanges.map((range) => madeHands(range, board, dead)), [narrowedRanges, board, dead])
  const drawRows = useMemo(
    () => narrowedRanges.map((range) => draws(range, board, dead, { oneCardBackdoors })),
    [narrowedRanges, board, dead, oneCardBackdoors],
  )
  const combinationDrawRows = useMemo(
    () => narrowedRanges.map((range) => combinationDraws(range, board, dead)),
    [narrowedRanges, board, dead],
  )
  const range = narrowedRanges[0]
  const own = useMemo(() => ownCombo(range, board, dead, { oneCardBackdoors }), [range, board, dead, oneCardBackdoors])
  /** Two Dead Cards are the own Combo, a Range of one, against the Range: preflop or on a flop, turn or river. */
  const ownEquityRequest = useMemo<EquityRequest | null>(
    () =>
      dead.length === MAX_DEAD_CARDS && (board.length === 0 || board.length >= FLOP_CARDS)
        ? { ranges: [{ [dead.join('')]: 100 }, range], board }
        : null,
    [range, board, dead],
  )
  const ownEquity = useEquity(ownEquityRequest)
  const otherRange = narrowedRanges[1]
  /** Two sides, each Range against the other: preflop or on a flop, turn or river. */
  const sidesEquityRequest = useMemo<EquityRequest | null>(
    () => (otherRange !== undefined && (board.length === 0 || board.length >= FLOP_CARDS) ? { ranges: [range, otherRange], board } : null),
    [range, otherRange, board],
  )
  const sidesEquity = useEquity(sidesEquityRequest)
  /** The cards out of the deck: the Board's and the Dead Cards. */
  const out = useMemo(() => [...board, ...dead], [board, dead])

  const ranges = sides.map((side) => side.range)
  const pickedHere = (on: PickedOn) =>
    on.board === board &&
    on.dead === dead &&
    on.ranges.length === ranges.length &&
    on.ranges.every((each, index) => each === ranges[index])
  const selected = picked !== null && pickedHere(picked) ? picked.categories : sides.map(() => NO_CATEGORIES)
  const hovered = hover !== null && pickedHere(hover) ? hover.category : null
  const rowsOfSide = (index: number) => [...madeHandRows[index], ...drawRows[index], ...combinationDrawRows[index]]
  const selections = narrowedRanges.map((each, index) =>
    selectionOf(each, out, rowsOfSide(index).filter((row) => selected[index].has(row.category))),
  )
  // A hovered row lights up with the selection, as it would once clicked.
  const highlighted = narrowedRanges.map(
    (each, index) =>
      selectionOf(each, out, rowsOfSide(index).filter((row) => selected[index].has(row.category) || row.category === hovered)).range,
  )
  /** Why a side cannot be painted: its Narrowings would hide the cells it paints. */
  const lockedReason = (side: AnalysisSide) =>
    side.narrowings.some((kept) => kept.length > 0) ? t('lab.analysis.brush.narrowed') : undefined
  /**
   * The Board changed by the grid, by text or at random. Dealing on turns each
   * side's own Selection into its Narrowing of that Street. A card taken off
   * brings back each side's Narrowing it was dealt on as its Selection.
   */
  const changeBoard = (cards: string[]) => {
    const moved: { to?: MovedAlongBoard } = {}
    change((state) => {
      moved.to = moveAlongBoard(state, cards, selected.map((categories) => [...categories]))
      return moved.to.state
    })
    const { state, selections: backTo } = moved.to!
    if (state.board === board) return
    setPicked(backTo && { ranges, board: state.board, dead: state.dead, categories: backTo.map((categories) => new Set(categories)) })
  }
  const anySelected = selected.some((categories) => categories.size > 0)
  const toggle = (category: string, side: number) => {
    const categories = new Set(selected[side])
    if (!categories.delete(category)) categories.add(category)
    setPicked({ ranges, board, dead, categories: selected.map((each, index) => (index === side ? categories : each)) })
  }
  /** Each side's rows of one table, under what the side is called. */
  const sidesOf = <Category extends string>(rows: CategoryRow<Category>[][]) => rows.map((each, index) => ({ label: sideLabel(index), rows: each }))
  const categoriesTable = {
    selected,
    onToggle: toggle,
    onHover: (category: string | null) => setHover(category === null ? null : { ranges, board, dead, category }),
  }
  const anyDraws = drawRows[0].length > 0 || combinationDrawRows[0].length > 0
  const oneDecimal = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const selectionShare = (index: number) =>
    t('lab.analysis.selection.share', { combos: oneDecimal(selections[index].combos), percent: oneDecimal(selections[index].share) })

  return (
    <div className="lab">
      <AppHeader current="lab" />
      <LabNav current="analysis" />
      <main className="lab__main">
        <h1 className="analysis__title">{t('lab.analysis')}</h1>
        <div className="analysis__toolbar">
          <Brush brush={brush} onChange={setBrush} lockedReason={sides.every(lockedReason) ? lockedReason(sides[0]) : undefined} />
          {sides.length < MAX_ANALYSIS_SIDES && (
            <Button variant="secondary" size="compact" onClick={addSide}>
              {t('lab.analysis.addSide')}
            </Button>
          )}
        </div>
        {sidesEquity && (
          <EquityBar
            equity={sidesEquity}
            labels={[sideLabel(0), sideLabel(1)]}
            // A cell of a side taken away is no longer on screen.
            hovered={hoveredCell !== null && hoveredCell.side < sides.length ? hoveredCell : null}
          />
        )}
        <div className="analysis__body" data-sides={sides.length}>
          <div className="analysis__sides">
            {sides.map((side, index) => (
              <AnalysisSideSection
                // Each side reads its own source: a side that comes back is a new one.
                key={index}
                side={side}
                narrowed={narrowedRanges[index]}
                lockedReason={lockedReason(side)}
                label={sideLabel(index)}
                compact={two}
                saved={saved}
                brush={brush}
                out={out}
                highlighted={highlighted[index]}
                onChange={changeSide(index)}
                onRemove={index > 0 ? removeSide : undefined}
                onHover={(handClass) => setHoveredCell(handClass && { side: index, handClass })}
              />
            ))}
          </div>
          {/* The Board and how the Ranges hit it: beside one matrix, each in its own column on a wide screen; under two, which take the width. */}
          <div className="analysis__panel">
            <BoardPicker
              // Dead Cards come and go with the second side: the grid starts over on the Board.
              key={sides.length}
              board={board}
              dead={dead}
              withDead={!two}
              onChange={changeBoard}
              onDeadChange={(cards) => change((state) => ({ ...state, dead: cards }))}
            >
              {(own || ownEquity) && <OwnComboSummary own={own} equity={ownEquity} dead={dead} />}
              {/* Each side's own trail, above the Selection it will add to. */}
              {sides.map((side, index) => (
                <NarrowingTrail
                  key={index}
                  range={side.range}
                  narrowings={side.narrowings}
                  board={board}
                  dead={dead}
                  options={drawOptions}
                  label={two ? t('lab.analysis.trail.side', { side: sideLabel(index) }) : t('lab.analysis.trail')}
                  side={two ? sideLabel(index) : undefined}
                  onRemove={(street) => changeSide(index)((each) => ({ ...each, narrowings: withoutNarrowing(each.narrowings, street) }))}
                />
              ))}
              {anySelected && (
                <section className="analysis__selection" aria-label={t('lab.analysis.selection')}>
                  <span className="lab__label">{t('lab.analysis.selection')}</span>
                  {two ? (
                    <ul className="analysis__selection-sides ro-mono">
                      {sides.map((_, index) => (
                        <li key={index}>{t('lab.analysis.selection.sideShare', { side: sideLabel(index), share: selectionShare(index) })}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="analysis__selection-share ro-mono">{selectionShare(0)}</p>
                  )}
                  <div className="analysis__selection-actions">
                    <Button variant="secondary" size="compact" onClick={() => setPicked(null)}>
                      {t('lab.analysis.selection.clear')}
                    </Button>
                  </div>
                </section>
              )}
            </BoardPicker>
            {/* Each kind of Category in a column of its own, scrolling on its own when it is taller than the screen. */}
            {madeHandRows[0].length > 0 && (
              <div className="analysis__categories-column">
                <CategoriesTable
                  title={t('lab.analysis.madeHands')}
                  heading={t('lab.analysis.madeHands.category')}
                  sides={sidesOf(madeHandRows)}
                  nameOf={(madeHand) => t(`lab.analysis.madeHand.${madeHand}`)}
                  {...categoriesTable}
                />
              </div>
            )}
            {anyDraws && (
              <div className="analysis__categories-column">
                {drawRows[0].length > 0 && (
                  <div className="analysis__draws">
                    <CategoriesTable
                      title={t('lab.analysis.draws')}
                      heading={t('lab.analysis.draws.category')}
                      sides={sidesOf(drawRows)}
                      nameOf={(draw) => t(`lab.analysis.draw.${draw}`)}
                      {...categoriesTable}
                    />
                    {/* Backdoors are only drawn on the flop. */}
                    {board.length === FLOP_CARDS && (
                      <Toggle
                        label={t('lab.analysis.draws.oneCardBackdoors')}
                        checked={oneCardBackdoors}
                        onChange={setOneCardBackdoors}
                        showLabel
                      />
                    )}
                  </div>
                )}
                {combinationDrawRows[0].length > 0 && (
                  <CategoriesTable
                    title={t('lab.analysis.combinationDraws')}
                    heading={t('lab.analysis.combinationDraws.category')}
                    sides={sidesOf(combinationDrawRows)}
                    nameOf={(combinationDraw) => t(`lab.analysis.combinationDraw.${combinationDraw}`)}
                    {...categoriesTable}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

/** The Narrowings with this Street's taken away: it keeps the whole Range, and the later Streets narrow what is left. */
function withoutNarrowing(narrowings: readonly Narrowing[], street: number): Narrowing[] {
  const left = narrowings.map((kept, index) => (index === street ? [] : kept))
  // A Street not narrowed at the end is not kept: nothing tells it from one never dealt.
  while (left.length > 0 && left[left.length - 1].length === 0) left.pop()
  return left
}

/** The pieces the Analysis writes an Equity with: `Equity 64.7 %`, `± 0.08 %`, `Win 47.1 % · Tie 35.3 %`. */
function useEquityText() {
  const { t, formatNumber } = useI18n()
  const oneDecimal = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return {
    oneDecimal,
    value: (percent: number) => t('lab.analysis.equity.value', { percent: oneDecimal(percent) }),
    margin: (margin: number) =>
      t('lab.analysis.equity.margin', { margin: formatNumber(margin, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) }),
    winAndTie: ({ win, tie }: SideEquity) => t('lab.analysis.equity.shares', { win: oneDecimal(win), tie: oneDecimal(tie) }),
  }
}

/**
 * Each side's Equity against the other, above both matrices, with how precise
 * it is; and the Equity of the Hand Class under the pointer against the other
 * side.
 */
function EquityBar({ equity, labels, hovered }: { equity: EquityResult; labels: readonly [string, string]; hovered: HoveredCell | null }) {
  const { t } = useI18n()
  const text = useEquityText()
  const hoveredLine = () => {
    if (hovered === null) return null
    const { side, handClass } = hovered
    const named = { handClass: handClass.name, side: labels[side], other: labels[1 - side] }
    const handClassEquity = equity.handClasses[side][handClass.name]
    // Not in the Range, taken out by the Board, or blocked by every Combo of the other side.
    if (!handClassEquity) return t('lab.analysis.equity.handClass.none', named)
    return [
      t('lab.analysis.equity.handClass', { ...named, percent: text.oneDecimal(handClassEquity.equity) }),
      // Fewer deals than its side's: its own margin, wider.
      ...(equity.exact ? [] : [text.margin(handClassEquity.margin)]),
      text.winAndTie(handClassEquity),
    ].join(' · ')
  }
  return (
    <section className="analysis__equity" aria-label={t('lab.analysis.equity')}>
      {/* Each side's share at its own end, so the colours need no legend; the list below is for screen readers. */}
      <div className="analysis__equity-meter ro-mono" aria-hidden="true">
        <span className="analysis__equity-end">{t('lab.analysis.equity.percent', { percent: text.oneDecimal(equity.sides[0].equity) })}</span>
        <div className="analysis__equity-bar">
          <span className="analysis__equity-fill" style={{ width: `${equity.sides[0].equity}%` }} />
        </div>
        <span className="analysis__equity-end">{t('lab.analysis.equity.percent', { percent: text.oneDecimal(equity.sides[1].equity) })}</span>
      </div>
      <ul className="analysis__sr-only">
        {equity.sides.map((sideEquity, index) => (
          <li key={index}>
            {t('lab.analysis.equity.side', {
              side: labels[index],
              equity: [text.value(sideEquity.equity), text.winAndTie(sideEquity)].join(' · '),
            })}
          </li>
        ))}
      </ul>
      {/* One line with the bar: the precision, which the hovered cell's Equity replaces while it is hovered. */}
      <p className="analysis__equity-precision ro-mono">
        {hoveredLine() ??
          (equity.exact ? t('lab.analysis.equity.precision.exact') : t('lab.analysis.equity.precision.sampled', { margin: text.margin(equity.margin) }))}
      </p>
    </section>
  )
}

/**
 * The own Combo two Dead Cards make: on a Board, its Made Hand and Draws and
 * where it stands against the Range; preflop too, its Equity against the Range
 * once worked out.
 */
function OwnComboSummary({ own, equity, dead }: { own: OwnCombo | null; equity: EquityResult | null; dead: readonly string[] }) {
  const { t } = useI18n()
  const text = useEquityText()
  const { oneDecimal } = text
  const description = own
    ? [t(`lab.analysis.madeHand.${own.madeHand}`), own.draws.map((draw) => t(`lab.analysis.draw.${draw}`)).join(', ')].filter(
        (part) => part !== '',
      )
    : []
  const mine = equity?.sides[0]
  return (
    <section className="analysis__own" aria-label={t('lab.analysis.own')}>
      <span className="lab__label">{t('lab.analysis.own')}</span>
      <div className="analysis__own-hand">
        <span className="analysis__own-cards" aria-hidden="true">
          {dead.map((card) => (
            <Card key={card} card={tenAs10(card)} size="list" />
          ))}
        </span>
        <p className="analysis__own-name">{description.join(' · ')}</p>
      </div>
      {equity && mine && (
        <p className="analysis__own-equity ro-mono">
          {[
            text.value(mine.equity),
            equity.exact ? t('lab.analysis.equity.exact') : text.margin(equity.margin),
            text.winAndTie(mine),
          ].join(' · ')}
        </p>
      )}
      {own && (
        <ul className="analysis__own-standing ro-mono">
          {(['ahead', 'tied', 'behind'] as const).map((side) => (
            <li key={side}>
              {t(`lab.analysis.own.${side}`, { combos: oneDecimal(own[side].combos), percent: oneDecimal(own[side].share) })}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
