import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from './Icon'

export type DropdownOption<V extends string> = { readonly value: V; readonly label: string; readonly disabled?: boolean }

type CommonProps<V extends string> = {
  label: string
  options: readonly DropdownOption<V>[]
  /** Drawn as applied, as a filter that narrows. */
  active?: boolean
  className?: string
}

type SingleProps<V extends string> = CommonProps<V> & {
  multiple?: false
  value: V
  onChange: (value: V) => void
}

type MultipleProps<V extends string> = CommonProps<V> & {
  /** Several options can be ticked; ticking one keeps the list open. */
  multiple: true
  value: readonly V[]
  onChange: (value: V[]) => void
  /** What it reads with nothing ticked. */
  none: string
  /** The name of the search a long list offers. */
  searchLabel: string
}

export type DropdownProps<V extends string> = SingleProps<V> | MultipleProps<V>

/** Past this many options, a list of several to tick offers a search. */
const SEARCH_FROM = 9

/**
 * A choice drawn in the app's style rather than the operating system's: a
 * 34 px chip that names its label and its choice, and opens a list of
 * options under it. One option, or several to tick (read as "PokerStars +2").
 * By keyboard the arrows, Home and End move, Enter or Space picks or ticks,
 * Escape closes; a click outside closes too.
 */
export function Dropdown<V extends string>(props: DropdownProps<V>) {
  const { label, options, active, className } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // The option the focus is on while open; -1 is the search.
  const [focused, setFocused] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<(HTMLLIElement | null)[]>([])
  const id = useId()

  const chosen: readonly V[] = props.multiple ? props.value : [props.value]
  const searchable = props.multiple === true && options.length >= SEARCH_FROM
  const shown = searchable && query ? options.filter((option) => folded(option.label).includes(folded(query))) : options
  // Named in the order the list offers them.
  const ticked = options.filter((option) => chosen.includes(option.value))
  const reads = props.multiple
    ? ticked.length === 0
      ? props.none
      : `${ticked[0].label}${ticked.length > 1 ? ` +${ticked.length - 1}` : ''}`
    : ticked[0]?.label

  useEffect(() => {
    if (!open) return
    if (focused === -1) search.current?.focus()
    else optionRefs.current[focused]?.focus()
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
    setQuery('')
    setFocused(searchable ? -1 : Math.max(options.findIndex((option) => chosen.includes(option.value)), 0))
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  const pick = (option: DropdownOption<V> | undefined) => {
    if (!option || option.disabled) return
    if (!props.multiple) {
      props.onChange(option.value)
      close()
      return
    }
    props.onChange(
      chosen.includes(option.value) ? chosen.filter((value) => value !== option.value) : [...chosen, option.value],
    )
  }

  const onButtonKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    openList()
  }
  const onPanelKey = (event: KeyboardEvent) => {
    const first = searchable ? -1 : 0
    const last = shown.length - 1
    const inSearch = event.target === search.current
    const moves: Record<string, number> = {
      ArrowDown: Math.min(focused + 1, last),
      ArrowUp: Math.max(focused - 1, first),
      // In the search, Home and End move the caret.
      ...(inSearch ? {} : { Home: 0, End: last }),
    }
    if (event.key in moves) {
      event.preventDefault()
      setFocused(moves[event.key])
    } else if (!inSearch && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      pick(shown[focused])
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
          {reads}
        </span>
        <Icon name="chevron" size={12} className="ro-dropdown__chevron" />
      </button>
      {open && (
        <div className="ro-dropdown__panel" onKeyDown={onPanelKey}>
          {searchable && (
            <input
              ref={search}
              type="search"
              className="ro-dropdown__search"
              aria-label={props.searchLabel}
              placeholder={props.searchLabel}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setFocused(-1)
              }}
            />
          )}
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            aria-multiselectable={props.multiple || undefined}
            className="ro-dropdown__list"
          >
            {shown.map((option, index) => (
              <li
                key={option.value}
                ref={(element) => {
                  optionRefs.current[index] = element
                }}
                role="option"
                tabIndex={-1}
                aria-selected={chosen.includes(option.value)}
                aria-disabled={option.disabled || undefined}
                className="ro-dropdown__option"
                onClick={() => {
                  setFocused(index)
                  pick(option)
                }}
              >
                {props.multiple && <span className="ro-dropdown__check" aria-hidden="true" />}
                {option.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Text as a search compares it: lower case, without accents. */
function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}
