/** Resolve API host: quando a UI vem do IP do WSL, usa o mesmo host na porta 3000. */
function resolveApiUrl(): string {
  const fallback = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  if (typeof window === 'undefined') return fallback;
  const host = window.location.hostname;
  if (
    /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host) ||
    host === '127.0.0.1'
  ) {
    // Mantém localhost só se a página também for localhost; IP privado → API no mesmo IP
    if (host !== '127.0.0.1' && host !== 'localhost') {
      return `http://${host}:3000`;
    }
  }
  return fallback;
}

export function apiUrl() {
  return resolveApiUrl();
}

export type Tokens = { accessToken: string; refreshToken: string };

const storageKey = 'concord.tokens';

export function loadTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: Tokens | null) {
  if (!tokens) localStorage.removeItem(storageKey);
  else localStorage.setItem(storageKey, JSON.stringify(tokens));
}

async function refreshIfNeeded(res: Response, retry: () => Promise<Response>) {
  if (res.status !== 401) return res;
  const tokens = loadTokens();
  if (!tokens?.refreshToken) return res;
  const refreshed = await fetch(`${apiUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!refreshed.ok) {
    saveTokens(null);
    return res;
  }
  const data = (await refreshed.json()) as Tokens;
  saveTokens(data);
  return retry();
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const doFetch = () => {
    const tokens = loadTokens();
    const h = new Headers(headers);
    if (auth && tokens?.accessToken) {
      h.set('Authorization', `Bearer ${tokens.accessToken}`);
    }
    if (rest.body && !(rest.body instanceof FormData) && !h.has('Content-Type')) {
      h.set('Content-Type', 'application/json');
    }
    return fetch(`${apiUrl()}${path}`, { ...rest, headers: h });
  };

  let res = await doFetch();
  res = await refreshIfNeeded(res, doFetch);
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const err = (await res.json()) as { message?: string | string[] };
      message = Array.isArray(err.message) ? err.message.join(', ') : err.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function wsUrl(token: string) {
  const base = apiUrl().replace(/^http/, 'ws');
  return `${base}/ws?token=${encodeURIComponent(token)}`;
}
