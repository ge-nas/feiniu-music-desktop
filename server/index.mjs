import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { buildAuthx, apiUrl, nasApi, normalizeHost, API_KEY } from './nas.mjs';
import * as store from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, '..', 'app');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, obj, status = 200) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}

async function readBody(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('请求体过大');
    chunks.push(c);
  }
  if (!chunks.length) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function requireAuth() {
  const c = store.load();
  if (!c.token) {
    const e = new Error('未登录');
    e.code = 401;
    throw e;
  }
  return c;
}

function upstreamError(res, err) {
  const status = err.code === 99999 || err.code === 401 ? 401 : 502;
  sendJson(res, { code: err.code || -1, msg: err.message || '请求失败', data: null }, status);
}

async function handleAuth(req, res, url) {
  const c = store.load();

  if (url.pathname === '/api/state' && req.method === 'GET') {
    return sendJson(res, { ok: true, ...store.publicState(), clientId: c.clientId || null });
  }

  if (url.pathname === '/api/host' && req.method === 'POST') {
    const body = await readBody(req);
    const host = normalizeHost(body?.host);
    const cfg = await nasApi(host, '', '/sys/config');
    if (cfg.code !== 0) throw Object.assign(new Error(cfg.msg || '无法连接该地址'), { code: 502 });
    const nasOAuth = cfg.data?.nasOAuth || {};
    store.save({ host, clientId: nasOAuth.clientId || null, serverName: cfg.data?.serverName || '' });
    return sendJson(res, { ok: true, host, serverName: cfg.data?.serverName, clientId: nasOAuth.clientId || null });
  }

  if (url.pathname === '/api/auth/url' && req.method === 'GET') {
    const cfg = store.load();
    let clientId = cfg.clientId;
    if (!clientId) {
      const sc = await nasApi(cfg.host, '', '/sys/config');
      clientId = sc.data?.nasOAuth?.clientId;
      if (clientId) store.save({ clientId });
    }
    if (!clientId) throw Object.assign(new Error('该服务器未提供 OAuth clientId'), { code: 502 });
    const redirect = new URL('/music/oauth/result', cfg.host).toString();
    const u = new URL('/signin', cfg.host);
    u.searchParams.set('client_id', clientId);
    u.searchParams.set('redirect_uri', redirect);
    u.searchParams.set('app_name', '飞牛音乐');
    return sendJson(res, { ok: true, url: u.toString(), redirectUri: redirect });
  }

  if (url.pathname === '/api/auth/callback') {
    const body = req.method === 'POST' ? await readBody(req) : null;
    const code = body?.code || url.searchParams.get('code');
    if (!code) throw Object.assign(new Error('缺少授权码'), { code: 400 });
    const cfg = store.load();
    const r = await nasApi(cfg.host, '', '/user/auth-login', {
      method: 'POST',
      body: { code, deviceId: cfg.deviceId },
    });
    if (r.code !== 0 || !r.data?.userToken) {
      throw Object.assign(new Error(r.msg || '授权失败，请重试'), { code: r.code || 502 });
    }
    store.save({ token: r.data.userToken, user: r.data.user });
    return sendJson(res, { ok: true, user: r.data.user });
  }

  if (url.pathname === '/api/auth/manual' && req.method === 'POST') {
    const body = await readBody(req);
    const token = String(body?.token || '').trim();
    if (!token) throw Object.assign(new Error('缺少 token'), { code: 400 });
    const cfg = store.load();
    const me = await nasApi(cfg.host, token, '/user/me');
    if (me.code !== 0) throw Object.assign(new Error(me.msg || 'token 无效'), { code: 401 });
    store.save({ token, user: me.data });
    return sendJson(res, { ok: true, user: me.data });
  }

  if (url.pathname === '/api/logout' && req.method === 'POST') {
    const cfg = store.load();
    if (cfg.token) {
      try {
        await nasApi(cfg.host, cfg.token, '/user/logout', { method: 'POST', body: {} });
      } catch {}
    }
    store.clearAuth();
    return sendJson(res, { ok: true });
  }

  if (url.pathname === '/api/prefs' && req.method === 'POST') {
    const body = await readBody(req) || {};
    const patch = {};
    if (typeof body.volume === 'number') patch.volume = Math.min(1, Math.max(0, body.volume));
    if (typeof body.lastView === 'string') patch.lastView = body.lastView;
    if (body.host) patch.host = normalizeHost(body.host);
    store.save(patch);
    return sendJson(res, { ok: true, ...store.publicState() });
  }

  return sendJson(res, { code: 404, msg: 'not found' }, 404);
}

