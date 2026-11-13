import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';

const url = process.argv.find((a) => a.startsWith('http'));
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 540, height: 760, show: false, webPreferences: { partition: 'persist:probe' } });
  const dump = async () => {
    console.log('URL:', w.webContents.getURL());
    try {
      const text = await w.webContents.executeJavaScript('document.body.innerText');
      console.log('TEXT:', text.slice(0, 2000));
    } catch (e) {
      console.log('ERR', e.message);
    }
    try {
      const img = await w.webContents.capturePage();
      fs.writeFileSync(process.env.OUT || '/tmp/login.png', img.toPNG());
      console.log('SHOT saved');
    } catch (e) {
      console.log('SHOT ERR', e.message);
    }
    app.quit();
  };
  w.webContents.on('dom-ready', () => setTimeout(dump, 3500));
  setTimeout(dump, 12000);
  w.loadURL(url);
});
