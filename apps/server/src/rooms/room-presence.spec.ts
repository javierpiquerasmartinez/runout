import {
  AWAY_AFTER_MS,
  LATENCY_STEP_MS,
  RoomPresence,
  UNSTABLE_AFTER_MS,
  presenceChanged,
  type ParticipantPresence,
} from './room-presence.js';

const room = 'room-1';
const javier = {
  identityId: 'id-javier',
  displayName: 'Javier',
  joinedAt: new Date('2026-01-01T10:00:00Z'),
};
const marta = {
  identityId: 'id-marta',
  displayName: 'Marta',
  joinedAt: new Date('2026-01-01T10:01:00Z'),
};
const start = new Date('2026-01-01T10:02:00Z');

function at(msFromStart: number): Date {
  return new Date(start.getTime() + msFromStart);
}

describe('RoomPresence heartbeats', () => {
  function withBoth() {
    const presence = new RoomPresence<string>();
    presence.enter(room, javier.identityId, javier, 'javier-tab', start);
    presence.enter(room, javier.identityId, marta, 'marta-tab', start);
    return presence;
  }

  it('counts everyone as connected while their heartbeats are recent', () => {
    const presence = withBoth();

    expect(presence.following(room, 0, at(UNSTABLE_AFTER_MS - 1))).toEqual([
      {
        identityId: javier.identityId,
        presence: 'connected',
        latencyMs: null,
        inSync: true,
      },
      {
        identityId: marta.identityId,
        presence: 'connected',
        latencyMs: null,
        inSync: true,
      },
    ]);
  });

  it('marks a Participant unstable once their heartbeats are late, and away past 30 s', () => {
    const presence = withBoth();
    presence.beat('javier-tab', {
      at: at(AWAY_AFTER_MS),
      latencyMs: 42,
      revision: 3,
    });

    const following = presence.following(room, 3, at(AWAY_AFTER_MS + 1_000));

    expect(following).toEqual([
      {
        identityId: javier.identityId,
        presence: 'connected',
        latencyMs: 42,
        inSync: true,
      },
      {
        identityId: marta.identityId,
        presence: 'away',
        latencyMs: null,
        inSync: false,
      },
    ]);
  });

  it('is unstable between the two thresholds', () => {
    const presence = withBoth();

    const following = presence.following(room, 0, at(UNSTABLE_AFTER_MS));

    expect(following.map((one) => one.presence)).toEqual([
      'unstable',
      'unstable',
    ]);
  });

  it('reports a Participant behind the Room as out of sync, whatever their latency', () => {
    const presence = withBoth();
    presence.beat('javier-tab', { at: at(0), latencyMs: 12, revision: 7 });
    presence.beat('marta-tab', { at: at(0), latencyMs: 12, revision: 6 });

    const following = presence.following(room, 7, at(0));

    expect(following.map((one) => one.inSync)).toEqual([true, false]);
  });

  it('follows a Participant by their liveliest tab', () => {
    const presence = withBoth();
    presence.enter(room, javier.identityId, javier, 'javier-second-tab', start);
    presence.beat('javier-tab', { at: at(0), latencyMs: 90, revision: 1 });
    presence.beat('javier-second-tab', {
      at: at(1_000),
      latencyMs: 30,
      revision: 4,
    });

    const [javierPresence] = presence.following(room, 4, at(1_000));

    expect(javierPresence).toEqual({
      identityId: javier.identityId,
      presence: 'connected',
      latencyMs: 30,
      inSync: true,
    });
  });

  it('lets a tab that is keeping up speak for one left behind', () => {
    const presence = withBoth();
    presence.enter(room, javier.identityId, javier, 'javier-second-tab', start);
    // An old tab, still open and still beating, sitting on a stale revision.
    presence.beat('javier-tab', { at: at(2_000), latencyMs: 300, revision: 2 });
    presence.beat('javier-second-tab', {
      at: at(1_000),
      latencyMs: 25,
      revision: 9,
    });

    const [javierPresence] = presence.following(room, 9, at(2_000));

    expect(javierPresence).toEqual({
      identityId: javier.identityId,
      presence: 'connected',
      latencyMs: 25,
      inSync: true,
    });
  });

  it('ignores a heartbeat from a connection that is in no Room', () => {
    const presence = withBoth();

    expect(
      presence.beat('a-stray-socket', { at: at(0), latencyMs: 5, revision: 1 }),
    ).toBe(false);
    expect(
      presence.beat('javier-tab', { at: at(0), latencyMs: 5, revision: 1 }),
    ).toBe(true);
  });

  it('has nothing to report about a Room nobody is in', () => {
    expect(
      new RoomPresence<string>().following('room-empty', 0, start),
    ).toEqual([]);
  });
});

describe('RoomPresence.applied', () => {
  it('brings a connection up to date without forgetting its latency', () => {
    const presence = new RoomPresence<string>();
    presence.enter(room, javier.identityId, javier, 'javier-tab', start);
    presence.beat('javier-tab', { at: at(0), latencyMs: 42, revision: 2 });

    presence.applied('javier-tab', 9, at(1_000));

    expect(presence.following(room, 9, at(1_000))).toEqual([
      {
        identityId: javier.identityId,
        presence: 'connected',
        latencyMs: 42,
        inSync: true,
      },
    ]);
  });

  it('says nothing of a connection that is in no Room', () => {
    expect(new RoomPresence<string>().applied('a-stray-socket', 1, start)).toBe(
      false,
    );
  });
});

describe('presenceChanged', () => {
  const following: ParticipantPresence[] = [
    {
      identityId: javier.identityId,
      presence: 'connected',
      latencyMs: 40,
      inSync: true,
    },
  ];
  const and = (change: Partial<ParticipantPresence>) => [
    { ...following[0], ...change },
  ];

  it('is worth telling the Room when nothing has been told yet', () => {
    expect(presenceChanged(undefined, following)).toBe(true);
  });

  it('is not worth telling the Room about the very same picture', () => {
    expect(presenceChanged(following, [...following])).toBe(false);
  });

  it('is worth telling the Room when someone arrives or leaves', () => {
    expect(presenceChanged(following, [])).toBe(true);
    expect(
      presenceChanged(following, [
        ...following,
        { ...following[0], identityId: marta.identityId },
      ]),
    ).toBe(true);
  });

  it('is worth telling the Room when a presence or a sync state moves', () => {
    expect(presenceChanged(following, and({ presence: 'unstable' }))).toBe(
      true,
    );
    expect(presenceChanged(following, and({ inSync: false }))).toBe(true);
  });

  it('lets a latency jitter, and travels once it has really shifted', () => {
    expect(
      presenceChanged(following, and({ latencyMs: 40 + LATENCY_STEP_MS - 1 })),
    ).toBe(false);
    expect(
      presenceChanged(following, and({ latencyMs: 40 + LATENCY_STEP_MS })),
    ).toBe(true);
    expect(presenceChanged(following, and({ latencyMs: null }))).toBe(true);
  });
});
