# Concord

Aplicativo desktop multiplataforma (Windows + Linux) de comunicação em tempo real com **um servidor fixo**, canais de texto/voz, arquivos, WebRTC P2P e compartilhamento de tela.

## Stack

- **Desktop:** Electron + React + TypeScript + Vite
- **API:** NestJS + Prisma + PostgreSQL
- **Realtime:** WebSocket (`/ws`)
- **Arquivos:** MinIO (S3) + URLs assinadas (máx. 500 MB) — `STORAGE_DRIVER=s3`
- **WebRTC:** P2P + coturn (STUN/TURN)
- **Auth:** cadastro com e-mail/senha, verificação por código e convite obrigatório

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

O seed **apaga todos os dados** e recria: admin **VictorCRF** (`victorhugomourabarreto1@gmail.com` / `concord123`), servidor **Concord**, canais `#geral` (texto) e `voz` (voz), mais um `inviteCode`. Só rode quando quiser zerar o banco (`RUN_SEED=1` na VPS ou `pnpm --filter @concord/api exec tsx prisma/seed.ts`).

## Desenvolvimento

```bash
pnpm dev:api      # API em :3000
pnpm dev:desktop # Electron + Vite :5173
```

Health: `GET http://localhost:3000/health`

### Login e cadastro

1. Configure SMTP no `.env` (veja `.env.example`).
2. Na tela do app: aba **Cadastrar** → preencha usuário, e-mail, senha, convite → **Enviar código** → informe o código recebido por e-mail → **Criar conta**.
3. Login existente: aba **Entrar** com e-mail e senha.

Exemplo (admin do seed):

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"victorhugomourabarreto1@gmail.com","password":"concord123"}'
```

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
