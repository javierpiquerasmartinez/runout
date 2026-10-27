import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from './Icon'

export type DropdownOption<V extends string> = { readonly value: V; readonly label: string; readonly disabled?: boolean }

export type DropdownProps<V extends string> = {
  label: string
  options: readonly DropdownOption<V>[]
  value: V
  onChange: (value: V) => void
  /** Drawn as applied, as a filter that narrows. */
  active?: boolean
  className?: string
}

/**
 * A choice among a few, drawn in the app's style rather than the operating
 * system's: a 34 px chip that names its label and its choice, and opens a
 * list of options under it. By keyboard the arrows, Home and End move,
 * Enter or Space picks, Escape closes; a click outside closes too.
 */
export function Dropdown<V extends string>({ label, options, value, onChange, active, className }: DropdownProps<V>) {
  const [open, setOpen] = useState(false)
  // The option the focus is on while open.
  const [focused, setFocused] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLLIElement | null)[]>([])
  const id = useId()
  const chosen = options.findIndex((option) => option.value === value)

  useEffect(() => {
    if (open) optionRefs.current[focused]?.focus()
  }, [open, focused])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  const openList = () => {
    setFocused(Math.max(chosen, 0))
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  const pick = (option: DropdownOption<V>) => {
    if (option.disabled) return
    onChange(option.value)
    close()
  }

  const onButtonKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    openList()
  }
  const onListKey = (event: KeyboardEvent) => {
    const last = options.length - 1
    const moves: Record<string, number> = {
      ArrowDown: Math.min(focused + 1, last),
      ArrowUp: Math.max(focused - 1, 0),
      Home: 0,
      End: last,
    }
    if (event.key in moves) {
      event.preventDefault()
      setFocused(moves[event.key])
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      pick(options[focused])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={root} className={['ro-dropdown', className].filter(Boolean).join(' ')} data-active={active || undefined}>
      <button
        ref={button}
        type="button"
        className="ro-dropdown__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onButtonKey}
      >
        <span id={`${id}-label`} className="ro-dropdown__label">
          {label}
        </span>
        <span id={`${id}-value`} className="ro-dropdown__value">
          {options[chosen]?.label}
        </span>
        <Icon name="chevron" size={12} className="ro-dropdown__chevron" />
      </button>
      {open && (
        <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="ro-dropdown__list" onKeyDown={onListKey}>
          {options.map((option, index) => (
            <li
              key={option.value}
              ref={(element) => {
                optionRefs.current[index] = element
              }}
              role="option"
              tabIndex={-1}
              aria-selected={index === chosen}
              aria-disabled={option.disabled || undefined}
              className="ro-dropdown__option"
              onClick={() => pick(option)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
