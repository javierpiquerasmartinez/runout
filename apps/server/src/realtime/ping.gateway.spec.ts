import { PingGateway } from './ping.gateway.js';

describe('PingGateway', () => {
  it('answers ping with pong echoing the client timestamp', () => {
    const reply = new PingGateway().handlePing({ sentAt: 1234 });

    expect(reply.event).toBe('pong');
    expect(reply.data.sentAt).toBe(1234);
    expect(reply.data.serverTime).toBeGreaterThan(0);
  });
});
