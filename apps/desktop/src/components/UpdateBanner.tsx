import { useEffect, useState } from 'react';

type UpdaterPayload = {
  type: string;
  version?: string;
  percent?: number;
  message?: string;
  reason?: string;
};

export function UpdateBanner() {
  const [event, setEvent] = useState<UpdaterPayload | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!window.concord?.onUpdaterEvent) return;
    void window.concord.getAppVersion?.().then((v) => {
      if (v?.version) setAppVersion(v.version);
    });
    return window.concord.onUpdaterEvent((payload) => {
      if (payload.type === 'idle' || payload.type === 'checking' || payload.type === 'not-available') {
        if (payload.type === 'not-available') setEvent(null);
        return;
      }
      if (payload.type === 'error') {
        console.warn('[updater]', payload.message);
        return;
      }
      setEvent(payload);
    });
  }, []);

  if (!event) return null;

  if (event.type === 'available' || event.type === 'progress') {
    const pct = event.type === 'progress' ? Math.round(event.percent ?? 0) : null;
    return (
      <div className="update-banner" role="status">
        <span>
          Nova versão {event.version ? `v${event.version}` : ''} encontrada
          {pct != null ? ` · baixando ${pct}%` : ' · baixando…'}
          {appVersion ? ` (você está na v${appVersion})` : ''}
        </span>
      </div>
    );
  }

  if (event.type === 'downloaded') {
    return (
      <div className="update-banner ready" role="status">
        <span>
          Atualização {event.version ? `v${event.version}` : ''} pronta
          {appVersion ? ` · v${appVersion} → v${event.version}` : ''}
        </span>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void window.concord?.installUpdate?.();
          }}
        >
          Reiniciar e atualizar
        </button>
      </div>
    );
  }

  return null;
}
