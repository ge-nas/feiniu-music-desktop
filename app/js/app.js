import {
  loadState, state, api, AuthError, coverUrl, fmtTime, artistNames, savePrefs, escapeHtml,
} from './api.js';
import { player } from './player.js';
import * as views from './views.js';

const $ = (s) => document.querySelector(s);
const viewEl = $('#view');
const titleEl = $('#routeTitle');

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------------- auth / server modal ---------------- */
function openServerModal(msg = '') {
  $('#serverModal').classList.add('open');
  $('#hostInput').value = state.host || '';
  $('#modalMsg').textContent = msg;
}
function closeServerModal() {
  $('#serverModal').classList.remove('open');
}

async function refreshState() {
  await loadState();
  renderSidebar();
  return state;
}

function renderSidebar() {
  $('#serverDot').classList.toggle('on', Boolean(state.host && state.loggedIn));
  $('#serverName').textContent = state.serverName || (state.host ? new URL(state.host).host : '未连接');
  $('#serverHost').textContent = state.host || '点击设置服务器';
  $('#userName').textContent = state.user?.name || '未登录';
  $('#userRole').textContent = state.user ? (state.user.role === 'admin' ? '管理员' : '成员') : '飞牛账号';
  $('#userAvatar').textContent = (state.user?.name || '?').slice(0, 1);
}

