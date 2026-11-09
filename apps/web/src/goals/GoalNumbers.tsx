import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n, type MessageKey } from '../i18n'
import { isValidCurrentValue, progressOf, readAmount, writeAmount, type Goal } from './goals'

/**
 * A Goal's Current Value over its Target and its Progress. The Current Value
 * is a control that turns into a field: Enter or leaving it saves, Escape
 * restores the value. An invalid value stays in the field with a message, and
 * the same line says so when a save fails.
 */
export function GoalNumbers({ goal, onChangeValue }: { goal: Goal; onChangeValue: (value: number) => Promise<void> }) {
  const { t, locale, formatNumber } = useI18n()
  const messageId = useId()
  const [typed, setTyped] = useState<string | null>(null)
  const [message, setMessage] = useState<MessageKey | null>(null)
  const editing = typed !== null
  const invalid = editing && message === 'goals.card.valueInvalid'
  const field = useRef<HTMLInputElement>(null)
  const control = useRef<HTMLButtonElement>(null)
  // Removing a focused field can fire its blur, which must not save a second time.
  const settled = useRef(true)
  const focusControl = useRef(false)
  const value = writeAmount(goal.currentValue, locale)

  useEffect(() => {
    if (editing) field.current?.focus()
    else if (focusControl.current) control.current?.focus()
    focusControl.current = false
  }, [editing])

  const open = () => {
    settled.current = false
    setMessage(null)
    setTyped(value)
  }

  const close = (handFocusBack: boolean) => {
    settled.current = true
    focusControl.current = handFocusBack
    setMessage(null)
    setTyped(null)
  }

  const save = (handFocusBack: boolean) => {
    if (settled.current || typed === null) return
    const amount = readAmount(typed, locale)
    if (amount === null || !isValidCurrentValue(amount)) {
      setMessage('goals.card.valueInvalid')
      return
    }
    close(handFocusBack)
    if (amount !== goal.currentValue) onChangeValue(amount).catch(() => setMessage('goals.card.valueNotSaved'))
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      // Otherwise this same press goes on to activate the control the focus returns to.
      event.preventDefault()
      save(true)
    }
    if (event.key === 'Escape') close(true)
  }

  return (
    <>
      <div className="goal-card__numbers">
        {editing ? (
          <input
            ref={field}
            className="goal-card__field ro-mono"
            type="text"
            inputMode="decimal"
            aria-label={t('goals.card.value', { name: goal.name })}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? messageId : undefined}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value)
              setMessage(null)
            }}
            onKeyDown={onKeyDown}
            onBlur={() => save(false)}
          />
        ) : (
          <button
            ref={control}
            type="button"
            className="goal-card__value ro-mono"
            aria-label={t('goals.card.valueChange', { name: goal.name, value })}
            onClick={open}
          >
            {value}
          </button>
        )}
        <span className="goal-card__target ro-mono">{`/ ${writeAmount(goal.target, locale)}`}</span>
        <span className="goal-card__percent ro-mono">{t('goals.card.percent', { percent: formatNumber(progressOf(goal)) })}</span>
      </div>
      {message !== null && (
        <p id={messageId} role="alert" className="goal-card__message">
          {t(message)}
        </p>
      )}
    </>
  )
}
