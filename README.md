# AccessibilityTool

`AccessibilityTool` 是一套面向桌面网站的原生 TypeScript 无障碍工具栏。首次使用由接入页面显式调用启动；成功打开后，默认会在刷新或进入另一个同源且引入相同脚本的页面时静默恢复。工具提供朗读、语速、五种页面配色、页面缩放、大鼠标、十字线、标准全屏、页面焦点黄色轮廓、盲道活动区域深橙色轮廓、六类盲道区域导航，以及标准选项卡与关联面板的键盘增强。

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
    storageKey: "site-accessibility:preferences",
    persistOpenState: true,
    toolbar: { helpUrl: "/accessibility/help.html" },
    regions: { autoDetect: true },
  });

  button.addEventListener("click", () => {
    AccessibilityTool.open({ trigger: button });
  });
</script>
```

没有已保存的打开意图时，脚本加载后不会显示工具栏、扫描页面或绑定高频监听。首次成功调用 `open()` 后，工具使用与 `storageKey` 派生的独立版本化键保存打开意图；同源页面刷新或导航且页面继续引入该脚本时，会在 DOM ready 后完整恢复工具栏和页面增强，但不会抢焦点或再次播报“工具栏已打开”。`close()`、工具栏“退出”和 `destroy()` 会清除打开意图；`reset()` 不会。可设置 `persistOpenState: false` 禁用并清理当前键的标记。

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

`data-a11y-label` 只填写区域短名称，例如 `要闻`，无需写成 `要闻视窗区` 或完整提示句；旧页面兼容属性 `aria-readlabel` 遵循同一规则。用户通过快捷键、工具栏、Tab、Shift+Tab 或脚本聚焦区域容器时，工具会按 `区域名称 + 分类名称` 直接拼接，并补充 Tab 操作提示，例如播报“提示：您已进入要闻视窗区，按下 Tab 键浏览信息；第 1 个，共 2 个”。工具不裁剪名称空白，也不判断或去除名称中已有的分类词，因此 `主导航` 与 `导航区` 会生成 `主导航导航区`；接入方应按期望提供短名称。区域内部节点只朗读自身内容，不重复区域提示；页面 mutation/reclassification 引起的自动恢复保持静默。

## 标准选项卡

```html
<div role="tablist" aria-label="栏目切换">
  <button
    id="tab-news"
    role="tab"
    aria-controls="panel-news"
    aria-selected="true"
    data-a11y-activation="manual"
    data-a11y-trigger-event="mouseover click"
  >新闻</button>
</div>

<section
  id="panel-news"
  role="tabpanel"
  aria-labelledby="tab-news"
></section>
```

普通关联面板和非原生浮层使用布尔属性 `data-a11y-hidden` 表示视觉隐藏，并由接入站点提供样式：

```css
[role="tabpanel"][data-a11y-hidden] {
  display: none;
}
```

工具通过 `aria-controls` 和 ID 关联，不按 DOM 邻接关系猜测。每个有效选项都会进入原生 Tab 顺序，可使用 Tab/Shift+Tab 逐项切换，也保留方向键与 Home/End。`data-a11y-activation` 和 `data-a11y-trigger-event` 只在对应的 `role="tab"` 选项节点上声明：自动模式在选项获得焦点时切换面板，手动模式需按 Enter 或空格。未声明或无效的激活模式回退到 `tabs.defaultActivation`；触发事件未声明或为空时回退到 `tabs.triggerEvents`，最终使用 `click`。多个事件使用空格分隔并自动去重，`role="tablist"` 只负责标准分组和方向语义。

有效选项每次通过 Tab、Shift+Tab、方向键、点击或脚本获得焦点时，只朗读一条完整提示，例如 `Tab，概览，正文区，当前有浮动窗口，按 ALT+下键进入窗口`；带 `href` 的链接选项使用 `链接：概览，Tab，正文区...`。区域部分来自选项所在的真实盲道区域分类，不包含区域短名称；不在已识别区域时自然省略。Alt+下进入面板后朗读来源选项与区域分类，Esc 成功返回时只朗读 `已返回{选项名称}选项`。若面板没有可通过 Tab 聚焦的后代，会明确提示暂无可遍历信息，工具不会为静态内容增加 `tabindex`。

接入站点原有事件负责添加或移除 `data-a11y-hidden`，宿主 `role="tabpanel"` 不直接使用原生 `hidden`。工具不会控制业务面板的视觉显隐，只触发所配置的页面原事件并同步 `aria-selected` / `aria-hidden`；两类属性必须分别保留。原生 `<dialog>` 仍使用 `showModal()`、`open` 和 `close()`。

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

`pnpm dev` 直接以 `public` 作为开发站点根目录，访问 `http://127.0.0.1:5173/` 即可打开完整演示，无需预先构建。开发响应会在内存中把 `/accessibility-tool.min.js` 接到 `src/index.ts`，并将演示页已有的本地 defer 脚本纳入 Vite 模块图；修改 `public` 下的 HTML、CSS、JavaScript 或 `src` 下的 TypeScript 会自动热更新或整页刷新，不会回写演示 HTML。

`pnpm preview` 仍从 `dist` 预览生产构建，使用实际的 `accessibility-tool.min.js`、`accessibility-tool.es.js` 与外部 CSS 产物。

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
- [云端 TTS 后续开发方案（提案）](docs/cloud-tts-future-plan.md)

## 隐私

工具默认不联网、不发送统计请求，也不会记录、保存或上传页面内容和朗读文本。用户偏好与独立的打开意图仅保存在接入站点的 `localStorage`；不可用时退化为当前页面内存，因此无法跨刷新恢复是预期行为。

## 首版边界

v0.1.0 不包含移动端专用布局、连续朗读、大字幕、音色选择、自动语言检测、公开插件 API、云端 TTS 或后端服务。

## License

MIT
