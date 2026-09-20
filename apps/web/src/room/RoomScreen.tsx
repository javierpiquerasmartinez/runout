import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { useI18n, type MessageKey } from '../i18n'
import type { Translator } from '../i18n/translator'
import { useSession } from '../identity/context'
import { Avatar } from '../ui/Avatar'
import { copyText } from '../ui/clipboard'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { SegmentedControl } from '../ui/SegmentedControl'
import { followLink, navigate } from '../routing'
import { settingsPath } from '../settings/SettingsPage'
import { ImportDialog } from './ImportDialog'
import {
  authoredCount,
  playedAtLabel,
  positionsLabel,
  potLabel,
  sameHandLabel,
  siteLabel,
  stakeLabel,
  streetLabel,
} from './queueEntryView'
import { PlaybackBar } from './PlaybackBar'
import { PokerTable } from './PokerTable'
import { RoomDialog } from './RoomDialog'
import type { Participant, QueueEntry, RoomView } from './roomClient'
import { formatRoomCode, roomLink } from './roomCode'
import { useShortcuts } from './shortcuts'
import { StreetLog } from './StreetLog'
import { tableView, type PayoutView, type TableView } from './tableView'
import { useHand, type HandLoad } from './useHand'
import type { RoomCommands } from './useRoom'

type InRoom = Extract<RoomView, { phase: 'in-room' }>

type ShowdownFilter = 'any' | 'yes' | 'no'

interface QueueFilters {
  author: string
  position: string
  finalStreet: string
  showdown: ShowdownFilter
}

const noFilters: QueueFilters = { author: '', position: '', finalStreet: '', showdown: 'any' }

/** The decision the Room is asking for right now, if any. */
type RoomDecision =
  | { kind: 'leave' }
  | { kind: 'close' }
  | { kind: 'kick'; participant: Participant }

function matchesFilters(entry: QueueEntry, filters: QueueFilters): boolean {
  if (filters.author && entry.author.identityId !== filters.author) return false
  if (filters.position && !entry.summary.positions.includes(filters.position)) return false
  if (filters.finalStreet && entry.summary.finalStreet !== filters.finalStreet) return false
  if (filters.showdown === 'yes' && !entry.summary.showdown) return false
  if (filters.showdown === 'no' && entry.summary.showdown) return false
  return true
}

/**
 * The Room, as in the "Sala" boards: header, Queue panel, table and side panel.
 * Hands pasted anywhere in the Room (outside a field) go into the Queue, and
 * the import dialog takes files. The Master moves through the Queue with J
 * and K.
 */
