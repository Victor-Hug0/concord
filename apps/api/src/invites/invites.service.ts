import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvitesService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async create(userId: string, maxUses = 1, ttlDays?: number) {
    const days = ttlDays ?? Number(this.config.get('INVITE_DEFAULT_TTL_DAYS', 7));
    const code = randomBytes(6).toString('hex');
    const invite = await this.prisma.invite.create({
      data: {
        code,
        createdBy: userId,
        maxUses,
        expiresAt: new Date(Date.now() + days * 86_400_000),
      },
    });
    return this.serialize(invite);
  }

  async list() {
    const invites = await this.prisma.invite.findMany({ orderBy: { createdAt: 'desc' } });
    return invites.map((i) => this.serialize(i));
  }

  async revoke(id: string) {
    const invite = await this.prisma.invite.findUnique({ where: { id } });
    if (!invite) throw new NotFoundException('Convite não encontrado');
    if (invite.revokedAt) throw new BadRequestException('Já revogado');
    const updated = await this.prisma.invite.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return this.serialize(updated);
  }

  /** Bootstrap invite when no users exist yet */
  async ensureBootstrapInvite() {
    const userCount = await this.prisma.user.count();
    if (userCount > 0) return null;
    const existing = await this.prisma.invite.findFirst({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (existing) return this.serialize(existing);

    // Create a system invite without creator — need a placeholder approach:
    // Use raw: create invite after we have no users is hard due to FK.
    // Instead return a generated code stored only in memory is bad.
    // Solution: allow nullable createdBy — but schema requires it.
    // We'll create invite after first admin via seed script.
    return null;
  }

  private serialize(i: {
    id: string;
    code: string;
    expiresAt: Date;
    maxUses: number;
    uses: number;
    revokedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: i.id,
      code: i.code,
      expiresAt: i.expiresAt.toISOString(),
      maxUses: i.maxUses,
      uses: i.uses,
      revokedAt: i.revokedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    };
  }
}
