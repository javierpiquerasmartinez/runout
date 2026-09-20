import { describe, expect, it } from 'vitest'
import type { Participant, ParticipantPresence } from './roomClient'
import { guestsFollowing, presenceOf } from './syncView'

const participants: Participant[] = [
  { identityId: 'id-javier', displayName: 'Javier', role: 'master' },
  { identityId: 'id-marta', displayName: 'Marta', role: 'guest' },
  { identityId: 'id-alberto', displayName: 'Alberto', role: 'guest' },
]

const following = (identityId: string, over: Partial<ParticipantPresence> = {}): ParticipantPresence => ({
  identityId,
  presence: 'connected',
  latencyMs: 40,
  inSync: true,
  ...over,
})

describe('guestsFollowing', () => {
  it('counts the Guests with the Master, and the slowest round trip among them', () => {
    const presence = [
      following('id-javier', { latencyMs: 900 }),
      following('id-marta', { latencyMs: 40 }),
      following('id-alberto', { latencyMs: 120 }),
    ]

    // The Master's own round trip is not the Room's: only the Guests' count.
    expect(guestsFollowing(participants, presence)).toEqual({ total: 2, inSync: 2, latencyMs: 120 })
  })

  it('leaves out a Guest who has not caught up', () => {
    const presence = [following('id-marta'), following('id-alberto', { inSync: false })]
    expect(guestsFollowing(participants, presence)).toMatchObject({ total: 2, inSync: 1 })
  })

  it('has no round trip to show before anyone has measured one', () => {
    const presence = [following('id-marta', { latencyMs: null }), following('id-alberto', { latencyMs: null })]
    expect(guestsFollowing(participants, presence).latencyMs).toBeNull()
  })

  it('counts a Guest the Room has said nothing about yet as not in sync', () => {
    expect(guestsFollowing(participants, [])).toEqual({ total: 2, inSync: 0, latencyMs: null })
  })

  it('has nothing to report in a Room with only a Master in it', () => {
    expect(guestsFollowing([participants[0]], [])).toEqual({ total: 0, inSync: 0, latencyMs: null })
  })
})

describe('presenceOf', () => {
  it('finds one Participant, and is null for one not reported on', () => {
    expect(presenceOf([following('id-marta')], 'id-marta')).toMatchObject({ identityId: 'id-marta' })
    expect(presenceOf([following('id-marta')], 'id-alberto')).toBeNull()
  })
})
