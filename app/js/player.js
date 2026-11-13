import { streamUrl, coverUrl, artistNames } from './api.js';

export const player = {
  audio: document.getElementById('audio'),
  queue: [],
  index: -1,
  shuffle: false,
  repeat: 'off', // off | all | one
  _history: [],
  _handlers: {},

  on(evt, fn) {
    (this._handlers[evt] ||= []).push(fn);
    return this;
  },
  emit(evt, ...args) {
    for (const fn of this._handlers[evt] || []) fn(...args);
  },

  get current() {
    return this.queue[this.index] || null;
  },
  get playing() {
    return !this.audio.paused && !!this.current;
  },

  setQueue(tracks, startIndex = 0) {
    this.queue = tracks.slice();
    this.index = Math.max(0, Math.min(startIndex, this.queue.length - 1));
    this._load(true);
  },

  playTrack(track, queue) {
    if (queue) {
      const i = queue.findIndex((t) => t.guid === track.guid);
      this.queue = queue.slice();
      this.index = i >= 0 ? i : 0;
    } else {
      const i = this.queue.findIndex((t) => t.guid === track.guid);
      if (i >= 0) {
        this.index = i;
      } else {
        this.queue.splice(this.index + 1, 0, track);
        this.index += 1;
      }
    }
    this._load(true);
  },

  _load(autoplay) {
    const t = this.current;
    if (!t) return;
    this._history.push(this.index);
    this.audio.src = streamUrl(t.guid);
    this.audio.load();
    if (autoplay) {
      this.audio.play().catch(() => {});
    }
    this._mediaSession(t);
    this.emit('track', t);
    this.emit('queue');
  },

  toggle() {
    if (!this.current) return;
    if (this.audio.paused) {
      this.audio.play().catch(() => {});
    } else {
      this.audio.pause();
    }
  },

  next(auto = false) {
    if (!this.queue.length) return;
    if (this.repeat === 'one' && auto) {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
      return;
    }
    let i;
    if (this.shuffle && this.queue.length > 1) {
      do {
        i = Math.floor(Math.random() * this.queue.length);
      } while (i === this.index);
    } else {
      i = this.index + 1;
    }
    if (i >= this.queue.length) {
      if (!auto || this.repeat === 'all') i = 0;
      else {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.emit('state');
        return;
      }
    }
    this.index = i;
    this._load(true);
  },

  prev() {
    if (!this.queue.length) return;
    if (this.audio.currentTime > 4) {
      this.audio.currentTime = 0;
      return;
    }
    let i = this.index - 1;
    if (i < 0) i = this.repeat === 'all' ? this.queue.length - 1 : 0;
    this.index = i;
    this._load(true);
  },

  seekRatio(ratio) {
    const d = this.audio.duration;
    if (Number.isFinite(d) && d > 0) {
      this.audio.currentTime = Math.max(0, Math.min(1, ratio)) * d;
    }
  },

  setVolume(v) {
    this.audio.volume = Math.max(0, Math.min(1, v));
    this.emit('volume', this.audio.volume);
  },

  _mediaSession(t) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: artistNames(t),
        album: t.album?.name || '',
        artwork: t.coverId ? [{ src: coverUrl(t.coverId), sizes: '512x512', type: 'image/webp' }] : [],
      });
      navigator.mediaSession.setActionHandler('play', () => this.toggle());
      navigator.mediaSession.setActionHandler('pause', () => this.toggle());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    } catch {}
  },
};

const audio = player.audio;

audio.addEventListener('play', () => player.emit('state'));
audio.addEventListener('pause', () => player.emit('state'));
audio.addEventListener('timeupdate', () => player.emit('time'));
audio.addEventListener('loadedmetadata', () => player.emit('time'));
audio.addEventListener('ended', () => player.next(true));
audio.addEventListener('error', () => {
  if (player.current) player.emit('error', '播放失败，可能是格式不支持');
});
