import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';

const url = process.argv.find((a) => a.startsWith('http'));
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 540, height: 760, show: false, webPreferences: { partition: 'persist:probe' } });
  const dump = async (tag) => {
    const info = await w.webContents.executeJavaScript(`(() => ({
      url: location.href,
      inputs: [...document.querySelectorAll('input')].map(i => ({type:i.type, name:i.name, ph:i.placeholder, id:i.id, cls:i.className})),
      buttons: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean).slice(0,20),
      text: document.body.innerText.slice(0,600),
    }))()`);
    console.log(tag, JSON.stringify(info, null, 2));
  };
  w.loadURL(url);
  w.webContents.on('dom-ready', () => setTimeout(() => dump('DOM'), 3000));
  if (process.env.DOLOGIN) {
    setTimeout(async () => {
      try {
        const r = await w.webContents.executeJavaScript(`(() => {
          const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', {bubbles:true})); };
          const inputs = [...document.querySelectorAll('input')];
          const user = inputs.find(i => i.type !== 'password');
          const pass = inputs.find(i => i.type === 'password');
          if (!user || !pass) return 'no fields';
          set(user, ${JSON.stringify(process.env.NAS_USER || '')});
          set(pass, ${JSON.stringify(process.env.NAS_PASS || '')});
          const btn = [...document.querySelectorAll('button')].find(b => /登录|Login/i.test(b.innerText));
          if (btn) btn.click();
          return 'submitted';
        })()`);
        console.log('LOGIN', r);
        setTimeout(() => dump('AFTER'), 5000);
        setTimeout(() => {
          w.webContents.capturePage().then((img) => fs.writeFileSync('/tmp/after-login.png', img.toPNG())).finally(() => app.quit());
        }, 6000);
      } catch (e) {
        console.log('ERR', e.message);
        app.quit();
      }
    }, 3500);
  } else {
    setTimeout(() => app.quit(), 9000);
  }
});
