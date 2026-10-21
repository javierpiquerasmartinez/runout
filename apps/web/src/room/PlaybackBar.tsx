import { useI18n } from '../i18n'
import { IconButton } from '../ui/IconButton'
import { guardLocked, lockedProps } from '../ui/locked'
import { Toggle } from '../ui/Toggle'
import type { RoomSync } from './roomClient'
import type { StreetProgress } from './streetProgress'
import { SyncIndicator } from './SyncIndicator'
import type { GuestsFollowing } from './syncView'
import type { TableView } from './tableView'

/** What the bar shows of a Room around the Playback: who drives it, and how in sync it is. */
export interface PlaybackRoom {
  isMaster: boolean
  sync: RoomSync
  guests: GuestsFollowing
  hideOpponentNames: boolean
  onHideOpponentNames: (hidden: boolean) => void
}

/**
 * The transport bar of the "Sala" boards, minus play/pause and speed: the
 * Street progress bar, where Playback is, the step controls, the Hide
 * Opponent Names switch and who drives. Guests see the same controls,
 * locked, never hidden — and so does everyone while the Room is out of
 * reach, with the table frozen where it was left. Without a `room` (a Hand
 * replayed alone, from the Library) only the steps and where they are show.
 */
export function PlaybackBar({ view, room, onGoTo }: { view: TableView; room?: PlaybackRoom; onGoTo: (actionIndex: number) => void }) {
  const { t } = useI18n()
  // Nothing is asked of a Room we cannot reach: the table stays where it froze.
  const frozen = room?.sync.state === 'offline' ? t('room.playback.frozen') : undefined
  const masterOnly = frozen ?? (!room || room.isMaster ? undefined : t('room.playback.masterOnly'))

  return (
    <section className="playback-bar" aria-label={t('room.playback.label')}>
      <StreetBar streets={view.streets} masterOnly={masterOnly} onGoTo={onGoTo} />

      <div className="playback-bar__row">
        <div className="playback-bar__where">
          <div className="playback-bar__said" aria-live="polite">
            <span className="playback-bar__counter ro-mono" data-guest={(room && !room.isMaster) || undefined}>
              {t('room.playback.counter', { current: view.actionNumber, total: view.actionCount })}
            </span>
            <span className="playback-bar__action">{view.lastAction}</span>
          </div>
          {room && (
            <Toggle
              label={t('room.playback.hideOpponentNames')}
              checked={room.hideOpponentNames}
              onChange={room.onHideOpponentNames}
              disabledReason={masterOnly}
              showLabel
            />
          )}
        </div>

        <div className="playback-bar__controls">
          {masterOnly && <span className="playback-bar__locked-note">{masterOnly}</span>}
          <IconButton
            icon="street-back"
            label={t('room.playback.previousStreet')}
            disabledReason={masterOnly ?? (view.streets.previousStreet === null ? t('room.playback.atStart') : undefined)}
            onClick={() => view.streets.previousStreet !== null && onGoTo(view.streets.previousStreet)}
          />
          <IconButton
            icon="previous"
            label={t('room.playback.previous')}
            disabledReason={masterOnly ?? (view.canGoBack ? undefined : t('room.playback.atStart'))}
            onClick={() => onGoTo(view.actionIndex - 1)}
          />
          <IconButton
            icon="next"
            label={t('room.playback.next')}
            disabledReason={masterOnly ?? (view.canGoForward ? undefined : t('room.playback.atEnd'))}
            onClick={() => onGoTo(view.actionIndex + 1)}
          />
          <IconButton
            icon="street-forward"
            label={t('room.playback.nextStreet')}
            disabledReason={masterOnly ?? (view.streets.nextStreet === null ? t('room.playback.noNextStreet') : undefined)}
            onClick={() => view.streets.nextStreet !== null && onGoTo(view.streets.nextStreet)}
          />
        </div>

        <div className="playback-bar__who">
          {room && <SyncIndicator sync={room.sync} isMaster={room.isMaster} guests={room.guests} />}
        </div>
      </div>
    </section>
  )
}

/**
 * Four equal Street segments plus Showdown, as in board B of "Especificación
 * del reproductor": equal widths so the Street reads at a glance, whatever
 * each one's number of Actions. A segment jumps to its Street's start.
 */
function StreetBar({
  streets,
  masterOnly,
  onGoTo,
}: {
  streets: StreetProgress
  masterOnly: string | undefined
  onGoTo: (actionIndex: number) => void
}) {
  const { t } = useI18n()
  return (
    <div className="street-bar" role="group" aria-label={t('room.playback.streets')} data-finished={streets.finished || undefined}>
      {streets.segments.map(({ stop, state, progress, target }) => {
        const label = t(stop === 'showdown' ? 'room.playback.showdown' : `room.playback.street.${stop}`)
        const unreached = target === null ? t(stop === 'showdown' ? 'room.playback.noShowdown' : 'room.playback.notReached') : undefined
        const reason = masterOnly ?? unreached
        return (
          <button
            key={stop}
            type="button"
            className="street-bar__segment"
            data-stop={stop}
            data-state={state}
            data-unreached={unreached !== undefined || undefined}
            aria-current={state === 'current' ? 'step' : undefined}
            {...lockedProps(label, reason)}
            onClick={guardLocked(reason, () => target !== null && onGoTo(target))}
          >
            <span className="street-bar__label">{label}</span>
            <span className="street-bar__track">
              <span className="street-bar__fill" style={{ width: `${progress * 100}%` }} />
              {state === 'current' && !streets.finished && <span className="street-bar__handle" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
