import { describe, expect, it } from 'vitest'
import { latencyFromPong, pingMessage } from './ping'

describe('latencyFromPong', () => {
  it('measures the round trip from the echoed timestamp', () => {
    const raw = JSON.stringify({ event: 'pong', data: { sentAt: 1000, serverTime: 5 } })
    expect(latencyFromPong(raw, 1042)).toBe(42)
  })

  it('ignores anything that is not a pong', () => {
    expect(latencyFromPong(pingMessage(1000), 1042)).toBeNull()
    expect(latencyFromPong('not json', 1042)).toBeNull()
  })
})
