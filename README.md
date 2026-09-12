# Snipflow Page

Snipflow 的浏览器客户端。当前代码已建立应用基线、HTTP 协议边界、运行时 Token 认证、受保护路由，以及文本和普通附件的发送、接收、下载与安全预览；仪表盘等后续能力按 Roadmap 继续接入。

## 环境要求

- Node.js 24 LTS
- pnpm 12
- 可访问的 Snipflow Worker

## 本地开发

```bash
pnpm install
pnpm dev
```

开发服务固定在 `http://127.0.0.1:10010`。当前路由包括：

- `/`：按认证状态跳转到 `/auth` 或 `/send`
- `/auth`：验证并缓存运行时输入的 Token
- `/send`、`/receive`、`/dashboard`：需要有效本地认证；验证后恢复原目标

## 检查命令

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Playwright 会在桌面和移动端 viewport 中打开页面，并将每次运行的截图写入忽略提交的 `test-results/`。失败时可运行 `pnpm test:e2e:report` 查看报告，或使用 `pnpm test:e2e:debug` 调试。

## Worker 代理

Vite 将 `/health`、`/snip` 和 `/stats` 原路径代理到 Worker。开发服务不会内置 Worker 地址；启动前从 `.env.example` 创建不提交的 `.env.local`，并设置实际服务地址：

```dotenv
SNIPFLOW_API_ORIGIN=https://worker.example.com
VITE_MAX_OBJECT_BYTES=10485760
VITE_AUTH_IDLE_TTL_SECONDS=1800
```

`SNIPFLOW_API_ORIGIN` 只决定开发代理目标。`VITE_MAX_OBJECT_BYTES` 是公开的前端单对象限制，缺省为 10 MiB。`VITE_AUTH_IDLE_TTL_SECONDS` 控制本地认证缓存的闲置秒数，缺省为 1800，设为 0 表示不按闲置时间过期。两个数值配置都会在构建时校验。

Bearer Token 必须由浏览器运行时输入，不能写入环境变量、源码、URL、日志或构建产物。验证成功后 Token 按当前架构保存在浏览器同源 `localStorage`；浏览器存储不可用时仅保留内存会话。

生产部署要求前端和 Worker API 同源；客户端始终使用 `/health`、`/snip`、`/stats` 相对路径，不依赖开发代理地址。
