# WebRTC — Concord

## Topologia

**P2P mesh** (decisão de produto), máx. 10 participantes por canal de voz.

Sinalização via WebSocket:

- `voice:join` / `voice:leave` / `voice:mute`
- `voice:peers` (lista inicial)
- `webrtc:signal` (offer/answer/ICE)
- `screenshare:started` / `screenshare:stopped`

ICE: STUN/TURN via `GET /turn/credentials` (coturn com auth secret).

## Limitações

- Com N participantes, cada cliente envia/recebe até N−1 fluxos de áudio (+ telas).
- Múltiplos compartilhamentos simultâneos são suportados, com custo alto de CPU/banda.
- Linux Wayland: captura de tela depende de portal/pipewire; pode falhar sem permissão.

## Reconexão

O cliente WebSocket reconecta automaticamente; o usuário deve reentrar no canal de voz após queda prolongada.