async function doConnect() {
  const host = $('#hostInput').value.trim();
  const btn = $('#connectBtn');
  btn.disabled = true;
  $('#modalMsg').textContent = '';
  try {
    const r = await fetch('/api/host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host }),
    }).then((x) => x.json());
    if (!r.ok) throw new Error(r.msg || '连接失败');
    const a = await fetch('/api/auth/url').then((x) => x.json());
    if (!a.ok) throw new Error(a.msg || '无法获取登录地址');
    state.host = r.host;
    state.serverName = r.serverName || '';
    renderSidebar();

    const w = window.open(a.url, 'fnmusic-login', 'width=540,height=760');
    $('#modalMsg').textContent = w
      ? '请在登录窗口中完成飞牛账号登录…'
      : '已打开系统登录窗口，请完成飞牛账号登录…';
    const timer = setInterval(async () => {
      try {
        const s = await fetch('/api/state').then((x) => x.json());
        if (s.loggedIn) {
          clearInterval(timer);
          state.loggedIn = true;
          state.user = s.user;
          renderSidebar();
          closeServerModal();
          toast(`欢迎，${s.user?.name || ''}`);
          try { w?.close(); } catch {}
          route();
        } else if (w && w.closed) {
          clearInterval(timer);
          $('#modalMsg').textContent = '登录窗口已关闭。若已完成登录仍无反应，请重试或手动粘贴 token。';
        }
      } catch {}
    }, 1200);
  } catch (e) {
    $('#modalMsg').textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

async function doManualToken() {
  const token = $('#tokenInput').value.trim();
  if (!token) return;
  $('#modalMsg').textContent = '';
  try {
    const r = await fetch('/api/auth/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then((x) => x.json());
    if (!r.ok) throw new Error(r.msg || '登录失败');
    await refreshState();
    closeServerModal();
    toast(`欢迎，${state.user?.name || ''}`);
    route();
  } catch (e) {
    $('#modalMsg').textContent = e.message;
  }
}

/* ---------------- router ---------------- */
let routeSeq = 0;

async function route() {
  if (!state.loggedIn) {
    openServerModal();
    return;
  }
  const seq = ++routeSeq;
  const hash = location.hash || '#/home';
  const [pathPart, queryPart] = hash.slice(1).split('?');
  const query = new URLSearchParams(queryPart || '');
  const parts = pathPart.split('/').filter(Boolean);
  const name = parts[0] || 'home';

  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === name);
  });

  viewEl.innerHTML = `<div class="skeleton"><span class="spinner"></span>正在加载…</div>`;
  try {
    let html = '';
    let title = '首页';
    switch (name) {
      case 'home':
        title = '首页';
        html = await views.renderHome();
        break;
      case 'tracks':
        title = '歌曲';
        html = await views.renderTracks(query.get('sort') || 'createdAt,desc');
        break;
      case 'albums':
        title = '专辑';
        html = await views.renderAlbums(query.get('sort') || 'newTrackAddedAt,desc');
        break;
      case 'album':
        title = '专辑详情';
        html = await views.renderAlbum(parts[1]);
        break;
      case 'artists':
        title = '歌手';
        html = await views.renderArtists();
        break;
      case 'artist':
        title = '歌手详情';
        html = await views.renderArtist(parts[1]);
        break;
      case 'playlists':
        title = '歌单';
        html = await views.renderPlaylists();
        break;
      case 'playlist':
        title = '歌单详情';
        html = await views.renderPlaylist(parts[1]);
        break;
      case 'favorites':
        title = '我的收藏';
        html = await views.renderFavorites();
        break;
      case 'folders':
        title = '文件夹';
        html = await views.renderFolders(query.get('path') || '');
        break;
      case 'search':
        title = '搜索';
        html = await views.renderSearch(query.get('q') || '');
        break;
      default:
        location.hash = '#/home';
        return;
    }
    if (seq !== routeSeq) return;
    titleEl.textContent = title;
    viewEl.innerHTML = html;
    viewEl.scrollTop = 0;
    updatePlayingRows();
    if (hash !== state.lastView) {
      state.lastView = hash;
      savePrefs({ lastView: hash });
    }
  } catch (e) {
    if (seq !== routeSeq) return;
    if (e instanceof AuthError || e.code === 401) {
      state.loggedIn = false;
      renderSidebar();
      openServerModal('登录已失效，请重新登录');
      return;
    }
    viewEl.innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

/* ---------------- playback / UI ---------------- */
function updatePlayingRows() {
  const cur = player.current;
  document.querySelectorAll('.track-row[data-guid]').forEach((row) => {
    const on = cur && row.dataset.guid === cur.guid;
    row.classList.toggle('playing', on);
    const idx = row.querySelector('.idx');
    if (idx) {
      idx.dataset.num ||= idx.textContent;
      idx.textContent = on && player.playing ? '♪' : idx.dataset.num;
    }
  });
}

function renderNowPlaying(t) {
  const cover = $('#npCover');
  cover.innerHTML = t?.coverId ? `<img src="${coverUrl(t.coverId)}" alt=""/>` : '♪';
  $('#npTitle').textContent = t?.title || '未在播放';
  $('#npArtist').textContent = t ? artistNames(t) : '选择一首歌开始';
  $('#npFav').classList.toggle('on', Boolean(t?.isFavorite));
  $('#npFav').textContent = t?.isFavorite ? '♥' : '♡';
  updatePlayingRows();
  loadLyrics(t);
  renderQueue();
  if (t) document.title = `${t.title} · ${artistNames(t)}`;
  else document.title = '飞牛音乐 · 桌面播放器';
}

function updatePlayButton() {
  const playing = player.playing;
  $('#playIcon').innerHTML = playing
    ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>'
    : '<path d="M8 5v14l11-7z" fill="currentColor"/>';
  $('#playBtn').title = playing ? '暂停' : '播放';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  updatePlayingRows();
}

function updateProgress() {
  const a = player.audio;
  const d = a.duration || 0;
  const ratio = d ? a.currentTime / d : 0;
  $('#progressFill').style.width = `${ratio * 100}%`;
  $('#progressThumb').style.left = `${ratio * 100}%`;
  $('#curTime').textContent = fmtTime(a.currentTime * 1000);
  $('#durTime').textContent = fmtTime(d * 1000);
  updateLyricHighlight(a.currentTime);
}

function updateVolume() {
  const v = player.audio.volume;
  $('#volumeFill').style.width = `${v * 100}%`;
  $('#muteBtn').textContent = v === 0 ? '🔇' : v < 0.5 ? '🔉' : '🔊';
}

/* ---------------- queue ---------------- */
function renderQueue() {
  const el = $('#queueList');
  if (!player.queue.length) {
    el.innerHTML = '<div class="empty">队列是空的</div>';
    return;
  }
  el.innerHTML = player.queue
    .map(
      (t, i) => `<div class="queue-item ${i === player.index ? 'active' : ''}" data-q="${i}">
        <div class="q-idx">${i === player.index ? '▶' : i + 1}</div>
        <div class="q-meta"><div class="q-title">${escapeHtml(t.title)}</div><div class="q-artist">${escapeHtml(artistNames(t))}</div></div>
      </div>`
    )
    .join('');
}

/* ---------------- lyrics ---------------- */
let lyricLines = [];
let lyricTimer = null;

async function loadLyrics(t) {
  lyricLines = [];
  const body = $('#lyricsBody');
  body.innerHTML = '<div class="lyrics-empty">暂无歌词</div>';
  if (!t) return;
  try {
    const r = await api('/lyric/list', { params: { trackGUID: t.guid } });
    const content = r.list?.find((x) => x.content)?.content || '';
    if (!content) return;
    lyricLines = parseLrc(content);
    if (!lyricLines.length) return;
    body.innerHTML = lyricLines
      .map((l, i) => `<div class="line" data-line="${i}">${escapeHtml(l.text || '♪')}</div>`)
      .join('');
  } catch {}
}

function parseLrc(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = [...raw.matchAll(/\[(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g)];
    if (!m.length) continue;
    const content = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const x of m) {
      out.push({ time: Number(x[1]) * 60 + Number(x[2]), text: content });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

let lastLyricIndex = -1;
function updateLyricHighlight(sec) {
  if (!lyricLines.length) return;
  let i = -1;
  for (let k = 0; k < lyricLines.length; k++) {
    if (lyricLines[k].time <= sec + 0.15) i = k;
    else break;
  }
  if (i === lastLyricIndex) return;
  lastLyricIndex = i;
  const body = $('#lyricsBody');
  body.querySelectorAll('.line').forEach((el, k) => el.classList.toggle('active', k === i));
  const active = body.querySelector('.line.active');
  if (active && $('#lyricsDrawer').classList.contains('open')) {
    active.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

/* ---------------- events ---------------- */
function bind() {
  $('#nav').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-nav]');
    if (!a) return;
    if (a.dataset.nav === 'folders') location.hash = '#/folders';
  });

  $('#globalSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      location.hash = q ? `#/search?q=${encodeURIComponent(q)}` : '#/search';
    }
  });

  $('#refreshBtn').addEventListener('click', () => route());

  viewEl.addEventListener('click', async (e) => {
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
      e.stopPropagation();
      await toggleFavorite(favBtn.dataset.fav);
      return;
    }
    const row = e.target.closest('.track-row[data-guid]');
    if (row) {
      const track = views.ctx.tracks.find((t) => t.guid === row.dataset.guid);
      if (track) player.playTrack(track, views.ctx.tracks);
      return;
    }
    const more = e.target.closest('[data-more]');
    if (more && views.ctx.more) {
      more.disabled = true;
      try {
        const r = await views.ctx.more();
        if (r?.html) {
          const list = viewEl.querySelector('.track-list');
          if (list && r.html.includes('track-row')) list.insertAdjacentHTML('beforeend', r.html);
          else viewEl.querySelector('.grid')?.insertAdjacentHTML('beforeend', r.html);
        }
        more.disabled = false;
        if (r?.done) more.parentElement.remove();
      } catch (err) {
        more.disabled = false;
        toast(err.message);
      }
      return;
    }
    const sort = e.target.closest('[data-sort]');
    if (sort) {
      const base = location.hash.split('?')[0];
      location.hash = `${base}?sort=${encodeURIComponent(sort.dataset.sort)}`;
      return;
    }
    const album = e.target.closest('[data-album]');
    if (album) return (location.hash = `#/album/${album.dataset.album}`);
    const artist = e.target.closest('[data-artist]');
    if (artist) return (location.hash = `#/artist/${artist.dataset.artist}`);
    const pl = e.target.closest('[data-playlist]');
    if (pl) return (location.hash = `#/playlist/${pl.dataset.playlist}`);
    const folder = e.target.closest('[data-folder]');
    if (folder) return (location.hash = `#/folders?path=${folder.dataset.folder}`);
    if (e.target.closest('[data-folder-root]')) return (location.hash = '#/folders');
    if (e.target.closest('[data-play-all]')) {
      if (!views.ctx.tracks.length) return toast('没有可播放的歌曲');
      player.setQueue(views.ctx.tracks, 0);
    }
  });

  $('#playBtn').addEventListener('click', () => player.toggle());
  $('#prevBtn').addEventListener('click', () => player.prev());
  $('#nextBtn').addEventListener('click', () => player.next());
  $('#shuffleBtn').addEventListener('click', () => {
    player.shuffle = !player.shuffle;
    $('#shuffleBtn').classList.toggle('active', player.shuffle);
    toast(player.shuffle ? '随机播放已开启' : '随机播放已关闭');
  });
  $('#repeatBtn').addEventListener('click', () => {
    player.repeat = player.repeat === 'off' ? 'all' : player.repeat === 'all' ? 'one' : 'off';
    const b = $('#repeatBtn');
    b.classList.toggle('active', player.repeat !== 'off');
    b.textContent = player.repeat === 'one' ? '↻¹' : '↻';
    toast(player.repeat === 'off' ? '不循环' : player.repeat === 'all' ? '列表循环' : '单曲循环');
  });

  $('#npFav').addEventListener('click', () => player.current && toggleFavorite(player.current.guid));

  $('#progress').addEventListener('pointerdown', (e) => {
    const bar = e.currentTarget;
    const move = (ev) => {
      const r = bar.getBoundingClientRect();
      player.seekRatio((ev.clientX - r.left) / r.width);
      updateProgress();
    };
    move(e);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  $('#volume').addEventListener('pointerdown', (e) => {
    const bar = e.currentTarget;
    const move = (ev) => {
      const r = bar.getBoundingClientRect();
      const v = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      player.setVolume(v);
      savePrefs({ volume: v });
    };
    move(e);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  $('#muteBtn').addEventListener('click', () => {
    if (player.audio.volume > 0) {
      player._lastVolume = player.audio.volume;
      player.setVolume(0);
    } else {
      player.setVolume(player._lastVolume || 0.8);
    }
    savePrefs({ volume: player.audio.volume });
  });

  $('#queueBtn').addEventListener('click', () => {
    $('#lyricsDrawer').classList.remove('open');
    $('#queueDrawer').classList.toggle('open');
  });
  $('#lyricsBtn').addEventListener('click', () => {
    $('#queueDrawer').classList.remove('open');
    $('#lyricsDrawer').classList.toggle('open');
  });
  document.querySelectorAll('[data-close-drawer]').forEach((b) =>
    b.addEventListener('click', () => b.closest('.drawer').classList.remove('open'))
  );

  $('#queueList').addEventListener('click', (e) => {
    const item = e.target.closest('[data-q]');
    if (!item) return;
    const i = Number(item.dataset.q);
    player.index = i;
    player._load(true);
  });

  $('#lyricsBody').addEventListener('click', (e) => {
    const line = e.target.closest('[data-line]');
    if (!line) return;
    const l = lyricLines[Number(line.dataset.line)];
    if (l) player.audio.currentTime = l.time;
  });

  $('#serverCard').addEventListener('click', () => openServerModal());
  $('#userRow').addEventListener('click', (e) => {
    if (e.target.closest('#logoutBtn')) return;
    openServerModal();
  });
  $('#connectBtn').addEventListener('click', doConnect);
  $('#tokenBtn').addEventListener('click', doManualToken);
  document.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', closeServerModal));
  $('#logoutBtn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await fetch('/api/logout', { method: 'POST' });
    player.audio.pause();
    player.queue = [];
    player.index = -1;
    await refreshState();
    openServerModal('已退出登录');
  });

  window.addEventListener('hashchange', route);

  player.on('track', renderNowPlaying);
  player.on('state', updatePlayButton);
  player.on('time', updateProgress);
  player.on('volume', updateVolume);
  player.on('queue', renderQueue);
  player.on('error', (m) => toast(m));

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      player.toggle();
    } else if (e.code === 'ArrowRight' && e.altKey) {
      player.next();
    } else if (e.code === 'ArrowLeft' && e.altKey) {
      player.prev();
    }
  });

  $('#shuffleBtn').classList.toggle('active', player.shuffle);
  $('#repeatBtn').classList.toggle('active', player.repeat !== 'off');
}

