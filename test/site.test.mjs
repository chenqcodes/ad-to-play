import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
test('both game routes have an explicit reciprocal navigation link', async () => {
  const home = await readFile(new URL('index.html', root), 'utf8');
  const pin = await readFile(new URL('games/pin-rescue/index.html', root), 'utf8');
  assert.match(home, /href="\.\/games\/pin-rescue\/"/); assert.match(pin, /href="\/"/);
  assert.match(pin, /Ad to Play/); assert.match(home, /双游戏版 0.3/);
});
test('static runtime imports resolve locally and local server serves ES modules', async () => {
  for (const file of ['src/main.js', 'src/render.js', 'games/pin-rescue/main.mjs']) {
    const url = new URL(file, root), text = await readFile(url, 'utf8');
    for (const [, path] of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(path.startsWith('.'), 'No external runtime import'); await access(new URL(path, url));
    }
  }
  const serve = await readFile(new URL('scripts/serve.mjs', root), 'utf8');
  assert.match(serve, /'\.mjs':'text\/javascript/);
});
test('runtime has no remote assets, analytics or account endpoints', async () => {
  for (const file of ['index.html', 'styles.css', 'src/main.js', 'src/game.js', 'src/render.js', 'games/pin-rescue/index.html', 'games/pin-rescue/main.mjs', 'games/pin-rescue/style.css']) {
    const text = await readFile(new URL(file, root), 'utf8');
    assert.doesNotMatch(text, /(?:src|href)=["']https?:\/\//);
    assert.doesNotMatch(text, /fetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket/);
  }
});
