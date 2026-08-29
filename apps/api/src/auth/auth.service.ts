import { createHash, randomBytes, randomInt } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private verificationTtlMs(): number {
    const minutes = Number(this.config.get('EMAIL_VERIFICATION_TTL_MINUTES', '15'));
    return minutes * 60_000;
  }

  async sendVerificationEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('E-mail obrigatório');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      throw new ConflictException('Este e-mail já está cadastrado');
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + this.verificationTtlMs());

    await this.prisma.emailVerification.updateMany({
      where: { email: normalized, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.prisma.emailVerification.create({
      data: {
        email: normalized,
        tokenHash: this.hashToken(code),
        expiresAt,
      },
    });

    await this.mail.sendVerificationCode(normalized, code);
    return { ok: true, expiresAt };
  }

  private async verifyEmailToken(email: string, token: string) {
    const normalized = email.trim().toLowerCase();
    const record = await this.prisma.emailVerification.findFirst({
      where: {
        email: normalized,
        tokenHash: this.hashToken(token.trim()),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException('Código de verificação inválido ou expirado');
    }

    await this.prisma.emailVerification.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
  }

  async register(
    inviteCode: string,
    email: string,
    password: string,
    displayName: string,
    verificationToken: string,
  ) {
    const normalized = email.trim().toLowerCase();
    const name = displayName.trim();
    if (!name) {
      throw new BadRequestException('Usuário obrigatório');
    }
    if (password.length < 8) {
      throw new BadRequestException('Senha deve ter pelo menos 8 caracteres');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      throw new ConflictException('Este e-mail já está cadastrado');
    }

    await this.verifyEmailToken(normalized, verificationToken);
    await this.consumeInvite(inviteCode);

    const isFirst = (await this.prisma.user.count()) === 0;
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: normalized,
        displayName: name,
        passwordHash,
        role: isFirst ? 'admin' : 'member',
      },
    });

    return this.issueTokens(user.id, user.email);
  }

  async login(email: string, password: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
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
}
