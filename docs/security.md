# Segurança — Concord

## Autenticação

- Cadastro com e-mail/senha + código de verificação por e-mail
- Convite obrigatório para novos usuários
- Access JWT curto + refresh rotativo (SHA-256 do token no banco), TTL ~30 dias
- Logout revoga a sessão
- Guard global JWT; rotas públicas marcadas com `@Public()`
- Roles `admin` | `member` com `RolesGuard` em convites/canais admin

## Transporte e arquivos

- TLS/WSS obrigatório em produção (Caddy)
- Anexos no MinIO; download apenas via URL assinada (5 min)
- Limite 500 MB; sem antivírus e sem encryption-at-rest no MVP (só TLS em trânsito)
- Rate limiting global (Throttler) + throttle extra no login

## WebRTC / TURN

- Credenciais TURN temporárias (TURN REST / auth secret HMAC)
- Não expor o static auth secret ao cliente
- Risco P2P: peers trocam mídia diretamente; use apenas com usuários convidados

## Logs

- Pino com redaction de `authorization` e `cookie`
- Não logar refresh tokens nem corpos de upload

## Riscos conhecidos

- Upload de 500 MB: timeouts de proxy; ajuste `client_max_body_size` / Caddy
- Mesh WebRTC com 10 usuários + várias telas: alto uso de banda no cliente
