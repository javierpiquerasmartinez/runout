import { useId, type InputHTMLAttributes } from 'react'
import { lockedProps } from './locked'

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'disabled' | 'id'> & {
  label: string
  error?: string
  /** Codes such as a Room Code are typed in tabular mono. */
  mono?: boolean
  disabledReason?: string
}

export function TextField({ label, error, mono = false, disabledReason, className, ...rest }: TextFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const locked = disabledReason !== undefined
  return (
    <div className={['ro-field', className].filter(Boolean).join(' ')} data-invalid={error ? '' : undefined} data-locked={locked ? '' : undefined}>
      <label htmlFor={id} className="ro-field__label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        className={mono ? 'ro-field__input ro-mono' : 'ro-field__input'}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
        {...(locked && { readOnly: true })}
        {...lockedProps(label, disabledReason)}
      />
      {error && (
        <span id={errorId} className="ro-field__error">
          {error}
        </span>
      )}
    </div>
  )
}
