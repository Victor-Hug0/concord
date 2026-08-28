import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';

type ClientMeta = {
  userId: string;
  displayName: string;
  voiceChannelId?: string;
  muted?: boolean;
  screensharing?: boolean;
};

@Injectable()
export class RealtimeService {
  private clients = new Map<WebSocket, ClientMeta>();

  addClient(socket: WebSocket, meta: ClientMeta) {
    this.clients.set(socket, meta);
    this.broadcastPresence();
  }

  removeClient(socket: WebSocket) {
    const meta = this.clients.get(socket);
    this.clients.delete(socket);
    if (meta?.voiceChannelId) {
      this.broadcast('voice:left', {
        userId: meta.userId,
        channelId: meta.voiceChannelId,
      });
    }
    this.broadcastPresence();
  }

  getMeta(socket: WebSocket) {
    return this.clients.get(socket);
  }

  updateMeta(socket: WebSocket, patch: Partial<ClientMeta>) {
    const cur = this.clients.get(socket);
    if (!cur) return;
    this.clients.set(socket, { ...cur, ...patch });
  }

  broadcast(event: string, payload: unknown, except?: WebSocket) {
    const data = JSON.stringify({ event, payload });
    for (const [socket] of this.clients) {
      if (socket !== except && socket.readyState === socket.OPEN) {
        socket.send(data);
      }
    }
  }

  sendToUser(userId: string, event: string, payload: unknown) {
    const data = JSON.stringify({ event, payload });
    for (const [socket, meta] of this.clients) {
      if (meta.userId === userId && socket.readyState === socket.OPEN) {
        socket.send(data);
      }
    }
  }

  broadcastPresence() {
    const online = [...this.clients.values()].map((c) => ({
      userId: c.userId,
      displayName: c.displayName,
      voiceChannelId: c.voiceChannelId ?? null,
      muted: !!c.muted,
      screensharing: !!c.screensharing,
    }));
    this.broadcast('presence:update', { online });
  }

  voiceMembers(channelId: string) {
    return [...this.clients.values()].filter((c) => c.voiceChannelId === channelId);
  }
}
