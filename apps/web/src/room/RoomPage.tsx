import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { useSession } from '../identity/context'
import { DISPLAY_NAME_MAX_LENGTH } from '../identity/identity'
import { followLink, navigate } from '../routing'
import { Button } from '../ui/Button'
import { BrandMark } from '../ui/BrandMark'
import { TextField } from '../ui/TextField'
import { readJoinIntent } from './joinIntent'
import type { RoomSummary } from './roomClient'
import { formatRoomCode } from './roomCode'
import { RoomScreen } from './RoomScreen'
import { useRoom } from './useRoom'
import './RoomPage.css'

type Lookup =
  | { state: 'loading' }
  | { state: 'found'; room: RoomSummary }
  | { state: 'failed'; reason: FailureReason }

/**
 * `/room/<code>`. Arriving from a link asks only to confirm the Display Name;
 * arriving from "Create" already has it and goes straight in.
 */
export function RoomPage({ code }: { code: string }) {
  const { token } = useSession()
  const [displayName, setDisplayName] = useState<string | null>(() => readJoinIntent()?.displayName ?? null)
  const [lookup, setLookup] = useState<Lookup>({ state: 'loading' })
  const view = useRoom(code, token, displayName)

  // Also run when arriving from "Create": a refused name falls back to the name form.
  useEffect(() => {
    let cancelled = false
    api<RoomSummary>(`/rooms/${encodeURIComponent(code)}`, { token })
      .then((room) => !cancelled && setLookup({ state: 'found', room }))
      .catch((error: unknown) => {
        if (!cancelled) setLookup({ state: 'failed', reason: reasonOf(error) })
      })
    return () => {
      cancelled = true
    }
  }, [code, token])

  if (view.phase === 'in-room') return <RoomScreen view={view} />
  if (view.phase === 'rejected' && view.reason === 'invalid-display-name' && lookup.state === 'found') {
    return <ConfirmName room={lookup.room} rejected onConfirm={setDisplayName} />
  }
  if (view.phase === 'rejected') return <Unavailable reason={view.reason} />
  if (view.phase === 'disconnected') return <Disconnected />
  if (displayName !== null) return <Status />

  if (lookup.state === 'loading') return <Status />
  if (lookup.state === 'failed') return <Unavailable reason={lookup.reason} />
  return <ConfirmName room={lookup.room} onConfirm={setDisplayName} />
}

function ConfirmName({
  room,
  rejected = false,
  onConfirm,
}: {
  room: RoomSummary
  rejected?: boolean
  onConfirm: (displayName: string) => void
}) {
  const { t } = useI18n()
  const { identity, rememberDisplayName } = useSession()
  const [name, setName] = useState(identity.displayName ?? '')
  const [invalid, setInvalid] = useState(rejected)

  function confirm(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setInvalid(true)
      return
    }
    rememberDisplayName(trimmed)
    onConfirm(trimmed)
  }

  return (
    <RoomGate>
      <form className="room-gate__card" onSubmit={confirm} noValidate>
        <div className="room-gate__heading">
          <span className="room-gate__eyebrow">{t('room.confirm.eyebrow')}</span>
          <h1 className="room-gate__title ro-serif">{room.name}</h1>
          <span className="room-gate__code ro-mono">{formatRoomCode(room.code)}</span>
        </div>
        <p className="room-gate__body">{t('room.confirm.body')}</p>
        <TextField
          label={t('welcome.displayName')}
          value={name}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="nickname"
          autoFocus
          onChange={(event) => {
            setName(event.target.value)
            setInvalid(false)
          }}
          error={invalid ? t('reason.invalid-display-name') : undefined}
        />
        <Button type="submit" variant="primary" size="prominent">
          {t('room.confirm.submit')}
        </Button>
      </form>
    </RoomGate>
  )
}

function Unavailable({ reason }: { reason: FailureReason }) {
  const { t } = useI18n()
  return (
    <RoomGate>
      <div className="room-gate__card" role="alert">
        <h1 className="room-gate__title ro-serif">{t('room.notFound.title')}</h1>
        <p className="room-gate__body">{t(`reason.${reason}`)}</p>
        <Button variant="secondary" onClick={() => navigate('/')}>
          {t('room.backHome')}
        </Button>
      </div>
    </RoomGate>
  )
}

function Disconnected() {
  const { t } = useI18n()
  return (
    <RoomGate>
      <div className="room-gate__card" role="alert">
        <p className="room-gate__body">{t('room.disconnected')}</p>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          {t('room.reload')}
        </Button>
      </div>
    </RoomGate>
  )
}

function Status() {
  const { t } = useI18n()
  return (
    <RoomGate>
      <p className="room-gate__body" aria-busy="true">
        {t('room.joining')}
      </p>
    </RoomGate>
  )
}

function RoomGate({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  return (
    <main className="room-gate">
      <a href="/" className="room-gate__brand" aria-label={t('room.home')} onClick={followLink}>
        <BrandMark size={22} />
        <span className="ro-serif">{t('brand.wordmark')}</span>
      </a>
      {children}
    </main>
  )
}

