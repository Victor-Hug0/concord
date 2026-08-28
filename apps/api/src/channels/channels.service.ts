import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServersService } from '../servers/servers.service';

@Injectable()
export class ChannelsService {
  constructor(
    private prisma: PrismaService,
    private servers: ServersService,
  ) {}

  async list() {
    const server = await this.servers.getSingleton();
    return server.channels;
  }

  async create(name: string, type: ChannelType, userId: string) {
    const server = await this.servers.ensureSeed();
    const max = await this.prisma.channel.aggregate({
      where: { serverId: server.id },
      _max: { position: true },
    });
    try {
      const channel = await this.prisma.channel.create({
        data: {
          serverId: server.id,
          name: name.trim(),
          type,
          position: (max._max.position ?? -1) + 1,
          createdBy: userId,
        },
      });
      return this.serialize(channel);
    } catch {
      throw new BadRequestException('Nome de canal já existe');
    }
  }

  async update(id: string, data: { name?: string; position?: number }) {
    const existing = await this.prisma.channel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Canal não encontrado');
    const channel = await this.prisma.channel.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        position: data.position,
      },
    });
    return this.serialize(channel);
  }

  async remove(id: string) {
    const existing = await this.prisma.channel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Canal não encontrado');
    await this.prisma.channel.delete({ where: { id } });
    return { ok: true };
  }

  async getOrThrow(id: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id } });
    if (!channel) throw new NotFoundException('Canal não encontrado');
    return channel;
  }

  private serialize(c: {
    id: string;
    name: string;
    type: ChannelType;
    position: number;
    createdAt: Date;
  }) {
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      position: c.position,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
