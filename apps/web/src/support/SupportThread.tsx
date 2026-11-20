import { Fragment, useId, useState, type FormEvent, type ReactNode } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { Avatar } from '../ui/Avatar'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'
import { MAX_SUPPORT_MESSAGE_LENGTH, type SupportTicketStatus } from './support'
import './Support.css'

/** One Support Message of a thread, however its side names the writer. */
export interface ThreadEntry {
  id: string
  /** The writer as this side names them: "Tú", "Runout", an Account, an Administrator. */
  name: string
  /** Who draws the mark: Runout's wave, or someone's initials. */
  mark: { kind: 'runout' } | { kind: 'person'; seed: string }
  /** Said beside the name, such as "como Runout". */
  tag?: string
  /** Written on Runout's side, so drawn a shade apart. */
  fromRunout: boolean
  text: string
  writtenAt: string
}

/**
 * A Support Ticket's thread, in the order it was written, each message with
 * its writer and when; "Nuevo" sets apart those from `newFrom` on, the ones
 * not yet read.
 */
export function SupportThread({ entries, newFrom }: { entries: ThreadEntry[]; newFrom?: string }) {
  const { t, formatDate } = useI18n()
  return (
    <div className="support-thread">
      {entries.map((entry) => (
        <Fragment key={entry.id}>
          {entry.id === newFrom && (
            <div className="support-thread__new ro-mono" role="separator" aria-label={t('support.newMessages')}>
              <span className="support-thread__new-rule" />
              {t('support.newDivider')}
              <span className="support-thread__new-rule" />
            </div>
          )}
          <article className="support-message" data-runout={entry.fromRunout || undefined}>
            {entry.mark.kind === 'runout' ? (
              <span className="support-message__brand" aria-hidden="true">
                <BrandMark size={16} />
              </span>
            ) : (
              <Avatar name={entry.name} seed={entry.mark.seed} size={28} />
            )}
            <div className="support-message__body">
              <div className="support-message__head">
                <h3 className="support-message__writer">{entry.name}</h3>
                {entry.tag && <span className="support-message__tag">{entry.tag}</span>}
                <span className="support-message__spacer" />
                <time className="support-message__time ro-mono" dateTime={entry.writtenAt}>
                  {formatDate(new Date(entry.writtenAt), { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </time>
              </div>
              <p className="support-message__text">{entry.text}</p>
            </div>
          </article>
        </Fragment>
      ))}
    </div>
  )
}

/**
 * Where a reply is written, with how much of the 4,000 characters it takes.
 * "Enviar" is locked while it is empty and while it is being sent; once
 * sent it clears, and a refusal says why, keeping what was typed.
 */
export function SupportComposer({ hint, lockedReason, onSend }: { hint: string; lockedReason?: string; onSend: (text: string) => Promise<void> }) {
  const { t } = useI18n()
  const id = useId()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<FailureReason | null>(null)

  async function send(event?: FormEvent) {
    event?.preventDefault()
    if (busy || lockedReason || text.trim() === '') return
    setBusy(true)
    try {
      await onSend(text)
      setText('')
      setFailure(null)
    } catch (caught) {
      setFailure(reasonOf(caught))
    } finally {
      setBusy(false)
    }
  }

  const sendLocked = lockedReason ?? (busy ? t('support.sending') : text.trim() === '' ? t('support.new.needsMessage') : undefined)
  return (
    <form className="support-composer" onSubmit={(event) => void send(event)}>
      <label htmlFor={id} className="ro-field__label">
        {t('support.reply')}
      </label>
      <textarea
        id={id}
        className="ro-field__input ro-field__description support-composer__text"
        placeholder={t('support.reply.placeholder')}
        maxLength={MAX_SUPPORT_MESSAGE_LENGTH}
        readOnly={lockedReason !== undefined}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {failure && (
        <p className="support-composer__failure" role="alert">
          {t('support.reply.failed', { reason: t(`reason.${failure}`) })}
        </p>
      )}
      <div className="support-composer__foot">
        <span className="support-composer__hint">{hint}</span>
        <span className="support-composer__spacer" />
        <SupportCount length={text.length} />
        <Button type="submit" variant="primary" size="compact" disabledReason={sendLocked} aria-busy={busy || undefined}>
          {t('support.send')}
        </Button>
      </div>
    </form>
  )
}

/**
 * "Cerrar incidencia": says the matter is settled. Locked while it is being
 * closed; a refusal says why.
 */
export function SupportCloseButton({ lockedReason, onClose }: { lockedReason?: string; onClose: () => Promise<void> }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<FailureReason | null>(null)

  async function close() {
    if (busy || lockedReason) return
    setBusy(true)
    try {
      await onClose()
      setFailure(null)
    } catch (caught) {
      setFailure(reasonOf(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {failure && (
        <p className="support-composer__failure" role="alert">
          {t('support.closeFailed', { reason: t(`reason.${failure}`) })}
        </p>
      )}
      <Button size="compact" disabledReason={lockedReason ?? (busy ? t('support.closing') : undefined)} aria-busy={busy || undefined} onClick={() => void close()}>
        {t('support.close')}
      </Button>
    </>
  )
}

/** "57 / 4.000": how much of a Support Message's room is taken. */
export function SupportCount({ length }: { length: number }) {
  const { t, formatNumber } = useI18n()
  return <span className="support-count ro-mono">{t('support.count', { length: formatNumber(length), max: formatNumber(MAX_SUPPORT_MESSAGE_LENGTH) })}</span>
}

/** Open in brass, Closed muted. */
export function SupportStatusBadge({ status }: { status: SupportTicketStatus }) {
  const { t } = useI18n()
  return (
    <span className="support-badge" data-tone={status === 'open' ? 'brass' : 'muted'}>
      {t(`support.status.${status}`)}
    </span>
  )
}

/** A box of the Ticket page's right-hand column. */
export function SupportAside({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="support-aside">
      <h2 className="support-aside__title ro-mono">{title}</h2>
      {children}
    </section>
  )
}
