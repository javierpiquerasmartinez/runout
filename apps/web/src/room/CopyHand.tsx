import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { useHandCopy, VERSION_LABELS, type HandCopyVersion } from './useHandCopy'
import './CopyHand.css'

/**
 * "Copiar mano", by the player: a split button whose main click copies the
 * Hand Summary, and whose arrow opens a menu of the versions to copy. It
 * copies the whole Hand, wherever Playback is, for anyone who can see it.
 */
export function CopyHand({ handId, className }: { handId: string; className?: string }) {
  const { t } = useI18n()
  const { copy, message, feedback } = useHandCopy(handId)
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const arrow = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const versions: HandCopyVersion[] = ['summary']

  useEffect(() => {
    if (open) items.current[focused]?.focus()
  }, [open, focused])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  const openMenu = () => {
    setFocused(0)
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    arrow.current?.focus()
  }
  const pick = (version: HandCopyVersion) => {
    close()
    copy(version)
  }

  const onArrowKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    openMenu()
  }
  const onMenuKey = (event: KeyboardEvent) => {
    const last = versions.length - 1
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
      close()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

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
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onArrowKey}
      >
        <Icon name="chevron" size={12} className="copy-hand__chevron" />
      </button>
      {open && (
        <div id={`${id}-menu`} role="menu" aria-label={t('hand.copy.choose')} className="copy-hand__menu" onKeyDown={onMenuKey}>
          {versions.map((version, index) => (
            <button
              key={version}
              ref={(element) => {
                items.current[index] = element
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="copy-hand__item"
              onClick={() => pick(version)}
            >
              {t(VERSION_LABELS[version])}
            </button>
          ))}
        </div>
      )}
      <span className="ro-visually-hidden" role="status">
        {message}
      </span>
    </div>
  )
}
