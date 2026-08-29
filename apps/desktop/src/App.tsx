import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, Message, ScreenQualityPreset, User } from '@concord/shared';
import { SCREEN_QUALITY_TABLE } from '@concord/shared';
import { api, loadTokens, saveTokens, type Tokens } from './lib/api';
import { ConcordSocket } from './lib/socket';
import { VoiceSession, type SignalData } from './lib/webrtc';
import {
  ScreenSharePicker,
  type CaptureEnv,
  type CaptureSource,
} from './components/ScreenSharePicker';
import { UpdateBanner } from './components/UpdateBanner';

type ServerPayload = {
  id: string;
  name: string;
  channels: Channel[];
};

type PresenceUser = {
  userId: string;
  displayName: string;
  voiceChannelId: string | null;
  muted: boolean;
  screensharing: boolean;
};

type Invite = {
  id: string;
  code: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  revokedAt: string | null;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function App() {
  const [tokens, setTokens] = useState<Tokens | null>(() => loadTokens());
  const [me, setMe] = useState<User | null>(null);
  const [server, setServer] = useState<ServerPayload | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');
  const [threadParent, setThreadParent] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wsStatus, setWsStatus] = useState('idle');
  const [muted, setMuted] = useState(false);
  const [inVoice, setInVoice] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [quality, setQuality] = useState<ScreenQualityPreset>('720p');
  const [remoteScreens, setRemoteScreens] = useState<Record<string, MediaStream>>({});
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const [sharingSource, setSharingSource] = useState<{
    id: string;
    name: string;
    type: 'screen' | 'window';
  } | null>(null);
  const [shareViewMode, setShareViewMode] = useState<'reduced' | 'fullscreen'>('reduced');
  /** Vista exclusiva da transmissão (esconde o chat de texto). */
  const [inShareView, setInShareView] = useState(false);
  /** Quem estamos assistindo: 'self' ou userId remoto. */
  const [watchingUserId, setWatchingUserId] = useState<string | 'self' | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputDeviceId, setInputDeviceId] = useState<string>('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [shareSources, setShareSources] = useState<CaptureSource[]>([]);
  const [sharePickerLoading, setSharePickerLoading] = useState(false);
  const [sharePickerError, setSharePickerError] = useState<string | null>(null);
  const [shareStarting, setShareStarting] = useState(false);
  const [captureEnv, setCaptureEnv] = useState<CaptureEnv | null>(null);

  const socketRef = useRef<ConcordSocket | null>(null);
  const voiceRef = useRef<VoiceSession | null>(null);
  const audioEls = useRef<Map<string, HTMLAudioElement>>(new Map());
  const fileRef = useRef<HTMLInputElement>(null);

  const channel = useMemo(
    () => server?.channels.find((c) => c.id === channelId) ?? null,
    [server, channelId],
  );

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const offlineUsers = useMemo(() => {
    const onlineIds = new Set(presence.map((p) => p.userId));
    return users.filter((u) => !onlineIds.has(u.id));
  }, [users, presence]);

  useEffect(() => {
    if (!server || !channelId) return;
    const current = server.channels.find((c) => c.id === channelId);
    if (current?.type === 'voice') {
      const text = server.channels.find((c) => c.type === 'text');
      if (text) setChannelId(text.id);
    }
  }, [server, channelId]);

  const applyTokens = (t: Tokens | null) => {
    saveTokens(t);
    setTokens(t);
  };

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [user, srv, list] = await Promise.all([
        api<User>('/users/me'),
        api<ServerPayload>('/server'),
        api<User[]>('/users'),
      ]);
      setMe(user);
      setServer(srv);
      setUsers(list);
      const firstText = srv.channels.find((c) => c.type === 'text') ?? srv.channels[0];
      if (!channelId && firstText) setChannelId(firstText.id);
    } catch (e) {
      setError((e as Error).message);
      applyTokens(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (!tokens) return;
    void bootstrap();
  }, [tokens, bootstrap]);

  useEffect(() => {
    if (!tokens?.accessToken || !me) return;
    const socket = new ConcordSocket();
    socket.onStatus = setWsStatus;
    socket.connect();
    socketRef.current = socket;

    const offs = [
      socket.on('presence:update', (p) => {
        const payload = p as { online: PresenceUser[] };
        setPresence(payload.online);
      }),
      socket.on('message:new', (p) => {
        const msg = p as Message;
        setMessages((prev) =>
          msg.channelId === channelId && (!threadParent || msg.parentId === threadParent.id)
            ? [...prev.filter((m) => m.id !== msg.id), msg]
            : prev,
        );
      }),
      socket.on('message:updated', (p) => {
        const msg = p as Message;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }),
      socket.on('message:deleted', (p) => {
        const msg = p as Message;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }),
      socket.on('reaction:updated', (p) => {
        const msg = p as Message;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }),
      socket.on('channel:updated', () => {
        void api<ServerPayload>('/server').then(setServer);
      }),
      socket.on('webrtc:signal', (p) => {
        const payload = p as { fromUserId: string; data: SignalData };
        void voiceRef.current?.handleSignal(payload.fromUserId, payload.data);
      }),
      socket.on('voice:peers', (p) => {
        const payload = p as {
          peers: Array<{ userId: string }>;
        };
        for (const peer of payload.peers) {
          const polite = me.id > peer.userId;
          void voiceRef.current?.ensurePeer(peer.userId, polite);
        }
      }),
      socket.on('voice:joined', (p) => {
        const payload = p as { userId: string };
        if (payload.userId === me.id) return;
        const polite = me.id > payload.userId;
        void voiceRef.current?.ensurePeer(payload.userId, polite);
      }),
      socket.on('voice:left', (p) => {
        const payload = p as { userId: string };
        voiceRef.current?.closePeer(payload.userId);
        setRemoteScreens((prev) => {
          const next = { ...prev };
          delete next[payload.userId];
          return next;
        });
      }),
    ];

    return () => {
      offs.forEach((off) => off());
      socket.close();
      socketRef.current = null;
    };
  }, [tokens?.accessToken, me?.id, channelId, threadParent?.id]);

  useEffect(() => {
    if (!channel || channel.type !== 'text' || !tokens) return;
    setLoading(true);
    const q = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';
    const parent = threadParent ? `&parentId=${threadParent.id}` : '';
    void api<Message[]>(`/channels/${channel.id}/messages?limit=50${q}${parent}`)
      .then(setMessages)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [channel?.id, channel?.type, tokens, search, threadParent?.id]);

  useEffect(() => {
    void navigator.mediaDevices?.enumerateDevices().then((devs) => {
      setAudioDevices(devs.filter((d) => d.kind === 'audioinput'));
    });
  }, [inVoice]);

  const logout = async () => {
    const t = loadTokens();
    if (t?.refreshToken) {
      try {
        await api('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: t.refreshToken }),
          auth: false,
        });
      } catch {
        /* ignore */
      }
    }
    voiceRef.current?.dispose();
    applyTokens(null);
    setMe(null);
    setServer(null);
  };

  const sendMessage = async () => {
    if (!channel || !body.trim()) return;
    const text = body.trim();
    setBody('');
    try {
      const msg = await api<Message>(`/channels/${channel.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          body: text,
          parentId: threadParent?.id,
          mentionUserIds: users
            .filter((u) => text.includes(`@${u.displayName}`))
            .map((u) => u.id),
        }),
      });
      setMessages((prev) => [...prev.filter((m) => m.id !== msg.id), msg]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const uploadForMessage = async (messageId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const msg = await api<Message>(`/files/messages/${messageId}`, {
      method: 'POST',
      body: fd,
    });
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
  };

  const onPickFile = async (file: File | null) => {
    if (!file || !channel) return;
    try {
      const msg = await api<Message>(`/channels/${channel.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          body: `Arquivo: ${file.name}`,
          parentId: threadParent?.id,
        }),
      });
      await uploadForMessage(msg.id, file);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const joinVoice = async (id: string) => {
    if (!me) return;
    if (inVoice && voiceChannelId === id) return;
    if (inVoice) {
      leaveVoice();
    }
    setVoiceChannelId(id);
    setInVoice(true);
    const session = new VoiceSession(me.id, (targetUserId, data) => {
      socketRef.current?.send('webrtc:signal', { targetUserId, data });
    });
    session.onRemoteStream = (userId, stream) => {
      let el = audioEls.current.get(userId);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        audioEls.current.set(userId, el);
      }
      el.srcObject = stream;
    };
    session.onRemoteScreen = (userId, stream) => {
      setRemoteScreens((prev) => {
        const next = { ...prev };
        if (!stream) delete next[userId];
        else next[userId] = stream;
        return next;
      });
    };
    session.onLocalScreen = (stream) => {
      setLocalScreen(stream);
    };
    session.onScreenShareEnded = () => {
      setSharing(false);
      setLocalScreen(null);
      setSharingSource(null);
      setShareViewMode('reduced');
      setInShareView(false);
      setWatchingUserId(null);
      socketRef.current?.send('screenshare:stopped');
    };
    voiceRef.current = session;
    await session.initIce();
    await session.startMic(inputDeviceId || undefined);
    socketRef.current?.send('voice:join', { channelId: id });
  };

  const leaveVoice = () => {
    socketRef.current?.send('voice:leave');
    voiceRef.current?.dispose();
    voiceRef.current = null;
    setInVoice(false);
    setVoiceChannelId(null);
    setSharing(false);
    setRemoteScreens({});
    setLocalScreen(null);
    setSharingSource(null);
    setShareViewMode('reduced');
    setInShareView(false);
    setWatchingUserId(null);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    voiceRef.current?.setMuted(next);
    socketRef.current?.send('voice:mute', { muted: next });
  };

  const loadShareSources = useCallback(async () => {
    setSharePickerLoading(true);
    setSharePickerError(null);
    try {
      if (!window.concord?.getSources) {
        throw new Error('Captura de tela disponível apenas no aplicativo desktop.');
      }
      const env = window.concord.getCaptureEnv
        ? await window.concord.getCaptureEnv()
        : null;
      if (env) setCaptureEnv(env);
      const sources = await window.concord.getSources();
      setShareSources(
        sources
          .filter((s) => !/^concord$/i.test(s.name.trim()))
          .map((s) => ({
            ...s,
            type: s.type ?? (s.id.startsWith('screen:') ? 'screen' : 'window'),
            previewOk: s.previewOk ?? Boolean(s.thumbnail),
            captureRisky:
              s.captureRisky ??
              (s.type === 'screen' &&
                Boolean(env?.screenCaptureUnreliable) &&
                !(s.previewOk ?? Boolean(s.thumbnail))),
          })),
      );
      if (sources.length === 0) {
        setSharePickerError(
          env?.wsl
            ? 'Nenhuma fonte útil no WSL. Use pnpm --filter @concord/desktop dev:win no Windows.'
            : 'Nenhuma tela ou janela encontrada. No Linux (Wayland), conceda permissão de captura ao Concord.',
        );
      }
    } catch (e) {
      setShareSources([]);
      setSharePickerError((e as Error).message || 'Falha ao listar telas/janelas');
    } finally {
      setSharePickerLoading(false);
    }
  }, []);

  const openSharePicker = async () => {
    if (!voiceRef.current) return;
    setSharePickerOpen(true);
    await loadShareSources();
  };

  const closeSharePicker = () => {
    if (shareStarting) return;
    setSharePickerOpen(false);
    setSharePickerError(null);
  };

  const confirmShare = async (sourceId: string, withSystemAudio: boolean) => {
    if (!voiceRef.current) return;
    const source = shareSources.find((s) => s.id === sourceId);
    if (!source) {
      setSharePickerError('Fonte inválida. Atualize a lista e tente de novo.');
      return;
    }
    if (source.captureRisky || (source.type === 'screen' && !source.previewOk)) {
      setSharePickerError(
        captureEnv?.wsl
          ? 'Captura de tela no WSL só gera preto + cursor. Feche este Electron e rode: pnpm --filter @concord/desktop dev:win'
          : 'Esta tela não tem captura válida. Escolha uma janela com prévia.',
      );
      return;
    }
    setShareStarting(true);
    setSharePickerError(null);
    setError(null);
    try {
      await voiceRef.current.startScreenShare(
        { id: source.id, name: source.name },
        quality,
        { includeSystemAudio: withSystemAudio },
      );
      socketRef.current?.send('screenshare:started', { quality });
      setSharingSource({ id: source.id, name: source.name, type: source.type });
      setSharing(true);
      setShareViewMode('fullscreen');
      setWatchingUserId('self');
      setInShareView(true);
      setSharePickerOpen(false);
    } catch (e) {
      setSharePickerError(`Falha ao compartilhar: ${(e as Error).message}`);
      setError(`Falha ao compartilhar tela: ${(e as Error).message}`);
    } finally {
      setShareStarting(false);
    }
  };

  const toggleShare = async () => {
    if (!voiceRef.current) return;
    if (sharing) {
      await voiceRef.current.stopScreenShare();
      socketRef.current?.send('screenshare:stopped');
      setSharing(false);
      setLocalScreen(null);
      setSharingSource(null);
      setShareViewMode('reduced');
      setInShareView(false);
      setWatchingUserId(null);
      return;
    }
    await openSharePicker();
  };

  const enterShareView = (userId: string | 'self') => {
    setWatchingUserId(userId);
    setInShareView(true);
    setShareViewMode('fullscreen');
  };

  const exitShareView = () => {
    setInShareView(false);
    setWatchingUserId(null);
    setShareViewMode('reduced');
  };

  useEffect(() => {
    if (!inShareView || !watchingUserId || watchingUserId === 'self') return;
    const stillLive = presence.some(
      (p) => p.userId === watchingUserId && p.screensharing && p.voiceChannelId === voiceChannelId,
    );
    if (!stillLive && !remoteScreens[watchingUserId]) {
      exitShareView();
    }
  }, [presence, remoteScreens, inShareView, watchingUserId, voiceChannelId]);

  const loadInvites = async () => {
    const list = await api<Invite[]>('/invites');
    setInvites(list);
  };

  if (!tokens || !me) {
    return (
      <LoginScreen
        onLoggedIn={applyTokens}
        error={error}
        setError={setError}
      />
    );
  }

  const voiceChannel =
    server?.channels.find((c) => c.id === voiceChannelId && c.type === 'voice') ?? null;
  const textChannel = channel?.type === 'text' ? channel : null;
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="app-shell">
      <UpdateBanner />
      <nav className="server-rail" aria-label="Servidores">
        <button type="button" className="server-icon active" title={server?.name || 'Concord'}>
          {server?.name ? initials(server.name).slice(0, 1) : 'C'}
        </button>
        <div className="server-rail-sep" />
        {me.role === 'admin' && (
          <button
            type="button"
            className={`server-icon ${showAdmin ? 'active' : ''}`}
            title="Admin"
            onClick={() => {
              setShowAdmin((v) => !v);
              void loadInvites().catch((e) => setError((e as Error).message));
            }}
          >
            +
          </button>
        )}
      </nav>

      <aside className="sidebar">
        <div className="server-header">
          <span>{server?.name || 'Concord'}</span>
        </div>
        <div className="channel-scroll">
          <div className="channel-group-title">Canais de texto</div>
          {server?.channels
            .filter((c) => c.type === 'text')
            .map((c) => (
              <button
                key={c.id}
                type="button"
                className={`channel-btn ${channelId === c.id ? 'active' : ''}`}
                onClick={() => {
                  setChannelId(c.id);
                  setThreadParent(null);
                }}
              >
                <span className="hash">#</span>
                {c.name}
              </button>
            ))}
          <div className="channel-group-title">Canais de voz</div>
          {server?.channels
            .filter((c) => c.type === 'voice')
            .map((c) => {
              const members = presence.filter((p) => p.voiceChannelId === c.id);
              const joined = voiceChannelId === c.id && inVoice;
              return (
                <div key={c.id} className={`voice-channel-block ${joined ? 'joined' : ''}`}>
                  <button
                    type="button"
                    className={`channel-btn ${joined ? 'active' : ''}`}
                    onClick={() => void joinVoice(c.id)}
                  >
                    <span className="hash" aria-hidden>
                      ◉
                    </span>
                    {c.name}
                  </button>
                  {members.length > 0 && (
                    <div className="voice-user-list">
                      {members.map((p) => (
                        <div
                          key={p.userId}
                          className={`voice-user-row ${p.muted ? 'muted' : ''} ${
                            p.screensharing ? 'sharing' : ''
                          } ${p.screensharing ? 'clickable' : ''}`}
                          role={p.screensharing ? 'button' : undefined}
                          tabIndex={p.screensharing ? 0 : undefined}
                          title={
                            p.screensharing
                              ? p.userId === me.id
                                ? 'Abrir sua transmissão'
                                : `Entrar na transmissão de ${p.displayName}`
                              : undefined
                          }
                          onClick={() => {
                            if (!p.screensharing) return;
                            enterShareView(p.userId === me.id ? 'self' : p.userId);
                          }}
                          onKeyDown={(e) => {
                            if (!p.screensharing) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              enterShareView(p.userId === me.id ? 'self' : p.userId);
                            }
                          }}
                        >
                          <div className="voice-user-avatar">
                            {initials(p.displayName)}
                            <span className="status-dot ok" />
                          </div>
                          <span className="voice-user-name">{p.displayName}</span>
                          {p.muted && <span className="voice-user-flag" title="Mudo">🔇</span>}
                          {p.screensharing && (
                            <span className="voice-user-flag live" title="Transmitindo">
                              Ao vivo
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          {showAdmin && me.role === 'admin' && (
            <div className="admin-panel">
              <strong>Canais</strong>
              <input
                placeholder="Nome do canal"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
              <select
                value={newChannelType}
                onChange={(e) => setNewChannelType(e.target.value as 'text' | 'voice')}
              >
                <option value="text">Texto</option>
                <option value="voice">Voz</option>
              </select>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await api('/channels', {
                    method: 'POST',
                    body: JSON.stringify({ name: newChannelName, type: newChannelType }),
                  });
                  setNewChannelName('');
                  setServer(await api('/server'));
                  socketRef.current?.send('channel:updated', {});
                }}
              >
                Criar canal
              </button>
              <strong>Convites</strong>
              <button
                type="button"
                className="btn secondary"
                onClick={async () => {
                  await api('/invites', { method: 'POST', body: JSON.stringify({ maxUses: 5 }) });
                  await loadInvites();
                }}
              >
                Gerar convite
              </button>
              {invites.map((i) => (
                <div key={i.id} className="attachment">
                  <code>{i.code}</code> ({i.uses}/{i.maxUses})
                  {!i.revokedAt && (
                    <button
                      type="button"
                      className="btn danger"
                      style={{ marginLeft: 8, padding: '4px 8px' }}
                      onClick={async () => {
                        await api(`/invites/${i.id}`, { method: 'DELETE' });
                        await loadInvites();
                      }}
                    >
                      Revogar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {inVoice && voiceChannel && (
          <div className="voice-connection-panel">
            <div className="voice-connection-status">
              <div className="voice-connection-info">
                <strong>Voz conectada</strong>
                <span>
                  {voiceChannel.name}
                  {server?.name ? ` / ${server.name}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="icon-btn hangup"
                title="Desconectar"
                onClick={leaveVoice}
              >
                ⌀
              </button>
            </div>
            <div className="voice-connection-actions">
              <button
                type="button"
                className={`voice-action-btn ${muted ? 'danger-active' : ''}`}
                title={muted ? 'Ativar microfone' : 'Silenciar'}
                onClick={toggleMute}
              >
                {muted ? '🔇' : '🎤'}
              </button>
              <button
                type="button"
                className={`voice-action-btn ${sharing ? 'active' : ''}`}
                title={sharing ? 'Parar transmissão' : 'Compartilhar a tela'}
                disabled={shareStarting}
                onClick={() => void toggleShare()}
              >
                ▣
              </button>
              <select
                className="voice-quality-select"
                value={quality}
                title="Qualidade"
                onChange={(e) => setQuality(e.target.value as ScreenQualityPreset)}
              >
                {(Object.keys(SCREEN_QUALITY_TABLE) as ScreenQualityPreset[]).map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="user-panel">
          <div className="user-avatar">
            {initials(me.displayName)}
            <span
              className={`status-dot ${wsStatus === 'open' ? 'ok' : wsStatus === 'connecting' ? 'warn' : 'err'}`}
            />
          </div>
          <div className="user-panel-meta">
            <div className="user-panel-name">{me.displayName}</div>
            <div className="user-panel-sub">
              {me.role}
              {inVoice ? (muted ? ' · mudo' : ' · voz') : ''}
            </div>
          </div>
          <div className="user-panel-actions">
            {inVoice && (
              <button
                type="button"
                className={`icon-btn ${muted ? 'danger-active' : ''}`}
                title={muted ? 'Ativar microfone' : 'Silenciar'}
                onClick={toggleMute}
              >
                {muted ? '🔇' : '🎤'}
              </button>
            )}
            <button type="button" className="icon-btn" title="Sair" onClick={() => void logout()}>
              ⎋
            </button>
          </div>
        </div>
      </aside>

      <main className={`main ${inShareView ? 'share-focus' : ''}`}>
        {!inShareView && (
          <div className="main-header">
            <div className="main-header-title">
              <span className="hash">#</span>
              <strong>{textChannel?.name ?? '—'}</strong>
              {threadParent && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 8 }}>
                  Thread de {threadParent.authorDisplayName}{' '}
                  <button type="button" className="btn secondary" onClick={() => setThreadParent(null)}>
                    Fechar
                  </button>
                </div>
              )}
            </div>
            <div className="main-header-tools">
              {textChannel && (
                <input
                  placeholder={`Buscar ${server?.name || 'Concord'}`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
            </div>
          </div>
        )}

        {error && <div className="error">{error}</div>}
        {loading && !inShareView && <div className="loading">Carregando…</div>}

        {inShareView ? (
          <div className="share-stage share-stage--focus">
            <div className="share-stage-toolbar">
              <div className="share-focus-title">
                <strong>Transmissão</strong>
                <span>
                  {watchingUserId === 'self' || (sharing && watchingUserId === me.id)
                    ? `Você · ${sharingSource?.name || 'tela'}`
                    : presence.find((p) => p.userId === watchingUserId)?.displayName ||
                      users.find((u) => u.id === watchingUserId)?.displayName ||
                      'Ao vivo'}
                </span>
              </div>
              <div className="share-focus-actions">
                {sharing && (watchingUserId === 'self' || watchingUserId === me.id) && (
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => void toggleShare()}
                    disabled={shareStarting}
                  >
                    Parar transmissão
                  </button>
                )}
                <button type="button" className="btn secondary" onClick={exitShareView}>
                  Voltar ao chat
                </button>
              </div>
            </div>
            <div className="share-stage-videos">
              {(watchingUserId === 'self' || (sharing && watchingUserId === me.id)) && localScreen && (
                <ScreenVideo
                  stream={localScreen}
                  label={`Você (${me.displayName}) · ${sharingSource?.name || 'transmissão'}`}
                  self
                />
              )}
              {watchingUserId &&
                watchingUserId !== 'self' &&
                watchingUserId !== me.id &&
                remoteScreens[watchingUserId] && (
                  <ScreenVideo
                    stream={remoteScreens[watchingUserId]}
                    label={
                      presence.find((p) => p.userId === watchingUserId)?.displayName ||
                      users.find((u) => u.id === watchingUserId)?.displayName ||
                      watchingUserId
                    }
                  />
                )}
              {watchingUserId &&
                watchingUserId !== 'self' &&
                watchingUserId !== me.id &&
                !remoteScreens[watchingUserId] && (
                  <div className="empty">
                    Aguardando o vídeo da transmissão… Se não aparecer, peça para reiniciar o
                    compartilhamento.
                  </div>
                )}
              {watchingUserId === 'self' && !localScreen && (
                <div className="empty">Preparando sua transmissão…</div>
              )}
            </div>
          </div>
        ) : (
          <>
            {inVoice &&
              presence
                .filter(
                  (p) =>
                    p.screensharing &&
                    p.voiceChannelId === voiceChannelId &&
                    p.userId !== me.id,
                )
                .map((p) => (
                  <div key={p.userId} className="share-invite-banner">
                    <span>
                      <strong>{p.displayName}</strong> está transmitindo a tela
                    </span>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => enterShareView(p.userId)}
                    >
                      Entrar na transmissão
                    </button>
                  </div>
                ))}
            {sharing && (
              <div className="share-invite-banner self">
                <span>Você está transmitindo</span>
                <button type="button" className="btn" onClick={() => enterShareView('self')}>
                  Abrir transmissão
                </button>
              </div>
            )}

            {textChannel ? (
              <>
                <div className="messages">
                  {messages.length === 0 && !loading && (
                    <div className="empty">Nenhuma mensagem ainda. Diga olá.</div>
                  )}
                  {messages.map((m) => (
                    <MessageItem
                      key={m.id}
                      message={m}
                      me={me}
                      onEdit={async (id, text) => {
                        await api(`/channels/${textChannel.id}/messages/${id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ body: text }),
                        });
                      }}
                      onDelete={async (id) => {
                        await api(`/channels/${textChannel.id}/messages/${id}`, {
                          method: 'DELETE',
                        });
                      }}
                      onReact={async (id, emoji) => {
                        await api(`/channels/${textChannel.id}/messages/${id}/reactions`, {
                          method: 'POST',
                          body: JSON.stringify({ emoji }),
                        });
                      }}
                      onThread={() => setThreadParent(m)}
                    />
                  ))}
                </div>
                <div className="composer">
                  <div className="composer-row">
                    <button
                      type="button"
                      className="composer-attach"
                      title="Anexar arquivo"
                      onClick={() => fileRef.current?.click()}
                    >
                      +
                    </button>
                    <input
                      placeholder={`Conversar em #${textChannel.name}`}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage();
                        }
                      }}
                    />
                    <input
                      ref={fileRef}
                      type="file"
                      hidden
                      onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
                    />
                    <button type="button" className="btn" onClick={() => void sendMessage()}>
                      Enviar
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty">Selecione um canal de texto.</div>
            )}
          </>
        )}
      </main>

      <aside className="member-panel">
        <div className="channel-group-title">Online — {presence.length}</div>
        {presence.map((p) => {
          const user = userById.get(p.userId);
          return (
            <div
              key={p.userId}
              className={`member-row ${user?.role === 'admin' ? 'admin' : ''}`}
            >
              <div className="member-avatar">
                {initials(p.displayName)}
                <span className="status-dot ok" />
              </div>
              <span className="member-name">
                {p.displayName}
                {p.voiceChannelId ? ' · voz' : ''}
              </span>
            </div>
          );
        })}
        <div className="channel-group-title">Membros — {offlineUsers.length}</div>
        {offlineUsers.map((u) => (
          <div key={u.id} className={`member-row ${u.role === 'admin' ? 'admin' : ''}`}>
            <div className="member-avatar">{initials(u.displayName)}</div>
            <span className="member-name">{u.displayName}</span>
          </div>
        ))}
      </aside>

      <ScreenSharePicker
        open={sharePickerOpen}
        loading={sharePickerLoading || shareStarting}
        error={sharePickerError}
        sources={shareSources}
        captureEnv={captureEnv}
        onRefresh={() => void loadShareSources()}
        onCancel={closeSharePicker}
        onConfirm={(id, audio) => void confirmShare(id, audio)}
      />
    </div>
  );
}


function ScreenVideo({
  stream,
  label,
  self = false,
}: {
  stream: MediaStream;
  label: string;
  self?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(self);
  const [volume, setVolume] = useState(0.85);
  const [showVolume, setShowVolume] = useState(false);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.muted = muted;
    el.volume = muted ? 0 : volume;
    const tryPlay = () => {
      void el.play().catch(() => undefined);
    };
    tryPlay();
    const onReady = () => tryPlay();
    el.addEventListener('loadedmetadata', onReady);
    el.addEventListener('canplay', onReady);
    const track = stream.getVideoTracks()[0];
    const onUnmute = () => tryPlay();
    track?.addEventListener('unmute', onUnmute);
    return () => {
      el.removeEventListener('loadedmetadata', onReady);
      el.removeEventListener('canplay', onReady);
      track?.removeEventListener('unmute', onUnmute);
    };
  }, [stream]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = muted;
    el.volume = muted ? 0 : volume;
  }, [muted, volume]);

  useEffect(() => {
    const onFs = () => {
      setIsFs(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = async () => {
    const tile = tileRef.current;
    if (!tile) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await tile.requestFullscreen();
      }
    } catch {
      /* ignore */
    }
  };

  const hasAudio = stream.getAudioTracks().length > 0;

  return (
    <div ref={tileRef} className={`screen-tile ${self ? 'self' : ''}`}>
      <div className="screen-tile-label">
        {self ? 'Sua transmissão' : 'Transmissão'} · {label}
      </div>
      <video ref={ref} autoPlay playsInline muted={muted} />
      <div className="screen-tile-controls">
        <div
          className={`screen-vol ${showVolume ? 'open' : ''}`}
          onMouseLeave={() => setShowVolume(false)}
        >
          {showVolume && (
            <input
              type="range"
              className="screen-vol-slider"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label="Volume da transmissão"
              disabled={!hasAudio && self}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                setMuted(v === 0);
              }}
            />
          )}
          <button
            type="button"
            className="screen-ctrl-btn"
            title={
              !hasAudio
                ? 'Esta transmissão não tem áudio'
                : muted || volume === 0
                  ? 'Ativar volume'
                  : 'Silenciar volume'
            }
            aria-label="Volume"
            onClick={() => {
              if (!hasAudio) {
                setShowVolume(true);
                return;
              }
              if (showVolume) {
                setMuted((m) => !m);
              } else {
                setShowVolume(true);
              }
            }}
          >
            <IconVolume muted={muted || volume === 0 || !hasAudio} />
          </button>
        </div>
        <button
          type="button"
          className="screen-ctrl-btn"
          title={isFs ? 'Sair da tela cheia' : 'Tela cheia'}
          aria-label="Tela cheia"
          onClick={() => void toggleFullscreen()}
        >
          <IconFullscreen exit={isFs} />
        </button>
      </div>
    </div>
  );
}

