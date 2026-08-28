import { createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

type GoogleProfile = {
  googleSub: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  inviteCode: string;
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async loginWithGoogle(profile: GoogleProfile) {
    if (!profile.email || !profile.googleSub) {
      throw new BadRequestException('Perfil Google incompleto');
    }

    let user = await this.prisma.user.findUnique({
      where: { googleSub: profile.googleSub },
    });

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });
      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleSub: profile.googleSub,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
        });
      } else {
        await this.consumeInvite(profile.inviteCode);
        const bootstrap = this.config.get<string>('BOOTSTRAP_ADMIN_EMAIL');
        const isFirst = (await this.prisma.user.count()) === 0;
        const role =
          isFirst || (bootstrap && bootstrap.toLowerCase() === profile.email.toLowerCase())
            ? 'admin'
            : 'member';

        user = await this.prisma.user.create({
          data: {
            googleSub: profile.googleSub,
            email: profile.email,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            role,
          },
        });
      }
    }

    return this.issueTokens(user.id, user.email);
  }

  private async consumeInvite(code: string) {
    if (!code?.trim()) {
      throw new BadRequestException('Código de convite obrigatório para novos usuários');
    }
    const invite = await this.prisma.invite.findUnique({ where: { code: code.trim() } });
    if (!invite || invite.revokedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException('Convite inválido ou expirado');
    }
    if (invite.uses >= invite.maxUses) {
      throw new BadRequestException('Convite esgotado');
    }
    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { uses: { increment: 1 } },
    });
  }

  async issueTokens(userId: string, email: string, userAgent?: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as `${number}m`,
      },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const refreshTtl = this.config.get('JWT_REFRESH_TTL', '30d');
    const expiresAt = this.parseTtlDate(refreshTtl);

    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt,
        userAgent,
      },
    });

    return { accessToken, refreshToken, expiresAt };
  }

  private parseTtlDate(ttl: string): Date {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
    const n = Number(match[1]);
    const unit = match[2];
    const ms =
      unit === 's'
        ? n * 1000
        : unit === 'm'
          ? n * 60_000
          : unit === 'h'
            ? n * 3_600_000
            : n * 86_400_000;
    return new Date(Date.now() + ms);
  }

  async refresh(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    const session = await this.prisma.session.findFirst({
      where: { refreshTokenHash: hash, revokedAt: null },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Sessão inválida');
    }
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(session.user.id, session.user.email);
  }

  async logout(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  /** Dev-only login when Google OAuth is not configured */
  async devLogin(inviteCode: string, email: string, displayName: string) {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new BadRequestException('Dev login desabilitado em produção');
    }
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await this.consumeInvite(inviteCode);
      const isFirst = (await this.prisma.user.count()) === 0;
      user = await this.prisma.user.create({
        data: {
          googleSub: `dev-${email}`,
          email,
          displayName,
          role: isFirst ? 'admin' : 'member',
        },
      });
    }
    return this.issueTokens(user.id, user.email);
  }
}
