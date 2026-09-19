import { useHealth, usePing } from './backend/useBackendStatus'
import { DesignSystemPage } from './design-system/DesignSystemPage'
import { useI18n } from './i18n'

export const designSystemPath = '/design-system'

function App() {
  if (window.location.pathname === designSystemPath) return <DesignSystemPage />
  return <ConnectionStatus />
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
