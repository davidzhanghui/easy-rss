# Contributing

感谢你的关注！欢迎 Issue 与 PR。

## 开发

```bash
npm install
npm run dev        # http://localhost:3100
npm run check      # lint + 格式检查 + test + build（提交前请确保通过）
npm run format     # 自动格式化（Prettier）
```

要求 Node 18+（推荐 20+）。

## 约定

- **TypeScript strict**，`npm run lint`（`tsc --noEmit` + ESLint）和 `npm run format:check`（Prettier）必须干净
- **测试**：`npm test`（Vitest + jsdom）。改动 `parser` / `fetcher` / `sanitize` / `server/rss-proxy`
  时请补用例；安全相关修复请附能在旧实现上失败的回归测试
- **样式**：用 `src/index.css` 里的语义 token，不要在组件里写裸色值
- **文案**：新增文字同时补 `src/i18n.ts` 的中 / 英词条
- **Feed 内容永远不可信**：渲染 HTML 必须走 `sanitizeArticleHtml`；提取纯文本用 `stripHtml`；
  写进 `href` 的 URL 必须经 `safeHttpUrl`
- 不要提交 `.env`、token 或个人服务器信息

## 提交 PR

1. Fork 并从 `main` 切分支
2. 保持改动聚焦，说明「做了什么、为什么」
3. 确认 `npm run check` 通过后再提交

安全漏洞请走 [SECURITY.md](SECURITY.md)，不要公开提 Issue。
