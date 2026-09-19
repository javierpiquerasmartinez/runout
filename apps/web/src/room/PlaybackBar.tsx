import { useI18n } from '../i18n'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import type { TableView } from './tableView'

/**
 * The transport bar of the "Sala" boards, minus play/pause and speed: where
 * Playback is, the step controls and who drives. Guests see the same controls,
 * locked, never hidden.
 */
export function PlaybackBar({
  view,
  isMaster,
  connected,
  onGoTo,
}: {
  view: TableView
  isMaster: boolean
  connected: boolean
  onGoTo: (actionIndex: number) => void
}) {
  const { t } = useI18n()
  const masterOnly = isMaster ? undefined : t('room.playback.masterOnly')

  return (
    <section className="playback-bar" aria-label={t('room.playback.label')}>
      <div className="playback-bar__where" aria-live="polite">
        <span className="playback-bar__counter ro-mono" data-guest={!isMaster || undefined}>
          {t('room.playback.counter', { current: view.actionIndex, total: view.actionCount })}
        </span>
        <span className="playback-bar__action">{view.lastAction}</span>
      </div>

      <div className="playback-bar__controls">
        {!isMaster && <span className="playback-bar__locked-note">{masterOnly}</span>}
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
      </div>

      <div className="playback-bar__who">
        {isMaster ? (
          <span className="playback-bar__pill" data-tone="brass">
            <Icon name="master" size={13} />
            {t('room.playback.youControl')}
          </span>
        ) : (
          <span className="playback-bar__pill" data-tone={connected ? 'sync' : 'muted'}>
            <span className="playback-bar__dot" />
            {t(connected ? 'room.playback.synced' : 'room.playback.offline')}
          </span>
        )}
      </div>
    </section>
  )
}
