import { useState, type FormEvent } from 'react'
import { api, reasonOf } from '../backend/api'
import { useI18n, type MessageKey } from '../i18n'
import { useSession } from '../identity/context'
import { DISPLAY_NAME_MAX_LENGTH } from '../identity/identity'
import { navigate } from '../routing'
import type { RoomSummary } from '../room/roomClient'
import type { JoinIntent } from '../room/joinIntent'
import { roomPath } from '../room/roomCode'
import { Button } from '../ui/Button'
import { BrandMark } from '../ui/BrandMark'
import { Icon } from '../ui/Icon'
import { TextField } from '../ui/TextField'
import { WelcomePreview } from './WelcomePreview'
import './WelcomePage.css'

/** Same limit the server enforces. */
const ROOM_NAME_MAX_LENGTH = 60

export function WelcomePage() {
  const { t } = useI18n()
  return (
    <main className="welcome">
      <div className="welcome__entry">
        <div className="welcome__brand">
          <BrandMark />
          <span className="welcome__wordmark ro-serif">{t('brand.wordmark')}</span>
          <span className="welcome__beta ro-mono">{t('brand.beta')}</span>
        </div>

        <div className="welcome__intro">
          <h1 className="welcome__title ro-serif">{t('welcome.title')}</h1>
          <p className="welcome__lead">{t('welcome.lead')}</p>
        </div>

        <div className="welcome__actions">
          <CreateRoomCard />
          <div className="welcome__or" aria-hidden="true">
            <span />
            {t('welcome.or')}
            <span />
          </div>
          <JoinRoomCard />
        </div>
      </div>

      <WelcomePreview />
    </main>
  )
}

function CreateRoomCard() {
  const { t } = useI18n()
  const { token, identity, rememberDisplayName } = useSession()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState(identity.displayName ?? '')
  const [error, setError] = useState<{ field: 'name' | 'displayName' | 'form'; message: MessageKey } | null>(null)
  const [busy, setBusy] = useState(false)

  async function create(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const room = await api<RoomSummary>('/rooms', { token, method: 'POST', body: { name, displayName } })
      const trimmed = displayName.trim()
      rememberDisplayName(trimmed)
      navigate(roomPath(room.code), { displayName: trimmed } satisfies JoinIntent)
    } catch (caught) {
      const reason = reasonOf(caught)
      const field = reason === 'invalid-room-name' ? 'name' : reason === 'invalid-display-name' ? 'displayName' : 'form'
      setError({ field, message: `reason.${reason}` })
      setBusy(false)
    }
  }

  return (
    <form className="welcome-card" onSubmit={create} noValidate>
      <div className="welcome-card__heading">
        <h2 className="welcome-card__title">{t('welcome.create.title')}</h2>
        <p className="welcome-card__body">{t('welcome.create.body')}</p>
      </div>
      <div className="welcome-card__fields">
        <TextField
          label={t('welcome.create.roomName')}
          placeholder={t('welcome.create.roomNamePlaceholder')}
          value={name}
          maxLength={ROOM_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          error={error?.field === 'name' ? t(error.message) : undefined}
        />
        <TextField
          label={t('welcome.displayName')}
          value={displayName}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="nickname"
          onChange={(event) => setDisplayName(event.target.value)}
          error={error?.field === 'displayName' ? t(error.message) : undefined}
        />
      </div>
      <Button type="submit" variant="primary" size="prominent" aria-busy={busy}>
        <Icon name="add" size={16} />
        {t('welcome.create.submit')}
      </Button>
      {error?.field === 'form' && (
        <p className="welcome-card__error" role="alert">
          {t(error.message)}
        </p>
      )}
    </form>
  )
}

function JoinRoomCard() {
  const { t } = useI18n()
  const { token } = useSession()
  const [code, setCode] = useState('')
  const [error, setError] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)

  async function join(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const typed = code.trim()
    if (typed === '') {
      setError('reason.room-not-found')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const room = await api<RoomSummary>(`/rooms/${encodeURIComponent(typed)}`, { token })
      navigate(roomPath(room.code))
    } catch (caught) {
      setError(`reason.${reasonOf(caught)}`)
      setBusy(false)
    }
  }

  return (
    <form className="welcome-card welcome-card--join" onSubmit={join} noValidate>
      <div className="welcome-card__heading">
        <h2 className="welcome-card__title">{t('welcome.join.title')}</h2>
        <p className="welcome-card__body">{t('welcome.join.body')}</p>
      </div>
      <div className="welcome-join">
        <TextField
          className="welcome-join__code"
          label={t('welcome.join.code')}
          mono
          placeholder={t('welcome.join.codePlaceholder')}
          value={code}
          maxLength={12}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(event) => {
            setCode(event.target.value)
            setError(null)
          }}
          error={error ? t(error) : undefined}
        />
        <Button type="submit" variant="sync" size="prominent" className="welcome-join__submit" aria-busy={busy}>
          {t('welcome.join.submit')}
        </Button>
      </div>
      <p className="welcome-card__hint">{t('welcome.join.linkHint')}</p>
    </form>
  )
}
