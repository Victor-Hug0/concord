import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  let server = await prisma.server.findFirst({ where: { name: 'Concord' } });
  if (!server) {
    server = await prisma.server.create({ data: { name: 'Concord' } });
  }

  const channelCount = await prisma.channel.count({ where: { serverId: server.id } });
  if (channelCount === 0) {
    await prisma.channel.createMany({
      data: [
        { serverId: server.id, name: 'geral', type: 'text', position: 0 },
        { serverId: server.id, name: 'aleatorio', type: 'text', position: 1 },
        { serverId: server.id, name: 'Lobby', type: 'voice', position: 2 },
        { serverId: server.id, name: 'Sala 1', type: 'voice', position: 3 },
      ],
    });
  }

  let admin = await prisma.user.findUnique({ where: { email: 'admin@concord.local' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        googleSub: 'seed-admin',
        email: 'admin@concord.local',
        displayName: 'Admin',
        role: 'admin',
      },
    });
  }

  let invite = await prisma.invite.findFirst({
    where: {
      revokedAt: null,
      expiresAt: { gt: new Date() },
      createdBy: admin.id,
    },
  });

  if (!invite) {
    invite = await prisma.invite.create({
      data: {
        code: randomBytes(6).toString('hex'),
        createdBy: admin.id,
        maxUses: 50,
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        adminEmail: admin.email,
        inviteCode: invite.code,
        serverId: server.id,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
