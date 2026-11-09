import { useId } from 'react'
import { useI18n } from '../i18n'
import { LengthCount } from './LengthCount'

/**
 * A description, labelled as optional, taking no more than `maxLength`; with
 * its refusal beside it, and how much room is taken when `counted`.
 */
export function DescriptionField({
  value,
  onChange,
  maxLength,
  className,
  placeholder,
  error,
  counted = false,
}: {
  value: string
  onChange: (value: string) => void
  maxLength: number
  /** The textarea's own class, which sizes it. */
  className: string
  placeholder?: string
  error?: string
  counted?: boolean
}) {
  const { t } = useI18n()
  const id = useId()
  return (
    <div className="ro-field" data-invalid={error !== undefined ? '' : undefined}>
      <label htmlFor={id} className="ro-field__label">
        {t('field.description')} <span className="ro-field__optional">· {t('field.optional')}</span>
      </label>
      <textarea
        id={id}
        className={`ro-field__input ro-field__description ${className}`}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={error !== undefined || undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error !== undefined && <span className="ro-field__error">{error}</span>}
      {counted && <LengthCount length={value.length} max={maxLength} />}
    </div>
  )
}
