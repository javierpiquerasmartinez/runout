import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchHand, forgetHands } from './hand'

describe('fetchHand', () => {
  let hasHistory: boolean
  let fetched: number

  beforeEach(() => {
    hasHistory = false
    fetched = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetched += 1
        return Response.json({ id: 'hand-1', hasHistory })
      }),
    )
  })

  afterEach(() => {
    forgetHands()
    vi.unstubAllGlobals()
  })

  it('fetches each Hand once for the page', async () => {
    await fetchHand('hand-1', 'token')
    await fetchHand('hand-1', 'token')

    expect(fetched).toBe(1)
  })

  it('fetches a Hand again once Hands are forgotten, as importing it again may have given it its Original', async () => {
    expect((await fetchHand('hand-1', 'token')).hasHistory).toBe(false)
    hasHistory = true

    forgetHands()

    expect((await fetchHand('hand-1', 'token')).hasHistory).toBe(true)
  })
})
