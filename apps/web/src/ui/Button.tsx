import type { ButtonHTMLAttributes } from 'react'
import { guardLocked, lockedProps } from './locked'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'sync' | 'destructive'
export type ButtonSize = 'compact' | 'standard' | 'prominent'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Locks the button and explains why; the reason is read out with its name. */
  disabledReason?: string
}

export function Button({
  variant = 'secondary',
  size = 'standard',
  disabledReason,
  className,
  children,
  onClick,
  type = 'button',
  ...rest
}: ButtonProps) {
  const label = rest['aria-label'] ?? (typeof children === 'string' ? children : undefined)
  return (
    <button
      type={type}
      className={['ro-btn', `ro-btn--${variant}`, `ro-btn--${size}`, className].filter(Boolean).join(' ')}
      {...rest}
      {...lockedProps(label, disabledReason)}
      onClick={guardLocked(disabledReason, onClick)}
    >
      {children}
    </button>
  )
}
