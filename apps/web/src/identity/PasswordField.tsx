import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { TextField } from '../ui/TextField'
import { checkPassword, lengthProblem, PASSWORD_MAX_LENGTH, type PasswordProblem } from './passwordRules'
import './PasswordField.css'

/** How long typing must pause before the server is asked about a password. */
const CHECK_AFTER_MS = 400

/**
 * A new password, with its rules shown while it is typed: at least 12
 * characters, and not one everybody guesses first. Spaces and any characters
 * are welcome; no mix of them is asked for.
 */
export function NewPasswordField({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const { t } = useI18n()
  const problem = usePasswordProblem(value)
  const longEnough = value.length > 0 && lengthProblem(value) !== 'too-short'
  return (
    <div className="password-field">
      <TextField
        label={label}
        type="password"
        autoComplete="new-password"
        value={value}
        maxLength={PASSWORD_MAX_LENGTH * 2}
        onChange={(event) => onChange(event.target.value)}
        error={error}
      />
      <ul className="password-field__rules" aria-live="polite">
        <li data-met={longEnough || undefined}>{t('password.rule.length')}</li>
        <li data-met={(value.length > 0 && problem === null) || undefined} data-failed={problem === 'common' || undefined}>
          {problem === 'common' ? t('password.rule.commonFailed') : t('password.rule.common')}
        </li>
      </ul>
      <p className="password-field__hint">{t('password.rule.anything')}</p>
    </div>
  )
}

/** What is wrong with the password typed so far; null once nothing is, or while unknown. */
function usePasswordProblem(password: string): PasswordProblem | null {
  const [checked, setChecked] = useState<{ password: string; problem: PasswordProblem | null } | null>(null)
  const local = lengthProblem(password)
  useEffect(() => {
    if (local !== null) return
    let cancelled = false
    const timer = setTimeout(() => {
      checkPassword(password)
        .then((problem) => !cancelled && setChecked({ password, problem }))
        // Offline: the server says it on submit instead.
        .catch(() => undefined)
    }, CHECK_AFTER_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [password, local])
  if (local !== null) return local
  return checked?.password === password ? checked.problem : null
}
