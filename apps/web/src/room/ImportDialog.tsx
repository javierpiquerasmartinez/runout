import { useEffect, useReducer, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import type { Translator } from '../i18n/translator'
import { useSession } from '../identity/context'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import {
  batchHands,
  batchTotals,
  emptyBatch,
  MAX_FILE_BYTES,
  reduceBatch,
  SOURCE_FORMATS,
  type HandPreview,
  type ImportItem,
  type ImportPreview,
  type SourceFormat,
  unmatchedHeroes,
} from './importBatch'
import { playedAtLabel, positionsLabel, potLabel, potSecondaryLabel, streetLabel } from './queueEntryView'
import { usePreferences } from '../preferences/context'
import { Secondary } from '../ui/Secondary'
import './ImportDialog.css'

type Tab = 'files' | 'paste'

/** What one item is read from: an uploaded file, or pasted text. */
type Source = File | string

/**
 * The "Modal de importación de manos" board, adapted: the Importer drops
 * Tracker exports or pastes text, reviews what each file gave and what was
 * discarded, and confirms. The server reads each item into a preview; only
 * confirming puts Hands in the Queue. There is no Author picker (Authors come
 * from Screen Names) and no Library tab; the "detected Hero" block offers to
 * add a Hero nobody is recognised as to the Importer's Screen Names instead
 * of changing it.
 */
export function ImportDialog({
  room,
  onClose,
  onImported,
}: {
  room: { code: string; name: string }
  onClose: () => void
  /** Called with how many Hands went into the Queue and how many were left out, just before closing. */
  onImported: (imported: number, discarded: number) => void
}) {
  const i18n = useI18n()
  const { t } = i18n
  const { token } = useSession()
  const dialog = useRef<HTMLDialogElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const sources = useRef(new Map<string, Source>())
  const nextKey = useRef(0)
  const [batch, dispatch] = useReducer(reduceBatch, emptyBatch)
  const [tab, setTab] = useState<Tab>('files')
  const [dragging, setDragging] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [discardedOf, setDiscardedOf] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmFailure, setConfirmFailure] = useState<FailureReason | null>(null)
  const totals = batchTotals(batch)
  const hands = batchHands(batch)
  const showingDiscarded = batch.items.find((item) => item.key === discardedOf && item.state === 'read')

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    return () => element.close()
  }, [])

  function read(key: string, source: Source, format?: SourceFormat) {
    let body: FormData | { text: string; format?: SourceFormat }
    if (typeof source === 'string') {
      body = { text: source, format }
    } else {
      body = new FormData()
      body.append('file', source)
      if (format) body.append('format', format)
    }
    api<ImportPreview>(`/rooms/${encodeURIComponent(room.code)}/imports/previews`, { token, method: 'POST', body })
      .then((preview) => dispatch({ type: 'read', key, preview }))
      .catch((error: unknown) => dispatch({ type: 'failed', key, reason: reasonOf(error) }))
  }

  function add(added: { name: string; size: number; source: Source }[]) {
    const items = added.map((item) => ({ ...item, key: String(nextKey.current++) }))
    dispatch({ type: 'added', items })
    setConfirmFailure(null)
    for (const item of items) {
      sources.current.set(item.key, item.source)
      // Files over the limit are refused here, without being sent.
      if (item.size <= MAX_FILE_BYTES) read(item.key, item.source)
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return
    add([...files].map((file) => ({ name: file.name, size: file.size, source: file })))
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData('text/plain')
    if (!text.trim()) return
    // Parsed on paste, with no button, like pasting anywhere in the Room.
    event.preventDefault()
    add([{ name: t('import.paste.name'), size: new Blob([text]).size, source: text }])
  }

  function reread(key: string, format: SourceFormat) {
    const source = sources.current.get(key)
    if (source === undefined) return
    if (discardedOf === key) setDiscardedOf(null)
    dispatch({ type: 'rereading', key, format })
    read(key, source, format)
  }

  function remove(key: string) {
    sources.current.delete(key)
    if (discardedOf === key) setDiscardedOf(null)
    dispatch({ type: 'removed', key })
  }

  function confirm() {
    setConfirming(true)
    setConfirmFailure(null)
    api<{ imported: number }>(`/rooms/${encodeURIComponent(room.code)}/imports`, {
      token,
      method: 'POST',
      body: { previews: totals.previewIds },
    })
      .then(({ imported }) => {
        onImported(imported, totals.discarded)
        onClose()
      })
      .catch((error: unknown) => {
        setConfirmFailure(reasonOf(error))
        setConfirming(false)
      })
  }

  const lockedReason = confirming
    ? t('import.confirming')
    : totals.reading
      ? t('import.confirm.reading')
      : totals.ready === 0
        ? t('import.confirm.nothing')
        : undefined

  return (
    <dialog
      ref={dialog}
      className="import-dialog"
      aria-labelledby="import-title"
      onCancel={(event) => {
        // Escape closes through the Room, which unmounts the dialog.
        event.preventDefault()
        onClose()
      }}
    >
      <header className="import-dialog__header">
        <div className="import-dialog__heading">
          <h2 id="import-title" className="import-dialog__title">
            {t('import.title')}
          </h2>
          <span className="import-dialog__subtitle">{t('import.subtitle', { room: room.name })}</span>
        </div>
        <IconButton icon="close" label={t('import.close')} size="compact" onClick={onClose} />
      </header>

      <div className="import-dialog__tabs" role="tablist">
        {(['files', 'paste'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`import-tab-${name}`}
            aria-controls="import-tabpanel"
            aria-selected={tab === name}
            className="import-dialog__tab"
            onClick={() => setTab(name)}
          >
            {t(`import.tab.${name}`)}
          </button>
        ))}
      </div>

      <div className="import-dialog__body">
        <div className="import-dialog__main">
          <div id="import-tabpanel" role="tabpanel" aria-labelledby={`import-tab-${tab}`}>
            {tab === 'files' ? (
              <div
                className="import-drop"
                data-dragging={dragging || undefined}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <Icon name="import" size={30} className="import-drop__icon" />
                <span className="import-drop__title">{t('import.drop.title')}</span>
                <span className="import-drop__hint">{t('import.drop.hint')}</span>
                <Button variant="secondary" size="compact" onClick={() => fileInput.current?.click()}>
                  {t('import.drop.choose')}
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept=".txt,.zip,text/plain,application/zip"
                  className="ro-visually-hidden"
                  tabIndex={-1}
                  aria-label={t('import.drop.choose')}
                  onChange={(event) => {
                    addFiles(event.target.files)
                    event.target.value = ''
                  }}
                />
              </div>
            ) : (
              <label className="import-paste">
                <span className="ro-visually-hidden">{t('import.paste.label')}</span>
                <textarea className="import-paste__field" placeholder={t('import.paste.placeholder')} onPaste={onPaste} />
              </label>
            )}
          </div>

          <ul className="import-formats" aria-label={t('import.formats.label')}>
            {SOURCE_FORMATS.map((format) => (
              <li key={format} className="import-formats__chip ro-mono">
                {t(`import.format.${format}`)}
              </li>
            ))}
          </ul>

          {batch.items.length > 0 && (
            <section className="import-files" aria-labelledby="import-files-title">
              <h3 id="import-files-title" className="import-dialog__eyebrow">
                {t('import.files.title')}
              </h3>
              <ul className="import-files__list">
                {batch.items.map((item) => (
                  <FileRow
                    key={item.key}
                    item={item}
                    i18n={i18n}
                    onRemove={() => remove(item.key)}
                    onPickFormat={(format) => reread(item.key, format)}
                    onShowDiscarded={() => setDiscardedOf(item.key)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="import-dialog__side">
          <ClaimHeroes heroes={unmatchedHeroes(batch)} onClaimed={(screenName) => dispatch({ type: 'screenNameAdded', screenName })} />
          {showingDiscarded?.state === 'read' ? (
            <DiscardedPanel item={showingDiscarded} preview={showingDiscarded.preview} onBack={() => setDiscardedOf(null)} />
          ) : (
            <HandPreviewPanel hands={hands} index={previewIndex} onNext={() => setPreviewIndex((index) => (index + 1) % hands.length)} i18n={i18n} />
          )}
        </aside>
      </div>

      <footer className="import-dialog__footer">
        <div className="import-dialog__totals" role="status">
          <span className="import-dialog__ready">
            {totals.ready > 0
              ? t(totals.ready === 1 ? 'import.footer.ready.one' : 'import.footer.ready.other', { count: totals.ready })
              : t('import.footer.none')}
          </span>
          {totals.discarded > 0 && (
            <span className="import-dialog__left-out">
              {t(totals.discarded === 1 ? 'import.footer.discarded.one' : 'import.footer.discarded.other', { count: totals.discarded })}
            </span>
          )}
        </div>
        {confirmFailure && (
          <p className="import-dialog__failure" role="alert">
            {t(`reason.${confirmFailure}`)}
          </p>
        )}
        <span className="import-dialog__spacer" />
        <Button variant="secondary" onClick={onClose}>
          {t('import.cancel')}
        </Button>
        <Button variant="primary" disabledReason={lockedReason} onClick={confirm}>
          <Icon name="add" size={16} />
          {totals.ready > 0
            ? t(totals.ready === 1 ? 'import.confirm.one' : 'import.confirm.other', { count: totals.ready })
            : t('import.confirm.empty')}
        </Button>
      </footer>
    </dialog>
  )
}

function FileRow({
  item,
  i18n,
  onRemove,
  onPickFormat,
  onShowDiscarded,
}: {
  item: ImportItem
  i18n: Translator
  onRemove: () => void
  onPickFormat: (format: SourceFormat) => void
  onShowDiscarded: () => void
}) {
  const { t } = i18n
  const status = rowStatus(item)
  return (
    <li className="import-file" data-status={status}>
      <Icon name={STATUS_ICON[status]} size={18} className="import-file__icon" />
      <div className="import-file__text">
        <span className="import-file__name">{item.name}</span>
        <span className="import-file__meta ro-mono" aria-busy={item.state === 'reading' || undefined}>
          {fileMeta(item, i18n)}
        </span>
      </div>
      {item.state === 'read' && item.preview.format === null && (
        <select
          className="import-file__format"
          aria-label={t('import.file.pickFormatLabel', { name: item.name })}
          value=""
          onChange={(event) => onPickFormat(event.target.value as SourceFormat)}
        >
          <option value="" disabled>
            {t('import.file.pickFormat')}
          </option>
          {item.preview.tried.map((format) => (
            <option key={format} value={format}>
              {t(`import.format.${format}`)}
            </option>
          ))}
        </select>
      )}
      {item.state === 'read' && item.preview.discarded.length > 0 && (
        <Button variant="ghost" size="compact" onClick={onShowDiscarded}>
          {item.preview.discarded.length === 1
            ? t('import.file.showDiscarded.one')
            : t('import.file.showDiscarded.other', { count: item.preview.discarded.length })}
        </Button>
      )}
      <IconButton icon="close" size="compact" label={t('import.file.remove', { name: item.name })} onClick={onRemove} />
    </li>
  )
}

type RowStatus = 'reading' | 'ok' | 'warning' | 'failed'

const STATUS_ICON: Record<RowStatus, IconName> = {
  reading: 'history',
  ok: 'success',
  warning: 'warning',
  failed: 'error',
}

function rowStatus(item: ImportItem): RowStatus {
  if (item.state === 'reading') return 'reading'
  if (item.state === 'failed') return 'failed'
  return item.preview.discarded.length > 0 || item.preview.hands.length === 0 ? 'warning' : 'ok'
}

/** "PokerStars · 42 manos · 1 ya en la cola · 3 descartadas", or why it gave nothing. */
function fileMeta(item: ImportItem, { t }: Translator): string {
  if (item.state === 'reading') return t('import.file.reading')
  if (item.state === 'failed') return t(`reason.${item.reason}`)
  const { format, tried, hands, discarded } = item.preview
  if (format === null) {
    return t('import.file.undetected', { formats: tried.map((name) => t(`import.format.${name}`)).join(', ') })
  }
  // Duplicates are read fine and left out on purpose, so they are counted apart.
  const duplicates = discarded.filter((entry) => entry.reason === 'duplicate').length
  const left = discarded.length - duplicates
  const parts = [
    t(`import.format.${format}`),
    t(hands.length === 1 ? 'import.file.hands.one' : 'import.file.hands.other', { count: hands.length }),
  ]
  if (duplicates > 0) {
    parts.push(t(duplicates === 1 ? 'import.file.duplicates.one' : 'import.file.duplicates.other', { count: duplicates }))
  }
  if (left > 0) {
    parts.push(t(left === 1 ? 'import.file.discarded.one' : 'import.file.discarded.other', { count: left }))
  }
  return parts.join(' · ')
}

/** One Hand at a time: its board, Positions, final pot, Final Street and date. */
function HandPreviewPanel({
  hands,
  index,
  onNext,
  i18n,
}: {
  hands: HandPreview[]
  index: number
  onNext: () => void
  i18n: Translator
}) {
  const { t } = i18n
  const { displayUnit } = usePreferences()
  if (hands.length === 0) {
    return (
      <div className="import-preview">
        <p className="import-preview__empty">{t('import.preview.empty')}</p>
      </div>
    )
  }
  const current = Math.min(index, hands.length - 1)
  const hand = hands[current]
  return (
    <section className="import-preview" aria-labelledby="import-preview-title">
      <h3 id="import-preview-title" className="import-dialog__eyebrow" aria-live="polite">
        {t('import.preview.title', { current: current + 1, total: hands.length })}
      </h3>
      <div className="import-preview__board" role="group" aria-label={t('import.preview.board')}>
        {hand.board.length > 0 ? (
          hand.board.map((card, position) => <Card key={position} card={card} size="list" />)
        ) : (
          <span className="import-preview__no-board">{t('import.preview.noBoard')}</span>
        )}
      </div>
      <dl className="import-preview__facts">
        <div>
          <dt>{t('import.preview.positions')}</dt>
          <dd>{positionsLabel(hand, i18n)}</dd>
        </div>
        <div>
          <dt>{t('import.preview.pot')}</dt>
          <dd className="import-preview__pot ro-mono">
            {potLabel(hand, i18n, displayUnit)}
            <Secondary value={potSecondaryLabel(hand, i18n, displayUnit)} />
          </dd>
        </div>
        <div>
          <dt>{t('import.preview.street')}</dt>
          <dd>{streetLabel(hand, i18n)}</dd>
        </div>
        <div>
          <dt>{t('import.preview.date')}</dt>
          <dd className="ro-mono">{playedAtLabel(hand, i18n)}</dd>
        </div>
        <div>
          <dt>{t('import.preview.hero')}</dt>
          <dd className="ro-mono">{hand.hero}</dd>
        </div>
        <div>
          <dt>{t('import.preview.author')}</dt>
          <dd>{hand.author.displayName}</dd>
        </div>
      </dl>
      {hands.length > 1 && (
        <Button variant="secondary" size="compact" className="import-preview__next" onClick={onNext}>
          {t('import.preview.next', { count: hands.length })}
        </Button>
      )}
    </section>
  )
}

/**
 * The board's "detected Hero" block, for each Hero nobody in the Room has
 * among their Screen Names: those Hands are the Importer's, and one click
 * adds the name to their Screen Names so they are recognised next time.
 */
function ClaimHeroes({ heroes, onClaimed }: { heroes: string[]; onClaimed: (screenName: string) => void }) {
  const { t } = useI18n()
  const { token, identity, rememberScreenNames } = useSession()
  const [claiming, setClaiming] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<string | null>(null)
  const [failure, setFailure] = useState<FailureReason | null>(null)

  function claim(screenName: string) {
    setClaiming(screenName)
    setFailure(null)
    api<{ screenNames: string[] }>('/identities/me/screen-names', {
      token,
      method: 'PUT',
      body: { screenNames: [...identity.screenNames, screenName] },
    })
      .then(({ screenNames }) => {
        rememberScreenNames(screenNames)
        onClaimed(screenName)
        setClaimed(screenName)
      })
      .catch((error: unknown) => setFailure(reasonOf(error)))
      .finally(() => setClaiming(null))
  }

  return (
    <>
      {heroes.map((hero) => (
        <section key={hero} className="import-claim" aria-labelledby={`import-claim-${hero}`}>
          <h3 id={`import-claim-${hero}`} className="import-dialog__eyebrow">
            {t('import.claim.title')}
          </h3>
          <div className="import-claim__box">
            <span className="import-claim__name ro-mono">{hero}</span>
            <Button
              variant="secondary"
              size="compact"
              aria-label={t('import.claim.addNamed', { name: hero })}
              disabledReason={claiming === null ? undefined : t('import.claim.adding')}
              onClick={() => claim(hero)}
            >
              {t('import.claim.add')}
            </Button>
          </div>
          <p className="import-claim__hint">{t('import.claim.body', { name: hero })}</p>
        </section>
      ))}
      <p className="import-claim__status" role="status">
        {failure ? t(`reason.${failure}`) : claimed && t('import.claim.added', { name: claimed })}
      </p>
    </>
  )
}

/** A file's discarded entries: each one's reason and original text. */
function DiscardedPanel({ item, preview, onBack }: { item: ImportItem; preview: ImportPreview; onBack: () => void }) {
  const { t } = useI18n()
  return (
    <section className="import-discarded" aria-labelledby="import-discarded-title">
      <h3 id="import-discarded-title" className="import-dialog__eyebrow">
        {t('import.discarded.title', { name: item.name })}
      </h3>
      <ol className="import-discarded__list">
        {preview.discarded.map((entry, index) => (
          <li key={index} className="import-discarded__entry">
            <span className="import-discarded__reason">{t(`import.discarded.reason.${entry.reason}`)}</span>
            <pre className="import-discarded__text ro-mono" tabIndex={0}>
              {entry.text}
            </pre>
          </li>
        ))}
      </ol>
      <Button variant="secondary" size="compact" onClick={onBack}>
        {t('import.discarded.back')}
      </Button>
    </section>
  )
}