export function RoomScreen({ view, commands }: { view: InRoom; commands: RoomCommands }) {
  const i18n = useI18n()
  const { t } = i18n
  const me = view.participants.find((p) => p.identityId === view.you)
  const isMaster = me?.role === 'master'
  const masterNotice = useMasterNotice(view)
  const [decision, setDecision] = useState<RoomDecision | null>(null)
  // Who the Master is handing the Room to on their way out, until the role moves.
  const [leavingTo, setLeavingTo] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importOutcome, reportImport] = useImportOutcome()
  // While the dialog is open, pasting goes to its own paste tab.
  usePasteToImport(view.room.code, !importing, reportImport)
  const { token } = useSession()
  const load = useHand(view.playback?.handId ?? null, token)
  const table =
    view.playback && load.state === 'loaded' ? tableView(load.hand, view.playback.actionIndex, i18n) : null
  // With no Hand loaded (or the loaded one gone from the Queue), K loads the first.
  const loadedIndex = view.queue.findIndex((entry) => entry.handId === view.playback?.handId)
  const loadedEntry = view.queue[loadedIndex]
  // The Master may remove the loaded Hand's own Queue Entry; Playback (and this panel)
  // keeps showing it from the last Queue Entry seen for it, per "leaves Playback untouched".
  const [lastLoadedEntry, setLastLoadedEntry] = useState<QueueEntry | undefined>(undefined)
  if (loadedEntry && loadedEntry.id !== lastLoadedEntry?.id) setLastLoadedEntry(loadedEntry)
  const detailsEntry =
    loadedEntry ?? (lastLoadedEntry?.handId === view.playback?.handId ? lastLoadedEntry : undefined)
  const previous = loadedIndex > 0 ? view.queue[loadedIndex - 1] : undefined
  const next = view.queue[loadedIndex + 1]
  useShortcuts(isMaster, {
    'previous-hand': previous && (() => commands.loadHand(previous.handId)),
    'next-hand': next && (() => commands.loadHand(next.handId)),
  })
  // A handover can still be refused (it may lose a race to a failover), so the
  // Master only walks out once the Room says the role has moved.
  useEffect(() => {
    if (leavingTo !== null && !isMaster) navigate('/')
  }, [leavingTo, isMaster])

  return (
    <div className="room">
      <RoomHeader
        view={view}
        isMaster={isMaster}
        onLeave={() => (isMaster ? setDecision({ kind: 'leave' }) : navigate('/'))}
      />

      <div className="room__body">
        <QueuePanel
          view={view}
          isMaster={isMaster}
          commands={commands}
          i18n={i18n}
          onImport={() => setImporting(true)}
          importOutcome={importOutcome}
        />

        <main className="room-stage">
          {view.playback ? (
            <LoadedHand
              view={view}
              handId={view.playback.handId}
              load={load}
              table={table}
              isMaster={isMaster}
              onGoTo={commands.goToAction}
            />
          ) : (
            <div className="room-stage__felt">
              <div className="room-stage__table">
                <p>{t(isMaster ? 'room.table.waitingMaster' : 'room.table.waitingGuest')}</p>
              </div>
            </div>
          )}
        </main>

        <aside className="room-side" aria-labelledby="room-side-title">
          <div className="room-panel__header">
            <h2 id="room-side-title" className="room-panel__title">
              {t('room.details.title')}
            </h2>
          </div>
          {detailsEntry && (
            <CurrentHand
              entry={detailsEntry}
              tableSize={load.state === 'loaded' ? load.hand.tableSize : null}
              participants={view.participants}
              isMaster={isMaster && loadedEntry !== undefined}
              onReassign={(authorId) => commands.reassignAuthor(detailsEntry.handId, authorId)}
            />
          )}
          {table?.payout && <Payout payout={table.payout} />}
          <section className="room-side__section" aria-labelledby="room-participants-title">
            <h3 id="room-participants-title" className="room-side__title">
              {t('room.participants.title')}
            </h3>
            {/* Always mounted, so screen readers announce a change of Master when it happens. */}
            <p className="room-participants__status" role="status">
              {masterNotice}
            </p>
            <ul className="room-participants" aria-live="polite">
              {view.participants.map((participant) => (
                <ParticipantRow
                  key={participant.identityId}
                  participant={participant}
                  isYou={participant.identityId === view.you}
                  authored={authoredCount(view.queue, participant.identityId)}
                  onHandOver={
                    isMaster && participant.identityId !== view.you
                      ? () => commands.handOverMaster(participant.identityId)
                      : undefined
                  }
                  onKick={
                    isMaster && participant.identityId !== view.you
                      ? () => setDecision({ kind: 'kick', participant })
                      : undefined
                  }
                />
              ))}
            </ul>
          </section>
        </aside>
      </div>
      {importing && (
        <ImportDialog
          room={view.room}
          onClose={() => setImporting(false)}
          onImported={(imported, discarded) => reportImport({ state: 'done', imported, discarded })}
        />
      )}
      {decision && (
        <RoomDecisionDialog
          decision={decision}
          view={view}
          commands={commands}
          handingOverTo={leavingTo}
          onHandOver={(identityId) => {
            commands.handOverMaster(identityId)
            setLeavingTo(identityId)
          }}
          onClose={() => setDecision(null)}
          onCloseRoom={() => setDecision({ kind: 'close' })}
        />
      )}
    </div>
  )
}

/**
 * What the Room asks before something irreversible. A Master cannot simply
 * walk out (H1.7): they hand the role to someone present, or close the
 * Room for everyone.
 */
