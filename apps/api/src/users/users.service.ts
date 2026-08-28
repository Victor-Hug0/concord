import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.serialize(user);
  }

  async updateProfile(id: string, displayName: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { displayName },
    });
    return this.serialize(user);
  }

  async list() {
    const users = await this.prisma.user.findMany({ orderBy: { displayName: 'asc' } });
    return users.map((u) => this.serialize(u));
  }

  private serialize(user: {
    id: string;
    email: string;
    displayName: string;
    role: 'admin' | 'member';
    avatarUrl: string | null;
    createdAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