async function handleProxy(req, res, url) {
  const cfg = requireAuth();
  const sub = url.pathname.replace(/^\/api\/v1/, '');
  const params = Object.fromEntries(url.searchParams.entries());
  const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : undefined;
  const r = await nasApi(cfg.host, cfg.token, sub, { method: req.method, params, body });
  if (r.code === 99999) {
    store.clearAuth();
    return sendJson(res, r, 401);
  }
  return sendJson(res, r);
}

async function handleStream(req, res, url) {
  const cfg = requireAuth();
  const guid = url.searchParams.get('guid');
  if (!guid) return sendJson(res, { code: 400, msg: 'missing guid' }, 400);
  const target = apiUrl(cfg.host, '/track/stream', { guid });
  const headers = {
    authx: buildAuthx(target.pathname, { params: { guid } }),
    Cookie: `music-token=${cfg.token}`,
  };
  if (req.headers.range) headers.Range = req.headers.range;

  const upstream = await fetch(target, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers });
  const out = {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
    'Cache-Control': 'no-store',
  };
  for (const h of ['content-length', 'content-range', 'etag', 'last-modified']) {
    const v = upstream.headers.get(h);
    if (v) out[h.replace(/(^|-)\w/g, (m) => m.toUpperCase())] = v;
  }
  res.writeHead(upstream.status, out);
  if (req.method === 'HEAD' || !upstream.body) return res.end();
  Readable.fromWeb(upstream.body).pipe(res);
}

async function handleCover(req, res, url) {
  const cfg = requireAuth();
  const coverId = url.searchParams.get('coverId');
  if (!coverId) return sendJson(res, { code: 400, msg: 'missing coverId' }, 400);
  const params = { coverId };
  const target = apiUrl(cfg.host, '/static/cover', params);
  const upstream = await fetch(target, {
    headers: { authx: buildAuthx(target.pathname, { params }), Cookie: `music-token=${cfg.token}` },
  });
  if (!upstream.ok) {
    res.writeHead(upstream.status);
    return res.end();
  }
  res.writeHead(200, {
    'Content-Type': upstream.headers.get('content-type') || 'image/webp',
    'Cache-Control': 'public, max-age=86400',
  });
  if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
  else res.end();
}

async function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(APP_DIR, p));
  if (!file.startsWith(APP_DIR)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw new Error('not file');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname.startsWith('/api/v1/')) return await handleProxy(req, res, url);
        return await handleAuth(req, res, url);
      }
      if (url.pathname === '/media/stream') return await handleStream(req, res, url);
      if (url.pathname === '/media/cover') return await handleCover(req, res, url);
      if (url.pathname === '/health') return sendJson(res, { ok: true, apiKey: API_KEY.slice(0, 4) + '...' });
      return await serveStatic(req, res, url);
    } catch (err) {
      if (res.headersSent) return res.end();
      if (err.code === 401 || err.code === 99999) {
        store.clearAuth();
        return sendJson(res, { code: 401, msg: err.message || '未登录' }, 401);
      }
      return upstreamError(res, err);
    }
  });
}

export async function startServer(port = Number(process.env.PORT) || 7311) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT) || 7311;
  const s = await startServer(port);
  console.log(`飞牛音乐播放器: http://127.0.0.1:${s.address().port}`);
}
