import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deviceId } from './nas.mjs';

const HOME = process.env.FNMP_HOME || path.join(os.homedir(), '.fnmusic-player');
const FILE = path.join(HOME, 'config.json');

const defaults = () => ({
  host: '',
  token: '',
  user: null,
  deviceId: deviceId(),
  volume: 0.85,
  lastView: '#/tracks',
});

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    cache = { ...defaults(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    cache = defaults();
  }
  if (!cache.deviceId) cache.deviceId = deviceId();
  return cache;
}

export function save(patch) {
  const cfg = { ...load(), ...patch };
  cache = cfg;
  fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
  try {
    fs.chmodSync(FILE, 0o600);
  } catch {}
  return cfg;
}

export function clearAuth() {
  return save({ token: '', user: null });
}

export function publicState() {
  const c = load();
  return {
    host: c.host,
    loggedIn: Boolean(c.token && c.user),
    user: c.user,
    volume: c.volume,
    lastView: c.lastView,
  };
}

export { FILE as CONFIG_FILE };
