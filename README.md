# 飞牛音乐 · 桌面播放器

对接飞牛 NAS「飞牛音乐」网页版接口的第三方桌面客户端。
Electron 外壳 + 本地零依赖 Node 服务 + 原生 ES Module 前端，无打包构建步骤。

## 发布地址

- GitHub 仓库：<https://github.com/ge-nas/feiniu-music-desktop>
- 下载安装包：<https://github.com/ge-nas/feiniu-music-desktop/releases>

## 开发者文档

- [开发者说明书](docs/开发者说明书.md)：架构、逐文件说明、开发过程、接口逆向、打包、如何继续开发
- [接口笔记](docs/API.md) ｜ [路线图](docs/NEXT.md)

## 功能（v0.1）

- 账号密码直登（v0.2 起，主登录方式，不弹网页）
- 飞牛账号网页授权登录 / 手动粘贴 token（备选）
- 歌曲 / 专辑 / 歌手 / 歌单 / 收藏 / 文件夹 / 搜索
- 播放队列、随机、列表循环、单曲循环、上一首/下一首
- 进度拖动、音量、静音、Media Session（系统媒体键 / 锁屏信息）
- LRC 歌词滚动、点击歌词跳转
- 收藏 / 取消收藏
- 深色界面、封面墙、懒加载

## Windows 安装版 / 免安装版

两种都在发布页 / 构建产物目录 `dist/`：

| 文件 | 大小 | 说明 |
|---|---|---|
| `飞牛音乐电脑版-v0.2.0-安装版.exe` | 80 MB | NSIS 安装包，装到 `%LOCALAPPDATA%\Programs\FnMusic`，建桌面/开始菜单快捷方式，可在「设置 → 应用」卸载 |
| `飞牛音乐电脑版-v0.2.0-win64.zip` | 110 MB | 免安装，解压双击 `FnMusic.exe` |

- 安装版**不需要管理员权限**（按用户安装）
- 未签名，SmartScreen 提示「未知发布者」→「更多信息 → 仍要运行」
- 首次启动 → 填 NAS 地址 + 账号 + 密码 → 登录（不弹网页）

### 自己编译安装包

```bash
sudo apt install nsis
cd build && makensis installer.nsi   # 输出 dist/fnmusic-setup-0.1.0.exe
```

改图标/版本信息：`node scripts/patch-exe.mjs <原exe> build/icon.ico <输出exe>`（纯 JS，不需要 wine）

## 源码运行

```bash
# 1. 安装 Electron（首次）
PATH=/vol2/@appcenter/nodejs_v24/bin:$PATH \
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
npm i -D electron

# 2. 桌面客户端
npx electron .

# 3. 或者只跑本地 Web 版（浏览器打开 http://127.0.0.1:7311）
npm start
```

> Electron 33 / Node 20+。Linux 无桌面环境时可用 `xvfb-run`。

## 登录说明

1. 首次打开弹出「登录飞牛音乐」，填三项：
   - 服务器地址：`192.168.1.10` 或 `http://192.168.1.10:5000`（不填端口默认 5000）
   - 账号 / 密码：飞牛音乐账号密码（回车可直接提交）
2. 点「登录」→ 成功后写入本地 token（`~/.fnmusic-player/config.json`，权限 600），下次自动免登录

密码只在这次请求里用，**不保存**。

> 为什么不再用内嵌网页登录：v0.1 的飞牛系统登录页在 Electron 内必然返回「用户名或密码错误」（同一密码浏览器能登），排查确认是该页面前端加密链路在 Electron 内不生效，故 v0.2 改为账号密码直登（官方 `/music/api/v1/user/password-login`）。

备选：展开「其他登录方式」可用飞牛账号网页授权登录，或手动粘贴 `music-token`（32 位）。

## 目录

```
electron/main.mjs      Electron 主进程：窗口、登录弹窗、OAuth code 拦截
server/index.mjs       HTTP 服务：静态资源、API 代理、音频/封面代理、登录
server/nas.mjs         飞牛音乐签名（authx）与 API 调用
server/config.mjs      本地配置 / token 存储
app/                   前端（原生 ESM，无构建）
docs/API.md            接口调研笔记
scripts/login-probe.mjs 登录页调试小工具
```

## 接口要点（详见 docs/API.md）

- API base：`/music/api/v1`
- 认证：Cookie `music-token` + 请求头 `authx`（MD5 签名，含应用内置 secret/apiKey）
- 音频：`/track/stream?guid=`，支持 Range，直接喂 `<audio>`
- 封面：`/static/cover?coverId=`；歌词：`/lyric/list?trackGUID=`
- 分页固定 50 条/页，`page` 从 1 开始

## 安全

- 本地服务只监听 `127.0.0.1`，随机端口
- token 存在用户目录，文件权限 600，不上传任何第三方
- 所有请求只发往用户填写的 NAS 地址

## 已知限制

- 暂未做转码兜底：浏览器不支持的格式（APE/WMA/DSD 等）会播放失败，需要后续接 `/track/transcode`
- 歌单管理、下载、播放历史上报未实现
- 专辑/歌手列表目前只取第一页（50 条），「加载更多」仅歌曲/专辑/收藏可用

## 打包（可选）

```bash
npm i -D electron-builder
npx electron-builder --win nsis
npx electron-builder --mac dmg
npx electron-builder --linux AppImage
```

在 `package.json` 增加 `build` 字段（appId、productName、files）后即可。
