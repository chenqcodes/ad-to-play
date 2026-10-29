import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('analytics permits only Cloudflare origins and preserves all other security headers', async () => {
  const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  const csp = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1];
  const directives = Object.fromEntries(csp.split(';').map(value => {
    const [name, ...sources] = value.trim().split(/\s+/);
    return [name, sources];
  }));
  assert.deepEqual(directives, {
    'default-src': ["'self'"],
    'script-src': ["'self'", 'https://static.cloudflareinsights.com'],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:'],
    'connect-src': ["'self'", 'https://cloudflareinsights.com'],
    'font-src': ["'self'"],
    'media-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'none'"],
  });
  assert.match(headers, /^\/\*\s*$/m);
  assert.match(headers, /^\s*Referrer-Policy: no-referrer\s*$/m);
  assert.match(headers, /^\s*X-Content-Type-Options: nosniff\s*$/m);
  assert.match(headers, /^\s*X-Frame-Options: DENY\s*$/m);
  assert.match(headers, /^\s*Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)\s*$/m);
});
