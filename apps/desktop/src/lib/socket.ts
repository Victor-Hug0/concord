import { loadTokens, wsUrl } from './api';

type Handler = (payload: unknown) => void;

export class ConcordSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private reconnectTimer: number | null = null;
  private intentionalClose = false;
  status: 'idle' | 'connecting' | 'open' | 'closed' = 'idle';
  onStatus?: (s: ConcordSocket['status']) => void;

  connect() {
    const tokens = loadTokens();
    if (!tokens?.accessToken) return;
    this.intentionalClose = false;
    this.setStatus('connecting');
    this.ws = new WebSocket(wsUrl(tokens.accessToken));
    this.ws.onopen = () => this.setStatus('open');
    this.ws.onclose = () => {
      this.setStatus('closed');
      if (!this.intentionalClose) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 2000);
      }
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { event: string; payload: unknown };
        const set = this.handlers.get(msg.event);
        set?.forEach((h) => h(msg.payload));
        this.handlers.get('*')?.forEach((h) => h(msg));
      } catch {
        /* ignore */
      }
    };
  }

  private setStatus(s: ConcordSocket['status']) {
    this.status = s;
    this.onStatus?.(s);
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  send(event: string, data?: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    }
  }

  close() {
    this.intentionalClose = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
