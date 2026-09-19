import { useHealth, usePing } from './backend/useBackendStatus'
import { DesignSystemPage } from './design-system/DesignSystemPage'
import { useI18n } from './i18n'
import { SessionProvider } from './identity/SessionProvider'
import { RoomPage } from './room/RoomPage'
import { SettingsPage, settingsPath } from './settings/SettingsPage'
import { roomCodeFromPath } from './room/roomCode'
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
      {/* Keyed by code, so moving to another Room starts from a clean slate. */}
      {code ? <RoomPage key={code} code={code} /> : <Screen path={path} />}
    </SessionProvider>
  )
}

function Screen({ path }: { path: string }) {
  return path === settingsPath ? <SettingsPage /> : <WelcomePage />
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
