const TOKEN_KEY = 'solucio_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, path, { body, query, raw } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null))
    : '';
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  let res;
  try {
    res = await fetch(`/api${path}${qs}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized();
  if (!res.ok) {
    let data = {};
    try { data = await res.json(); } catch { /* not JSON */ }
    throw new ApiError(res.status, data.message || 'Request failed', data.fields);
  }
  return raw ? res.blob() : res.json();
}

export const api = {
  get: (p, query) => request('GET', p, { query }),
  post: (p, body) => request('POST', p, { body }),
  patch: (p, body) => request('PATCH', p, { body }),
  blob: (p, query) => request('GET', p, { query, raw: true }),
};
