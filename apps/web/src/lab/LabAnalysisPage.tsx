import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { redirect, useSearch } from '../routing'
import { RoomDialog } from '../room/RoomDialog'
import { Button } from '../ui/Button'
import { liveCombos, madeHands, removedCombos } from './board'
import { BoardPicker } from './BoardPicker'
import { analysisStateFromSearch, labAnalysisAddress, MAX_RANGE_NAME_LENGTH, rangeSaveFailure, type AnalysisState } from './lab'
import { LabNav } from './LabNav'
import { MadeHandsTable } from './MadeHandsTable'
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
  const [{ range, sourceId, board }, changeState] = useAnalysisState()
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
  /** Asking for the name to save the Range under. */
  const [savingAs, setSavingAs] = useState(false)

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

  /** Once saved as a new Range, the Analysis goes on from it: its name shows, and nothing has changed yet. */
  const savedAs = (range: SavedRange) => {
    setSavingAs(false)
    sourceRef.current = range
    setSource(range)
    setSaved((ranges) => [...ranges, range].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())))
    change((state) => ({ ...state, sourceId: range.id }))
  }

  // Every Combo of the deck is classified to tell which Made Hands can happen: not on every render.
  const madeHandRows = useMemo(() => madeHands(range, board), [range, board])

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
                <Button variant="secondary" size="compact" onClick={() => setSavingAs(true)}>
                  {t('lab.analysis.saveAs')}
                </Button>
              </div>
              {failure && (
                <p className="lab__failure" role="alert">
                  {failure === 'range-not-found' ? t('lab.ranges.unavailable') : t(`reason.${failure}`)}
                </p>
              )}
              <RangeMatrix range={range} brush={brush} onPaint={paint} removed={(handClass) => removedCombos(handClass, board)} />
              <p className="analysis__live ro-mono">{t('lab.analysis.live', { combos: oneDecimal(liveCombos(range, board)) })}</p>
              <Stats stats={rangeStats(range)} />
              <RangeText range={range} onImport={(combos) => setCombos(() => combos)} />
            </section>
          </div>
          {/* The Board and how the Range hits it, in one column beside the matrix, so all of it is in view at once. */}
          <div className="analysis__panel">
            <BoardPicker board={board} onChange={(cards) => change((state) => ({ ...state, board: cards }))} />
            {madeHandRows.length > 0 && <MadeHandsTable rows={madeHandRows} />}
          </div>
        </div>
      </main>
      {savingAs && <SaveAsDialog combos={range} onClose={() => setSavingAs(false)} onSaved={savedAs} />}
    </div>
  )
}

/** Asks for a name and keeps the Combos as a new Range, with the name rules and refusals of any Range. */
function SaveAsDialog({
  combos,
  onClose,
  onSaved,
}: {
  combos: Range
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
      title={t('lab.analysis.saveAs.title')}
      body={t('lab.analysis.saveAs.body')}
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