function RoomDecisionDialog({
  decision,
  view,
  commands,
  handingOverTo,
  onHandOver,
  onClose,
  onCloseRoom,
}: {
  decision: RoomDecision
  view: InRoom
  commands: RoomCommands
  /** The Participant the Master is on their way out through, while it settles. */
  handingOverTo: string | null
  onHandOver: (identityId: string) => void
  onClose: () => void
  onCloseRoom: () => void
}) {
  const { t } = useI18n()

  // Kicking and closing ask the same thing: one red act, or nothing.
  if (decision.kind !== 'leave') {
    const asked =
      decision.kind === 'kick'
        ? {
            title: t('room.kick.title', { name: decision.participant.displayName }),
            body: t('room.kick.body'),
            label: t('room.kick.confirm'),
            act: () => commands.kick(decision.participant.identityId),
          }
        : {
            title: t('room.close.title'),
            body: t('room.close.body'),
            label: t('room.close.confirm'),
            act: () => commands.closeRoom(),
          }
    return (
      <RoomDialog
        title={asked.title}
        body={asked.body}
        onClose={onClose}
        actions={
          <Button
            variant="destructive"
            autoFocus
            onClick={() => {
              asked.act()
              onClose()
            }}
          >
            {asked.label}
          </Button>
        }
      />
    )
  }

  const successors = view.participants.filter((participant) => participant.identityId !== view.you)
  return (
    <RoomDialog
      title={t('room.leave.master.title')}
      body={t('room.leave.master.body')}
      onClose={onClose}
      actions={
        <Button variant="destructive" onClick={onCloseRoom}>
          {t('room.leave.close')}
        </Button>
      }
    >
      {successors.length > 0 ? (
        <ul className="room-dialog__choices">
          {successors.map((participant) => (
            <li key={participant.identityId}>
              <button
                type="button"
                className="room-dialog__choice"
                aria-busy={participant.identityId === handingOverTo || undefined}
                // Still focusable while the handover settles, as a locked control is.
                onClick={() => handingOverTo === null && onHandOver(participant.identityId)}
              >
                <Avatar name={participant.displayName} seed={participant.identityId} size={24} />
                <span className="room-dialog__choice-name">{participant.displayName}</span>
                <Icon name="master" size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="room-dialog__body">{t('room.leave.master.alone')}</p>
      )}
    </RoomDialog>
  )
}

const UNDO_WINDOW_MS = 10_000

/**
 * The Queue panel, from the "Sala" boards: Author, date, Positions, Stake,
 * final pot, Final Street and Showdown per row, the loaded Hand highlighted.
 * The Master reorders and removes rows (undoable); filters are personal and
 * never leave this component. Collapses to give the table full width.
 */
function QueuePanel({
  view,
  isMaster,
  commands,
  i18n,
  onImport,
  importOutcome,
}: {
  view: InRoom
  isMaster: boolean
  commands: RoomCommands
  i18n: Translator
  onImport: () => void
  importOutcome: string | null
}) {
  const { t } = i18n
  const [collapsed, setCollapsed] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<QueueFilters>(noFilters)
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(undoTimer.current), [])

  const hasActiveFilters =
    filters.author !== '' || filters.position !== '' || filters.finalStreet !== '' || filters.showdown !== 'any'
  const visibleQueue = useMemo(() => view.queue.filter((entry) => matchesFilters(entry, filters)), [view.queue, filters])
  const authors = useMemo(() => {
    const byId = new Map(view.queue.map((entry) => [entry.author.identityId, entry.author]))
    return [...byId.values()]
  }, [view.queue])
  const positions = useMemo(
    () => [...new Set(view.queue.flatMap((entry) => entry.summary.positions))].sort(),
    [view.queue],
  )
  const streets = ['preflop', 'flop', 'turn', 'river'] as const
  // Where each Entry actually sits in the full Queue, for the move buttons' ends —
  // the Queue itself may be filtered, but adjacency is always the real Queue's.
  const indexById = useMemo(() => new Map(view.queue.map((entry, index) => [entry.id, index])), [view.queue])

  function move(entry: QueueEntry, direction: -1 | 1) {
    const order = view.queue.map((each) => each.id)
    const from = order.indexOf(entry.id)
    const to = from + direction
    if (to < 0 || to >= order.length) return
    ;[order[from], order[to]] = [order[to], order[from]]
    commands.reorderQueue(order)
  }

  function remove(entry: QueueEntry) {
    commands.removeQueueEntry(entry.id)
    setPendingRemovalId(entry.id)
    clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setPendingRemovalId(null), UNDO_WINDOW_MS)
  }

  function undo() {
    if (!pendingRemovalId) return
    commands.undoQueueRemoval(pendingRemovalId)
    clearTimeout(undoTimer.current)
    setPendingRemovalId(null)
  }

  return (
    <aside className="room-queue" data-collapsed={collapsed || undefined} aria-labelledby="room-queue-title">
      {collapsed ? (
        <div className="room-panel__header room-panel__header--collapsed">
          <IconButton
            icon="chevron"
            label={t('room.queue.expand')}
            size="compact"
            className="room-queue__toggle room-queue__toggle--expand"
            onClick={() => setCollapsed(false)}
          />
        </div>
      ) : (
        <>
          <div className="room-panel__header">
            <h2 id="room-queue-title" className="room-panel__title">
              {t('room.queue.title')}
            </h2>
            <span className="room-queue__count ro-mono">{view.queue.length}</span>
            <IconButton
              icon="chevron"
              label={t('room.queue.collapse')}
              size="compact"
              className="room-queue__toggle room-queue__toggle--collapse"
              onClick={() => setCollapsed(true)}
            />
          </div>
          <div className="room-queue__actions">
            <button type="button" className="room-queue__import" onClick={onImport}>
              <Icon name="add" size={15} />
              {t(isMaster ? 'room.queue.import.master' : 'room.queue.import.guest')}
            </button>
          </div>
          {/* Always mounted, so screen readers announce the outcome when it appears. */}
          <p className="room-queue__status" role="status">
            {importOutcome}
          </p>
          {view.queue.length > 0 && (
            <div className="room-queue__toolbar">
              <IconButton
                icon="filter"
                label={t('room.queue.filter')}
                size="compact"
                data-active={filtersOpen || hasActiveFilters || undefined}
                onClick={() => setFiltersOpen((open) => !open)}
              />
              {hasActiveFilters && (
                <span className="room-queue__filter-count ro-mono">
                  {t('room.queue.filter.count', { count: visibleQueue.length, total: view.queue.length })}
                </span>
              )}
            </div>
          )}
          {filtersOpen && (
            <div className="room-queue__filters">
              <label className="room-queue__filter-field">
                <span>{t('room.queue.filter.author')}</span>
                <select
                  value={filters.author}
                  onChange={(event) => setFilters((f) => ({ ...f, author: event.target.value }))}
                >
                  <option value="">{t('room.queue.filter.all')}</option>
                  {authors.map((author) => (
                    <option key={author.identityId} value={author.identityId}>
                      {author.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="room-queue__filter-field">
                <span>{t('room.queue.filter.position')}</span>
                <select
                  value={filters.position}
                  onChange={(event) => setFilters((f) => ({ ...f, position: event.target.value }))}
                >
                  <option value="">{t('room.queue.filter.all')}</option>
                  {positions.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
              </label>
              <label className="room-queue__filter-field">
                <span>{t('room.queue.filter.finalStreet')}</span>
                <select
                  value={filters.finalStreet}
                  onChange={(event) => setFilters((f) => ({ ...f, finalStreet: event.target.value }))}
                >
                  <option value="">{t('room.queue.filter.all')}</option>
                  {streets.map((street) => (
                    <option key={street} value={street}>
                      {t(`room.queue.street.${street}`)}
                    </option>
                  ))}
                </select>
              </label>
              <SegmentedControl
                label={t('room.queue.filter.showdown')}
                value={filters.showdown}
                onChange={(showdown) => setFilters((f) => ({ ...f, showdown }))}
                options={[
                  { value: 'any', label: t('room.queue.filter.showdown.any') },
                  { value: 'yes', label: t('room.queue.filter.showdown.yes') },
                  { value: 'no', label: t('room.queue.filter.showdown.no') },
                ]}
              />
              {hasActiveFilters && (
                <Button variant="secondary" size="compact" onClick={() => setFilters(noFilters)}>
                  {t('room.queue.filter.clear')}
                </Button>
              )}
            </div>
          )}
          {isMaster && pendingRemovalId && (
            <div className="room-queue__undo" role="status">
              <span>{t('room.queue.removed')}</span>
              <Button variant="secondary" size="compact" onClick={undo}>
                {t('room.queue.undo')}
              </Button>
            </div>
          )}
          {view.queue.length === 0 ? (
            <p className="room-queue__empty">{t('room.queue.empty')}</p>
          ) : visibleQueue.length === 0 ? (
            <p className="room-queue__empty">{t('room.queue.filter.noMatches')}</p>
          ) : (
            <ul className="room-queue__list">
              {visibleQueue.map((entry) => {
                const fullIndex = indexById.get(entry.id) ?? -1
                return (
                  <QueueRow
                    key={entry.id}
                    entry={entry}
                    sameHand={sameHandLabel(entry, view.queue, i18n)}
                    i18n={i18n}
                    loaded={entry.handId === view.playback?.handId}
                    onLoad={isMaster ? () => commands.loadHand(entry.handId) : undefined}
                    onMoveUp={isMaster && fullIndex > 0 ? () => move(entry, -1) : undefined}
                    onMoveDown={isMaster && fullIndex < view.queue.length - 1 ? () => move(entry, 1) : undefined}
                    onRemove={isMaster ? () => remove(entry) : undefined}
                  />
                )
              })}
            </ul>
          )}
        </>
      )}
    </aside>
  )
}

function RoomHeader({
  view,
  isMaster,
  onLeave,
}: {
  view: InRoom
  isMaster: boolean
  /** A Guest walks out; the Master is asked to hand the role over or close first. */
  onLeave: () => void
}) {
  const { t } = useI18n()
  const master = view.participants.find((p) => p.role === 'master')
  // Guests see the Master named apart, so the stack shows everyone else.
  const stacked = isMaster ? view.participants : view.participants.filter((p) => p.role !== 'master')
  const [copied, copy] = useCopied()

  return (
    <header className="room-header">
      <a href="/" className="room-header__brand" aria-label={t('room.home')} onClick={followLink}>
        <BrandMark size={22} />
        <span className="ro-serif">{t('brand.wordmark')}</span>
      </a>
      <span className="room-header__divider" />
      <h1 className="room-header__name">{view.room.name}</h1>
      <span className="room-header__code">
        <span className="ro-mono">{formatRoomCode(view.room.code)}</span>
        <IconButton
          icon={copied === 'code' ? 'success' : 'copy'}
          label={t(copied === 'code' ? 'room.codeCopied' : 'room.copyCode')}
          size="compact"
          className="room-header__copy-code"
          onClick={() => copy('code', formatRoomCode(view.room.code))}
        />
      </span>
      {isMaster && (
        <Button
          variant="secondary"
          size="compact"
          className="room-header__copy-link"
          data-copied={copied === 'link' || undefined}
          onClick={() => copy('link', roomLink(view.room.code))}
        >
          <Icon name={copied === 'link' ? 'success' : 'link'} size={14} />
          {t(copied === 'link' ? 'room.linkCopied' : 'room.copyLink')}
        </Button>
      )}
      <span className="ro-visually-hidden" role="status">
        {copied && t(copied === 'link' ? 'room.linkCopied' : 'room.codeCopied')}
      </span>

      <span className="room-header__spacer" />

      <span className="room-header__live" data-offline={!view.connected || undefined}>
        <span className="room-header__live-dot" />
        {t(view.connected ? 'room.live' : 'room.offline')}
      </span>
      {!isMaster && master && (
        <span className="room-header__master">
          <Avatar name={master.displayName} seed={master.identityId} size={20} />
          <span>
            {t('room.masterIs')} <strong>{master.displayName}</strong>
          </span>
        </span>
      )}
      <span className="room-header__people">
        <span className="ro-avatar-stack">
          {stacked.map((p) => (
            <Avatar key={p.identityId} name={p.displayName} seed={p.identityId} />
          ))}
        </span>
        <span className="room-header__count">{t('room.inRoom', { count: view.participants.length })}</span>
      </span>
      <span className="room-header__role" data-role={isMaster ? 'master' : 'guest'}>
        <Icon name={isMaster ? 'master' : 'profile'} size={14} />
        {t(isMaster ? 'room.master' : 'room.guest')}
      </span>
      <Button variant="ghost" size="compact" className="room-header__leave" onClick={onLeave}>
        <Icon name="close" size={14} />
        {t('room.leave')}
      </Button>
      <a href={settingsPath} className="room-header__nav" aria-label={t('room.settings')} onClick={followLink}>
        <Icon name="settings" size={17} />
      </a>
    </header>
  )
}

/**
 * The loaded Hand: which one it is, the table at the current Action and the
 * transport bar. The Hand's content is fetched once by id. The Master steps
 * Actions with the arrow keys and jumps Streets with Shift + arrow.
 */
function LoadedHand({
  view,
  handId,
  load,
  table,
  isMaster,
  onGoTo,
}: {
  view: InRoom
  handId: string
  load: HandLoad
  /** The table at the current Action, once the Hand is loaded. */
  table: TableView | null
  isMaster: boolean
  onGoTo: (actionIndex: number) => void
}) {
  const i18n = useI18n()
  const { t } = i18n
  const index = view.queue.findIndex((entry) => entry.handId === handId)
  const entry = view.queue[index]
  const goTo = (actionIndex: number | null) => (actionIndex === null ? undefined : () => onGoTo(actionIndex))
  useShortcuts(isMaster && table !== null, {
    'previous-action': goTo(table?.canGoBack ? table.actionIndex - 1 : null),
    'next-action': goTo(table?.canGoForward ? table.actionIndex + 1 : null),
    'previous-street': goTo(table?.streets.previousStreet ?? null),
    'next-street': goTo(table?.streets.nextStreet ?? null),
  })

  return (
    <>
      <div className="room-stage__header">
        {entry && (
          <>
            <span className="room-stage__count ro-mono">
              {t('room.stage.hand', { current: index + 1, total: view.queue.length })}
            </span>
            <span className="room-stage__divider" />
            <span className="room-stage__title">{positionsLabel(entry, i18n)}</span>
            <span className="room-stage__by">
              {t('room.stage.loadedBy', { name: entry.author.displayName, date: playedAtLabel(entry, i18n) })}
            </span>
          </>
        )}
      </div>
      {table ? (
        <>
          <div className="room-stage__play">
            <PokerTable view={table} />
          </div>
          <StreetLog log={table.log} />
          <PlaybackBar view={table} isMaster={isMaster} connected={view.connected} onGoTo={onGoTo} />
        </>
      ) : (
        <div className="room-stage__felt">
          <div className="room-stage__table" role={load.state === 'failed' ? 'alert' : undefined}>
            {load.state !== 'failed' ? (
              <p aria-busy="true">{t('room.table.loading')}</p>
            ) : (
              <div className="room-stage__failed">
                <p>{t(`reason.${load.reason}`)}</p>
                <Button variant="secondary" size="compact" onClick={load.retry}>
                  {t('room.table.retry')}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * The details panel's "Mano actual" block, for now only its Author. The
 * Master changes it from here; Guests see the control locked.
 */
function CurrentHand({
  entry,
  tableSize,
  participants,
  isMaster,
  onReassign,
}: {
  entry: QueueEntry
  /** Seats the table has; null until the Hand's Timeline has loaded. */
  tableSize: number | null
  participants: Participant[]
  isMaster: boolean
  onReassign: (authorId: string) => void
}) {
  const i18n = useI18n()
  const { t } = i18n
  const [changing, setChanging] = useState(false)
  // The Author may have left the Room; they stay a choice so the list shows who it is.
  const choices = participants.some((p) => p.identityId === entry.author.identityId)
    ? participants
    : [{ ...entry.author, role: 'guest' as const }, ...participants]

  return (
    <section className="room-side__section" aria-labelledby="room-current-title">
      <h3 id="room-current-title" className="room-side__title">
        {t('room.current.title')}
      </h3>
      <dl className="room-facts">
        <div className="room-facts__row">
          <dt>{t('room.current.author')}</dt>
          <dd className="room-facts__author">
            {changing && isMaster ? (
              <select
                className="room-facts__select"
                aria-label={t('room.current.reassign')}
                value={entry.author.identityId}
                autoFocus
                onChange={(event) => {
                  onReassign(event.target.value)
                  setChanging(false)
                }}
                onBlur={() => setChanging(false)}
              >
                {choices.map((p) => (
                  <option key={p.identityId} value={p.identityId}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <span className="room-facts__value">{entry.author.displayName}</span>
                <Button
                  variant="secondary"
                  size="compact"
                  className="room-facts__change"
                  aria-label={t('room.current.changeAuthor')}
                  disabledReason={isMaster ? undefined : t('room.current.reassignLocked')}
                  onClick={() => setChanging(true)}
                >
                  {t('room.current.change')}
                </Button>
              </>
            )}
          </dd>
        </div>
        <div className="room-facts__row">
          <dt>{t('room.current.stake')}</dt>
          <dd className="room-facts__value">{stakeLabel(entry)}</dd>
        </div>
        <div className="room-facts__row">
          <dt>{t('room.current.date')}</dt>
          <dd className="room-facts__value">{playedAtLabel(entry, i18n)}</dd>
        </div>
        {tableSize !== null && (
          <div className="room-facts__row">
            <dt>{t('room.current.table')}</dt>
            <dd className="room-facts__value">{t('room.current.tableSize', { max: tableSize })}</dd>
          </div>
        )}
        <div className="room-facts__row">
          <dt>{t('room.current.positions')}</dt>
          <dd className="room-facts__value">{positionsLabel(entry, i18n)}</dd>
        </div>
        <div className="room-facts__row">
          <dt>{t('room.current.finalPot')}</dt>
          <dd className="room-facts__value">{potLabel(entry, i18n)}</dd>
        </div>
        <div className="room-facts__row">
          <dt>{t('room.queue.filter.finalStreet')}</dt>
          <dd className="room-facts__value">{streetLabel(entry, i18n)}</dd>
        </div>
        <div className="room-facts__row">
          <dt>{t('room.current.site')}</dt>
          <dd className="room-facts__value">{siteLabel(entry, i18n)}</dd>
        </div>
      </dl>
    </section>
  )
}

/** Board "Sala — vista del invitado": what each pot was worth and who took it. */
function Payout({ payout }: { payout: PayoutView }) {
  const { t } = useI18n()
  return (
    <section className="room-side__section" aria-labelledby="room-payout-title">
      <h3 id="room-payout-title" className="room-side__title">
        {t('room.payout.title')}
      </h3>
      <ul className="room-payout">
        {payout.pots.map((pot, index) => (
          <li key={index} className="room-payout__pot" data-main={index === 0 || undefined}>
            <span className="room-payout__who">
              <span className="room-payout__label">{pot.label}</span>
              {pot.winners.map((winner) => (
                <span key={winner} className="room-payout__winner">
                  {winner}
                </span>
              ))}
            </span>
            <span className="room-payout__amount ro-mono">{pot.amount}</span>
          </li>
        ))}
      </ul>
      {payout.rake && <p className="room-payout__rake ro-mono">{payout.rake}</p>}
    </section>
  )
}

function QueueRow({
  entry,
  sameHand,
  i18n,
  loaded,
  onLoad,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  entry: QueueEntry
  /** Names the other Heroes' Hands of the same real-world hand in the Queue, if any. */
  sameHand: string | null
  i18n: Translator
  loaded: boolean
  /** Only the Master loads Hands; for Guests a row is information, not a control. */
  onLoad?: () => void
  /** Undefined for a Guest, or at the Queue's ends (disabled, not hidden). */
  onMoveUp?: () => void
  onMoveDown?: () => void
  /** Undefined for a Guest; only the Master removes a Queue Entry. */
  onRemove?: () => void
}) {
  const { t } = i18n
  const controls = onRemove !== undefined && (
    <div className="queue-entry__controls">
      <IconButton
        icon="chevron"
        label={t('room.queue.moveUp')}
        size="compact"
        className="queue-entry__move queue-entry__move--up"
        disabledReason={onMoveUp ? undefined : t('room.queue.atStart')}
        onClick={onMoveUp}
      />
      <IconButton
        icon="chevron"
        label={t('room.queue.moveDown')}
        size="compact"
        className="queue-entry__move queue-entry__move--down"
        disabledReason={onMoveDown ? undefined : t('room.queue.atEnd')}
        onClick={onMoveDown}
      />
      <IconButton
        icon="delete"
        label={t('room.queue.remove')}
        size="compact"
        className="queue-entry__remove"
        onClick={onRemove}
      />
    </div>
  )
  const content = (
    <>
      <div className="queue-entry__line">
        {loaded && <Icon name="in-progress" size={13} className="queue-entry__loaded-icon" />}
        <Avatar name={entry.author.displayName} seed={entry.author.identityId} size={18} />
        <span className="queue-entry__author">{entry.author.displayName}</span>
        <span className="queue-entry__date ro-mono">{playedAtLabel(entry, i18n)}</span>
      </div>
      <div className="queue-entry__line">
        <span className="queue-entry__positions">{positionsLabel(entry, i18n)}</span>
        <span className="queue-entry__street ro-mono">{streetLabel(entry, i18n)}</span>
      </div>
      <div className="queue-entry__chips">
        <span className="queue-entry__chip ro-mono">{stakeLabel(entry)}</span>
        <span className="queue-entry__chip ro-mono">{potLabel(entry, i18n)}</span>
        {sameHand && (
          <span className="queue-entry__chip queue-entry__chip--same-hand">
            <Icon name="link" size={11} />
            {sameHand}
          </span>
        )}
      </div>
      {loaded && <span className="ro-visually-hidden">{i18n.t('room.queue.loaded')}</span>}
    </>
  )
  return (
    <li className="queue-entry" data-loaded={loaded || undefined} aria-current={loaded || undefined}>
      {onLoad ? (
        <button type="button" className="queue-entry__load" onClick={onLoad}>
          {content}
        </button>
      ) : (
        <div className="queue-entry__body">{content}</div>
      )}
      {controls}
    </li>
  )
}

type ImportOutcome =
  | { state: 'done'; imported: number; discarded: number }
  | { state: 'failed'; reason: FailureReason }

const OUTCOME_FOR_MS = 6000

/**
 * A short-lived, human-readable outcome of the last import, for the Queue's
 * status line, and the function that reports one.
 */
function useImportOutcome(): [string | null, (outcome: ImportOutcome) => void] {
  const { t } = useI18n()
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const report = useCallback((next: ImportOutcome) => {
    setOutcome(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOutcome(null), OUTCOME_FOR_MS)
  }, [])

  if (!outcome) return [null, report]
  if (outcome.state === 'failed') return [t(`reason.${outcome.reason}`), report]
  const parts: string[] = []
  if (outcome.imported > 0) {
    parts.push(t(outcome.imported === 1 ? 'room.queue.imported.one' : 'room.queue.imported.other', { count: outcome.imported }))
  }
  if (outcome.discarded > 0) {
    parts.push(t(outcome.discarded === 1 ? 'room.queue.discarded.one' : 'room.queue.discarded.other', { count: outcome.discarded }))
  }
  return [parts.length > 0 ? parts.join(' · ') : t('room.queue.imported.none'), report]
}

/**
 * Imports whatever Hand History text is pasted while in the Room — no button,
 * as issue 04 asks. Pastes into a field (e.g. a Display Name) are left alone.
 */
function usePasteToImport(code: string, enabled: boolean, report: (outcome: ImportOutcome) => void) {
  const { token } = useSession()

  useEffect(() => {
    if (!enabled) return
    const onPaste = (event: ClipboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]')) return
      const text = event.clipboardData?.getData('text/plain')
      if (!text?.trim()) return
      event.preventDefault()
      api<{ imported: number; discarded: unknown[] }>(`/rooms/${encodeURIComponent(code)}/hands`, {
        token,
        method: 'POST',
        body: { text },
      })
        .then(({ imported, discarded }) => report({ state: 'done', imported, discarded: discarded.length }))
        .catch((error: unknown) => report({ state: 'failed', reason: reasonOf(error) }))
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [code, token, enabled, report])
}

function ParticipantRow({
  participant,
  isYou,
  authored,
  onHandOver,
  onKick,
}: {
  participant: Participant
  isYou: boolean
  /** How many Hands in the Queue they are Author of. */
  authored: number
  /** Only the Master hands the role on, and never to themselves. */
  onHandOver?: () => void
  /** Only the Master removes someone, and never themselves. */
  onKick?: () => void
}) {
  const { t } = useI18n()
  const role: MessageKey = participant.role === 'master' ? 'room.master' : 'room.guest'
  return (
    <li className="room-participant">
      <Avatar name={participant.displayName} seed={participant.identityId} />
      <span className="room-participant__who">
        <span className="room-participant__name">
          {participant.displayName}
          {isYou && <span className="room-participant__you">{t('room.you')}</span>}
        </span>
        <span className="room-participant__role">
          {t(authored === 1 ? 'room.participants.hands.one' : 'room.participants.hands.other', {
            role: t(role),
            count: authored,
          })}
        </span>
      </span>
      <span className="room-participant__presence" title={t('room.participants.present')}>
        <span className="ro-visually-hidden">{t('room.participants.present')}</span>
      </span>
      {onHandOver && (
        <IconButton
          icon="master"
          label={t('room.participants.handOver', { name: participant.displayName })}
          size="compact"
          className="room-participant__hand-over"
          onClick={onHandOver}
        />
      )}
      {onKick && (
        <IconButton
          icon="delete"
          label={t('room.participants.kick', { name: participant.displayName })}
          size="compact"
          className="room-participant__kick"
          onClick={onKick}
        />
      )}
    </li>
  )
}

/**
 * What to say when the Master role moves, for a few seconds: who has it now,
 * and, when it passed on its own, that the former Master dropped.
 */
function useMasterNotice(view: InRoom): string | null {
  const { t } = useI18n()
  const [announced, setAnnounced] = useState<InRoom['masterChange']>(null)
  const [change, setChange] = useState<InRoom['masterChange']>(null)
  // Adjusted during render, as the last loaded Queue Entry is: each move of
  // the role is announced once, and only until it goes stale.
  if (view.masterChange !== announced) {
    setAnnounced(view.masterChange)
    setChange(view.masterChange)
  }
  useEffect(() => {
    if (!change) return
    const timer = setTimeout(() => setChange(null), MASTER_NOTICE_FOR_MS)
    return () => clearTimeout(timer)
  }, [change])

  if (!change) return null
  if (change.masterId === view.you) return t(`room.master.changed.${change.reason}.you`)
  const master = view.participants.find((p) => p.identityId === change.masterId)
  return master ? t(`room.master.changed.${change.reason}`, { name: master.displayName }) : null
}

const MASTER_NOTICE_FOR_MS = 6000

const COPIED_FOR_MS = 2000

/** Copies text to the clipboard and remembers, briefly, which thing was copied. */
type Copyable = 'code' | 'link'

function useCopied(): [Copyable | null, (what: Copyable, text: string) => void] {
  const [copied, setCopied] = useState<Copyable | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  function copy(what: Copyable, text: string) {
    void copyText(text).then((done) => {
      // If copying is impossible the code stays on screen to copy by hand.
      if (!done) return
      setCopied(what)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), COPIED_FOR_MS)
    })
  }
  return [copied, copy]
}
