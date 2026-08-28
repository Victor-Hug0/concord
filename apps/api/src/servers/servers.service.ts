import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_SERVER = 'Concord';
const SEED_CHANNELS: Array<{ name: string; type: 'text' | 'voice'; position: number }> = [
  { name: 'geral', type: 'text', position: 0 },
  { name: 'aleatorio', type: 'text', position: 1 },
  { name: 'Lobby', type: 'voice', position: 2 },
  { name: 'Sala 1', type: 'voice', position: 3 },
];

@Injectable()
export class ServersService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureSeed();
  }

  async ensureSeed() {
    let server = await this.prisma.server.findFirst({ where: { name: DEFAULT_SERVER } });
    if (!server) {
      server = await this.prisma.server.create({ data: { name: DEFAULT_SERVER } });
    }
    const count = await this.prisma.channel.count({ where: { serverId: server.id } });
    if (count === 0) {
      await this.prisma.channel.createMany({
        data: SEED_CHANNELS.map((c) => ({ ...c, serverId: server!.id })),
      });
    }
    return server;
  }

  async getSingleton() {
    const server = await this.ensureSeed();
    const channels = await this.prisma.channel.findMany({
      where: { serverId: server.id },
      orderBy: { position: 'asc' },
    });
    return {
      id: server.id,
      name: server.name,
      createdAt: server.createdAt.toISOString(),
      channels: channels.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}
