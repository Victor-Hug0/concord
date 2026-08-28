/// <reference types="vite/client" />

export {};

type CaptureSource = {
  id: string;
  name: string;
  thumbnail: string;
  type: 'screen' | 'window';
  previewOk?: boolean;
  captureRisky?: boolean;
};

type CaptureEnv = {
  platform: string;
  wsl: boolean;
  wayland: boolean;
  screenCaptureUnreliable: boolean;
};

type UpdaterEvent = {
  type: string;
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  message?: string;
  reason?: string;
  releaseNotes?: string | null;
};

declare global {
  interface Window {
    concord?: {
      getSources: () => Promise<CaptureSource[]>;
      getCaptureEnv: () => Promise<CaptureEnv>;
      setDisplaySource: (
        source: { id: string; name: string; audio?: boolean } | null,
      ) => Promise<{ ok: boolean }>;
      openExternal: (url: string) => Promise<void>;
      getMediaAccess: () => Promise<{ microphone: string; screen: string }>;
      getAppVersion: () => Promise<{ version: string; packaged: boolean }>;
      checkForUpdates: () => Promise<{ ok: boolean; version?: string | null; message?: string; reason?: string }>;
      installUpdate: () => Promise<{ ok: boolean; reason?: string }>;
      onUpdaterEvent: (cb: (payload: UpdaterEvent) => void) => () => void;
      onOAuthCallback: (cb: (url: string) => void) => () => void;
    };
  }
}
