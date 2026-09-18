import { Controller, Get } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  uptimeSeconds: number;
  serverTime: string;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      serverTime: new Date().toISOString(),
    };
  }
}
