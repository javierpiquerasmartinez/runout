import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'
import { guardLocked, lockedProps } from './locked'

export type IconButtonSize = 'compact' | 'standard' | 'prominent'

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'children' | 'aria-label'> & {
  icon: IconName
  /** Required: an icon-only button is named by this label. */
  label: string
  /** compact 34 · standard 44 · prominent 56 (round, brass). */
  size?: IconButtonSize
  disabledReason?: string
}

const iconSizes: Record<IconButtonSize, number> = { compact: 16, standard: 18, prominent: 21 }

export function IconButton({ icon, label, size = 'standard', disabledReason, className, onClick, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={['ro-icon-btn', `ro-icon-btn--${size}`, className].filter(Boolean).join(' ')}
      {...rest}
      {...lockedProps(label, disabledReason)}
      onClick={guardLocked(disabledReason, onClick)}
    >
      <Icon name={icon} size={iconSizes[size]} />
    </button>
  )
}
