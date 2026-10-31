import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { redirect, useSearch } from '../routing'
import { RoomDialog } from '../room/RoomDialog'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Toggle } from '../ui/Toggle'
import type { EquityRequest, EquityResult } from '@runout/poker'
import {
  combinationDraws,
  draws,
  FLOP_CARDS,
  liveCombos,
  madeHands,
  MAX_DEAD_CARDS,
  ownCombo,
  removedCombos,
  selectionOf,
  tenAs10,
  type OwnCombo,
} from './board'
import { BoardPicker } from './BoardPicker'
import { useEquity } from './equity'
import { analysisStateFromSearch, labAnalysisAddress, MAX_RANGE_NAME_LENGTH, rangeSaveFailure, type AnalysisState } from './lab'
import { CategoriesTable } from './CategoriesTable'
import { LabNav } from './LabNav'
import { EMPTY_RANGE, rangeStats, sameRange, withHandClass, type HandClass, type Range } from './range'
import { Brush, RangeMatrix, RangeText, Stats } from './RangeControls'
import './LabRangesPage.css'
import './LabAnalysisPage.css'

/** A saved Range as the server opens it, as far as the Analysis reads it. */
interface SavedRange {
  id: string
  name: string
  combos: Range
}

/** A saved Range as the server lists it. */
interface RangeSummary {
  id: string
  name: string
}

/** The Categories picked, on the Range, Board and Dead Cards they were picked on: a change to any clears them. */
interface PickedCategories {
  range: Range
  board: readonly string[]
  dead: readonly string[]
  categories: ReadonlySet<string>
  /** The name the selection was last saved under, until it changes. */
  savedUnder?: string
}

const NO_CATEGORIES: ReadonlySet<string> = new Set()

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
 * The Lab's Analysis: one Range, loaded, pasted or painted, studied without
 * touching the saved one. Its address holds what is on screen, so reloading
 * or going back keeps it.
 */
