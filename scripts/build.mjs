import { mkdir, cp, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'styles.css', 'src', 'public', 'games']) {
  await cp(resolve(root, file), file === 'public' ? out : resolve(out, file), { recursive: true, filter: source => !/[/\\]test([/\\]|$)/.test(source) && !source.endsWith('README.md') });
}
for (const file of ['index.html', 'styles.css', 'src/main.js', 'src/game.js', 'src/render.js', 'src/storage.js', 'src/sound.js', 'games/pin-rescue/index.html', 'games/pin-rescue/main.mjs', 'games/pin-rescue/engine.mjs']) {
  if (!(await stat(resolve(out, file))).size) throw new Error(`Empty build file: ${file}`);
}
console.log('Built static site → dist/ (no third-party dependencies or runtime requests).');
