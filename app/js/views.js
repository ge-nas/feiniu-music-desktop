import { api, coverHtml, artistNames, fmtTime, fmtTotal, escapeHtml, state } from './api.js';

export const ctx = {
  route: '',
  tracks: [],
  more: null,
};

const PAGE = 50;

function setTracks(list) {
  ctx.tracks = list;
}

export function trackRows(list, { showAlbum = true, startIndex = 0 } = {}) {
  if (!list.length) return `<div class="empty">这里还没有歌曲</div>`;
  return list
    .map((t, i) => {
      const fav = t.isFavorite ? 'on' : '';
      return `<div class="track-row" data-guid="${t.guid}" data-idx="${startIndex + i}">
        <div class="idx">${startIndex + i + 1}</div>
        ${coverHtml(t.coverId, 't-cover')}
        <div class="t-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
        <div class="t-artist">${escapeHtml(artistNames(t))}</div>
        ${showAlbum ? `<div class="t-album">${escapeHtml(t.album?.name || '')}</div>` : '<div class="t-album"></div>'}
        <div class="t-dur">${fmtTime(t.duration)}</div>
        <button class="icon-btn t-fav ${fav}" data-fav="${t.guid}" title="收藏">${t.isFavorite ? '♥' : '♡'}</button>
      </div>`;
    })
    .join('');
}

function trackListShell(list, opts) {
  return `<div class="track-list">${trackRows(list, opts)}</div>`;
}

function loadMore(label = '加载更多') {
  return `<div class="load-more"><button class="btn ghost" data-more>${label}</button></div>`;
}

/* ---------------- home ---------------- */
export async function renderHome() {
  ctx.route = 'home';
  const hour = new Date().getHours();
  const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const [recent, albums] = await Promise.all([
    api('/track/list', { params: { page: 1, sort: 'createdAt,desc' } }),
    api('/album/list', { params: { page: 1, sort: 'newTrackAddedAt,desc' } }),
  ]);
  const tracks = recent.list.slice(0, 12);
  setTracks(recent.list);
  ctx.more = null;

  return `
    <div class="home-hero">
      <div>
        <h1>${greet}，${escapeHtml(state.user?.name || '')}</h1>
        <p>${escapeHtml(state.serverName || '飞牛音乐')} · 共 ${fmtTotal(recent.total)} 首歌曲 / ${fmtTotal(albums.total)} 张专辑</p>
      </div>
      <button class="btn" data-play-all>▶ 播放全部</button>
    </div>

    <div class="section">
      <div class="section-head"><h2>最近添加</h2><a class="more" href="#/tracks">查看全部 →</a></div>
      ${trackListShell(tracks)}
    </div>

    <div class="section">
      <div class="section-head"><h2>新专辑</h2><a class="more" href="#/albums">查看全部 →</a></div>
      <div class="grid">${albumCards(albums.list.slice(0, 12))}</div>
    </div>`;
}

export function artistCards(list) {
  if (!list.length) return `<div class="empty">暂无歌手</div>`;
  return list
    .map(
      (a) => `<div class="card round" data-artist="${a.guid}">
        ${coverHtml(a.coverId)}
        <div class="c-title">${escapeHtml(a.name)}</div>
        <div class="c-sub">${a.trackCount || 0} 首 · ${a.albumCount || 0} 张专辑</div>
      </div>`
    )
    .join('');
}

export function albumCards(list) {
  if (!list.length) return `<div class="empty">暂无专辑</div>`;
  return list
    .map(
      (a) => `<div class="card" data-album="${a.guid}">
        ${coverHtml(a.coverId)}
        <div class="play-float">▶</div>
        <div class="c-title" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
        <div class="c-sub">${escapeHtml(a.artists?.map((x) => x.name).join(' / ') || '未知歌手')} · ${a.trackCount || 0} 首</div>
      </div>`
    )
    .join('');
}

