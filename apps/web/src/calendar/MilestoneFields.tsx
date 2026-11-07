import { useId } from 'react'
import { useI18n } from '../i18n'
import { MAX_MILESTONE_DESCRIPTION_LENGTH } from './calendar'
import './MilestoneFields.css'

/** "12 / 80": how much of a field's room is taken. */
export function LengthCount({ length, max, className, besideError = false }: { length: number; max: number; className?: string; besideError?: boolean }) {
  return (
    <span className={['milestone-count ro-mono', className].filter(Boolean).join(' ')} data-beside-error={besideError || undefined}>
      {`${length} / ${max}`}
    </span>
  )
}

/**
 * A Milestone's description, labelled as optional, taking no more than the
 * server allows; with its refusal beside it, and how much room is taken
 * when `counted`.
 */
export function DescriptionField({
  value,
  onChange,
  className,
  placeholder,
  error,
  counted = false,
}: {
  value: string
  onChange: (value: string) => void
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
        {t('calendar.create.description')} <span className="milestone-field__optional">· {t('calendar.create.optional')}</span>
      </label>
      <textarea
        id={id}
        className={`ro-field__input milestone-field__description ${className}`}
        placeholder={placeholder}
        maxLength={MAX_MILESTONE_DESCRIPTION_LENGTH}
        aria-invalid={error !== undefined || undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error !== undefined && <span className="ro-field__error">{error}</span>}
      {counted && <LengthCount length={value.length} max={MAX_MILESTONE_DESCRIPTION_LENGTH} />}
    </div>
  )
}
