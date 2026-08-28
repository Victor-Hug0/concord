import { useEffect, useMemo, useState } from 'react';

export type CaptureSource = {
  id: string;
  name: string;
  thumbnail: string;
  type: 'screen' | 'window';
  previewOk?: boolean;
  captureRisky?: boolean;
};

export type CaptureEnv = {
  platform: string;
  wsl: boolean;
  wayland: boolean;
  screenCaptureUnreliable: boolean;
};

type Props = {
  open: boolean;
  loading: boolean;
  error: string | null;
  sources: CaptureSource[];
  captureEnv: CaptureEnv | null;
  onRefresh: () => void;
  onCancel: () => void;
  onConfirm: (sourceId: string, withSystemAudio: boolean) => void;
};

export function ScreenSharePicker({
  open,
  loading,
  error,
  sources,
  captureEnv,
  onRefresh,
  onCancel,
  onConfirm,
}: Props) {
  const [tab, setTab] = useState<'screen' | 'window'>('window');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [withSystemAudio, setWithSystemAudio] = useState(true);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  const screens = useMemo(() => sources.filter((s) => s.type === 'screen'), [sources]);
  const windows = useMemo(() => sources.filter((s) => s.type === 'window'), [sources]);
  const list = tab === 'screen' ? screens : windows;

  useEffect(() => {
    if (!open || loading) return;
    const usable = list.filter((s) => s.previewOk && !s.captureRisky);
    const preferred = usable[0] || list.find((s) => s.previewOk) || list[0];
    setSelectedId((prev) => {
      if (prev && list.some((s) => s.id === prev)) return prev;
      return preferred?.id ?? null;
    });
  }, [open, loading, tab, sources]);

  if (!open) return null;

  const selected = list.find((s) => s.id === selectedId);
  const selectedBlocked =
    Boolean(selected) &&
    (selected!.captureRisky || (selected!.type === 'screen' && !selected!.previewOk));
  const wslHint = captureEnv?.wsl || captureEnv?.screenCaptureUnreliable;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card share-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="share-picker-header">
          <h2 id="share-picker-title">Compartilhar tela</h2>
          {wslHint ? (
            <p className="share-picker-warn">
              Você está no <strong>Electron via WSL</strong>. O sistema só entrega tela preta +
              cursor — não é bug do Concord. Feche este app e use o Electron <strong>nativo do
              Windows</strong>:
              <code> pnpm --filter @concord/desktop dev:win</code>
              (com o Vite já rodando).
            </p>
          ) : (
            <p>
              Prefira uma <strong>janela</strong> quando possível. Telas inteiras dependem do
              sistema operacional.
            </p>
          )}
        </div>

        <div className="share-tabs">
          <button
            type="button"
            className={`share-tab ${tab === 'window' ? 'active' : ''}`}
            onClick={() => setTab('window')}
          >
            Janelas ({windows.length})
          </button>
          <button
            type="button"
            className={`share-tab ${tab === 'screen' ? 'active' : ''}`}
            onClick={() => setTab('screen')}
          >
            Telas ({screens.length})
          </button>
        </div>

        {loading && <div className="loading">Carregando fontes de captura…</div>}
        {error && <div className="error">{error}</div>}
        {selectedBlocked && (
          <div className="error">
            Esta fonte não tem captura válida (prévia preta). No WSL, rode{' '}
            <code>dev:win</code> no Windows. Caso contrário, escolha uma janela com prévia.
          </div>
        )}

        {!loading && !error && list.length === 0 && (
          <div className="empty">
            Nenhuma {tab === 'screen' ? 'tela' : 'janela'} encontrada.
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn secondary" onClick={onRefresh}>
                Tentar de novo
              </button>
            </div>
          </div>
        )}

        {!loading && list.length > 0 && (
          <div className="share-grid">
            {list.map((source) => {
              const blank = !source.previewOk || !source.thumbnail;
              const blocked = source.captureRisky || (source.type === 'screen' && !source.previewOk);
              return (
                <button
                  key={source.id}
                  type="button"
                  className={`share-source ${selectedId === source.id ? 'selected' : ''} ${
                    blocked ? 'risky' : ''
                  }`}
                  onClick={() => setSelectedId(source.id)}
                  onDoubleClick={() => {
                    if (blocked) return;
                    onConfirm(source.id, withSystemAudio);
                  }}
                >
                  {blank ? (
                    <div className="share-source-fallback">
                      <span aria-hidden>{source.type === 'screen' ? '▢' : '▭'}</span>
                      <small>Prévia indisponível</small>
                    </div>
                  ) : (
                    <img src={source.thumbnail} alt="" />
                  )}
                  <span title={source.name}>{source.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <label className="share-audio-toggle">
          <input
            type="checkbox"
            checked={withSystemAudio}
            onChange={(e) => setWithSystemAudio(e.target.checked)}
          />
          Incluir áudio do sistema (quando disponível)
        </label>

        <div className="share-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn secondary" onClick={onRefresh} disabled={loading}>
            Atualizar
          </button>
          <button
            type="button"
            className="btn"
            disabled={!selectedId || loading || selectedBlocked}
            onClick={() => selectedId && !selectedBlocked && onConfirm(selectedId, withSystemAudio)}
          >
            Transmitir
          </button>
        </div>
      </div>
    </div>
  );
}
