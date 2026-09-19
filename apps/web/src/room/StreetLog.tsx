import { useI18n } from '../i18n'
import type { LogView } from './tableView'

/**
 * The strip under the table in the "Sala" boards: the Street, its latest
 * Actions with the newest highlighted and who is to act, and the SPR and
 * effective stack; at the end, the cards shown, who won and the pots.
 */
export function StreetLog({ log }: { log: LogView }) {
  const { t } = useI18n()
  return (
    <section className="street-log" aria-label={t('room.log.label')}>
      <span className="street-log__street ro-mono">{log.label}</span>
      <span className="street-log__divider" />
      <ol className="street-log__entries">
        {log.entries.map((entry, index) => (
          <li key={index} className="street-log__entry" data-tone={entry.tone}>
            {entry.text}
          </li>
        ))}
      </ol>
      {log.aside && <span className="street-log__aside ro-mono">{log.aside}</span>}
    </section>
  )
}
