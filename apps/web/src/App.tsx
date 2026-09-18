import { useHealth, usePing } from './backend/useBackendStatus'

function App() {
  const health = useHealth()
  const ping = usePing()

  return (
    <main className="status">
      <h1>Runout</h1>
      <p className="subtitle">Comprobación de conexión con el servidor</p>

      <dl>
        <div className="row">
          <dt>API (HTTP)</dt>
          <dd data-state={health.state}>
            {health.state === 'checking' && 'Comprobando…'}
            {health.state === 'ok' && `OK · ${new Date(health.serverTime).toLocaleTimeString('es-ES')}`}
            {health.state === 'error' && `Sin respuesta (${health.message})`}
          </dd>
        </div>
        <div className="row">
          <dt>Tiempo real (WebSocket)</dt>
          <dd data-state={ping.state === 'open' ? 'ok' : ping.state === 'closed' ? 'error' : 'checking'}>
            {ping.state === 'connecting' && 'Conectando…'}
            {ping.state === 'open' && (ping.latencyMs === null ? 'Conectado' : `Sincronizado · ${ping.latencyMs} ms`)}
            {ping.state === 'closed' && 'Sin conexión'}
          </dd>
        </div>
      </dl>
    </main>
  )
}

export default App
