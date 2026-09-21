import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

// Tests run from the client folder; the jsdom URL class cannot be handed to fs, so use a plain path.
const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));

describe('Vercel hosting', () => {
  test('every page address serves the app, so refreshing /income does not 404', () => {
    const rule = config.rewrites.find((r) => r.destination === '/index.html');
    expect(rule).toBeDefined();
    expect(new RegExp(`^${rule.source.replace(/^\/\(\.\*\)$/, '/.*')}$`).test('/income')).toBe(true);
  });

  test('the API is never rewritten to the app', () => {
    // The app calls the API on its own server (VITE_API_URL), so no /api rule should exist here.
    expect(config.rewrites.some((r) => String(r.source).startsWith('/api'))).toBe(false);
  });
});
