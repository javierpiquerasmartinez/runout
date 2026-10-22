import { useState, type ReactNode } from 'react'
import { useHealth, usePing } from './backend/useBackendStatus'
import { DesignSystemPage } from './design-system/DesignSystemPage'
import { useI18n } from './i18n'
import { FirstDisplayName } from './identity/ChooseDisplayName'
import { useSession } from './identity/context'
import { SessionProvider } from './identity/SessionProvider'
import { libraryHandIdFromPath, libraryPath, roomCodeFromLibraryPath } from './library/library'
import { LibraryHandPage } from './library/LibraryHandPage'
import { LibraryPage } from './library/LibraryPage'
import { RoomPage } from './room/RoomPage'
import { useHeldRoom } from './room/heldRoomContext'
import { RoomHolder } from './room/RoomHolder'
import { SettingsPage, settingsPath } from './settings/SettingsPage'
import { formatRoomCode, roomCodeFromPath } from './room/roomCode'
import { usePath } from './routing'
import { WelcomePage } from './welcome/WelcomePage'

export const designSystemPath = '/design-system'
export const statusPath = '/status'

function App() {
  const path = usePath()
  if (path === designSystemPath) return <DesignSystemPage />
  if (path === statusPath) return <ConnectionStatus />
  const code = roomCodeFromPath(path)
  return (
    <SessionProvider>
      <FirstDisplayName>
        <KeepRoom path={path}>{code ? <RoomPage code={code} /> : <Screen path={path} />}</KeepRoom>
      </FirstDisplayName>
    </SessionProvider>
  )
}

/**
 * Holds the Room this person is in while they are on its screen, picking
 * Hands for it in their Library or have stepped out to Settings; any other
 * screen leaves it.
 */
function KeepRoom({ path, children }: { path: string; children: ReactNode }) {
  const [keptCode, setKeptCode] = useState(() => roomCodeIn(path))
  const code = roomCodeIn(path) ?? (path === settingsPath ? keptCode : null)
  if (code !== keptCode) setKeptCode(code)
  if (!code) return children
  // Keyed by code, so moving to another Room starts from a clean slate.
  return (
    <RoomHolder key={code} code={code}>
      {children}
    </RoomHolder>
  )
}

/** The Room a path belongs to: its own screen, or picking Hands for it in the Library. */
function roomCodeIn(path: string): string | null {
  return roomCodeFromPath(path) ?? roomCodeFromLibraryPath(path)
}

function Screen({ path }: { path: string }) {
  // Settings are an identity's: without one there is nothing to set yet.
  const { identity } = useSession()
  if (path === settingsPath && identity) return <SettingsPage />
  // Only an Account has a Library (ADR 0005); anyone else is sent to the start.
  if (identity?.account) {
    if (path === libraryPath) return <LibraryPage />
    const pickingFor = roomCodeFromLibraryPath(path)
    if (pickingFor) return <RoomLibrary code={pickingFor} />
    const handId = libraryHandIdFromPath(path)
    if (handId) return <LibraryHandPage key={handId} handId={handId} />
  }
  return <WelcomePage />
}

/** The Library, opened from the Room this person is still in, to add Hands to its Queue. */
function RoomLibrary({ code }: { code: string }) {
  const view = useHeldRoom()?.view
  const name = view && 'room' in view ? view.room.name : formatRoomCode(code)
  return <LibraryPage room={{ code, name }} />
}

function ConnectionStatus() {
  const { t, formatTime } = useI18n()
  const health = useHealth()
  const ping = usePing()

  return (
    <main className="status">
      <h1 className="ro-serif">{t('app.name')}</h1>
      <p className="status__subtitle">{t('status.subtitle')}</p>

      <dl>
        <div className="status__row">
          <dt>{t('status.api')}</dt>
          <dd className="ro-mono" data-state={health.state}>
            {health.state === 'checking' && t('status.checking')}
            {health.state === 'ok' && t('status.ok', { time: formatTime(new Date(health.serverTime)) })}
            {health.state === 'error' && t('status.noResponse', { message: health.message })}
          </dd>
        </div>
        <div className="status__row">
          <dt>{t('status.realtime')}</dt>
          <dd className="ro-mono" data-state={ping.state === 'open' ? 'ok' : ping.state === 'closed' ? 'error' : 'checking'}>
            {ping.state === 'connecting' && t('status.connecting')}
            {ping.state === 'open' &&
              (ping.latencyMs === null ? t('status.connected') : t('status.synced', { latency: ping.latencyMs }))}
            {ping.state === 'closed' && t('status.offline')}
          </dd>
        </div>
      </dl>

      <a className="status__link" href={designSystemPath}>
        {t('status.designSystemLink')}
      </a>
    </main>
  )
}

export default App