/* ---------------- tracks ---------------- */
export async function renderTracks(sort = 'createdAt,desc') {
  ctx.route = 'tracks';
  const r = await api('/track/list', { params: { page: 1, sort, size: PAGE } });
  setTracks(r.list);
  let page = 1;
  ctx.more = async () => {
    page += 1;
    const n = await api('/track/list', { params: { page, sort, size: PAGE } });
    setTracks(ctx.tracks.concat(n.list));
    return { html: trackRows(n.list, { startIndex: ctx.tracks.length - n.list.length }), done: ctx.tracks.length >= n.total };
  };
  return `
    <div class="page-head">
      <div>
        <h1>歌曲</h1>
        <div class="sub">共 ${fmtTotal(r.total)} 首</div>
      </div>
      <div class="spacer"></div>
      <div class="chips">
        ${chip('createdAt,desc', '最近添加', sort)}
        ${chip('title,asc', '标题', sort)}
        ${chip('trackNumber,asc', '音轨号', sort)}
      </div>
      <button class="btn ghost" data-play-all>▶ 全部播放</button>
    </div>
    ${trackListShell(r.list)}
    ${r.list.length < r.total ? loadMore() : ''}`;
}

function chip(value, label, active) {
  return `<button class="chip ${value === active ? 'active' : ''}" data-sort="${value}">${label}</button>`;
}

/* ---------------- albums ---------------- */
export async function renderAlbums(sort = 'newTrackAddedAt,desc') {
  ctx.route = 'albums';
  const r = await api('/album/list', { params: { page: 1, sort, size: PAGE } });
  setTracks([]);
  let page = 1;
  ctx.albumCount = r.list.length;
  ctx.more = async () => {
    page += 1;
    const n = await api('/album/list', { params: { page, sort, size: PAGE } });
    ctx.albumCount = (ctx.albumCount || PAGE) + n.list.length;
    return { html: albumCards(n.list), done: ctx.albumCount >= n.total };
  };
  return `
    <div class="page-head">
      <div><h1>专辑</h1><div class="sub">共 ${fmtTotal(r.total)} 张</div></div>
      <div class="spacer"></div>
      <div class="chips">
        ${chip('newTrackAddedAt,desc', '最近添加', sort)}
        ${chip('name,asc', '名称', sort)}
        ${chip('releaseYear,desc', '发行年份', sort)}
      </div>
    </div>
    <div class="grid" id="albumGrid">${albumCards(r.list)}</div>
    ${r.list.length < r.total ? loadMore() : ''}`;
}

export async function renderAlbum(guid) {
  ctx.route = 'album';
  const [album, tracks] = await Promise.all([
    api('/album/detail', { params: { guid } }),
    api('/track/album-detail/list', { params: { albumGUID: guid } }),
  ]);
  setTracks(tracks.list);
  ctx.more = null;
  return `
    <div class="hero">
      ${coverHtml(album.coverId)}
      <div class="meta">
        <div class="kind">专辑</div>
        <h1>${escapeHtml(album.name)}</h1>
        <div class="sub">
          <span>${escapeHtml(album.artists?.map((x) => x.name).join(' / ') || '未知歌手')}</span>
          ${album.releaseDate ? `<span class="dot">·</span><span>${album.releaseDate.slice(0, 10)}</span>` : ''}
          <span class="dot">·</span><span>${tracks.total} 首</span>
        </div>
        <div class="actions"><button class="btn" data-play-all>▶ 播放专辑</button></div>
      </div>
    </div>
    ${trackListShell(tracks.list, { showAlbum: false })}`;
}

/* ---------------- artists ---------------- */
export async function renderArtists(sort = 'trackCount,desc') {
  ctx.route = 'artists';
  const r = await api('/artist/list', { params: { page: 1, sort, size: PAGE } });
  setTracks([]);
  let page = 1;
  let count = r.list.length;
  ctx.more = async () => {
    page += 1;
    const n = await api('/artist/list', { params: { page, sort, size: PAGE } });
    count += n.list.length;
    return { html: artistCards(n.list), done: count >= n.total };
  };
  return `
    <div class="page-head"><div><h1>歌手</h1><div class="sub">共 ${fmtTotal(r.total)} 位</div></div></div>
    <div class="grid">${artistCards(r.list)}</div>
    ${r.list.length < r.total ? loadMore('加载更多歌手') : ''}`;
}

