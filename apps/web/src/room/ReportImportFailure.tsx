import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { useImpersonationLock } from '../identity/impersonationLock'
import { NewTicketDialog } from '../support/NewTicketDialog'
import { Button } from '../ui/Button'
import type { ImportDestination } from './importBatch'
import { sizeLabel } from './sizeLabel'

/*
 * "Reportar un problema" where an ordinary import fails: a Support Ticket
 * with the failure already written into its first message. Ordinary imports
 * have no record, so the Ticket points at nothing.
 */

/** What failed in an ordinary import: the files it was importing, and the reason it was given, as shown. */
export interface ImportFailure {
  files: { name: string; size: number }[]
  reason: string
}

/**
 * The shortcut beside a failure. Only an Account that is not an
 * Administrator has Support to write to; while impersonating, it is locked
 * like the rest of Support.
 */
export function ReportImportFailureButton({ onReport }: { onReport: () => void }) {
  const { t } = useI18n()
  const { identity } = useIdentity()
  const locked = useImpersonationLock('support')
  if (!identity.account || identity.administrator) return null
  return (
    <Button variant="ghost" size="compact" disabledReason={locked} onClick={onReport}>
      {t('import.report')}
    </Button>
  )
}

/**
 * "Reportar un problema": a new Ticket whose subject and first message say
 * what was imported, where, and why it failed, in the Account's language,
 * both editable before sending.
 */
export function ReportImportFailureDialog({
  destination,
  failure,
  onClose,
}: {
  destination: ImportDestination
  failure: ImportFailure
  onClose: () => void
}) {
  const { t, formatNumber } = useI18n()
  const files = failure.files.map((file) => `${file.name} (${sizeLabel(file.size, formatNumber)})`).join(', ')
  const message =
    destination.kind === 'room'
      ? t('import.report.message.room', { room: destination.name, code: destination.code, files, reason: failure.reason })
      : t('import.report.message.library', { files, reason: failure.reason })
  return (
    <NewTicketDialog
      title={t('import.report')}
      body={t('import.report.body')}
      subject={t('import.report.subject')}
      message={message}
      onClose={onClose}
    />
  )
}
