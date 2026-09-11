# Snipflow Page

Snipflow 的浏览器客户端。当前代码提供可持续扩展的应用基线和页面路由；认证、发送、接收与仪表盘业务将在后续 Roadmap 阶段接入。

## 环境要求

- Node.js 24 LTS
- pnpm 12
- 可访问的 Snipflow Worker

## 本地开发

```bash
pnpm install
pnpm dev
```

开发服务固定在 `http://127.0.0.1:10010`。当前页面骨架包括：

- `/`：跳转到 `/auth`
- `/auth`
- `/send`
- `/receive`
- `/dashboard`

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
```

`SNIPFLOW_API_ORIGIN` 只决定开发代理目标。`VITE_MAX_OBJECT_BYTES` 是公开的前端单对象限制，缺省为 10 MiB，构建时必须是正安全整数。Bearer Token 必须由浏览器运行时输入，不能写入环境变量、源码、URL、日志或构建产物。

生产部署要求前端和 Worker API 同源；客户端始终使用 `/health`、`/snip`、`/stats` 相对路径，不依赖开发代理地址。