export function LabAnalysisPage() {
  const { t, formatNumber } = useI18n()
  const { token } = useIdentity()
  const [{ range, sourceId, board, dead }, changeState] = useAnalysisState()
  const [brush, setBrush] = useState<number>(100)
  /** The Account's saved Ranges, to load one; empty until they are read. */
  const [saved, setSaved] = useState<RangeSummary[]>([])
  /** The saved Range the address names, once read: its name and Combos, never written from here. */
  const [source, setSource] = useState<SavedRange | null>(null)
  // Read by the source's effect, which outlives this render.
  const sourceRef = useRef(source)
  useEffect(() => {
    sourceRef.current = source
  })
  /** Why the last load, or reading the source, failed; until the Range changes. */
  const [failure, setFailure] = useState<FailureReason | null>(null)
  /** Asking for the name to save the Range, or the selection, under. */
  const [savingAs, setSavingAs] = useState<'range' | 'selection' | null>(null)
  const [picked, setPicked] = useState<PickedCategories | null>(null)
  /**
   * The Category under the pointer or the focus, lit up without being selected,
   * on the Range, Board and Dead Cards it was hovered on: a row that leaves with them sends no leave event.
   */
  const [hover, setHover] = useState<{ range: Range; board: readonly string[]; dead: readonly string[]; category: string } | null>(
    null,
  )
  /** Whether the Draws show the one-card backdoor flush draw: off by default, as in Flopzilla. */
  const [oneCardBackdoors, setOneCardBackdoors] = useState(false)

  const change = (next: (state: AnalysisState) => AnalysisState) => {
    setFailure(null)
    changeState(next)
  }
  const setCombos = (combos: (current: Range) => Range) => change((state) => ({ ...state, range: combos(state.range) }))
  const paint = (handClass: HandClass, frequency: number) => setCombos((combos) => withHandClass(combos, handClass, frequency))

  useEffect(() => {
    let cancelled = false
    api<RangeSummary[]>('/lab/ranges', { token })
      .then((ranges) => !cancelled && setSaved(ranges))
      // Loading is not offered without them; the Range can still be pasted or painted.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    // Already read, as a Range just loaded is.
    if (sourceId === null || sourceId === sourceRef.current?.id) return
    let cancelled = false
    api<SavedRange>(`/lab/ranges/${encodeURIComponent(sourceId)}`, { token })
      .then((range) => !cancelled && setSource(range))
      .catch((error: unknown) => {
        if (cancelled) return
        const reason = reasonOf(error)
        // No longer this Account's: the Combos stay, without a name to compare them with.
        if (reason === 'range-not-found') changeState((state) => (state.sourceId === sourceId ? { ...state, sourceId: null } : state))
        else setFailure(reason)
      })
    return () => {
      cancelled = true
    }
  }, [sourceId, token, changeState])

  const load = async (id: string) => {
    setFailure(null)
    try {
      const range = await api<SavedRange>(`/lab/ranges/${encodeURIComponent(id)}`, { token })
      sourceRef.current = range
      setSource(range)
      change((state) => ({ ...state, range: range.combos, sourceId: range.id }))
    } catch (error) {
      setFailure(reasonOf(error))
    }
  }

  /** A Range just saved joins those to load. */
  const remember = (range: SavedRange) => {
    setSavingAs(null)
    setSaved((ranges) => [...ranges, range].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())))
  }

  /** Once saved as a new Range, the Analysis goes on from it: its name shows, and nothing has changed yet. */
  const savedAs = (range: SavedRange) => {
    remember(range)
    sourceRef.current = range
    setSource(range)
    change((state) => ({ ...state, sourceId: range.id }))
  }

  // Every Combo of the deck is classified to tell which Categories can happen: not on every render.
  const madeHandRows = useMemo(() => madeHands(range, board, dead), [range, board, dead])
  const drawRows = useMemo(() => draws(range, board, dead, { oneCardBackdoors }), [range, board, dead, oneCardBackdoors])
  const combinationDrawRows = useMemo(() => combinationDraws(range, board, dead), [range, board, dead])
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
  /** The cards out of the deck: the Board's and the Dead Cards. */
  const out = useMemo(() => [...board, ...dead], [board, dead])

  const rows = [...madeHandRows, ...drawRows, ...combinationDrawRows]
  const pickedHere = (on: { range: Range; board: readonly string[]; dead: readonly string[] }) =>
    on.range === range && on.board === board && on.dead === dead
  const selected = picked !== null && pickedHere(picked) ? picked.categories : NO_CATEGORIES
  const hovered = hover !== null && pickedHere(hover) ? hover.category : null
  const selection = selectionOf(range, out, rows.filter((row) => selected.has(row.category)))
  // A hovered row lights up with the selection, as it would once clicked.
  const highlighted = selectionOf(range, out, rows.filter((row) => selected.has(row.category) || row.category === hovered)).range
  const toggle = (category: string) => {
    const categories = new Set(selected)
    if (!categories.delete(category)) categories.add(category)
    setPicked({ range, board, dead, categories })
  }
  const categoriesTable = {
    selected,
    onToggle: toggle,
    onHover: (category: string | null) => setHover(category === null ? null : { range, board, dead, category }),
  }

  const shownSource = source !== null && source.id === sourceId ? source : null
  const changed = shownSource !== null && !sameRange(range, shownSource.combos)
  const oneDecimal = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  return (
    <div className="lab">
      <AppHeader current="lab" />
      <LabNav current="analysis" />
      <main className="lab__main">
        <h1 className="analysis__title">{t('lab.analysis')}</h1>
        <Brush brush={brush} onChange={setBrush} />
        <div className="analysis__body">
          <div className="analysis__sides">
            <section className="analysis__side" aria-label={t('lab.analysis.side')}>
              <div className="analysis__side-name">
                <h2 className="analysis__source">
                  {sourceId === null ? t('lab.analysis.unsaved') : (shownSource?.name ?? '…')}
                </h2>
                {changed && <span className="lab__unsaved">{t('lab.analysis.changed')}</span>}
              </div>
              <div className="analysis__side-actions">
                <select
                  className="analysis__load"
                  value=""
                  aria-label={t('lab.analysis.load')}
                  onChange={(event) => void load(event.target.value)}
                >
                  <option value="" disabled>
                    {t('lab.analysis.loadPlaceholder')}
                  </option>
                  {saved.map((each) => (
                    <option key={each.id} value={each.id}>
                      {each.name}
                    </option>
                  ))}
                </select>
                <span className="lab__spacer" />
                <Button variant="secondary" size="compact" onClick={() => setCombos(() => EMPTY_RANGE)}>
                  {t('lab.ranges.clear')}
                </Button>
                <Button variant="secondary" size="compact" onClick={() => setSavingAs('range')}>
                  {t('lab.analysis.saveAs')}
                </Button>
              </div>
              {failure && (
                <p className="lab__failure" role="alert">
                  {failure === 'range-not-found' ? t('lab.ranges.unavailable') : t(`reason.${failure}`)}
                </p>
              )}
              <RangeMatrix
                range={range}
                brush={brush}
                onPaint={paint}
                removed={(handClass) => removedCombos(handClass, out)}
                highlighted={highlighted}
              />
              <p className="analysis__live ro-mono">{t('lab.analysis.live', { combos: oneDecimal(liveCombos(range, out)) })}</p>
              <Stats stats={rangeStats(range)} />
              <RangeText range={range} onImport={(combos) => setCombos(() => combos)} />
            </section>
          </div>
          {/* The Board and how the Range hits it, in one column beside the matrix, so all of it is in view at once. */}
          <div className="analysis__panel">
            <BoardPicker
              board={board}
              dead={dead}
              onChange={(cards) => change((state) => ({ ...state, board: cards }))}
              onDeadChange={(cards) => change((state) => ({ ...state, dead: cards }))}
            />
            {(own || ownEquity) && <OwnComboSummary own={own} equity={ownEquity} dead={dead} />}
            {selected.size > 0 && (
              <section className="analysis__selection" aria-label={t('lab.analysis.selection')}>
                <span className="lab__label">{t('lab.analysis.selection')}</span>
                <p className="analysis__selection-share ro-mono">
                  {t('lab.analysis.selection.share', { combos: oneDecimal(selection.combos), percent: oneDecimal(selection.share) })}
                </p>
                <div className="analysis__selection-actions">
                  <Button variant="secondary" size="compact" onClick={() => setPicked(null)}>
                    {t('lab.analysis.selection.clear')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="compact"
                    disabledReason={selection.combos > 0 ? undefined : t('lab.analysis.selection.empty')}
                    onClick={() => setSavingAs('selection')}
                  >
                    {t('lab.analysis.selection.save')}
                  </Button>
                </div>
                {picked?.savedUnder !== undefined && (
                  <p className="analysis__selection-saved" role="status">
                    {t('lab.analysis.selection.saved', { name: picked.savedUnder })}
                  </p>
                )}
              </section>
            )}
            {madeHandRows.length > 0 && (
              <CategoriesTable
                title={t('lab.analysis.madeHands')}
                heading={t('lab.analysis.madeHands.category')}
                rows={madeHandRows}
                nameOf={(madeHand) => t(`lab.analysis.madeHand.${madeHand}`)}
                {...categoriesTable}
              />
            )}
            {drawRows.length > 0 && (
              <div className="analysis__draws">
                <CategoriesTable
                  title={t('lab.analysis.draws')}
                  heading={t('lab.analysis.draws.category')}
                  rows={drawRows}
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
            {combinationDrawRows.length > 0 && (
              <CategoriesTable
                title={t('lab.analysis.combinationDraws')}
                heading={t('lab.analysis.combinationDraws.category')}
                rows={combinationDrawRows}
                nameOf={(combinationDraw) => t(`lab.analysis.combinationDraw.${combinationDraw}`)}
                {...categoriesTable}
              />
            )}
          </div>
        </div>
      </main>
      {savingAs === 'range' && (
        <SaveAsDialog
          combos={range}
          title={t('lab.analysis.saveAs.title')}
          body={t('lab.analysis.saveAs.body')}
          onClose={() => setSavingAs(null)}
          onSaved={savedAs}
        />
      )}
      {savingAs === 'selection' && (
        <SaveAsDialog
          combos={selection.range}
          title={t('lab.analysis.selection.save.title')}
          body={t('lab.analysis.selection.save.body')}
          onClose={() => setSavingAs(null)}
          // The Analysis stays as it is, the selection too.
          onSaved={(range) => {
            remember(range)
            setPicked((current) => current && { ...current, savedUnder: range.name })
          }}
        />
      )}
    </div>
  )
}

/**
 * The own Combo two Dead Cards make: on a Board, its Made Hand and Draws and
 * where it stands against the Range; preflop too, its Equity against the Range
 * once worked out.
 */
function OwnComboSummary({ own, equity, dead }: { own: OwnCombo | null; equity: EquityResult | null; dead: readonly string[] }) {
  const { t, formatNumber } = useI18n()
  const oneDecimal = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
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
            t('lab.analysis.own.equity', { percent: oneDecimal(mine.equity) }),
            equity.exact
              ? t('lab.analysis.own.equity.exact')
              : t('lab.analysis.own.equity.margin', {
                  margin: formatNumber(equity.margin, { minimumFractionDigits: 1, maximumFractionDigits: 2 }),
                }),
            t('lab.analysis.own.equity.shares', { win: oneDecimal(mine.win), tie: oneDecimal(mine.tie) }),
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

/** Asks for a name and keeps the Combos as a new Range, with the name rules and refusals of any Range. */
function SaveAsDialog({
  combos,
  title,
  body,
  onClose,
  onSaved,
}: {
  combos: Range
  title: string
  body: string
  onClose: () => void
  onSaved: (range: SavedRange) => void
}) {
  const { t } = useI18n()
  const { token } = useIdentity()
  const [name, setName] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setFailure(t('lab.ranges.nameRequired'))
      return
    }
    setFailure(null)
    setBusy(true)
    try {
      onSaved(await api<SavedRange>('/lab/ranges', { token, method: 'POST', body: { name: trimmed, combos, tagIds: [] } }))
    } catch (error) {
      setFailure(rangeSaveFailure(t, reasonOf(error), trimmed))
      setBusy(false)
    }
  }

  return (
    <RoomDialog
      title={title}
      body={body}
      onClose={onClose}
      actions={
        <Button variant="primary" disabledReason={busy ? t('lab.ranges.saving') : undefined} onClick={() => void save()}>
          {t('lab.ranges.save')}
        </Button>
      }
    >
      <input
        className="analysis__save-name"
        value={name}
        maxLength={MAX_RANGE_NAME_LENGTH}
        placeholder={t('lab.ranges.namePlaceholder')}
        aria-label={t('lab.ranges.name')}
        autoFocus
        onChange={(event) => {
          setName(event.target.value)
          setFailure(null)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || busy) return
          event.preventDefault()
          void save()
        }}
      />
      {failure && (
        <p className="lab__failure" role="alert">
          {failure}
        </p>
      )}
    </RoomDialog>
  )
}