function IconVolume({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path
          fill="currentColor"
          d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
      />
    </svg>
  );
}

function IconFullscreen({ exit }: { exit: boolean }) {
  if (exit) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path
          fill="currentColor"
          d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
      />
    </svg>
  );
}

function MessageItem({
  message: m,
  me,
  onEdit,
  onDelete,
  onReact,
  onThread,
}: {
  message: Message;
  me: User;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReact: (id: string, emoji: string) => Promise<void>;
  onThread: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.body);

  return (
    <div className="message">
      <div className="message-avatar">
        {m.authorDisplayName
          .split(/\s+/)
          .map((p) => p[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()}
      </div>
      <div className="message-meta">
        <span className="message-author">{m.authorDisplayName}</span>
        <span>{formatTime(m.createdAt)}</span>
        {m.editedAt && <span>(editada)</span>}
      </div>
      {m.deletedAt ? (
        <div className="message-body deleted">Mensagem removida</div>
      ) : editing ? (
        <div className="composer-row">
          <input value={text} onChange={(e) => setText(e.target.value)} />
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await onEdit(m.id, text);
              setEditing(false);
            }}
          >
            Salvar
          </button>
        </div>
      ) : (
        <div className="message-body">{renderBody(m.body)}</div>
      )}
      {m.attachments?.length > 0 && (
        <div className="attachments">
          {m.attachments.map((a) => (
            <AttachmentView key={a.id} attachment={a} />
          ))}
        </div>
      )}
      <div className="message-actions toolbar">
        {m.reactions?.map((r) => (
          <button
            key={r.emoji}
            type="button"
            className={`reaction ${r.me ? 'active' : ''}`}
            onClick={() => void onReact(m.id, r.emoji)}
          >
            {r.emoji} {r.count}
          </button>
        ))}
        <button type="button" className="reaction" onClick={() => void onReact(m.id, '👍')}>
          👍
        </button>
        <button type="button" className="reaction" onClick={onThread}>
          Thread
        </button>
        {(m.authorId === me.id || me.role === 'admin') && !m.deletedAt && (
          <>
            {m.authorId === me.id && (
              <button type="button" className="reaction" onClick={() => setEditing(true)}>
                Editar
              </button>
            )}
            <button type="button" className="reaction" onClick={() => void onDelete(m.id)}>
              Excluir
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function renderBody(body: string) {
  const parts = body.split(/(@\w+)/g);
  return parts.map((p, i) =>
    p.startsWith('@') ? (
      <span key={i} className="mention">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function AttachmentView({
  attachment,
}: {
  attachment: Message['attachments'][number];
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void api<{ url: string }>(`/files/${attachment.id}/download`).then((r) => setUrl(r.url));
  }, [attachment.id]);

  const isImage = attachment.mimeType.startsWith('image/');
  const isVideo = attachment.mimeType.startsWith('video/');

  return (
    <div className="attachment">
      <div>
        {attachment.fileName} · {formatBytes(attachment.sizeBytes)} · {attachment.mimeType}
      </div>
      {url && isImage && <img className="preview-img" src={url} alt={attachment.fileName} />}
      {url && isVideo && <video className="preview-video" src={url} controls />}
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          Baixar
        </a>
      )}
    </div>
  );
}

function LoginScreen({
  onLoggedIn,
  error,
  setError,
}: {
  onLoggedIn: (t: Tokens) => void;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const sendVerificationCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/verification/send', {
        method: 'POST',
        body: JSON.stringify({ email }),
        auth: false,
      });
      setCodeSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      const tokens = await api<Tokens>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        auth: false,
      });
      onLoggedIn(tokens);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const tokens = await api<Tokens>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          inviteCode,
          email,
          password,
          displayName,
          verificationToken,
        }),
        auth: false,
      });
      onLoggedIn(tokens);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Concord</h1>
        <div className="login-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              setMode('register');
              setError(null);
            }}
          >
            Cadastrar
          </button>
        </div>

        {mode === 'login' ? (
          <>
            <p>Entre com e-mail e senha.</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
            />
            <button className="btn" disabled={busy || !email || !password} onClick={() => void login()}>
              Entrar
            </button>
          </>
        ) : (
          <>
            <p>Crie sua conta com convite e verificação de e-mail.</p>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Usuário"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
            />
            <div className="login-inline">
              <button
                type="button"
                className="btn secondary"
                disabled={busy || !email}
                onClick={() => void sendVerificationCode()}
              >
                Enviar código
              </button>
              {codeSent && <span className="login-hint">Código enviado</span>}
            </div>
            <input
              value={verificationToken}
              onChange={(e) => setVerificationToken(e.target.value)}
              placeholder="Código de verificação (6 dígitos)"
              inputMode="numeric"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirmar senha"
            />
            <input
              placeholder="Código de convite"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
            <button
              className="btn"
              disabled={
                busy ||
                !inviteCode ||
                !email ||
                !displayName ||
                !password ||
                !verificationToken
              }
              onClick={() => void register()}
            >
              Criar conta
            </button>
          </>
        )}

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
