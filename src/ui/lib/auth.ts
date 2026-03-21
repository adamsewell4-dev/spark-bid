const TOKEN_KEY = 'spark_bid_token';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => { localStorage.setItem(TOKEN_KEY, t); };
export const clearToken = (): void => { localStorage.removeItem(TOKEN_KEY); };
export const isAuthenticated = (): boolean => !!getToken();

const RAILWAY_URL = import.meta.env.VITE_RAILWAY_URL ?? '';

/** Authenticated fetch — adds Bearer token and routes long-running calls directly to Railway. */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** Direct Railway fetch (bypasses Netlify proxy) — use for slow endpoints like proposal generation. */
export async function railwayFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return authFetch(`${RAILWAY_URL}${path}`, options);
}