async function toggleFavorite(guid) {
  const track = views.ctx.tracks.find((t) => t.guid === guid) || (player.current?.guid === guid ? player.current : null);
  if (!track) return;
  const next = !track.isFavorite;
  try {
    await api(next ? '/favorite-track/create' : '/favorite-track/delete', {
      method: 'POST',
      body: { trackGUID: guid },
    });
    for (const t of views.ctx.tracks) if (t.guid === guid) t.isFavorite = next;
    if (player.current?.guid === guid) player.current.isFavorite = next;
    document.querySelectorAll(`[data-fav="${guid}"]`).forEach((b) => {
      b.classList.toggle('on', next);
      b.textContent = next ? '♥' : '♡';
    });
    if (player.current?.guid === guid) {
      $('#npFav').classList.toggle('on', next);
      $('#npFav').textContent = next ? '♥' : '♡';
    }
    toast(next ? '已加入收藏' : '已取消收藏');
  } catch (e) {
    toast(e.message);
  }
}

/* ---------------- boot ---------------- */
(async function boot() {
  document.addEventListener('error', (e) => {
    if (e.target?.tagName === 'IMG') e.target.style.display = 'none';
  }, true);
  bind();
  try {
    await refreshState();
  } catch {}
  player.setVolume(state.volume ?? 0.85);
  updateVolume();
  if (!location.hash) location.hash = state.lastView || '#/home';
  route();
  if (!state.loggedIn) openServerModal();
})();
