# Concord

Aplicativo desktop multiplataforma (Windows + Linux) de comunicação em tempo real com **um servidor fixo**, canais de texto/voz, arquivos, WebRTC P2P e compartilhamento de tela.

## Stack

- **Desktop:** Electron + React + TypeScript + Vite
- **API:** NestJS + Prisma + PostgreSQL
- **Realtime:** WebSocket (`/ws`)
- **Arquivos:** MinIO (S3) + URLs assinadas (máx. 500 MB) — `STORAGE_DRIVER=s3`
- **WebRTC:** P2P + coturn (STUN/TURN)
- **Auth:** Google OAuth + código de convite (login de desenvolvimento para local)

## Pré-requisitos

- Node.js 20+
- pnpm 9 (`npx pnpm`, `node tools/node_modules/pnpm/bin/pnpm.cjs`, ou `./tools/node_modules/.bin/pnpm`)
- Docker + Docker Compose (daemon real; `unset DOCKER_HOST` se o socket embutido não existir)

## Banco e storage locais (somente Docker Compose)

**Docker Compose é o único suporte oficial para Postgres e MinIO em desenvolvimento.** Não use embedded Postgres, `pnpm dev:db`, nem outros Postgres locais.

Serviços em `infra/docker/docker-compose.yml`:

| Serviço | Porta | Uso |
|---------|-------|-----|
| Postgres 16 | `5432` | `DATABASE_URL=postgresql://concord:concord@localhost:5432/concord?schema=public` |
| MinIO | `9000` (API), `9001` (console) | anexos com `STORAGE_DRIVER=s3` |

Variáveis de storage (veja `.env.example`):

```bash
STORAGE_DRIVER=s3
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=concord
S3_SECRET_KEY=concordsecret
S3_BUCKET=concord-attachments
S3_REGION=us-east-1
S3_PUBLIC_URL=http://localhost:9000
```

### Setup rápido (recomendado)

No terminal onde `docker ps` funciona:

```bash
cp .env.example .env
cp .env apps/api/.env
bash scripts/setup-from-docker.sh
# ou: pnpm setup
```

O script sobe Compose, espera o Postgres, instala deps, builds `@concord/shared`, roda `prisma migrate deploy` e o seed.

### Setup manual

```bash
unset DOCKER_HOST
cp .env.example .env && cp .env apps/api/.env
pnpm docker:up
# opcional TURN: docker compose -f infra/docker/docker-compose.yml --profile turn up -d

export PATH="$PWD/tools/node_modules/.bin:$PATH"
pnpm install
pnpm --filter @concord/shared build
pnpm --filter @concord/api exec prisma generate
pnpm --filter @concord/api exec prisma migrate deploy
pnpm --filter @concord/api exec tsx prisma/seed.ts
```

### Seed e código de convite

O seed cria o admin `admin@concord.local` e imprime JSON com o **`inviteCode`** (ex.: `{"adminEmail":"...","inviteCode":"…","serverId":"…"}`). Guarde esse código: usuários novos (e o login de desenvolvimento) precisam dele.

Re-rodar o seed no mesmo banco pode reutilizar/atualizar dados; o `inviteCode` impresso na última execução é o que vale para o login local.

## Desenvolvimento

```bash
pnpm dev:api      # API em :3000
pnpm dev:desktop # Electron + Vite :5173
```

Health: `GET http://localhost:3000/health`

### Login local (sem Google)

1. Use o `inviteCode` do seed (obrigatório no body de `POST /auth/dev-login`) e o e-mail `admin@concord.local` (já existe) **ou** outro e-mail + o mesmo convite para criar usuário.
2. Na tela de login, preencha convite + e-mail/nome e clique em **Login de desenvolvimento**.

Exemplo:

```bash
curl -s -X POST http://localhost:3000/auth/dev-login \
  -H 'Content-Type: application/json' \
  -d '{"inviteCode":"<do seed>","email":"admin@concord.local","displayName":"Admin"}'
```

### Google OAuth

Configure no `.env`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback`
- URI de redirecionamento no GCP + esquema `concord://auth/callback` no app

## Testes

```bash
pnpm --filter @concord/shared build
pnpm --filter @concord/api test
pnpm --filter @concord/desktop test
```

## Empacotamento

```bash
pnpm --filter @concord/desktop pack:linux   # AppImage + .deb
pnpm --filter @concord/desktop pack:win     # NSIS (em host Windows ou wine)
pnpm --filter @concord/desktop release      # build + publish (GH_TOKEN)
```

Auto-update: [docs/auto-update.md](docs/auto-update.md) (`electron-updater` + GitHub Releases ou `UPDATE_FEED_URL`).

## Produção (Docker Compose)

Stack completo na VPS (Caddy + API + Postgres + MinIO + coturn):

```bash
cp infra/docker/.env.production.example infra/docker/.env.production
# edite DOMAIN, senhas, JWT, Google, TURN — primeira vez: RUN_SEED=1
pnpm docker:prod:up
```

Detalhes: [docs/operations.md](docs/operations.md) e [docs/publishing.md](docs/publishing.md).

## Documentação adicional

- [docs/development.md](docs/development.md)
- [docs/security.md](docs/security.md)
- [docs/webrtc.md](docs/webrtc.md)
- [docs/operations.md](docs/operations.md)
- [docs/publishing.md](docs/publishing.md) — **passo a passo para publicar**
- [docs/auto-update.md](docs/auto-update.md)
