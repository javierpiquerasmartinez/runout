import { guardLocked, lockedProps } from './locked'

export type SegmentedOption<V extends string> = { readonly value: V; readonly label: string }

export type SegmentedControlProps<V extends string> = {
  label: string
  options: readonly SegmentedOption<V>[]
  value: V
  onChange: (value: V) => void
  disabledReason?: string
}

export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onChange,
  disabledReason,
}: SegmentedControlProps<V>) {
  return (
    <div role="radiogroup" aria-label={label} className="ro-segmented" data-locked={disabledReason !== undefined ? '' : undefined}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className="ro-segmented__option"
          {...lockedProps(option.label, disabledReason)}
          onClick={guardLocked(disabledReason, () => onChange(option.value))}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
