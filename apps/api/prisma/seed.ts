import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_ADMIN_EMAIL = 'victorhugomourabarreto1@gmail.com';
const SEED_ADMIN_NAME = 'VictorCRF';
const SEED_ADMIN_PASSWORD = 'concord123';

async function resetDatabase() {
  await prisma.$executeRaw`
    TRUNCATE TABLE
      "Reaction",
      "Attachment",
      "Message",
      "Channel",
      "Invite",
      "Session",
      "EmailVerification",
      "User",
      "Server"
    RESTART IDENTITY CASCADE
  `;
}

async function main() {
  await resetDatabase();

  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);
  const admin = await prisma.user.create({
    data: {
      email: SEED_ADMIN_EMAIL,
      displayName: SEED_ADMIN_NAME,
      passwordHash,
      role: 'admin',
    },
  });

  const server = await prisma.server.create({
    data: { name: 'Concord' },
  });

  await prisma.channel.createMany({
    data: [
      {
        serverId: server.id,
        name: 'geral',
        type: 'text',
        position: 0,
        createdBy: admin.id,
      },
      {
        serverId: server.id,
        name: 'voz',
        type: 'voice',
        position: 1,
        createdBy: admin.id,
      },
    ],
  });

  const invite = await prisma.invite.create({
    data: {
      code: randomBytes(6).toString('hex'),
      createdBy: admin.id,
      maxUses: 50,
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });

  console.log(
    JSON.stringify(
      {
        reset: true,
        adminEmail: admin.email,
        adminDisplayName: admin.displayName,
        adminPassword: SEED_ADMIN_PASSWORD,
        inviteCode: invite.code,
        serverId: server.id,
        channels: ['geral (texto)', 'voz (voz)'],
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
