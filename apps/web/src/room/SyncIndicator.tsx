import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { RELOAD_AFTER_FAILURES, type RoomSync, type SyncState } from './roomClient'
import type { GuestsFollowing } from './syncView'

/** The pill's colour for each state, from section C of the reproductor board. */
const tones: Record<SyncState, 'sync' | 'brass' | 'alert'> = {
  synced: 'sync',
  recovering: 'brass',
  offline: 'alert',
}

/**
 * Section C of "Especificación del reproductor": whether what is on screen is
 * the Room as it stands, and how long it takes to get here. The Master's line
 * is about the Room — how many Guests are with them — and a Guest's is about
 * themselves. A recovery that keeps failing ends in the offer to reload.
 */
export function SyncIndicator({
  sync,
  isMaster,
  guests,
}: {
  sync: RoomSync
  isMaster: boolean
  /** How the Room's Guests are following. Only the Master is shown it. */
  guests: GuestsFollowing
}) {
  const { t, formatNumber } = useI18n()
  // While the connection is in doubt that is the news, whoever is looking.
  const inControl = isMaster && sync.state === 'synced'
  const label = inControl
    ? t('room.playback.youControl')
    : t(`room.playback.${sync.state === 'synced' ? 'synced' : sync.state}`)

  return (
    <div className="sync-indicator" role="status">
      <span className="playback-bar__pill" data-tone={inControl ? 'brass' : tones[sync.state]} data-state={sync.state}>
        {inControl ? <Icon name="master" size={13} /> : <span className="playback-bar__dot" />}
        {label}
      </span>
      {sync.state === 'offline' ? (
        <Offline failedAttempts={sync.failedAttempts} />
      ) : (
        <span className="sync-indicator__detail">
          {isMaster
            ? guestsLine(guests, t, formatNumber)
            : latencyLine(sync.latencyMs, sync.state === 'synced', t, formatNumber)}
        </span>
      )}
    </div>
  )
}

/**
 * A Room that is not coming back on its own. Reloading is the last thing left
 * to offer, and only once enough tries have gone by to mean it.
 */
function Offline({ failedAttempts }: { failedAttempts: number }) {
  const { t } = useI18n()
  if (failedAttempts < RELOAD_AFTER_FAILURES) {
    return <span className="sync-indicator__detail">{t('room.playback.frozen')}</span>
  }
  return (
    <span className="sync-indicator__reload">
      <span className="ro-visually-hidden">{t('room.playback.reloadHint')}</span>
      <Button variant="secondary" size="compact" onClick={() => window.location.reload()}>
        <Icon name="repeat" size={13} />
        {t('room.playback.reload')}
      </Button>
    </span>
  )
}

type Translate = ReturnType<typeof useI18n>['t']
type FormatNumber = ReturnType<typeof useI18n>['formatNumber']

/** "3 invitados sincronizados · 42 ms", of the Room the Master is driving. */
function guestsLine(guests: GuestsFollowing, t: Translate, formatNumber: FormatNumber): string {
  if (guests.total === 0) return t('room.playback.guestsInSync.none')
  const count = formatNumber(guests.inSync)
  if (guests.latencyMs === null) {
    return t(`room.playback.guestsInSync.measuring.${guests.inSync === 1 ? 'one' : 'other'}`, { count })
  }
  return t(`room.playback.guestsInSync.${guests.inSync === 1 ? 'one' : 'other'}`, {
    count,
    ms: formatNumber(Math.round(guests.latencyMs)),
  })
}

/** "latencia 42 ms · al día", of a Guest's own line to the Room. */
function latencyLine(latencyMs: number | null, upToDate: boolean, t: Translate, formatNumber: FormatNumber): string {
  if (latencyMs === null) return t('room.playback.latency.unknown')
  const ms = formatNumber(Math.round(latencyMs))
  return t(upToDate ? 'room.playback.latency' : 'room.playback.latency.behind', { ms })
}
