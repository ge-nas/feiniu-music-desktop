# 飞牛音乐（trim.music）接口笔记

> 来源：NAS 上 `/usr/local/apps/@appcenter/trim.music/` 前端 bundle + 实测（2026-11-12）。
> 服务由 nginx 反代：`/music` → `unix:/var/run/trim_music.socket`。

## 1. 基础

- 站点：`http://<nas>:<port>/music/`（fnOS 默认 5000；80 会 302 到 5000）
- API base：`/music/api/v1`（另有 `/api/v2`、`/api/intl/v1`、`/api/intl/v2`）
- 认证：Cookie `music-token=<token>`（前端也支持 URL 参数同名）
- 额外签名头 **`authx`**（所有接口都要，否则 401/120001）：

```
nonce     = 6 位随机数
timestamp = 毫秒时间戳
bodyhash  = GET  : md5(decodeURIComponent(sorted "k=v&..." 去参数名排序，空格编码 %20))
            POST : md5(raw JSON body 字节)
sign      = md5(secret + "_" + pathname + "_" + nonce + "_" + timestamp + "_" + bodyhash + "_" + apiKey)

secret = NDzZTVxnRKP8Z0jXg1VAMonaG8akvh
apiKey = 6D5602D4-A342-4799-A0F0-BB795E7167D0
pathname 必须带 /music 前缀，例如 /music/api/v1/track/list
authx = nonce=...&timestamp=...&sign=...
```

## 2. 登录

### 2.1 OAuth（推荐，等同于网页版）

1. `GET /music/api/v1/sys/config` → `data.nasOAuth.clientId`（每台 NAS 不同，需动态获取）
2. 浏览器打开：
   `http://<nas>:5000/signin?client_id=<clientId>&redirect_uri=<urlencode(http://<nas>:5000/music/oauth/result)>&app_name=<urlencode(飞牛音乐)>`
3. 登录成功后跳回 `/music/oauth/result?code=...`
4. `POST /music/api/v1/user/auth-login`，body `{"code":"...","deviceId":"32位hex"}`
   → `data.userToken`（即 music-token）、`data.user`

### 2.2 密码登录（仅限音乐应用内自建用户）

`POST /music/api/v1/user/password-login` `{"username","password","deviceId"}`
> NAS 同步过来的用户（created_by=oauth）会返回 `120001`，不可用。

### 2.3 其它

- `GET /user/me` → 当前用户
- `POST /user/logout`
- `GET /sys/info` → 连接/授权信息
- `GET /initialization/state` → `{initialized:true}`

## 3. 媒体库

分页统一：`page`（从 1 开始），每页固定 **50**，返回 `{list,total,sort}`。

| 功能 | 接口 | 参数 |
|---|---|---|
| 歌曲 | `GET /track/list` | `page`, `sort`（如 `title,asc`） |
| 专辑 | `GET /album/list` | `page`, `sort` |
| 专辑详情 | `GET /album/detail` | `guid` |
| 专辑曲目 | `GET /track/album-detail/list` | `albumGUID` |
| 歌手 | `GET /artist/list` | `page`, `sort` |
| 歌手详情 | `GET /artist/detail` | `guid` |
| 歌手专辑 | `GET /album/artist-detail/list` | `artistGUID` |
| 歌手曲目 | `GET /track/artist-detail/list` | `artistGUID` |
| 歌单 | `GET /playlist/list` | — |
| 歌单详情 | `GET /playlist/detail` | `guid` |
| 歌单曲目 | `GET /track/playlist-detail/list` | `playlistGUID` |
| 收藏 | `GET /favorite-track/list` | `page` |
| 收藏/取消 | `POST /favorite-track/create` / `delete` | `{trackGUID}` |
| 最近播放 | `GET /play-history/list` | `page` |
| 文件夹 | `GET /folder-view/list` | `parentPath`, `sort` |
| 文件夹可播曲目 | `POST /folder-view/playable-tracks` | `{folderPaths:[],trackGUIDs:[]}` |

曲目对象关键字段：
`guid,title,duration(ms),trackNo,discNo,isCue,isFavorite,coverId,album{guid,name,coverId},artists[{guid,name}],audioSpec{format,codec,bitrate,sampleRate,bitDepth,channel,size,path}`

## 4. 播放

- 直链：`GET /music/api/v1/track/stream?guid=<guid>`
  - 支持 `Range`，返回 206 + `audio/mpeg` 等；浏览器 `<audio>` 直接可用
- 封面：`GET /music/api/v1/static/cover?coverId=<coverId>` → webp（支持 Range）
- 歌词：`GET /music/api/v1/lyric/list?trackGUID=<guid>` → `data.list[].content` 为 LRC 文本
- 转码（格式不支持时）：
  `POST /track/transcode` `{guid, channel, start:0, output:{...quality}}`
  → `{status, ...}`；心跳 `POST /track/transcode/heartbeat`；退出 `POST /track/transcode/quit`
- HLS 预设：`/track/hls/:guid/preset.m3u8`

## 5. 搜索

- `GET /search/track?q=关键词`（也接受 `keyword` 同时传）
- `GET /search/album?q=`、`/search/artist?q=`、`/search/playlist?q=`
- `GET /search/suggest?q=` → `{track:{items},album:{...},artist:{...}}`
- 重建索引：`POST /search/index/rebuild`

## 6. 其它

- 播放上报：`POST /event/report`（前端埋点，可忽略）
- 任务：`/task/list`、`/task/cancel`、`/task/delete`、`/task/retry`
- 共享库：`/shared-library/list` 等
- 用户管理：`/user/list|create|edit|delete|passwd-change|unbanned`（管理员）

## 7. 实测要点

- 不带 `authx` 或签名错 → `401 {"code":99999,"msg":"INVALID TOKEN"}`
- `music-token` 有效期约 30 天，存于 SQLite `user_token`
- `pageSize/limit/offset` 均无效，固定 50/页
- 文件夹根路径是共享库真实路径（如 `/vol1/1000/Music/音乐`），`/` 会 100005
- 图片/音频接口同样需要 `authx` + Cookie
