import request from 'supertest';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';

interface Participant {
  identityId: string;
  displayName: string;
  role: 'master' | 'guest';
}

interface Snapshot {
  room: { code: string; name: string };
  you: string;
  participants: Participant[];
  queue: unknown[];
  playback: unknown;
  revision: number;
  presence: {
    identityId: string;
    presence: string;
    latencyMs: number | null;
    inSync: boolean;
  }[];
}

describe('Joining a Room over the WebSocket (e2e)', () => {
  let running: RunningApp;
  const clients: RoomClient[] = [];

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await running.close();
  });

  async function issueIdentity(): Promise<{ token: string; id: string }> {
    const res = await request(running.httpServer).post('/api/identities');
    return { token: res.body.token, id: res.body.identity.id };
  }

  async function createRoom(token: string, displayName: string) {
    const res = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Martes NL50', displayName });
    return res.body as { code: string; name: string };
  }

  async function connect(token?: string): Promise<RoomClient> {
    const client = await RoomClient.connect(running.wsUrl, token);
    clients.push(client);
    return client;
  }

  it('gives the creator a snapshot of their Room: Master, alone, with an empty Queue', async () => {
    const master = await issueIdentity();
    const room = await createRoom(master.token, 'Javier');
    const socket = await connect(master.token);

    socket.send('room.join', { code: room.code, displayName: 'Javier' });
    const snapshot = await socket.next<Snapshot>('room.snapshot');

    expect(snapshot).toEqual({
      room: { code: room.code, name: 'Martes NL50' },
      you: master.id,
      participants: [
        { identityId: master.id, displayName: 'Javier', role: 'master' },
      ],
      queue: [],
      playback: null,
      // Their own arrival is the Room's first change.
      revision: 1,
      presence: [
        {
          identityId: master.id,
          presence: 'connected',
          latencyMs: null,
          inSync: true,
        },
      ],
    });
  });

  it('lets two clients join the same Room and see each other appear and leave', async () => {
    const master = await issueIdentity();
    const guest = await issueIdentity();
    const room = await createRoom(master.token, 'Javier');
    const masterSocket = await connect(master.token);
    masterSocket.send('room.join', { code: room.code, displayName: 'Javier' });
    await masterSocket.next('room.snapshot');

    const guestSocket = await connect(guest.token);
    const typed =
      `${room.code.slice(0, 4)}-${room.code.slice(4)}`.toLowerCase();
    guestSocket.send('room.join', { code: typed, displayName: 'Marta' });

    const guestView = await guestSocket.next<Snapshot>('room.snapshot');
    expect(guestView.you).toBe(guest.id);
    expect(guestView.participants).toEqual([
      { identityId: master.id, displayName: 'Javier', role: 'master' },
      { identityId: guest.id, displayName: 'Marta', role: 'guest' },
    ]);
    expect(await masterSocket.next('room.participantJoined')).toEqual({
      participant: {
        identityId: guest.id,
        displayName: 'Marta',
        role: 'guest',
      },
    });

    guestSocket.send('room.leave');
    expect(await masterSocket.next('room.participantLeft')).toEqual({
      identityId: guest.id,
    });

    guestSocket.send('room.join', { code: room.code, displayName: 'Marta' });
    await guestSocket.next('room.snapshot');
    await masterSocket.next('room.participantJoined');

    await masterSocket.close();
    expect(await guestSocket.next('room.participantLeft')).toEqual({
      identityId: master.id,
    });
  });

  it('keeps a Participant present while any of their tabs is still in the Room', async () => {
    const master = await issueIdentity();
    const guest = await issueIdentity();
    const room = await createRoom(master.token, 'Javier');
    const masterSocket = await connect(master.token);
    masterSocket.send('room.join', { code: room.code, displayName: 'Javier' });
    await masterSocket.next('room.snapshot');

    const firstTab = await connect(guest.token);
    const secondTab = await connect(guest.token);
    for (const tab of [firstTab, secondTab]) {
      tab.send('room.join', { code: room.code, displayName: 'Marta' });
      await tab.next('room.snapshot');
    }
    await masterSocket.next('room.participantJoined');

    await firstTab.close();
    secondTab.send('room.leave');
    await masterSocket.next('room.participantLeft');

    expect(masterSocket.all('room.participantJoined')).toEqual([]);
    expect(masterSocket.all('room.participantLeft')).toEqual([]);
  });

  it('remembers the Display Name a Guest joined with, for next time', async () => {
    const master = await issueIdentity();
    const guest = await issueIdentity();
    const room = await createRoom(master.token, 'Javier');
    const guestSocket = await connect(guest.token);

    guestSocket.send('room.join', { code: room.code, displayName: ' Marta ' });
    await guestSocket.next('room.snapshot');

    const me = await request(running.httpServer)
      .get('/api/identities/me')
      .set('Authorization', `Bearer ${guest.token}`);
    expect(me.body.displayName).toBe('Marta');
  });

  it('rejects joining an unknown Room with a typed reason', async () => {
    const guest = await issueIdentity();
    const socket = await connect(guest.token);

    socket.send('room.join', { code: 'ZZZZ-ZZZZ', displayName: 'Marta' });

    expect(await socket.next('rejected')).toEqual({
      command: 'room.join',
      reason: 'room-not-found',
    });
  });

  it('rejects joining with a blank Display Name', async () => {
    const master = await issueIdentity();
    const room = await createRoom(master.token, 'Javier');
    const socket = await connect(master.token);

    socket.send('room.join', { code: room.code, displayName: '' });

    expect(await socket.next('rejected')).toEqual({
      command: 'room.join',
      reason: 'invalid-display-name',
    });
  });

  it('rejects a malformed join with a typed reason instead of failing silently', async () => {
    const guest = await issueIdentity();
    const socket = await connect(guest.token);

    socket.send('room.join', null);

    expect(await socket.next('rejected')).toEqual({
      command: 'room.join',
      reason: 'room-not-found',
    });
  });

  it('rejects commands from a socket without a valid identity', async () => {
    const master = await issueIdentity();
    const room = await createRoom(master.token, 'Javier');

    for (const socket of [await connect(), await connect('forged-token')]) {
      socket.send('room.join', { code: room.code, displayName: 'Mallory' });
      expect(await socket.next('rejected')).toEqual({
        command: 'room.join',
        reason: 'unauthenticated',
      });
    }
  });

  it('rejects leaving when not in a Room', async () => {
    const guest = await issueIdentity();
    const socket = await connect(guest.token);

    socket.send('room.leave');

    expect(await socket.next('rejected')).toEqual({
      command: 'room.leave',
      reason: 'not-in-room',
    });
  });
});
