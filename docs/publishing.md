# Publicar o Concord — passo a passo

Guia completo: servidor (API) + app desktop + auto-update.

Há **duas publicações** independentes:

1. **Backend** — usuários usam a mesma API; você atualiza o servidor sem novo `.exe`
2. **Desktop** — instalador Windows/Linux + updates automáticos depois

---

## Visão geral do checklist

| # | Etapa | Obrigatório? |
|---|--------|----------------|
| 0 | Conta GitHub + domínio | Sim (domínio para API) |
| 1 | VPS / cloud com Docker | Sim |
| 2 | DNS + HTTPS (Caddy) | Sim |
| 3 | Postgres + MinIO + (TURN) | Sim / TURN fortemente recomendado |
| 4 | Deploy da API + migrate + seed | Sim |
| 5 | SMTP configurado para verificação de e-mail | Prod: sim |
| 6 | Build desktop com `VITE_API_URL` de produção | Sim |
| 7 | Publicar release (GitHub) + auto-update | Sim para updates |
| 8 | Assinatura de código Windows | Recomendado |
| 9 | Testar com 2 máquinas / amigo | Sim |

---

## Fase 0 — Preparação

1. **Domínio** (ex.: `concord.seudominio.com`) apontando para o IP da VPS (registro A/AAAA).
2. **Repositório GitHub** do projeto (público ou privado) — o auto-update padrão usa GitHub Releases.
3. **VPS** (Ubuntu 22.04+): 2+ vCPU, 4+ GB RAM recomendados; Docker + Docker Compose instalados.
4. Abra firewall:
   - `80/tcp`, `443/tcp` (Caddy / API)
   - `3478/tcp` + `3478/udp` (TURN)
   - faixa relay UDP do coturn (veja compose / docs do coturn), se usar

---

## Fase 1 — Servidor (API + dados)

### 1.1 Clonar e configurar env

Na VPS:

```bash
git clone <seu-repo> concord && cd concord
cp infra/docker/.env.production.example infra/docker/.env.production
```

Edite `infra/docker/.env.production` (domínio, senhas, JWT, Google, TURN). Na primeira subida deixe `RUN_SEED=1`.

DNS: aponte `DOMAIN` e `files.DOMAIN` para o IP da VPS.

### 1.2 Subir o stack de produção

```bash
pnpm docker:prod:up
# equivalente:
# docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.production up -d --build
```

Sobe **Caddy (HTTPS) + API + Postgres + MinIO + coturn**. A API roda migrate no start; com `RUN_SEED=1` imprime `inviteCode` nos logs.

```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.production logs api | head -80
```

Depois defina `RUN_SEED=0` e reinicie só a API. Guarde o **inviteCode**.

### 1.3 SMTP (produção)

Configure no `infra/docker/.env.production`:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`

Sem SMTP, novos usuários não recebem o código de verificação no cadastro.

### 1.4 Health check

```bash
curl -s https://seu.dominio/health
```

WebSocket: `wss://seu.dominio/ws`. Anexos públicos via `https://files.seu.dominio`.

---

## Fase 2 — App desktop (primeira publicação)

### 2.1 Apontar o client para a API

Em `apps/desktop/.env` **antes do build**:

```env
VITE_API_URL=https://seu.dominio
```

(`seu.dominio` = o mesmo `DOMAIN` do compose de produção.)

`VITE_*` é embutido no build — não muda depois sem rebuild.

### 2.2 Versão

Em `apps/desktop/package.json`, defina a versão inicial, ex.: `"version": "0.1.0"`.

### 2.3 Gerar instaladores (local)

**Windows** (máquina Windows ou CI `windows-latest`):

```bash
pnpm --filter @concord/desktop pack:win
# → apps/desktop/release/*.exe (NSIS)
```

**Linux**:

```bash
pnpm --filter @concord/desktop pack:linux
# → AppImage (auto-update) + .deb
```

Distribua o instalador aos usuários (site, Discord, Release do GitHub).

### 2.4 Publicar release + auto-update (recomendado)

Detalhes em [auto-update.md](./auto-update.md).

**Opção A — GitHub Actions (mais fácil)**

1. Push do código para GitHub.
2. Crie tag alinhada à versão:

```bash
git tag desktop-v0.1.0
git push origin desktop-v0.1.0
```

3. O workflow `.github/workflows/release-desktop.yml` gera artefatos e Release.
4. Na primeira instalação, o app busca updates nessa Release (`latest.yml`).

**Opção B — CLI com token**

```bash
export GH_TOKEN=ghp_...   # repo scope
pnpm --filter @concord/desktop release:win
# e/ou release:linux
```

**Opção C — Feed próprio (S3/R2)**

1. Faça upload dos arquivos da pasta `release/` + `latest.yml`.
2. No ambiente do app (ou script de build): `UPDATE_FEED_URL=https://updates.../concord`.

### 2.5 Assinatura Windows (recomendado)

Sem certificado Authenticode, o SmartScreen assusta usuários e updates falham mais.

No CI / máquina de build:

```bash
export CSC_LINK=path/ou/base64-do-cert.pfx
export CSC_KEY_PASSWORD=...
```

O `electron-builder` assina o NSIS automaticamente.

---

## Fase 3 — Entregar aos usuários

1. Envie o instalador (`Concord Setup 0.1.0.exe` / AppImage).
2. Passe um **código de convite** (seed ou gerado no painel admin).
3. Usuário instala → login Google (ou fluxo que você habilitou) → entra no servidor.
4. Teste: texto, voz (2 pessoas), compartilhar tela, anexo.

---

## Fase 4 — Atualizações seguintes (sem baixar instalador na mão)

1. Altere o código.
2. **Bump** `version` em `apps/desktop/package.json` (ex.: `0.1.0` → `0.2.0`).
3. Tag `desktop-v0.2.0` **ou** `pnpm --filter @concord/desktop release`.
4. Usuários com o app aberto (ou no próximo boot) veem o banner → **Reiniciar e atualizar**.

Atualizações **só de API** (bugfix no Nest, migrate):

```bash
git pull
pnpm docker:prod:up
# migrate roda no entrypoint da API
```

Não exige novo desktop **se** a API continuar compatível.

---

## Ordem mínima “quero no ar este fim de semana”

1. VPS + DNS `DOMAIN` + `files.DOMAIN` → HTTPS (Caddy no compose)  
2. `pnpm docker:prod:up` + seed (guardar invite)  
3. STUN público + TURN (coturn no compose, portas UDP)  
4. `apps/desktop/.env` com `VITE_API_URL=https://DOMAIN`  
5. `pack:win` (ou tag Actions) e enviar `.exe` + invite ao amigo  
6. Depois: tag `desktop-v*` para auto-update nas próximas versões  

---

## Problemas comuns

| Sintoma | Causa provável |
|---------|----------------|
| Login Failed to fetch | API/URL/`VITE_API_URL` errados ou CORS |
| Voz conecta mas sem áudio/tela | TURN/firewall UDP |
| Anexos quebrados para remoto | `S3_PUBLIC_URL` ainda `localhost` |
| Update não aparece | versão não bumpada / Release sem `latest.yml` / app em modo dev |
| SmartScreen / update falha no Win | falta assinatura de código |

---

## Referências no repo

- [operations.md](./operations.md) — compose local e **prod**  
- [auto-update.md](./auto-update.md) — electron-updater  
- [security.md](./security.md) — secrets e TURN  
- [webrtc.md](./webrtc.md) — ICE  
- `infra/docker/docker-compose.prod.yml` — stack de produção  
- `.github/workflows/release-desktop.yml` — CI de release  
