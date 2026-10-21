import { useState, type FormEvent, type ReactNode } from 'react'
import { reasonOf } from '../backend/api'
import { useI18n, type MessageKey } from '../i18n'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'
import { useIdentity, useSession } from './context'
import { DISPLAY_NAME_MAX_LENGTH, saveDisplayName } from './identity'
import './ChooseDisplayName.css'

/**
 * A first-time Account chooses its Display Name before anything else,
 * wherever it signed in; everyone else goes straight to `children`.
 */
export function FirstDisplayName({ children }: { children: ReactNode }) {
  const { identity } = useSession()
  if (identity?.account && identity.displayName === null) return <ChooseDisplayName />
  return children
}

function ChooseDisplayName() {
  const { t } = useI18n()
  const { token, rememberDisplayName } = useIdentity()
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      rememberDisplayName(await saveDisplayName(token, displayName))
    } catch (caught) {
      setError(`reason.${reasonOf(caught)}`)
      setBusy(false)
    }
  }

  return (
    <main className="choose-name">
      <form className="choose-name__card" onSubmit={save} noValidate>
        <BrandMark size={28} />
        <div className="choose-name__heading">
          <h1 className="choose-name__title ro-serif">{t('welcome.name.title')}</h1>
          <p className="choose-name__body">{t('welcome.name.body')}</p>
        </div>
        <TextField
          label={t('welcome.name.label')}
          value={displayName}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="nickname"
          autoFocus
          onChange={(event) => setDisplayName(event.target.value)}
          error={error ? t(error) : undefined}
        />
        <Button type="submit" variant="primary" size="prominent" aria-busy={busy}>
          {t('welcome.name.submit')}
        </Button>
      </form>
    </main>
  )
}
