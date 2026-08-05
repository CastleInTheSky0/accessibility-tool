# 快速接入

## 1. 引入产物

普通页面只需引入 IIFE：

```html
<script defer src="/assets/accessibility-tool.min.js"></script>
```

没有已保存的打开意图时，脚本本身不会打开工具或扫描页面。用户曾成功打开且未主动退出时，后续同源页面会在 DOM ready 后静默恢复。

## 2. 配置站点参数

```js
AccessibilityTool.configure({
  locale: "zh-CN",
  storageKey: "site-accessibility:preferences",
  persistOpenState: true,
  toolbar: {
    layoutMode: "push",
    helpUrl: "/accessibility/help.html",
  },
  regions: {
    autoDetect: true,
    selectors: {
      service: "[data-service-center]",
    },
  },
});
```

请在 `DOMContentLoaded` 前完成站点级配置。自动恢复会读取最终 `configure()` 结果，因此自定义 `storageKey` 的每个同源页面都应保持一致。`persistOpenState` 默认是 `true`；设置为 `false` 会禁用自动恢复并清理当前键的打开标记。

## 3. 由页面按钮显式打开

```js
const openButtons = document.querySelectorAll("[data-open-accessibility]");

openButtons.forEach((button) => {
  button.addEventListener("click", () => {
    AccessibilityTool.open({ trigger: button });
  });
});
```

多个按钮共用同一个工具实例。退出后焦点优先返回最近使用的按钮。

首次成功打开后，工具会使用 `${storageKey}:open-state` 保存独立、版本化的打开意图。刷新或进入另一个同源且引入相同工具脚本的页面时，工具会恢复完整页面增强和已保存偏好，但不会移动当前焦点，也不会再次朗读“工具栏已打开”。调用 `close()`、点击“退出”或调用 `destroy()` 后不再自动恢复；`reset()` 只重置偏好并保持打开意图。

## 4. 标记页面区域

```html
<header data-a11y-region="viewport" data-a11y-label="页面视窗"></header>
<nav data-a11y-region="2" data-a11y-label="主导航"></nav>
<form data-a11y-region="interaction" data-a11y-label="站内检索"></form>
<section data-a11y-region="service" data-a11y-label="在线服务"></section>
<section data-a11y-region="list" data-a11y-label="办事清单"></section>
<main data-a11y-region="content" data-a11y-label="正文"></main>
```

未显式标记时，默认仅保守识别有明确语义的 `nav`、`form`、`article` 及相关 ARIA role。原生 `main` 不再自动归为正文区，需要像上例一样显式标记；可以使用 `regions.autoDetect: false` 关闭全部语义自动识别。

## 5. 无法改 HTML 时使用 JavaScript 注册

普通区域支持 CSS 选择器和现有 `Element`。`region` 只使用数字 `1`～`6`，`label` 只填写短名称：

```js
const regions = AccessibilityTool.registerRegions([
  { target: "#news", region: 1, label: "要闻" },
  { target: document.querySelector("#main-nav"), region: 2, label: "主导航" },
  { target: "#content", region: 6, label: "新闻正文" },
]);
```

选项卡直接传入扁平配置。相同类名可一次匹配多个 tab 和 panel，并按 DOM 顺序索引配对；每个 tab 的直接父节点会自动获得 tablist 语义。行为属性写在选项节点；普通面板使用 `data-a11y-hidden` 和页面原有 CSS/事件，不使用原生 `hidden`：

```js
const tabs = AccessibilityTool.registerTabs([
  {
    tab: ".services-tab-hditem",
    panel: ".services-tabcut-bdcontent",
    region: 1,
  },
]);
```

同一项两侧的有效匹配数量必须相等且大于零；数量不一致时该项会被跳过，`debug: true` 时输出警告。同一选择器跨多个选项卡组件时，工具按 tab 的不同直接父节点自动拆成独立组，每组的选中状态和键盘导航互不影响。

```css
[role="tabpanel"][data-a11y-hidden] {
  display: none;
}
```

每个句柄可以独立、重复安全地注销；属性会恢复到注册前的不存在、空值或原值状态：

```js
regions.dispose();
tabs.dispose();
```

API 只解析调用时已有 DOM。SPA 路由或组件框架重建节点后，需要对新节点重新调用。`close()` 不注销这些注册，`destroy()` 会自动释放所有未注销句柄。

## 6. 销毁

单页应用卸载整个站点壳或测试环境清理时，可调用：

```js
await AccessibilityTool.destroy();
```

这会清除打开意图，移除工具节点、监听器、观察器及工具补充的 DOM 状态，并恢复接入页面原值。
