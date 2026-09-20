import type { Participant, ParticipantPresence } from './roomClient'

/** How the Room's Guests are keeping up, as the Master's readout says it. */
export interface GuestsFollowing {
  /** Guests present in the Room, the Master aside. */
  total: number
  /** How many of them have applied the Room's current revision. */
  inSync: number
  /** The slowest round trip among them, in ms; null until one is measured. */
  latencyMs: number | null
}

/**
 * What the Master needs to know about the Room: how many Guests are with them
 * and how far behind the slowest one is. The worst round trip is the one worth
 * showing — it is how long the Room takes to see what the Master just did.
 */
export function guestsFollowing(
  participants: Participant[],
  presence: ParticipantPresence[],
): GuestsFollowing {
  const guests = participants.filter((participant) => participant.role === 'guest')
  const following = guests.map((guest) => presenceOf(presence, guest.identityId))
  const latencies = following
    .map((one) => one?.latencyMs)
    .filter((latencyMs): latencyMs is number => typeof latencyMs === 'number')
  return {
    total: guests.length,
    inSync: following.filter((one) => one?.inSync).length,
    latencyMs: latencies.length > 0 ? Math.max(...latencies) : null,
  }
}

/** How one Participant is following the Room, or null before it has been reported. */
export function presenceOf(presence: ParticipantPresence[], identityId: string): ParticipantPresence | null {
  return presence.find((one) => one.identityId === identityId) ?? null
}
