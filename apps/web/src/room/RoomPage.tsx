import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { useSession } from '../identity/context'
import { GoogleSignInButton } from '../identity/GoogleSignInButton'
import { canEnter, DISPLAY_NAME_MAX_LENGTH } from '../identity/identity'
import { navigate } from '../routing'
import { Button } from '../ui/Button'
import { Brand } from '../ui/Brand'
import { TextField } from '../ui/TextField'
import type { RoomSummary } from './roomClient'
import { formatRoomCode } from './roomCode'
import { RoomScreen } from './RoomScreen'
import { useHeldRoom } from './heldRoomContext'
import './RoomPage.css'

type Lookup =
  | { state: 'loading' }
  | { state: 'found'; room: RoomSummary }
  | { state: 'failed'; reason: FailureReason }

/**
 * `/room/<code>`. Whoever can go in as they are (an Account, the anonymous
 * identity of this Room) goes straight in under their Display Name, and so
 * does the Master arriving from "Create". Anyone else is shown the door: sign
 * in with Google there, or enter without an Account under a name for this Room
 * only, which issues an identity for it (ADR 0005). The Room itself is held by
 * the `RoomHolder` around it.
 */
export function RoomPage({ code }: { code: string }) {
  const { token, identity } = useSession()
  const room = useHeldRoom()
  if (!room) throw new Error('RoomPage must be rendered inside <RoomHolder>')
  const { view, commands, displayName, confirmDisplayName: setDisplayName } = room
  const [lookup, setLookup] = useState<Lookup>({ state: 'loading' })
  // Also once signing in with Google at the door has made this browser an Account.
  const enterAs = canEnter(identity, code) ? identity.displayName : null

  useEffect(() => {
    if (displayName === null && enterAs) setDisplayName(enterAs)
  }, [displayName, enterAs, setDisplayName])

  // Also run when arriving from "Create": a refused name falls back to the name form.
  useEffect(() => {
    let cancelled = false
    api<RoomSummary>(`/rooms/${encodeURIComponent(code)}`, { token: token ?? undefined })
      .then((room) => !cancelled && setLookup({ state: 'found', room }))
      .catch((error: unknown) => {
        if (!cancelled) setLookup({ state: 'failed', reason: reasonOf(error) })
      })
    return () => {
      cancelled = true
    }
  }, [code, token])

  if (view.phase === 'in-room') return <RoomScreen view={view} commands={commands} />
  if (view.phase === 'closed') return <Over room={view.room} what="closed" />
  if (view.phase === 'kicked') return <Over room={view.room} what="kicked" />
  if (view.phase === 'rejected' && view.reason === 'invalid-display-name' && lookup.state === 'found') {
    return <ConfirmName room={lookup.room} rejected onConfirm={setDisplayName} />
  }
  if (view.phase === 'rejected') return <Unavailable reason={view.reason} />
  if (view.phase === 'disconnected') return <Disconnected />
  if (displayName !== null || enterAs) return <Status />

  if (lookup.state === 'loading') return <Status />
  if (lookup.state === 'failed') return <Unavailable reason={lookup.reason} />
  // An identity for this Room that has no Display Name yet chooses one.
  if (canEnter(identity, code)) return <ConfirmName room={lookup.room} onConfirm={setDisplayName} />
  return <Door room={lookup.room} onEnter={setDisplayName} />
}

/** The two ways in for someone with no identity for this Room: an Account, or none. */
function Door({ room, onEnter }: { room: RoomSummary; onEnter: (displayName: string) => void }) {
  const { t } = useI18n()
  const { identity, joinAnonymously } = useSession()
  const [name, setName] = useState(identity?.displayName ?? '')
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const [busy, setBusy] = useState(false)

  async function enterWithoutAccount(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setFailure('invalid-display-name')
      return
    }
    setBusy(true)
    try {
      await joinAnonymously(room.code, trimmed)
    } catch (error) {
      setFailure(reasonOf(error))
      setBusy(false)
      return
    }
    onEnter(trimmed)
  }

  return (
    <RoomGate>
      <div className="room-gate__card">
        <RoomHeading room={room} />
        <p className="room-gate__body">{t('room.door.body')}</p>
        {/* Signing in here makes this browser an Account, which goes straight in. */}
        <GoogleSignInButton label="continue" />
        <div className="room-gate__or" aria-hidden="true">
          <span />
          {t('rooms.or')}
          <span />
        </div>
        <form className="room-gate__form" onSubmit={enterWithoutAccount} noValidate>
          <TextField
            label={t('room.door.displayName')}
            value={name}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            autoComplete="nickname"
            onChange={(event) => {
              setName(event.target.value)
              setFailure(null)
            }}
            error={failure ? t(`reason.${failure}`) : undefined}
          />
          <Button type="submit" variant="secondary" size="prominent" aria-busy={busy}>
            {t('room.door.withoutAccount')}
          </Button>
        </form>
      </div>
    </RoomGate>
  )
}

function RoomHeading({ room }: { room: RoomSummary }) {
  const { t } = useI18n()
  return (
    <div className="room-gate__heading">
      <span className="room-gate__eyebrow">{t('room.door.eyebrow')}</span>
      <h1 className="room-gate__title ro-serif">{room.name}</h1>
      <span className="room-gate__code ro-mono">{formatRoomCode(room.code)}</span>
    </div>
  )
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
  const [name, setName] = useState(identity?.displayName ?? '')
  const [failure, setFailure] = useState<FailureReason | null>(rejected ? 'invalid-display-name' : null)

  function confirm(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setFailure('invalid-display-name')
      return
    }
    rememberDisplayName(trimmed)
    onConfirm(trimmed)
  }

  return (
    <RoomGate>
      <form className="room-gate__card" onSubmit={confirm} noValidate>
        <RoomHeading room={room} />
        <p className="room-gate__body">{t('room.confirm.body')}</p>
        <TextField
          label={t('welcome.displayName')}
          value={name}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="nickname"
          autoFocus
          onChange={(event) => {
            setName(event.target.value)
            setFailure(null)
          }}
          error={failure ? t(`reason.${failure}`) : undefined}
        />
        <Button type="submit" variant="primary" size="prominent">
          {t('room.confirm.submit')}
        </Button>
      </form>
    </RoomGate>
  )
}

/**
 * A Room that has ended for this person: the Master closed it, or removed
 * them. Either way it never takes them back, so the only way on is home.
 */
function Over({ room, what }: { room: RoomSummary; what: 'closed' | 'kicked' }) {
  const { t } = useI18n()
  return (
    <RoomGate>
      <div className="room-gate__card" role="alert">
        <h1 className="room-gate__title ro-serif">{t(`room.${what}.title`)}</h1>
        <p className="room-gate__body">{t(`room.${what}.body`, { name: room.name })}</p>
        <Button variant="secondary" onClick={() => navigate('/')}>
          {t('room.backHome')}
        </Button>
      </div>
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

/** The Room's door: the brand over one card, on the bare canvas. */
export function RoomGate({ children }: { children: ReactNode }) {
  return (
    <main className="room-gate">
      <Brand />
      {children}
    </main>
  )
}

