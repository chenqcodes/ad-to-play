import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const base = resolve(import.meta.dirname, '..', process.argv[2] || '.');
const port = Number(process.env.PORT || 4173);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = resolve(base, '.' + decodeURIComponent(url.pathname));
    if (url.pathname === '/favicon.svg' && !process.argv[2]) path = resolve(base, 'public/favicon.svg');
    if (path !== base && !path.startsWith(base + sep)) throw new Error('Forbidden');
    const target = (await stat(path)).isDirectory() ? resolve(path, 'index.html') : path;
    const bytes = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Local preview: http://localhost:${port}`));
