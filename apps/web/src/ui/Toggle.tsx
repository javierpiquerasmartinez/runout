import { guardLocked, lockedProps } from './locked'

export type ToggleProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabledReason?: string
  /** Show the label next to the switch; otherwise it is only announced. */
  showLabel?: boolean
}

export function Toggle({ label, checked, onChange, disabledReason, showLabel = false }: ToggleProps) {
  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="ro-toggle"
      {...lockedProps(label, disabledReason)}
      onClick={guardLocked(disabledReason, () => onChange(!checked))}
    >
      <span className="ro-toggle__thumb" />
    </button>
  )
  if (!showLabel) return toggle
  return (
    <span className="ro-toggle-row">
      {toggle}
      <span className="ro-toggle-row__label" aria-hidden="true">
        {label}
      </span>
    </span>
  )
}
