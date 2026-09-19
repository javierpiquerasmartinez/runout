import type { ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * filter: an available filter · active: an applied filter (brass, removable) ·
 * street: a mono Street/Showdown label · showdown: the Showdown label (teal) · tag: a Tag.
 */
export type ChipVariant = 'filter' | 'active' | 'street' | 'showdown' | 'tag'

type RemovableProps = { onRemove: () => void; removeLabel: string } | { onRemove?: undefined; removeLabel?: undefined }

export type ChipProps = { variant?: ChipVariant; children: ReactNode } & RemovableProps

export function Chip({ variant = 'filter', children, onRemove, removeLabel }: ChipProps) {
  return (
    <span className={`ro-chip ro-chip--${variant}`}>
      {children}
      {onRemove && (
        <button type="button" className="ro-chip__remove" aria-label={removeLabel} title={removeLabel} onClick={onRemove}>
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  )
}
