import { RoomRevisions } from './room-revisions.js';

describe('RoomRevisions', () => {
  it('starts a Room nothing has happened in at 0', () => {
    expect(new RoomRevisions().current('room-1')).toBe(0);
  });

  it('gives each change the next revision, and leaves the Room there', () => {
    const revisions = new RoomRevisions();

    expect(revisions.next('room-1')).toBe(1);
    expect(revisions.next('room-1')).toBe(2);
    expect(revisions.current('room-1')).toBe(2);
  });

  it('counts each Room on its own', () => {
    const revisions = new RoomRevisions();

    revisions.next('room-1');
    revisions.next('room-1');

    expect(revisions.next('room-2')).toBe(1);
    expect(revisions.current('room-1')).toBe(2);
  });

  it('forgets a Room that has closed', () => {
    const revisions = new RoomRevisions();
    revisions.next('room-1');

    revisions.forget('room-1');

    expect(revisions.current('room-1')).toBe(0);
  });
});
