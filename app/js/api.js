export class AuthError extends Error {
  constructor(msg = '登录已失效，请重新登录') {
    super(msg);
    this.code = 401;
  }
}

export const state = {
  host: '',
  loggedIn: false,
  user: null,
  volume: 0.85,
  lastView: '#/home',
  serverName: '',
};

export async function loadState() {
  const r = await fetch('/api/state').then((x) => x.json());
  Object.assign(state, r);
  return state;
}

export async function savePrefs(patch) {
  try {
    await fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch {}
}

export async function api(path, { method = 'GET', params, body } = {}) {
  let qs = '';
  if (params) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
    }
    const s = u.toString();
    if (s) qs = '?' + s;
  }
  const res = await fetch('/api/v1' + path + qs, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new AuthError();
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('服务器返回异常');
  }
  if (json.code !== 0) throw new Error(json.msg || `请求失败 (${json.code})`);
  return json.data;
}

export const coverUrl = (coverId) =>
  coverId ? `/media/cover?coverId=${encodeURIComponent(coverId)}` : '';

export const streamUrl = (guid) => `/media/stream?guid=${encodeURIComponent(guid)}`;

export function fmtTime(ms) {
  if (!ms || ms < 0) return '0:00';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtTotal(n) {
  if (n == null) return '';
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  return String(n);
}

export function artistNames(t) {
  const a = t?.artists?.map((x) => x.name).filter(Boolean) || [];
  return a.length ? a.join(' / ') : '未知歌手';
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function coverHtml(coverId, cls = '') {
  const url = coverUrl(coverId);
  if (!url) return `<div class="cover ${cls}"></div>`;
  return `<div class="cover ${cls}"><img src="${url}" loading="lazy" alt=""/></div>`;
}
