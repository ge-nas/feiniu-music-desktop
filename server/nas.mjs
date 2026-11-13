import crypto from 'node:crypto';

export const SECRET = 'NDzZTVxnRKP8Z0jXg1VAMonaG8akvh';
export const API_KEY = '6D5602D4-A342-4799-A0F0-BB795E7167D0';

export const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

export function buildAuthx(pathname, { params, bodyBytes } = {}) {
  const nonce = String(Math.floor(Math.random() * 900000) + 100000);
  const timestamp = String(Date.now());

  let raw = '';
  if (bodyBytes === undefined) {
    if (params && Object.keys(params).length) {
      const qs = Object.keys(params)
        .sort()
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k])).replace(/%20/g, '%20')}`)
        .join('&');
      // 前端先把 URLSearchParams 里的 '+' 换成 %20，再 decodeURIComponent 后做 md5
      raw = decodeURIComponent(qs.replace(/\+/g, '%20'));
    }
  } else {
    raw = bodyBytes.toString('utf8');
  }

  const bodyhash = md5(raw);
  const sign = md5([SECRET, pathname, nonce, timestamp, bodyhash, API_KEY].join('_'));
  return `nonce=${nonce}&timestamp=${timestamp}&sign=${sign}`;
}

export function normalizeHost(input) {
  let h = String(input || '').trim().replace(/\/+$/, '');
  if (!h) throw new Error('请填写 NAS 地址');
  if (!/^https?:\/\//i.test(h)) h = 'http://' + h;
  const u = new URL(h);
  // fnOS 默认 HTTP 5000；HTTPS 多为反代 443，不强行改端口
  if (!u.port && u.protocol === 'http:') u.port = '5000';
  return u.origin;
}

export function deviceId() {
  return crypto.randomBytes(16).toString('hex');
}

export function apiUrl(host, path, params) {
  const u = new URL('/music/api/v1' + path, host);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
    }
  }
  return u;
}

/**
 * 调用飞牛音乐 JSON 接口
 */
export async function nasApi(host, token, path, { method = 'GET', params, body, timeout = 20000 } = {}) {
  const url = apiUrl(host, path, params);
  const pathname = url.pathname;
  const bodyBytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');
  const headers = {
    authx: buildAuthx(pathname, { params: params || {}, bodyBytes }),
    Accept: 'application/json',
  };
  if (token) headers.Cookie = `music-token=${token}`;
  if (bodyBytes) headers['Content-Type'] = 'application/json';

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, { method, headers, body: bodyBytes, signal: ac.signal });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { code: -1, msg: `上游返回非 JSON (${res.status})`, data: text.slice(0, 300) };
    }
    if (res.status === 401 && json?.code === 99999) {
      const err = new Error('登录已失效，请重新登录');
      err.code = 99999;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}
