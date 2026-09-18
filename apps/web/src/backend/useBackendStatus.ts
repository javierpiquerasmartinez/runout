import { useEffect, useState } from 'react'
import { latencyFromPong, pingMessage, socketUrl } from './ping'

const PING_INTERVAL_MS = 2000

export type HttpStatus =
  | { state: 'checking' }
  | { state: 'ok'; serverTime: string }
  | { state: 'error'; message: string }

export type SocketStatus =
  | { state: 'connecting' }
  | { state: 'open'; latencyMs: number | null }
  | { state: 'closed' }

export function useHealth(): HttpStatus {
  const [status, setStatus] = useState<HttpStatus>({ state: 'checking' })

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as { serverTime: string }
        setStatus({ state: 'ok', serverTime: body.serverTime })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) })
      })
    return () => controller.abort()
  }, [])

  return status
}

export function usePing(): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>({ state: 'connecting' })

  useEffect(() => {
    const socket = new WebSocket(socketUrl('/ws'))
    let timer: ReturnType<typeof setInterval> | undefined

    socket.addEventListener('open', () => {
      setStatus({ state: 'open', latencyMs: null })
      const ping = () => socket.send(pingMessage(Date.now()))
      ping()
      timer = setInterval(ping, PING_INTERVAL_MS)
    })
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      const latencyMs = latencyFromPong(event.data, Date.now())
      if (latencyMs !== null) setStatus({ state: 'open', latencyMs })
    })
    socket.addEventListener('close', () => {
      clearInterval(timer)
      setStatus({ state: 'closed' })
    })

    return () => {
      clearInterval(timer)
      socket.close()
    }
  }, [])

  return status
}
