# Desenvolvimento — Concord

## Estrutura

```
apps/api       NestJS API + Prisma + WS
apps/desktop   Electron + React
packages/shared  Tipos e contratos compartilhados
infra/docker   Postgres, MinIO, coturn; prod: API + Caddy (`docker-compose.prod.yml`)
```

## Variáveis

Copie `.env.example` → `.env` e `apps/api/.env`.

No desktop, opcional: `apps/desktop/.env` com `VITE_API_URL=http://localhost:3000`.

## Banco local

Somente **Docker Compose** (`pnpm docker:up` / `scripts/setup-from-docker.sh`). Não há suporte a embedded Postgres nem `pnpm dev:db`. Storage: `STORAGE_DRIVER=s3` apontando para MinIO.

## Fluxo manual rápido

1. `pnpm docker:up`
2. migrate + seed
3. `pnpm dev:api` e `pnpm dev:desktop`
4. Login de desenvolvimento com admin seed
5. Abrir `#geral`, enviar mensagem, anexar arquivo
6. Entrar em canal de voz com dois clientes (dois usuários)

## Qualidade de tela (proposta fase 7)

| Preset | Resolução | FPS | Bitrate máx. |
|--------|-----------|-----|--------------|
| 144p | 256×144 | 15 | 300 kbps |
| 240p | 426×240 | 20 | 500 kbps |
| 360p | 640×360 | 24 | 800 kbps |
| 480p | 854×480 | 24 | 1200 kbps |
| 720p | 1280×720 | 30 | 2500 kbps |
| 1080p | 1920×1080 | 30 | 4500 kbps |

Prioridade: qualidade visual (conforme decisão do produto).