export async function renderArtist(guid) {
  ctx.route = 'artist';
  const [artist, albums, tracks] = await Promise.all([
    api('/artist/detail', { params: { guid } }),
    api('/album/artist-detail/list', { params: { artistGUID: guid } }),
    api('/track/artist-detail/list', { params: { artistGUID: guid } }),
  ]);
  setTracks(tracks.list);
  ctx.more = null;
  return `
    <div class="hero">
      ${coverHtml(artist.coverId)}
      <div class="meta">
        <div class="kind">歌手</div>
        <h1>${escapeHtml(artist.name)}</h1>
        <div class="sub"><span>${tracks.total} 首歌曲</span><span class="dot">·</span><span>${albums.total} 张专辑</span></div>
        <div class="actions"><button class="btn" data-play-all>▶ 播放全部</button></div>
      </div>
    </div>
    ${albums.list.length ? `<div class="section"><div class="section-head"><h2>专辑</h2></div><div class="grid">${albumCards(albums.list)}</div></div>` : ''}
    <div class="section"><div class="section-head"><h2>歌曲</h2></div>${trackListShell(tracks.list, { showAlbum: false })}</div>`;
}

/* ---------------- playlists ---------------- */
export async function renderPlaylists() {
  ctx.route = 'playlists';
  const r = await api('/playlist/list');
  setTracks([]);
  ctx.more = null;
  if (!r.list.length) return `<div class="page-head"><div><h1>歌单</h1></div></div><div class="empty">还没有歌单</div>`;
  return `
    <div class="page-head"><div><h1>歌单</h1><div class="sub">共 ${r.total} 个</div></div></div>
    <div class="grid">${r.list
      .map(
        (p) => `<div class="card" data-playlist="${p.guid}">
          ${coverHtml(p.coverId)}
          <div class="play-float">▶</div>
          <div class="c-title">${escapeHtml(p.name)}</div>
          <div class="c-sub">${p.trackCount || 0} 首</div>
        </div>`
      )
      .join('')}</div>`;
}

export async function renderPlaylist(guid) {
  ctx.route = 'playlist';
  const [pl, tracks] = await Promise.all([
    api('/playlist/detail', { params: { guid } }),
    api('/track/playlist-detail/list', { params: { playlistGUID: guid } }),
  ]);
  setTracks(tracks.list);
  ctx.more = null;
  return `
    <div class="hero">
      ${coverHtml(pl.coverId)}
      <div class="meta">
        <div class="kind">歌单</div>
        <h1>${escapeHtml(pl.name)}</h1>
        <div class="sub"><span>${tracks.total} 首</span>${pl.description ? `<span class="dot">·</span><span>${escapeHtml(pl.description)}</span>` : ''}</div>
        <div class="actions"><button class="btn" data-play-all>▶ 播放歌单</button></div>
      </div>
    </div>
    ${trackListShell(tracks.list)}`;
}

/* ---------------- favorites ---------------- */
export async function renderFavorites() {
  ctx.route = 'favorites';
  const r = await api('/favorite-track/list', { params: { page: 1, size: PAGE } });
  setTracks(r.list);
  let page = 1;
  ctx.more = async () => {
    page += 1;
    const n = await api('/favorite-track/list', { params: { page, size: PAGE } });
    const before = ctx.tracks.length;
    setTracks(ctx.tracks.concat(n.list));
    return { html: trackRows(n.list, { startIndex: before }), done: ctx.tracks.length >= n.total };
  };
  return `
    <div class="page-head"><div><h1>我的收藏</h1><div class="sub">共 ${r.total} 首</div></div>
      <div class="spacer"></div><button class="btn ghost" data-play-all>▶ 播放全部</button></div>
    ${trackListShell(r.list)}`;
}

