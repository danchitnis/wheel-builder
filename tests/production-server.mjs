// Local browser-verification harness. Build first, then:
// node tests/production-server.mjs
// ?verify=slow, webgl-once, import-once, clipboard, or storage exercise failures.
// Fault injection is confined to HTML served by this loopback-only test server.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('dist/client');
let nextViewportAction = '';
let importFailureUsed = false;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    let path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (path.startsWith(root + sep) && (await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) {
      res.writeHead(404).end(); return;
    }
    if (path.includes('/Viewport3D.') && nextViewportAction) {
      const action = nextViewportAction;
      nextViewportAction = '';
      if (action === 'import-once') { importFailureUsed = true; res.writeHead(503).end('Simulated module outage'); return; }
      if (action === 'slow') await new Promise(done => setTimeout(done, 4000));
    }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[extname(path)] ?? 'application/octet-stream';
    let body = await readFile(path);
    if (extname(path) === '.html') {
      const mode = url.searchParams.get('verify');
      nextViewportAction = mode === 'slow' || (mode === 'import-once' && !importFailureUsed) ? mode : '';
      let injection = '';
      if (mode === 'webgl-once') injection = `
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
          if (type === 'webgl2') {
            HTMLCanvasElement.prototype.getContext = original;
            throw new Error('Simulated WebGL startup failure');
          }
          return original.call(this, type, ...args);
        };`;
      if (mode === 'nipple-webgl-once') injection = `
        let nippleFailureUsed = false;
        document.addEventListener('click', event => {
          if (nippleFailureUsed || !event.target.closest('#btn-tab-nipple')) return;
          nippleFailureUsed = true;
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(type, ...args) {
            if (type === 'webgl2') {
              HTMLCanvasElement.prototype.getContext = original;
              throw new Error('Simulated nipple WebGL startup failure');
            }
            return original.call(this, type, ...args);
          };
        }, true);`;
      if (mode === 'clipboard') injection = `
        Object.defineProperty(navigator, 'clipboard', {value: {
          writeText: async () => { throw new Error('Simulated clipboard denial'); }
        }});`;
      if (mode === 'storage') injection = `
        Object.defineProperty(window, 'sessionStorage', {get() { throw new Error('Simulated storage denial'); }});`;
      body = Buffer.from(body.toString().replace('<head>', `<head><script>${injection}</script>`));
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end(); }
});
const port = Number(process.env.PORT ?? 4322);
server.listen(port, '127.0.0.1', () => console.log(`Production test server: http://127.0.0.1:${port} (pid ${process.pid})`));
process.on('SIGTERM', () => { server.close(); server.closeAllConnections(); });
process.on('SIGINT', () => { server.close(); server.closeAllConnections(); });
