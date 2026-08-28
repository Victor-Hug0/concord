import { createHmac } from 'crypto';
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IceServerConfig } from '@concord/shared';

@Controller('turn')
export class TurnController {
  constructor(private config: ConfigService) {}

  @Get('credentials')
  credentials(): { iceServers: IceServerConfig[] } {
    const stun = this.config.get('STUN_URLS', 'stun:localhost:3478');
    const turn = this.config.get('TURN_URLS', 'turn:localhost:3478');
    const secret = this.config.get('TURN_SECRET', 'concord-turn-secret');
    const ttl = 24 * 3600;
    const username = `${Math.floor(Date.now() / 1000) + ttl}:concord`;
    const credential = createHmac('sha1', secret).update(username).digest('base64');

    return {
      iceServers: [
        { urls: stun },
        { urls: turn, username, credential },
      ],
    };
  }
}
