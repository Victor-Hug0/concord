# Auto-update — Concord desktop

O app empacotado usa [`electron-updater`](https://www.electron.build/auto-update) para baixar e instalar novas versões sem o usuário buscar o instalador manualmente.

## Como funciona

1. No boot (após ~8s), o main process consulta o feed de updates.
2. Se houver versão maior que `apps/desktop/package.json#version`, baixa em background.
3. A UI mostra um banner; ao terminar, **Reiniciar e atualizar** chama `quitAndInstall`.

Em **dev** (`electron .` / Vite) o updater fica inativo.

## Feeds suportados

### GitHub Releases (padrão no `electron-builder`)

`publish.provider = github`. É preciso:

- Repositório GitHub (público ou privado com `GH_TOKEN`)
- Campo `repository` no `package.json` raiz ou do desktop, **ou** env `GH_OWNER` / `GH_REPO` no CI
- Token com permissão de release: `GH_TOKEN` / `GITHUB_TOKEN`

Publicar:

```bash
# bump version em apps/desktop/package.json (ex.: 0.1.0 → 0.2.0)
export GH_TOKEN=ghp_...
pnpm --filter @concord/desktop release:win
# ou release / release:linux
```

Isso sobe o instalador + `latest.yml` (Windows) / `latest-linux.yml` (AppImage) na Release.

### Feed genérico (S3, R2, nginx, etc.)

No ambiente da **máquina do usuário** (ou embutido no build via script):

```bash
UPDATE_FEED_URL=https://updates.seudominio.com/concord
```

A pasta/URL deve servir os artefatos gerados pelo `electron-builder` (`Concord Setup x.y.z.exe`, `latest.yml`, etc.).

No **publish** você ainda pode usar GitHub e espelhar os arquivos para o host genérico, ou configurar outro provider no CI.

## Artefatos

| SO | Alvo | Auto-update |
|----|------|-------------|
| Windows | NSIS | Sim (`latest.yml`) |
| Linux | **AppImage** | Sim (`latest-linux.yml`) |
| Linux | `.deb` | Instalação manual (apt); AppImage é o canal de update |
| Linux | **Flatpak** | Instalação manual; sem auto-update |

## CI (GitHub Actions)

Workflow: `.github/workflows/release-desktop.yml`

- **Automático:** após o **CI** passar na `main` (todo merge, sem filtro de paths)
- Versão gerada no CI: `0.1.<run>` (ex.: `0.1.42`) — sempre sobe para o auto-update funcionar
- Build **Windows** (NSIS) + **Linux** (AppImage + `.deb` + Flatpak) em paralelo
- Publica na **GitHub Release** com `latest.yml` / `latest-linux.yml`
- **Manual:** tag `desktop-v1.2.3` ou Actions → Release desktop → Run workflow

Ajuste `permissions` / secrets (`GH_TOKEN` já vem no Actions).

## Assinatura (recomendado em produção)

Sem assinatura, o Windows SmartScreen e alguns antivírus atrapalham download/update.

- Windows: certificado Authenticode (`CSC_LINK` / `CSC_KEY_PASSWORD` no electron-builder)
- macOS (se adicionar): notarização Apple

## Checklist de release

1. Bump `version` em `apps/desktop/package.json`
2. Garantir `VITE_API_URL` de produção no build
3. `pnpm --filter @concord/desktop release` (ou tag + Actions)
4. Testar: instalar build antiga → publicar nova → abrir app → banner → reiniciar
5. Manter API compatível com clients antigos por pelo menos um ciclo
