import { afterEach, beforeEach, vi } from 'vitest';

// The API address is read when the module loads, so each case loads a fresh copy.
async function loadApi(url) {
  vi.resetModules();
  if (url === undefined) vi.stubEnv('VITE_API_URL', '');
  else vi.stubEnv('VITE_API_URL', url);
  return import('./api.js');
}
const ok = (body = {}) => ({ ok: true, status: 200, json: async () => body, blob: async () => new Blob(['x']) });

beforeEach(() => { global.fetch = vi.fn().mockResolvedValue(ok({ hello: 'world' })); });
afterEach(() => { vi.unstubAllEnvs(); });

test('with no API address set, calls go to the same site under /api (the dev proxy)', async () => {
  const { api } = await loadApi(undefined);
  await api.get('/incomes', { status: 'all' });
  expect(fetch.mock.calls[0][0]).toBe('/api/incomes?status=all');
});

test('with an API address set, calls go to that server', async () => {
  const { api } = await loadApi('https://solucio.example.com');
  await api.get('/incomes');
  expect(fetch.mock.calls[0][0]).toBe('https://solucio.example.com/api/incomes');
  await api.post('/incomes', { amount: 1 });
  expect(fetch.mock.calls[1][0]).toBe('https://solucio.example.com/api/incomes');
});

test('a trailing slash on the address does not double up', async () => {
  const { api } = await loadApi('https://solucio.example.com/');
  await api.get('/roles');
  expect(fetch.mock.calls[0][0]).toBe('https://solucio.example.com/api/roles');
});

test('file downloads and PDF uploads use the same address', async () => {
  const { api } = await loadApi('https://solucio.example.com');
  await api.blob('/incomes/1/receipt');
  expect(fetch.mock.calls[0][0]).toBe('https://solucio.example.com/api/incomes/1/receipt');
  await api.uploadPdf('/statements/import?accountId=a', new Blob(['%PDF']));
  expect(fetch.mock.calls[1][0]).toBe('https://solucio.example.com/api/statements/import?accountId=a');
});

test('the sign-in token is still sent', async () => {
  const { api, setToken } = await loadApi('https://solucio.example.com');
  setToken('abc');
  await api.get('/auth/me');
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
});
