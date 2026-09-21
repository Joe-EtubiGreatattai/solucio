const request = require('supertest');

// The app reads its settings when it loads, so each case loads a fresh copy with its own environment.
function loadApp(env) {
  const saved = { ...process.env };
  for (const k of ['CLIENT_ORIGIN', 'TRUST_PROXY']) delete process.env[k];
  Object.assign(process.env, env);
  let app;
  jest.isolateModules(() => { app = require('../src/app'); });
  process.env = saved;
  return app;
}
const preflight = (app, origin) =>
  request(app).options('/api/health').set('Origin', origin).set('Access-Control-Request-Method', 'GET');

describe('CORS: which web addresses may call the API', () => {
  test('with nothing set, only the local dev app is allowed', async () => {
    const app = loadApp({});
    expect((await preflight(app, 'http://localhost:5173')).headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect((await preflight(app, 'https://evil.example')).headers['access-control-allow-origin']).toBeUndefined();
  });

  test('one configured address', async () => {
    const app = loadApp({ CLIENT_ORIGIN: 'https://app.example.com' });
    expect((await preflight(app, 'https://app.example.com')).headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect((await preflight(app, 'http://localhost:5173')).headers['access-control-allow-origin']).toBeUndefined();
  });

  test('several addresses, comma separated with spaces tolerated', async () => {
    const app = loadApp({ CLIENT_ORIGIN: 'https://a.example.com, https://b.example.com ,' });
    expect((await preflight(app, 'https://a.example.com')).headers['access-control-allow-origin']).toBe('https://a.example.com');
    expect((await preflight(app, 'https://b.example.com')).headers['access-control-allow-origin']).toBe('https://b.example.com');
    expect((await preflight(app, 'https://c.example.com')).headers['access-control-allow-origin']).toBeUndefined();
  });

  test('a look-alike address is not allowed', async () => {
    const app = loadApp({ CLIENT_ORIGIN: 'https://app.example.com' });
    expect((await preflight(app, 'https://app.example.com.evil.io')).headers['access-control-allow-origin']).toBeUndefined();
    expect((await preflight(app, 'http://app.example.com')).headers['access-control-allow-origin']).toBeUndefined();
  });

  test('the API still answers normally', async () => {
    const res = await request(loadApp({})).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('TRUST_PROXY: believing nginx about the visitor\'s address', () => {
  test('off by default, so a visitor cannot fake their address', () => {
    expect(loadApp({}).get('trust proxy')).toBeFalsy();
  });
  test('a number means that many proxies in front', () => {
    expect(loadApp({ TRUST_PROXY: '1' }).get('trust proxy')).toBe(1);
  });
  test('a name such as loopback is kept as given', () => {
    expect(loadApp({ TRUST_PROXY: 'loopback' }).get('trust proxy')).toBe('loopback');
  });
});
