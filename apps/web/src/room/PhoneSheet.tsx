import { useEffect } from 'react'
import { useI18n } from '../i18n'

/*
 * On a phone the replayer is the table and its transport alone; the panels
 * beside it on a wider screen (the Queue, Notes, Details) open as a sheet
 * from a bar under the transport, as boards "Biblioteca · Una mano en el
 * móvil", "Sala · En el móvil" and "Sala · La cola en el móvil" draw it. The
 * bar stays in sight above the sheet, so its buttons switch panels, and the
 * open one's closes it. Over 760 px the bar is not drawn and the panels stay
 * where they are (RoomPage.css).
 */

export interface SheetTab<T extends string> {
  id: T
  label: string
  /** A count beside the label: the Hands in the Queue, the Hand's Notes. */
  count?: number
  /** The id of the panel it opens. */
  controls: string
}

export function PhoneSheetBar<T extends string>({
  label,
  tabs,
  open,
  onOpen,
}: {
  label: string
  tabs: SheetTab<T>[]
  open: T | null
  onOpen: (tab: T | null) => void
}) {
  const { t } = useI18n()
  useEffect(() => {
    if (open === null) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpen(null)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, onOpen])

  return (
    <>
      {open !== null && <button type="button" className="phone-sheet__backdrop" aria-label={t('room.sheet.close')} onClick={() => onOpen(null)} />}
      <nav className="phone-sheet-bar" aria-label={label}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="phone-sheet-bar__tab"
            aria-expanded={open === tab.id}
            aria-controls={tab.controls}
            onClick={() => onOpen(open === tab.id ? null : tab.id)}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && <span className="phone-sheet-bar__count ro-mono">{tab.count}</span>}
          </button>
        ))}
      </nav>
    </>
  )
}
