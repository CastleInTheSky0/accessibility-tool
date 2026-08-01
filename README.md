# AccessibilityTool

`AccessibilityTool` 是一套面向桌面网站的原生 TypeScript 无障碍工具栏。它在接入页面显式调用后启动，提供朗读、语速、五种页面配色、页面缩放、大鼠标、十字线、标准全屏、页面焦点橙色高亮、盲道区域高对比上下文框、六类盲道区域导航，以及标准选项卡与关联面板的键盘增强。

- 版本：`0.1.0`
- 构建：TypeScript + Vite Library Mode + pnpm
- 样式源码：SCSS（`src/styles/accessibility-tool.scss`）
- 运行时依赖：0
- UI 隔离：生产环境 closed Shadow DOM；`debug: true` 时 open Shadow DOM
- 首版平台：桌面端，页面宽度最低按 1024px 设计

## 快速开始

### IIFE 浏览器版

```html
<script src="/assets/accessibility-tool.min.js"></script>
<button id="open-a11y" type="button">打开无障碍工具</button>
<script>
  const button = document.querySelector("#open-a11y");

  AccessibilityTool.configure({
    toolbar: { helpUrl: "/accessibility/help.html" },
    regions: { autoDetect: true },
  });

  button.addEventListener("click", () => {
    AccessibilityTool.open({ trigger: button });
  });
</script>
```

脚本加载时不会自动显示、扫描页面或绑定高频监听。首次调用 `open()` 后才创建工具栏和启动页面增强。

### ESM

```ts
import AccessibilityTool from "accessibility-tool";

AccessibilityTool.configure({
  toolbar: { helpUrl: "/help.html" },
});

await AccessibilityTool.open({ trigger: openButton });
```

## 推荐盲道属性

```html
<nav
  data-a11y-region="navigation"
  data-a11y-label="主导航"
></nav>
```

`data-a11y-region` 支持 `viewport`、`navigation`、`interaction`、`service`、`list`、`content`，也支持数字 `1`～`6`。同类可以有多个，工具按页面结构顺序循环定位。

## 标准选项卡

```html
<div role="tablist" aria-label="栏目切换">
  <button
    id="tab-news"
    role="tab"
    aria-controls="panel-news"
    aria-selected="true"
  >新闻</button>
</div>

<section
  id="panel-news"
  role="tabpanel"
  aria-labelledby="tab-news"
></section>
```

工具通过 `aria-controls` 和 ID 关联，不按 DOM 邻接关系猜测。每个有效选项都会进入原生 Tab 顺序，可使用 Tab/Shift+Tab 逐项切换，也保留方向键与 Home/End。自动模式在 Tab 聚焦时切换面板；手动模式需按 Enter 或空格。默认触发页面原有 `click` 事件完成视觉切换；可在 tablist 或单个 tab 上使用 `data-a11y-trigger-event="mouseover click"` 指定一个或多个原事件。

## 构建产物

运行：

```bash
pnpm install
pnpm build
```

生成：

- `dist/accessibility-tool.min.js`：IIFE，全局对象 `AccessibilityTool`
- `dist/accessibility-tool.es.js`：ESM
- `dist/accessibility-tool.css`：严格 CSP 外部样式
- `dist/*.d.ts`：TypeScript 声明

生产构建不生成 source map。

## 开发与验证

```bash
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

默认端到端回归使用系统 Chrome 与 Edge。在已安装 Playwright Firefox/WebKit 浏览器包的 CI 中，可设置 `PLAYWRIGHT_ALL_BROWSERS=1` 追加两组回归。

演示入口：

- `/`：完整功能、动态 DOM、SPA、Shadow DOM、iframe、选项卡与浮层
- `/demos/semantic-off.html`：关闭语义自动识别
- `/demos/hostile.html`：强宿主 CSS 下的 Shadow DOM 隔离
- `/demos/csp.html`：严格 CSP 外部样式
- `/help.html`：用户帮助页

## 文档

- [快速接入](docs/quick-start.md)
- [完整 API 与配置](docs/api.md)
- [HTML 属性协议](docs/attributes.md)
- [键盘与快捷键](docs/keyboard.md)
- [CSP 接入](docs/csp.md)
- [人工无障碍测试清单](docs/manual-testing.md)
- [兼容性与已知限制](docs/compatibility.md)

## 隐私

工具默认不联网、不发送统计请求，也不会记录、保存或上传页面内容和朗读文本。用户偏好仅保存在接入站点的 `localStorage`；不可用时退化为当前页面内存。

## 首版边界

v0.1.0 不包含移动端专用布局、连续朗读、大字幕、音色选择、自动语言检测、公开插件 API、云端 TTS 或后端服务。

## License

MIT
