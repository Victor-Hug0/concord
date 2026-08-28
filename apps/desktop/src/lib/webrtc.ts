import type { ScreenQualityPreset } from '@concord/shared';
import { SCREEN_QUALITY_TABLE } from '@concord/shared';
import { api } from './api';

export type SignalData =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; kind: 'media' }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; kind: 'media' }
  | { type: 'ice'; candidate: RTCIceCandidateInit; kind: 'media' };

type SendSignal = (targetUserId: string, data: SignalData) => void;

export class VoiceSession {
  private pc = new Map<string, RTCPeerConnection>();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  private muted = false;
  private makingOffer = new Set<string>();

  onRemoteStream?: (userId: string, stream: MediaStream) => void;
  onRemoteScreen?: (userId: string, stream: MediaStream | null) => void;
  onLocalScreen?: (stream: MediaStream | null) => void;
  onConnectionState?: (state: string) => void;
  onScreenShareEnded?: () => void;

  constructor(
    private selfId: string,
    private sendSignal: SendSignal,
  ) {}

  async initIce() {
    try {
      const creds = await api<{ iceServers: RTCIceServer[] }>('/turn/credentials');
      this.iceServers = creds.iceServers;
    } catch {
      /* fallback STUN already set */
    }
  }

  async startMic(deviceId?: string) {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      video: false,
    });
    if (this.muted) this.setMuted(true);
    return this.localStream;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  private wirePeer(userId: string, pc: RTCPeerConnection) {
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendSignal(userId, { type: 'ice', candidate: ev.candidate.toJSON(), kind: 'media' });
      }
    };
    pc.onconnectionstatechange = () => {
      this.onConnectionState?.(pc.connectionState);
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      if (ev.track.kind === 'video') {
        // Keep a stable stream for this peer's screen
        const screen = new MediaStream(stream.getVideoTracks());
        stream.getAudioTracks().forEach((t) => {
          if (t.id.includes('screen') || stream.getVideoTracks().length) screen.addTrack(t);
        });
        this.onRemoteScreen?.(userId, screen.getVideoTracks().length ? screen : stream);
      } else {
        this.onRemoteStream?.(userId, stream);
      }
    };
  }

  async ensurePeer(userId: string, polite: boolean) {
    if (this.pc.has(userId)) return this.pc.get(userId)!;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc.set(userId, pc);
    this.wirePeer(userId, pc);

    this.localStream?.getTracks().forEach((track) => {
      pc.addTrack(track, this.localStream!);
    });
    this.screenStream?.getTracks().forEach((track) => {
      pc.addTrack(track, this.screenStream!);
    });

    if (!polite) {
      await this.createAndSendOffer(userId, pc);
    }
    return pc;
  }

  private async createAndSendOffer(userId: string, pc: RTCPeerConnection) {
    try {
      this.makingOffer.add(userId);
      const offer = await pc.createOffer();
      if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
        return;
      }
      await pc.setLocalDescription(offer);
      this.sendSignal(userId, {
        type: 'offer',
        sdp: pc.localDescription!.toJSON(),
        kind: 'media',
      });
    } finally {
      this.makingOffer.delete(userId);
    }
  }

  async handleSignal(fromUserId: string, data: SignalData) {
    const polite = this.selfId > fromUserId;
    const pc = await this.ensurePeer(fromUserId, true);

    if (data.type === 'offer') {
      const offerCollision =
        this.makingOffer.has(fromUserId) || pc.signalingState !== 'stable';
      if (offerCollision && !polite) {
        return;
      }
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendSignal(fromUserId, {
        type: 'answer',
        sdp: pc.localDescription!.toJSON(),
        kind: 'media',
      });
    } else if (data.type === 'answer') {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(data.sdp);
      }
    } else if (data.type === 'ice' && data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch {
        /* ignore */
      }
    }
  }

  private async captureDesktop(
    sourceId: string,
    sourceName: string,
    preset: { width: number; height: number; fps: number },
    includeSystemAudio: boolean,
  ): Promise<MediaStream> {
    const devices = navigator.mediaDevices;
    if (!devices?.getDisplayMedia) {
      throw new Error(
        'Captura indisponível (mediaDevices ausente). Feche o Concord e abra de novo com o script start-desktop-win.ps1 (requer reinício do Electron).',
      );
    }
    // Não usar setContentProtection: no Windows marca a janela como buraco preto
    // na captura (pior se o Concord estiver maximizado). No WSL a tela já vem preta.
    await window.concord?.setDisplaySource?.({
      id: sourceId,
      name: sourceName,
      audio: includeSystemAudio,
    });
    try {
      const stream = await devices.getDisplayMedia({
        video: {
          width: { ideal: preset.width, max: preset.width },
          height: { ideal: preset.height, max: preset.height },
          frameRate: { ideal: preset.fps, max: preset.fps },
        },
        audio: includeSystemAudio,
      });
      if (!stream.getVideoTracks().length) {
        throw new Error('A fonte selecionada não retornou vídeo.');
      }
      const videoTrack = stream.getVideoTracks()[0];
      videoTrack.contentHint = 'detail';
      try {
        await videoTrack.applyConstraints({
          width: { ideal: preset.width, max: preset.width },
          height: { ideal: preset.height, max: preset.height },
          frameRate: { ideal: preset.fps, max: preset.fps },
        });
      } catch {
        /* constraints opcionais */
      }
      return stream;
    } finally {
      await window.concord?.setDisplaySource?.(null);
    }
  }

  async startScreenShare(
    source: { id: string; name: string } | undefined,
    quality: ScreenQualityPreset,
    options: { includeSystemAudio?: boolean } = {},
  ) {
    const preset = SCREEN_QUALITY_TABLE[quality];
    const includeSystemAudio = options.includeSystemAudio !== false;
    let stream: MediaStream;

    if (source?.id && window.concord) {
      stream = await this.captureDesktop(source.id, source.name, preset, includeSystemAudio);
    } else {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: preset.width, max: preset.width },
          height: { ideal: preset.height, max: preset.height },
          frameRate: { ideal: preset.fps, max: preset.fps },
        },
        audio: includeSystemAudio,
      });
    }

    if (this.screenStream) {
      await this.stopScreenShare(false);
    }

    this.screenStream = stream;
    this.onLocalScreen?.(stream);

    for (const [userId, pc] of this.pc) {
      for (const track of stream.getTracks()) {
        const existing = pc.getSenders().find((s) => s.track?.id === track.id);
        if (!existing) pc.addTrack(track, stream);
      }
      await this.createAndSendOffer(userId, pc);
    }

    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      void this.stopScreenShare();
      this.onScreenShareEnded?.();
    });
    return stream;
  }

  async stopScreenShare(notifyLocal = true) {
    const ending = this.screenStream;
    this.screenStream = null;
    ending?.getTracks().forEach((t) => t.stop());

    for (const [userId, pc] of this.pc) {
      for (const sender of pc.getSenders()) {
        if (sender.track && ending?.getTracks().some((t) => t.id === sender.track!.id)) {
          try {
            pc.removeTrack(sender);
          } catch {
            /* ignore */
          }
        }
      }
      if (pc.connectionState !== 'closed') {
        try {
          await this.createAndSendOffer(userId, pc);
        } catch {
          /* ignore */
        }
      }
    }

    if (window.concord?.setDisplaySource) {
      await window.concord.setDisplaySource(null);
    }
    if (notifyLocal) this.onLocalScreen?.(null);
  }

  closePeer(userId: string) {
    this.pc.get(userId)?.close();
    this.pc.delete(userId);
    this.onRemoteScreen?.(userId, null);
  }

  dispose() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.onLocalScreen?.(null);
    for (const pc of this.pc.values()) pc.close();
    this.pc.clear();
  }
}
