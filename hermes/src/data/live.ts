/* The Awady Office server (office-server/ on the VPS) over HTTP. */

export interface ServerConfig {
  url: string;
  token: string;
}

const KEY = 'awady-office-server';

export function loadConfig(): ServerConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return c && typeof c.url === 'string' && typeof c.token === 'string' ? c : null;
  } catch {
    return null;
  }
}

export function saveConfig(c: ServerConfig | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: lasts this session only */
  }
}

export function normalizeUrl(url: string) {
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/+$/, '');
}

export async function api<T>(c: ServerConfig, path: string, init: { method?: string; body?: unknown; timeout?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeout ?? 20_000);
  try {
    const res = await fetch(c.url + path, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${c.token}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
    return data as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('The server did not answer in time');
    if (e instanceof TypeError) throw new Error("Can't reach the server");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
