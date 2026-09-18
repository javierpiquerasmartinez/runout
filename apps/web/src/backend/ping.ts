export interface PongMessage {
  event: 'pong'
  data: { sentAt: number; serverTime: number }
}

export function pingMessage(sentAt: number): string {
  return JSON.stringify({ event: 'ping', data: { sentAt } })
}

/** Returns the round-trip latency in ms, or null if the message is not a pong. */
export function latencyFromPong(raw: string, receivedAt: number): number | null {
  let message: unknown
  try {
    message = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isPong(message)) return null
  return Math.max(0, receivedAt - message.data.sentAt)
}

function isPong(message: unknown): message is PongMessage {
  if (typeof message !== 'object' || message === null) return false
  const { event, data } = message as Partial<PongMessage>
  return event === 'pong' && typeof data?.sentAt === 'number'
}

export function socketUrl(path: string, location: Location = window.location): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}${path}`
}
