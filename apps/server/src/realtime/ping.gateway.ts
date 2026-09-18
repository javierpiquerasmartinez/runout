import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type WsResponse,
} from '@nestjs/websockets';

export interface PingPayload {
  sentAt: number;
}

export interface PongPayload {
  sentAt: number;
  serverTime: number;
}

/**
 * Minimal round-trip over WebSocket. The client echoes its own timestamp so
 * it can measure latency without trusting the server clock.
 */
@WebSocketGateway({ path: '/ws' })
export class PingGateway {
  @SubscribeMessage('ping')
  handlePing(@MessageBody() payload: PingPayload): WsResponse<PongPayload> {
    return {
      event: 'pong',
      data: { sentAt: payload.sentAt, serverTime: Date.now() },
    };
  }
}
