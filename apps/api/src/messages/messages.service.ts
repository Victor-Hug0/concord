import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelsService } from '../channels/channels.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private channels: ChannelsService,
    private realtime: RealtimeService,
  ) {}

  async list(
    channelId: string,
    opts: { before?: string; limit?: number; parentId?: string | null; q?: string },
    viewerId: string,
  ) {
    await this.channels.getOrThrow(channelId);
    const limit = Math.min(opts.limit ?? 50, 100);
    const where: Record<string, unknown> = {
      channelId,
      deletedAt: null,
    };
    if (opts.parentId === undefined) {
      where.parentId = null;
    } else if (opts.parentId) {
      where.parentId = opts.parentId;
    }
    if (opts.q?.trim()) {
      where.body = { contains: opts.q.trim(), mode: 'insensitive' };
    }
    if (opts.before) {
      where.createdAt = { lt: new Date(opts.before) };
    }

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        author: true,
        attachments: true,
        reactions: true,
      },
    });

    return rows.reverse().map((m) => this.serialize(m, viewerId));
  }

  async create(
    channelId: string,
    authorId: string,
    body: string,
    parentId?: string,
    mentionUserIds: string[] = [],
  ) {
    const channel = await this.channels.getOrThrow(channelId);
    if (channel.type !== 'text') {
      throw new ForbiddenException('Mensagens apenas em canais de texto');
    }
    if (parentId) {
      const parent = await this.prisma.message.findUnique({ where: { id: parentId } });
      if (!parent || parent.channelId !== channelId) {
        throw new NotFoundException('Thread pai inválida');
      }
    }
    const mentions = this.extractMentions(body, mentionUserIds);
    const message = await this.prisma.message.create({
      data: {
        channelId,
        authorId,
        body,
        parentId: parentId ?? null,
        mentionUserIds: mentions,
      },
      include: { author: true, attachments: true, reactions: true },
    });
    const payload = this.serialize(message, authorId);
    this.realtime.broadcast('message:new', payload);
    return payload;
  }

  async update(id: string, userId: string, body: string) {
    const existing = await this.prisma.message.findUnique({
      where: { id },
      include: { author: true, attachments: true, reactions: true },
    });
    if (!existing || existing.deletedAt) throw new NotFoundException('Mensagem não encontrada');
    if (existing.authorId !== userId) throw new ForbiddenException('Só o autor pode editar');
    const message = await this.prisma.message.update({
      where: { id },
      data: {
        body,
        editedAt: new Date(),
        mentionUserIds: this.extractMentions(body, []),
      },
      include: { author: true, attachments: true, reactions: true },
    });
    const payload = this.serialize(message, userId);
    this.realtime.broadcast('message:updated', payload);
    return payload;
  }

  async softDelete(id: string, userId: string, role: 'admin' | 'member') {
    const existing = await this.prisma.message.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Mensagem não encontrada');
    if (existing.authorId !== userId && role !== 'admin') {
      throw new ForbiddenException('Sem permissão para excluir');
    }
    const message = await this.prisma.message.update({
      where: { id },
      data: { deletedAt: new Date(), body: '' },
      include: { author: true, attachments: true, reactions: true },
    });
    const payload = this.serialize(message, userId);
    this.realtime.broadcast('message:deleted', payload);
    return payload;
  }

  async toggleReaction(messageId: string, userId: string, emoji: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Mensagem não encontrada');
    const existing = await this.prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji },
      },
    });
    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.reaction.create({ data: { messageId, userId, emoji } });
    }
    const full = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: { author: true, attachments: true, reactions: true },
    });
    const payload = this.serialize(full, userId);
    this.realtime.broadcast('reaction:updated', payload);
    return payload;
  }

  private extractMentions(body: string, extra: string[]) {
    const ids = new Set(extra);
    const re = /@\[([0-9a-f-]{36})\]/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      ids.add(m[1]);
    }
    return [...ids];
  }

  serialize(
    m: {
      id: string;
      channelId: string;
      authorId: string;
      body: string;
      parentId: string | null;
      mentionUserIds: string[];
      editedAt: Date | null;
      deletedAt: Date | null;
      createdAt: Date;
      author: { displayName: string };
      attachments: Array<{
        id: string;
        messageId: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        authorId: string;
        createdAt: Date;
      }>;
      reactions: Array<{ emoji: string; userId: string }>;
    },
    viewerId: string,
  ) {
    const reactionMap = new Map<string, { count: number; me: boolean }>();
    for (const r of m.reactions) {
      const cur = reactionMap.get(r.emoji) ?? { count: 0, me: false };
      cur.count += 1;
      if (r.userId === viewerId) cur.me = true;
      reactionMap.set(r.emoji, cur);
    }
    return {
      id: m.id,
      channelId: m.channelId,
      authorId: m.authorId,
      authorDisplayName: m.author.displayName,
      body: m.deletedAt ? '' : m.body,
      parentId: m.parentId,
      editedAt: m.editedAt?.toISOString() ?? null,
      deletedAt: m.deletedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      mentionUserIds: m.mentionUserIds,
      attachments: m.attachments.map((a) => ({
        id: a.id,
        messageId: a.messageId,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        authorId: a.authorId,
        createdAt: a.createdAt.toISOString(),
      })),
      reactions: [...reactionMap.entries()].map(([emoji, v]) => ({
        emoji,
        count: v.count,
        me: v.me,
      })),
    };
  }
}
