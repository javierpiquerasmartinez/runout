import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { lockedProps } from '../ui/locked'
import { useHandCopy, VERSION_LABELS, type HandCopyVersion } from './useHandCopy'
import './CopyHand.css'

/** The versions a copy menu offers, in its order. */
const VERSIONS: HandCopyVersion[] = ['summary', 'history']

/**
 * "Copiar mano", by the player: a split button whose main click copies the
 * Hand Summary, and whose arrow opens a menu of the versions to copy. It
 * copies the whole Hand, wherever Playback is, for anyone who can see it.
 * The Original is locked, saying why, when Runout kept no Hand History of
 * the Hand (`hasHistory` false); until that is known it is offered.
 */
export function CopyHand({
  handId,
  hasHistory,
  className,
}: {
  handId: string
  hasHistory?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const { copy, message, feedback } = useHandCopy(handId)
  const root = useRef<HTMLDivElement>(null)
  const arrow = useRef<HTMLButtonElement>(null)
  const menu = useCopyMenu(root, arrow)

  const copied = feedback !== null && 'copied' in feedback
  const failed = feedback !== null && 'failed' in feedback
  return (
    <div ref={root} className={['copy-hand', className].filter(Boolean).join(' ')}>
      <Button
        variant="secondary"
        size="compact"
        className="copy-hand__main"
        data-copied={copied || undefined}
        data-failed={failed || undefined}
        onClick={() => copy('summary')}
      >
        <Icon name={copied ? 'success' : failed ? 'error' : 'copy'} size={14} />
        {message ?? t('hand.copy')}
      </Button>
      <button
        ref={arrow}
        type="button"
        className="copy-hand__arrow"
        aria-label={t('hand.copy.choose')}
        title={t('hand.copy.choose')}
        {...menu.triggerProps}
      >
        <Icon name="chevron" size={12} className="copy-hand__chevron" />
      </button>
      {menu.open && <CopyMenu menu={menu} hasHistory={hasHistory} onPick={copy} />}
      <span className="ro-visually-hidden" role="status">
        {message}
      </span>
    </div>
  )
}

/**
 * Copying a Hand from a Library row: a compact icon button that only opens
 * the menu of the versions to copy, so a stray click copies nothing. Its icon
 * and name say, for a moment, how the copy went. The menu floats above the
 * list, so the table's scrolling frame doesn't clip it.
 */
export function CopyHandMenuButton({
  handId,
  hasHistory,
  label,
  className,
}: {
  handId: string
  hasHistory: boolean
  /** The button's name, saying which Hand it copies. */
  label: string
  className?: string
}) {
  const { copy, message, feedback } = useHandCopy(handId)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useCopyMenu(root, trigger)
  const [place, setPlace] = useState<CSSProperties>()

  // Placed under the button when it opens; any scroll or resize closes it rather than leave it behind.
  const { open, setOpen } = menu
  useLayoutEffect(() => {
    if (!open) return
    const rect = trigger.current!.getBoundingClientRect()
    setPlace({ position: 'fixed', top: rect.bottom + 6, right: window.innerWidth - rect.right })
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, setOpen])

  const copied = feedback !== null && 'copied' in feedback
  const failed = feedback !== null && 'failed' in feedback
  return (
    <div ref={root} className={['copy-hand-menu', className].filter(Boolean).join(' ')} data-open={menu.open || undefined}>
      <IconButton
        ref={trigger}
        icon={copied ? 'success' : failed ? 'error' : 'copy'}
        size="compact"
        className="copy-hand-menu__button"
        label={message ?? label}
        data-copied={copied || undefined}
        data-failed={failed || undefined}
        {...menu.triggerProps}
      />
      {menu.open && <CopyMenu menu={menu} hasHistory={hasHistory} onPick={copy} style={place} />}
      <span className="ro-visually-hidden" role="status">
        {message}
      </span>
    </div>
  )
}

type CopyMenuState = ReturnType<typeof useCopyMenu>

/**
 * Whether a copy menu is open, and the props of the button that opens it:
 * a click toggles it, an arrow key opens it, and a press outside closes it.
 */
function useCopyMenu(root: RefObject<HTMLElement | null>, trigger: RefObject<HTMLButtonElement | null>) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const id = useId()
  const menuId = `${id}-menu`

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, root])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    setOpen(true)
  }
  return {
    open,
    setOpen,
    menuId,
    label: t('hand.copy.choose'),
    /** Closes it, back on the button that opened it. */
    close: () => {
      setOpen(false)
      trigger.current?.focus()
    },
    triggerProps: {
      'aria-haspopup': 'menu' as const,
      'aria-expanded': open,
      'aria-controls': open ? menuId : undefined,
      onClick: () => setOpen(!open),
      onKeyDown,
    },
  }
}

/** The menu of the versions to copy, focused on its first one; the Original is locked without a Hand History. */
function CopyMenu({
  menu,
  hasHistory,
  onPick,
  style,
}: {
  menu: CopyMenuState
  hasHistory?: boolean
  onPick: (version: HandCopyVersion) => void
  style?: CSSProperties
}) {
  const { t } = useI18n()
  const [focused, setFocused] = useState(0)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const lockedReason = (version: HandCopyVersion) =>
    version === 'history' && hasHistory === false ? t('hand.copy.history.missing') : undefined

  useEffect(() => {
    items.current[focused]?.focus()
  }, [focused])

  const pick = (version: HandCopyVersion) => {
    menu.close()
    onPick(version)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    const last = VERSIONS.length - 1
    const moves: Record<string, number> = {
      ArrowDown: Math.min(focused + 1, last),
      ArrowUp: Math.max(focused - 1, 0),
      Home: 0,
      End: last,
    }
    if (event.key in moves) {
      event.preventDefault()
      setFocused(moves[event.key])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      menu.close()
    } else if (event.key === 'Tab') {
      menu.setOpen(false)
    }
  }

  return (
    <div id={menu.menuId} role="menu" aria-label={menu.label} className="copy-hand__menu" style={style} onKeyDown={onKeyDown}>
      {VERSIONS.map((version, index) => (
        <button
          key={version}
          ref={(element) => {
            items.current[index] = element
          }}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className="copy-hand__item"
          {...lockedProps(t(VERSION_LABELS[version]), lockedReason(version))}
          onClick={(event) => (lockedReason(version) ? event.preventDefault() : pick(version))}
        >
          {t(VERSION_LABELS[version])}
        </button>
      ))}
    </div>
  )
}
