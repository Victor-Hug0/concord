import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({ path: '/ws' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private realtime: RealtimeService,
    private jwt: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: WebSocket, req: IncomingMessage) {
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) {
        client.close(4401, 'token required');
        return;
      }
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        client.close(4401, 'invalid user');
        return;
      }
      this.realtime.addClient(client, {
        userId: user.id,
        displayName: user.displayName,
      });
      client.send(
        JSON.stringify({
          event: 'connected',
          payload: { userId: user.id },
        }),
      );
    } catch (err) {
      this.logger.warn(`WS auth failed: ${(err as Error).message}`);
      client.close(4401, 'unauthorized');
    }
  }

  handleDisconnect(client: WebSocket) {
    this.realtime.removeClient(client);
  }

  @SubscribeMessage('voice:join')
  onVoiceJoin(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() body: { channelId: string },
  ) {
    const meta = this.realtime.getMeta(client);
    if (!meta || !body?.channelId) return;
    if (this.realtime.voiceMembers(body.channelId).length >= 10) {
      client.send(
        JSON.stringify({
          event: 'error',
          payload: { message: 'Canal de voz cheio (máx. 10)' },
        }),
      );
      return;
    }
    if (meta.voiceChannelId && meta.voiceChannelId !== body.channelId) {
      this.realtime.broadcast('voice:left', {
        userId: meta.userId,
        channelId: meta.voiceChannelId,
      });
    }
    this.realtime.updateMeta(client, { voiceChannelId: body.channelId });
    this.realtime.broadcast('voice:joined', {
      userId: meta.userId,
      displayName: meta.displayName,
      channelId: body.channelId,
      muted: !!meta.muted,
    });
    this.realtime.broadcastPresence();
    client.send(
      JSON.stringify({
        event: 'voice:peers',
        payload: {
          channelId: body.channelId,
          peers: this.realtime
            .voiceMembers(body.channelId)
            .filter((p) => p.userId !== meta.userId)
            .map((p) => ({
              userId: p.userId,
              displayName: p.displayName,
              muted: !!p.muted,
              screensharing: !!p.screensharing,
            })),
        },
      }),
    );
  }

  @SubscribeMessage('voice:leave')
  onVoiceLeave(@ConnectedSocket() client: WebSocket) {
    const meta = this.realtime.getMeta(client);
    if (!meta?.voiceChannelId) return;
    const channelId = meta.voiceChannelId;
    this.realtime.updateMeta(client, {
      voiceChannelId: undefined,
      screensharing: false,
    });
    this.realtime.broadcast('voice:left', { userId: meta.userId, channelId });
    this.realtime.broadcastPresence();
  }

  @SubscribeMessage('voice:mute')
  onMute(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() body: { muted: boolean },
  ) {
    const meta = this.realtime.getMeta(client);
    if (!meta) return;
    this.realtime.updateMeta(client, { muted: !!body?.muted });
    if (meta.voiceChannelId) {
      this.realtime.broadcast('voice:mute', {
        userId: meta.userId,
        channelId: meta.voiceChannelId,
        muted: !!body?.muted,
      });
    }
    this.realtime.broadcastPresence();
  }

  @SubscribeMessage('webrtc:signal')
  onSignal(
    @ConnectedSocket() client: WebSocket,
    @MessageBody()
    body: { targetUserId: string; data: unknown },
  ) {
    const meta = this.realtime.getMeta(client);
    if (!meta || !body?.targetUserId) return;
    this.realtime.sendToUser(body.targetUserId, 'webrtc:signal', {
      fromUserId: meta.userId,
      data: body.data,
    });
  }

  @SubscribeMessage('screenshare:started')
  onShareStart(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() body: { quality?: string },
  ) {
    const meta = this.realtime.getMeta(client);
    if (!meta?.voiceChannelId) return;
    this.realtime.updateMeta(client, { screensharing: true });
    this.realtime.broadcast('screenshare:started', {
      userId: meta.userId,
      displayName: meta.displayName,
      channelId: meta.voiceChannelId,
      quality: body?.quality ?? '720p',
    });
    this.realtime.broadcastPresence();
  }

  @SubscribeMessage('screenshare:stopped')
  onShareStop(@ConnectedSocket() client: WebSocket) {
    const meta = this.realtime.getMeta(client);
    if (!meta?.voiceChannelId) return;
    this.realtime.updateMeta(client, { screensharing: false });
    this.realtime.broadcast('screenshare:stopped', {
      userId: meta.userId,
      channelId: meta.voiceChannelId,
    });
    this.realtime.broadcastPresence();
  }
}
