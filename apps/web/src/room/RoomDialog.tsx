import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import './RoomDialog.css'

/**
 * The irreversible decisions a Room asks for: leaving, kicking, closing.
 * Built from the import dialog's own shell (the design canvas draws no board
 * for these), with the way out always to the left of the act.
 */
export function RoomDialog({
  title,
  body,
  onClose,
  children,
  actions,
  lockedReason,
}: {
  title: string
  body: string
  onClose: () => void
  /** Anything between the body and the buttons, such as who to hand over to. */
  children?: ReactNode
  /** What this dialog is asking for, beside the cancel. */
  actions: ReactNode
  /** Locks the way out and explains why, while what was asked for is under way. */
  lockedReason?: string
}) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  // Before the dialog leaves the page: only a dialog still on it hands focus back to where it was.
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    return () => element.close()
  }, [])

  return (
    <dialog
      className="room-dialog"
      ref={dialog}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        // Stopped here, or the browser closes the dialog on a second Escape whatever the cancel event says.
        if (event.key === 'Escape' && lockedReason !== undefined) event.preventDefault()
      }}
      onCancel={(event) => {
        // Escape closes through the Room, which unmounts the dialog.
        event.preventDefault()
        if (lockedReason === undefined) onClose()
      }}
    >
      <h2 id={titleId} className="room-dialog__title ro-serif">
        {title}
      </h2>
      <p className="room-dialog__body">{body}</p>
      {children}
      <div className="room-dialog__actions">
        <Button variant="ghost" disabledReason={lockedReason} onClick={onClose}>
          {t('room.cancel')}
        </Button>
        {actions}
      </div>
    </dialog>
  )
}
