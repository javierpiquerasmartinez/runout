import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports ok with the server time', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const health = moduleRef.get(HealthController).check();

    expect(health.status).toBe('ok');
    expect(Number.isNaN(Date.parse(health.serverTime))).toBe(false);
  });
});
