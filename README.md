# EasyRSS — Local-First RSS Reader

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**中文** · [English](README.en.md) · **[在线 Demo](https://easy-rss.zkf15138.workers.dev)**

一个**纯前端、本地优先**的 RSS 阅读器：添加订阅、抓取解析 RSS/Atom、
三栏工作区阅读、收藏管理、搜索过滤、OPML 导入导出。
所有数据只存在你的浏览器里，没有后端、没有账号、没有遥测。

- **Local First**：断网也能打开应用、读历史文章、搜索本地内容
- **Frontend-only**：数据全部落在 IndexedDB + localStorage，静态托管即可运行
- **代理可替换**：抓取通道抽象为 `FetchProxy` 策略层，可零改动接入自建代理 / Cloudflare Worker

<p align="center">
  <img src="docs/screenshots/light.png" alt="EasyRSS 三栏阅读界面（浅色 / 深色）" width="49%">
  <img src="docs/screenshots/dark.png" alt="EasyRSS 三栏阅读界面（浅色 / 深色）" width="49%">
</p>

## 功能特性

- **订阅管理**：添加 / 删除 / 重命名 / 移动订阅，文件夹分组（含一键折叠/展开），OPML 导入导出
- **Smart Views**：全部 / 未读 / 收藏 / 稍后阅读，未读计数实时计算
- **三栏工作区**：侧栏 ↔ 文章列表 ↔ 信纸式阅读区，**左右分栏宽度可拖拽调整**并持久化
- **文章列表**：All / Unread / Starred 筛选、最新/最早排序、无限滚动、批量操作（已读/未读/收藏/删除）
- **阅读器**：DOMPurify 清洗、衬线信纸排版、图片懒加载、收藏 / 稍后读 / 已读 / 复制链接 / Web Share / 打开原文
- **10 套主题**：7 套浅色 + 3 套深色编辑风主题，跟随系统模式含独立的浅色/深色槽位，首屏防闪烁
- **组件化设计系统**：`primitive → variant → state` 三层组件规范，统一的按钮 / 输入框 / 徽章 / 开关
- **搜索**：顶部实时搜索 + `⌘K` / `Ctrl K` 命令面板（可搜文章并执行命令）
- **快捷键**：`j` `k` 上下篇、`o` 打开、`s` 收藏、`m`/`u` 已读切换、`r` 刷新、`/` 搜索、`?` 帮助
- **刷新**：单源 / 全部刷新、自动刷新（manual ~ 24h）、`visibilitychange` + `online` 感知
- **移动端**：抽屉侧栏 + 底部导航 + 全屏阅读页，触屏下悬停操作自动常显
- **离线 & PWA**：`manifest.json` + Service Worker 缓存 App Shell，离线可读历史文章；
  缓存名随构建号轮换（`easy-rss-<buildId>`），发版自动清理旧缓存
- **中英双语**，演示数据首启即见、可一键清除

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 框架 | React 18 + TypeScript 5.6（strict）+ Vite 6 |
| 样式 | Tailwind CSS v4（`@theme` 语义 token + 组件层） |
| 状态 | Zustand 5（persist 存设置）+ TanStack Query 5（数据读取层） |
| 路由 | React Router 7 |
| 存储 | Dexie 4（IndexedDB） |
| 内容 | DOMPurify 3（HTML 清洗） |
| 图标 | Lucide React |
| 测试 | Vitest + jsdom |

要求 Node 18+（推荐 20+）。

## 快速开始

```bash
npm install
npm run dev      # http://localhost:3100
npm run build    # tsc -b && vite build → dist/
npm run preview  # 预览生产构建
npm test         # 单元测试（Vitest）
npm run lint     # tsc + ESLint
npm run format   # Prettier 格式化（format:check 仅检查）
npm run check    # lint + 格式检查 + test + build，提交前运行
```

> 在线 Demo 是纯静态部署、**没有配置抓取代理**，所以不允许跨域访问的订阅源会抓取失败（演示数据不受影响）。
> 想抓取任意源，请本地运行并配置[自建代理](#自建-rss-代理可选)。

首次打开会播种一批演示订阅和文章（带「演示」徽标），侧栏底部或设置页可一键清除。

### 本地管理脚本（可选）

```bash
./rss.sh start | stop | restart | status | logs
```

管理 Vite dev server（3100）+ 可选的 SSH 代理隧道。
隧道主机通过 `.env` 中的 `RSS_TUNNEL_HOST` 配置：

```bash
RSS_TUNNEL_HOST=your-vps-ssh-alias
```

## 配置

复制 `.env.example` 为 `.env`，改完需重启 dev server：

```bash
VITE_RSS_PROXY=auto      # auto | direct | custom | allorigins | corslol | codetabs
VITE_RSS_PROXY_URL=https://your-proxy.example.com/?token=<TOKEN>&url={url}
```

`{url}` 是占位符，会被替换为 URL 编码后的目标订阅地址。

### CORS 与代理抽象

浏览器直连很多 RSS 源会被 CORS 拦截。抓取通道抽象为 `FetchProxy` 策略
（`src/services/rss/fetcher.ts`）：

- **默认 `auto`**：直连（5s）→ 自建代理（10s，需配 URL）→ 带逐策略诊断的报错
- **公共代理默认不走**：会泄露订阅 URL、限流不稳定，仅作显式实验选项保留
- **代理断路器**：超时/连接被拒这类"不可达"失败会让该策略冷却 5 分钟
  （期间标记为 `skipped` 跳过），隧道断掉时每源只损失一次 10s 等待而不是每次刷新都等
- **刷新并发**：`refreshAll` 以 3 个 worker 并发抓取（对公共代理仍算克制）
- **扩展**：实现 `FetchProxy` 接口注册进策略表，即可接入 Cloudflare Worker 等

### 自建 RSS 代理（可选）

`server/rss-proxy/` 提供开箱可用的零依赖 Node 透传代理（token 鉴权 +
SSRF 防护 + 超时/体积上限 + `/healthz`），只监听 `127.0.0.1`：

```bash
cd server/rss-proxy
./deploy.sh root@<你的VPS>    # 自动装 Node、建用户、注册 systemd、健康检查
```

部署后按提示开一条 SSH 隧道（`ssh -L 18766:127.0.0.1:8765 <主机>`），
再在 `.env` 配 `VITE_RSS_PROXY=custom` + `VITE_RSS_PROXY_URL` 即可。

代理安全要点（详见 [SECURITY.md](SECURITY.md)）：

- 鉴权：`x-proxy-token` 请求头（推荐）/ `Authorization: Bearer` / `?token=`（浏览器 URL 模板用），常量时间比较
- SSRF：解析出的**每个**地址都必须是公网地址，且连接时固定到已校验的 IP（防 DNS rebinding），重定向逐跳复检
- `RSS_PROXY_ALLOW_ORIGIN`：CORS 允许来源，默认 `*`，生产建议设为前端域名（`RSS_PROXY_ALLOW_ORIGIN=https://rss.example.com ./deploy.sh ...`）
- `?token=` 会出现在 nginx 访问日志里，请关闭或脱敏该路径的日志

## 项目结构

```
src/
├── components/          # Layout / TopBar / Sidebar / ArticleList / ArticleCard /
│                        # Reader / ThemeSwitcher / PaneResizer / Modal / dialogs /
│                        # AddFeedModal / CommandPalette / ShortcutsModal / Toasts /
│                        # EmptyState / SettingsPage / LogoMark
├── pages/               # HomePage（三栏）/ ArticlePage（移动端全屏阅读）
├── services/rss/        # fetcher(策略层) / parser / feedService / articleService /
│                        # searchService / opmlService / demoSeed
├── db/database.ts       # Dexie 数据库 + Repository
├── stores/appStore.ts   # Zustand: settings(持久化) / UI / Toast
├── themes.ts            # 10 套主题注册表
├── index.css            # @theme 语义 token + 组件层（primitive/variant/state）
├── i18n.ts              # 中/英词条
└── utils/               # sanitize(DOMPurify) / helpers（stripHtml / safeHttpUrl）

server/rss-proxy/        # 可选的自建抓取代理（server.mjs / ssrf.mjs）+ 部署脚本
public/                  # PWA: manifest / service worker / icons
```

## 工作原理

```
FeedService（编排，刷新按 3 并发）
   ↓
fetchFeedXml()   FetchProxy 策略层（直连 / 自建代理 / 公共代理）+ 断路器 → XML
   ↓
parseFeedXml()   RSS 2.0 / RSS 1.0(RDF) / Atom → ParsedFeed（归一化）
   ↓
articleIdFor()   guid > link > hash(feedId+title+url) 稳定 ID
   ↓
Repository（Dexie，去重 upsert，绝不覆盖已读/收藏/稍后读状态）
   ↓
TanStack Query（useInfiniteQuery，40 条/页 offset 分页）
   ↓
UI（Zustand 只存选择/过滤等 UI 状态）
```

### 数据层设计要点

- **游标分页**：`db.articles` 上的读取全部走复合索引，`offset/limit`
  直接落在索引游标上，页面之外的行不会进入内存：
  `[feedId+publishedAt]`（订阅内列表）、`[isRead+publishedAt]` /
  `[isStarred+publishedAt]` / `[isReadLater+publishedAt]`（Smart Views）、
  `publishedAt`（全部）、`[feedId+isRead]`（每订阅未读计数）
- **布尔标志存 0/1**：IndexedDB 不接受布尔作为索引键，直接存 `true/false`
  会让标志索引永远是空的。写入时 `toWire()` 归一化为 0/1（schema v4 迁移
  旧数据），读取时还原为布尔，业务层无感知
- **失效粒度**：`useInvalidate('counts', 'articles')` 之类按需失效；
  收藏/已读只重取列表与计数，不动 feeds / folders
- **搜索**：`title/snippet/author` 的包含匹配，在索引游标上过滤，不额外物化

### 部署为静态站点（Cloudflare 等）

仓库自带 `wrangler.jsonc`（Workers 静态资源 + SPA 回退）。在 Cloudflare 控制台把仓库连到一个同名 Worker 项目即可随 `main` 自动部署；也可以手动部署：

```bash
npx wrangler deploy    # 构建由 wrangler.jsonc 触发，用的是 build:public
```

部署到其它静态托管时请自行用 `npm run build:public`，而不是 `npm run build`：

> ⚠️ Vite 会把 `.env` 里的 `VITE_*` 变量**直接编译进公开的 JS**。如果你本地 `.env` 配了带 token 的
> `VITE_RSS_PROXY_URL`，用 `npm run build` 构建再部署会把 token 暴露给所有访问者。
> `npm run build:public` 会覆盖这两个变量，产物里不含代理地址。部署前建议自检：
> `grep -r "<你的token>" dist` 应当没有输出。

## 隐私与安全

- 订阅、文章、阅读状态只存在你浏览器的 IndexedDB / localStorage，应用本身没有后端、账号与遥测
- Feed 内容一律视为不可信：HTML 经 DOMPurify 清洗，链接只放行 `http(s)`，图片使用 `no-referrer`
- **字体自托管**：字体通过 `@fontsource` 随应用打包（`src/fonts.ts`），不再请求 Google Fonts，访问者 IP 不会泄露给字体服务
- **外部请求**：仅有演示文章里的示例配图来自 `picsum.photos`；点「清除演示数据」后应用不再发起任何第三方请求（抓取订阅源本身除外）
- 发现漏洞请按 [SECURITY.md](SECURITY.md) 私下报告

## 已知限制

- **CORS 无法绕过**：跨域源需经代理抓取
- **无跨设备同步**：数据只在本机浏览器；换设备请用 OPML 迁移（阅读状态不随 OPML 走）
- **搜索为包含匹配**：`title/snippet/author` 的 LIKE 式过滤，非全文索引
- **后台刷新有节流**：自动刷新以页面可见 + 在线为前提

## 路线展望

- `@tanstack/virtual` 虚拟列表
- MiniSearch / Orama 全文检索
- Cloudflare Worker 代理 + 跨设备同步（`FetchProxy` 与 Repository 已预留替换点）
- 阅读进度记忆、正文抓取、通知推送

## 贡献

欢迎 Issue 与 PR，开发约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

[MIT](LICENSE) © 2026
