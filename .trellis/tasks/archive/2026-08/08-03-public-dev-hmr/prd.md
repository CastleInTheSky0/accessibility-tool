# 开发环境使用 public 页面并支持热更新

## Goal

让 `pnpm dev` 直接以 `public` 目录作为开发站点根目录，访问 `/` 即打开 `public/index.html`，并在修改 `public` 下的 HTML、CSS、JavaScript 或工具源码后自动更新浏览器，无需先执行 `pnpm build`。

## What I already know

- 当前 `pnpm dev` 使用项目根目录，根目录没有 `index.html`，所以访问 `/` 返回 404。
- `public/index.html` 及 `public/demos/*.html` 引用 `/accessibility-tool.min.js`，该文件只在生产构建后存在于 `dist`。
- `pnpm preview` 正确用于验证 `dist`，必须继续保持现有生产预览行为。
- 用户当前对 `public/index.html` 和两个 logo 文件有未提交修改，本任务必须保留且不得纳入无关改写。

## Requirements

- `pnpm dev` 的站点根目录为 `public`。
- 开发服务器访问 `/` 返回 `public/index.html`，`/help.html` 和 `/demos/*.html` 保持可访问。
- 开发环境中的 `/accessibility-tool.min.js` 映射到 `src/index.ts`，不依赖 `dist`。
- 开发时把演示 HTML 中现有的 defer 脚本作为 Vite 模块处理，使工具源码及 `public` JavaScript 进入模块图。
- 修改 `public` 下 HTML、CSS、JavaScript 或 `src` 下工具源码后，浏览器自动 HMR 或整页刷新；不要求保留页面瞬时 UI 状态。
- `pnpm build` 的库产物名称、格式、public 复制行为保持不变。
- `pnpm preview` 继续从 `dist` 提供生产构建，不使用 `public` 开发根目录。

## Acceptance Criteria

- [x] `pnpm dev` 启动后 `http://127.0.0.1:5173/` 返回 200，并显示 `public/index.html`。
- [x] 开发页面加载来自 `src/index.ts` 的工具，点击“打开无障碍工具”可正常启动。
- [x] `/help.html` 以及至少一个 `/demos/*.html` 页面可正常打开。
- [x] 修改 `public` HTML、CSS、JavaScript 和 `src` TypeScript 时，浏览器无需重启开发服务器即可自动更新。
- [x] `pnpm build`、`pnpm preview`、typecheck 和 lint 继续通过。
- [x] `pnpm preview` 的 `/accessibility-tool.min.js` 仍是生产构建产物。
- [x] 不修改或纳入用户现有的 `public/index.html` 与 logo 工作区改动。

## Definition of Done

- Vite 开发配置、必要文档和验证覆盖完成。
- `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过。
- 使用真实开发服务器和浏览器验证入口、子页面及文件更新。

## Technical Approach

- 在现有 `vite.config.ts` 中使用 `ConfigEnv.isPreview` 区分真正的 dev server 与 preview。
- 仅在 `command === "serve" && !isPreview` 时设置 `root` 为 `public`、关闭嵌套 publicDir，并启用开发 HTML 转换与源码入口别名。
- 开发 HTML 转换只改变响应内容，不回写用户的 `public/*.html` 文件。
- build/preview 继续使用现有项目根配置和库构建插件。

## Decision (ADR-lite)

**Context**：演示页面必须同时支持生产构建产物和开发源码，但不能要求维护两套 HTML，也不能覆盖用户正在修改的 `public/index.html`。

**Decision**：使用同一份 Vite 配置按运行命令切换开发根目录；开发时通过 alias 和 `transformIndexHtml` 临时把生产脚本引用接入 Vite 模块图，生产 build/preview 不改变 HTML 协议。

**Consequences**：开发环境可直接编辑 `public` 并自动刷新；生产演示仍引用实际构建产物。HTML/普通脚本更新允许整页刷新，不承诺组件级状态保留。

## Out of Scope

- 改变 `dist` 文件名或 npm 包导出协议。
- 引入新的前端框架或运行时依赖。
- 为 HMR 保存工具栏当前焦点、滚动位置或未持久化瞬时状态。
- 整理或提交用户当前的演示页/logo 改动。

## Technical Notes

- Vite 8 `ConfigEnv` 提供 `isPreview?: boolean`，可避免把 `vite preview` 误判为普通 serve。
- 相关文件：`vite.config.ts`、`package.json`、`public/index.html`、`public/demos/*.html`。
