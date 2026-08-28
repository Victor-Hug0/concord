# Operações — Concord

## Compose local (dev)

Só infra; API continua com `pnpm`:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
docker compose -f infra/docker/docker-compose.yml --profile turn up -d
```

Serviços: Postgres `:5432`, MinIO `:9000`/console `:9001`, coturn `:3478` (host network).

## Compose de produção (VPS)

Stack: **API + Postgres + MinIO + coturn**. TLS fica no **nginx do host** (portas 80/443).

1. DNS: `concord.televei.dev` e `files.concord.televei.dev` → IP da VPS.
2. Firewall: `80`/`443` (nginx), `3478` tcp/udp, UDP `49152–49200`.
3. Env + `docker compose ... up -d --build` (API em `127.0.0.1:3000`, MinIO em `127.0.0.1:9000`).
4. Nginx: copie `infra/docker/nginx-concord.conf.example` → sites-available, certbot, reload.
5. Seed/invite nos logs da API; `RUN_SEED=0` depois.
6. Health: `curl -s https://concord.televei.dev/health`
7. Desktop: `VITE_API_URL=https://concord.televei.dev`

`Caddyfile.prod` só se a VPS **não** tiver nginx e as portas 80/443 estiverem livres.

Passo a passo completo: [publishing.md](./publishing.md).

## Empacote

- Linux: AppImage + `.deb` via `pnpm --filter @concord/desktop pack:linux`
- Windows: NSIS via `pack:win`
- Release com publish: `pnpm --filter @concord/desktop release` (requer `GH_TOKEN`)

## Auto-update

Ver [auto-update.md](./auto-update.md). Builds empacotadas consultam GitHub Releases (ou `UPDATE_FEED_URL`) e instalam updates sem baixar instalador manualmente.

## Backup

```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.production exec postgres \
  pg_dump -U concord concord > backup.sql
# MinIO: mc mirror ou volume minio_data
```
