import { app, BrowserWindow, shell, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWin = null;
let server = null;
let baseUrl = '';
let loginWin = null;

async function finishLogin(code) {
  try {
    const r = await fetch(`${baseUrl}/api/auth/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const j = await r.json();
    console.log('[oauth] callback', r.status, j.ok, j.msg || '');
    if (j.ok) {
      loginWin?.close();
      loginWin = null;
      mainWin?.webContents.executeJavaScript('location.reload()').catch(() => {});
    } else {
      if (!process.env.FNMP_TEST_OAUTH) dialog.showErrorBox('登录失败', j.msg || '授权码换取 token 失败');
    }
  } catch (e) {
    dialog.showErrorBox('登录失败', String(e));
  }
}

function isOAuthResult(target) {
  try {
    const u = new URL(target);
    return u.pathname.replace(/\/+$/, '').endsWith('/music/oauth/result') || u.pathname.endsWith('/oauth/result');
  } catch {
    return false;
  }
}

function openLoginWindow(url) {
  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.focus();
    loginWin.loadURL(url);
    return;
  }
  loginWin = new BrowserWindow({
    parent: mainWin,
    modal: false,
    width: 540,
    height: 760,
    autoHideMenuBar: true,
    title: '飞牛账号登录',
    backgroundColor: '#111118',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { partition: 'persist:fnmusic-login', nodeIntegration: false, contextIsolation: true },
  });

  const captured = new Set();
  const handle = (e, target) => {
    if (!target || captured.has(target)) return;
    if (!isOAuthResult(target)) return;
    captured.add(target);
    // 必须在页面加载前拦住，否则音乐 SPA 会先用掉一次性 code
    try { e?.preventDefault?.(); } catch {}
    try {
      const u = new URL(target);
      const code = u.searchParams.get('code');
      if (code) finishLogin(code);
      else {
        const err = u.searchParams.get('error') || u.searchParams.get('errmsg');
        if (err) dialog.showErrorBox('登录失败', decodeURIComponent(err));
      }
    } catch {}
  };

  loginWin.webContents.on('will-redirect', (e, target) => handle(e, target));
  loginWin.webContents.on('will-navigate', (e, target) => handle(e, target));
  loginWin.webContents.on('did-navigate', (_e, target) => handle(null, target));
  loginWin.webContents.on('did-navigate-in-page', (_e, target) => handle(null, target));
  loginWin.on('closed', () => (loginWin = null));

  if (process.env.FNMP_AUTOLOGIN === '1') {
    loginWin.webContents.on('dom-ready', () => {
      setTimeout(async () => {
        try {
          const u = process.env.NAS_USER || '';
          const p = process.env.NAS_PASS || '';
          const r = await loginWin.webContents.executeJavaScript(`(() => {
            const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', {bubbles:true})); };
            const inputs = [...document.querySelectorAll('input')];
            const user = inputs.find(i => i.type !== 'password' && i.type !== 'checkbox');
            const pass = inputs.find(i => i.type === 'password');
            if (!user || !pass) return 'no fields';
            set(user, ${JSON.stringify(u)});
            set(pass, ${JSON.stringify(p)});
            const btn = [...document.querySelectorAll('button')].find(b => /登录|Login/i.test(b.innerText));
            if (!btn) return 'no button';
            btn.click();
            return 'submitted';
          })()`);
          console.log('[autologin]', r);
          setTimeout(async () => {
            try {
              const t = await loginWin.webContents.executeJavaScript('location.pathname + "|" + document.body.innerText.slice(0,200)');
              console.log('[autologin-after]', t.replace(/\n/g, ' / '));
            } catch {}
          }, 3500);
        } catch (e) {
          console.log('[autologin] error', e.message);
        }
      }, 2600);
    });
  }

  loginWin.loadURL(url);
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#0b0b10',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    title: '飞牛音乐',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('/signin')) {
      openLoginWindow(url);
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWin.loadURL(baseUrl);

  if (process.env.FNMP_DUMP) {
    mainWin.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const data = await mainWin.webContents.executeJavaScript(`(() => {
            const rect = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; };
            const over = [...document.querySelectorAll('.view *')].filter(e => e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0).slice(0,8).map(e => e.className + '|' + e.scrollWidth + '>' + e.clientWidth);
            return {
              title: document.title, hash: location.hash,
              rows: document.querySelectorAll('.track-row').length,
              cards: document.querySelectorAll('.card').length,
              sidebar: rect('.sidebar'), main: rect('.main'), player: rect('.playerbar'), view: rect('.view'),
              topbarText: document.querySelector('.topbar')?.innerText,
              sidebarText: document.querySelector('.sidebar')?.innerText,
              viewText: document.querySelector('.view')?.innerText.slice(0, 1200),
              playerText: document.querySelector('.playerbar')?.innerText,
              overflow: over,
              imgs: [...document.images].map(i => ({src: i.src.slice(-60), ok: i.complete && i.naturalWidth > 0})).slice(0,10),
            };
          })()`);
          console.log('DUMP ' + JSON.stringify(data, null, 2));
        } catch (e) {
          console.error('dump failed', e);
        }
        app.quit();
      }, Number(process.env.FNMP_SHOT_DELAY) || 2500);
    });
  }

  if (process.env.FNMP_EVAL) {
    mainWin.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          await mainWin.webContents.executeJavaScript(process.env.FNMP_EVAL);
          await new Promise((r) => setTimeout(r, Number(process.env.FNMP_EVAL_WAIT) || 4000));
          const out = await mainWin.webContents.executeJavaScript(process.env.FNMP_EVAL_AFTER || 'null');
          console.log('EVAL ' + JSON.stringify(out, null, 2));
        } catch (e) {
          console.error('eval failed', e);
        }
        app.quit();
      }, Number(process.env.FNMP_SHOT_DELAY) || 2500);
    });
  }

  mainWin.webContents.on('console-message', (_e, level, msg) => {
    if (process.env.FNMP_DUMP) console.log('[console]', level, msg.slice(0, 300));
  });

  if (process.env.FNMP_SHOT) {
    mainWin.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await mainWin.webContents.capturePage();
          const fs = await import('node:fs');
          fs.writeFileSync(process.env.FNMP_SHOT, img.toPNG());
          console.log('screenshot saved', process.env.FNMP_SHOT);
        } catch (e) {
          console.error('screenshot failed', e);
        }
        app.quit();
      }, Number(process.env.FNMP_SHOT_DELAY) || 2500);
    });
  }

  mainWin.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWin.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

app.setName('飞牛音乐');

app.whenReady().then(async () => {
  server = await startServer(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log('local server:', baseUrl);
  createWindow();

  if (process.env.FNMP_TEST_OAUTH) openLoginWindow(process.env.FNMP_TEST_OAUTH);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  server?.close();
});
