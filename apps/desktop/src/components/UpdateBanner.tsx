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
      if (payload.type === 'idle' || payload.type === 'not-available' || payload.type === 'checking') {
        if (payload.type === 'not-available') setEvent(null);
        return;
      }
      setEvent(payload);
    });
  }, []);

  if (!event || event.type === 'error') {
    if (event?.type === 'error') {
      return (
        <div className="update-banner error" role="status">
          Falha ao verificar atualização
          {event.message ? `: ${event.message}` : ''}
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setEvent(null);
              void window.concord?.checkForUpdates?.();
            }}
          >
            Tentar de novo
          </button>
        </div>
      );
    }
    return null;
  }

  if (event.type === 'available' || event.type === 'progress') {
    const pct = event.type === 'progress' ? Math.round(event.percent ?? 0) : null;
    return (
      <div className="update-banner" role="status">
        <span>
          Atualização {event.version ? `v${event.version}` : ''} disponível
          {pct != null ? ` · baixando ${pct}%` : ' · baixando…'}
          {appVersion ? ` (atual v${appVersion})` : ''}
        </span>
      </div>
    );
  }

  if (event.type === 'downloaded') {
    return (
      <div className="update-banner ready" role="status">
        <span>
          Concord {event.version ? `v${event.version}` : ''} pronto para instalar
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
