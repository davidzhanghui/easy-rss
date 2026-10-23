# Security Policy

## Reporting a vulnerability

请**不要**在公开 Issue 中提交安全漏洞。请使用 GitHub 的
[Private vulnerability reporting](../../security/advisories/new)（仓库 *Security* 标签页 → *Report a vulnerability*）私下报告，
并尽量附上复现步骤与影响范围。

Please do **not** open a public issue for security problems. Use GitHub's private
vulnerability reporting (repo *Security* tab → *Report a vulnerability*) and include
reproduction steps and impact.

## Scope & threat model

EasyRSS 把 feed 内容视为**不可信输入**：

- 文章 HTML 经 DOMPurify 清洗后才渲染；摘要提取使用惰性的 `DOMParser`，不用 `innerHTML`
- feed / 文章 / 站点链接只放行绝对 `http(s)` URL（拦截 `javascript:` / `data:` 等）
- 自建代理（`server/rss-proxy`）按「会被公网访问」设计：token 鉴权（常量时间比较）、
  SSRF 防护（逐跳校验重定向、连接时固定到已校验的 IP 以防 DNS rebinding）、超时与体积上限

在范围内：XSS、SSRF / 代理滥用、鉴权绕过、数据泄露。
不在范围内：公共 CORS 代理（`allorigins` 等实验选项）自身的隐私问题——它们默认关闭。

## Hardening tips for self-hosters

- 设置 `RSS_PROXY_ALLOW_ORIGIN` 为你的前端域名，而不是默认的 `*`
- 代理只监听 `127.0.0.1`，通过 SSH 隧道或带 TLS 的反向代理访问
- 优先用 `x-proxy-token` 请求头传 token；若必须用 `?token=`，请在 nginx 中关闭或脱敏该路径的访问日志
- 定期执行 `npm audit`