/* ---------------- folders ---------------- */
export async function renderFolders(parentPath = '') {
  ctx.route = 'folders';
  setTracks([]);
  ctx.more = null;

  if (!parentPath) {
    const libs = await api('/shared-library/list');
    return `
      <div class="page-head"><div><h1>文件夹</h1><div class="sub">音乐库</div></div></div>
      <div class="grid">${libs.list
        .map(
          (l) => `<div class="card" data-folder="${encodeURIComponent(l.path)}">
            <div class="cover" style="display:grid;place-items:center;font-size:36px;color:#8b8ba7">▢</div>
            <div class="c-title">${escapeHtml(l.name || l.path.split('/').pop())}</div>
            <div class="c-sub">${escapeHtml(l.path)}</div>
          </div>`
        )
        .join('')}</div>`;
  }

  const r = await api('/folder-view/list', { params: { parentPath, sort: 'title,asc' } });
  const folder = r.folder || { folders: [], tracks: [] };
  const tracks = folder.tracks || [];
  setTracks(tracks);
  const crumbs = parentPath.split('/').filter(Boolean);

  return `
    <div class="page-head">
      <div><h1>${escapeHtml(folder.name || crumbs[crumbs.length - 1] || '文件夹')}</h1>
      <div class="sub">${folder.itemCount ?? tracks.length} 个项目</div></div>
      <div class="spacer"></div>
      <button class="btn ghost" data-folder-root>← 音乐库</button>
      ${tracks.length ? '<button class="btn ghost" data-play-all>▶ 播放本目录</button>' : ''}
    </div>
    <div class="crumbs sub" style="margin:-10px 0 16px;color:#6f6f85">${crumbs
      .map((c, i) => `<span>${escapeHtml(c)}</span>`)
      .join(' / ')}</div>
    ${(folder.folders || [])
      .map(
        (f) => `<div class="track-row" data-folder="${encodeURIComponent(f.path)}" style="grid-template-columns:34px 1fr 100px">
          <div class="idx">▢</div><div class="t-title">${escapeHtml(f.name)}</div><div class="t-dur">${f.itemCount ?? ''}</div></div>`
      )
      .join('')}
    ${tracks.length ? trackListShell(tracks, { showAlbum: false }) : folder.folders?.length ? '' : '<div class="empty">空文件夹</div>'}`;
}

/* ---------------- search ---------------- */
export async function renderSearch(q = '') {
  ctx.route = 'search';
  setTracks([]);
  ctx.more = null;
  if (!q) {
    return `<div class="page-head"><div><h1>搜索</h1><div class="sub">输入关键词，搜索歌曲、专辑或歌手</div></div></div>`;
  }
  const [tracks, albums, artists] = await Promise.all([
    api('/search/track', { params: { q } }),
    api('/search/album', { params: { q } }),
    api('/search/artist', { params: { q } }),
  ]);
  setTracks(tracks.list || []);
  return `
    <div class="page-head"><div><h1>“${escapeHtml(q)}” 的搜索结果</h1>
      <div class="sub">歌曲 ${tracks.total} · 专辑 ${albums.total} · 歌手 ${artists.total}</div></div></div>
    ${tracks.list?.length ? `<div class="section"><div class="section-head"><h2>歌曲</h2></div>${trackListShell(tracks.list)}</div>` : ''}
    ${albums.list?.length ? `<div class="section"><div class="section-head"><h2>专辑</h2></div><div class="grid">${albumCards(albums.list)}</div></div>` : ''}
    ${artists.list?.length ? `<div class="section"><div class="section-head"><h2>歌手</h2></div><div class="grid">${artists.list
      .map(
        (a) => `<div class="card round" data-artist="${a.guid}">${coverHtml(a.coverId)}<div class="c-title">${escapeHtml(a.name)}</div><div class="c-sub">${a.trackCount || 0} 首</div></div>`
      )
      .join('')}</div></div>` : ''}
    ${!tracks.list?.length && !albums.list?.length && !artists.list?.length ? '<div class="empty">没有找到相关内容</div>' : ''}`;
}
