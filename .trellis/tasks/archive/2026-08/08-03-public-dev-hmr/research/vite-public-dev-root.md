# Vite public 开发根目录方案

## Existing behavior

- Vite dev 默认把配置的 `root` 作为 HTML 入口根；项目根没有 `index.html`，所以 `/` 为 404。
- `publicDir` 适合原样静态资源，不适合作为默认 HTML 模块入口。
- 当前生产构建会把 `public` 复制到 `dist`，同时生成 `accessibility-tool.min.js`，因此 preview 正常。

## Chosen approach

- 真正的 dev server 使用 `root: public` 和 `publicDir: false`，使 `public/index.html`、CSS 和 JavaScript进入 Vite 的开发处理与监听范围。
- 通过开发专用 alias 将 `/accessibility-tool.min.js` 指向 `src/index.ts`。
- 通过 `transformIndexHtml` 仅在开发响应中把现有 defer 脚本转换成 module 脚本；不编辑源 HTML，所以同一份页面仍可在 `dist` 中加载 IIFE 构建产物。
- 通过 `ConfigEnv.isPreview` 保证 preview 继续读取 `dist`。

## Validation focus

- 根页面和 demos 返回 200。
- 工具全局对象在 demo.js 执行前可用。
- HTML/CSS/JS/TS 文件更新触发 WebSocket HMR 消息或整页 reload。
- build 产物和 preview 行为无回归。
