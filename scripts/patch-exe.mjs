import fs from 'node:fs';
import { NtExecutable, NtExecutableResource, Resource, Data } from 'resedit';

const [, , inExe, inIco, outExe] = process.argv;
const exe = NtExecutable.from(fs.readFileSync(inExe), { ignoreCert: true });
const res = NtExecutableResource.from(exe);

const ico = Data.IconFile.from(fs.readFileSync(inIco));
const groups = Resource.IconGroupEntry.fromEntries(res.entries);
if (!groups.length) throw new Error('no icon group');
const g = groups[0];
Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, ico.icons.map((i) => i.data));
console.log('icon', g.id, g.lang, ico.icons.length);

const lang = 1033, cp = 1200;
let vi = Resource.VersionInfo.fromEntries(res.entries)[0];
if (!vi) vi = Resource.VersionInfo.create(lang, {}, []);
vi.setStringValues({ lang, codepage: cp }, {
  FileDescription: '飞牛音乐',
  ProductName: '飞牛音乐',
  ProductVersion: '0.1.0.0',
  FileVersion: '0.1.0.0',
  CompanyName: 'fnmusic',
  LegalCopyright: 'Personal use only',
  OriginalFilename: 'FnMusic.exe',
  InternalName: 'fnmusic-player',
}, true);
vi.fixedInfo.fileVersionMS = 1; vi.fixedInfo.fileVersionLS = 0;
vi.fixedInfo.productVersionMS = 1; vi.fixedInfo.productVersionLS = 0;
vi.outputToResourceEntries(res.entries);

res.outputResource(exe);
fs.writeFileSync(outExe, Buffer.from(exe.generate()));
console.log('written', fs.statSync(outExe).size);
