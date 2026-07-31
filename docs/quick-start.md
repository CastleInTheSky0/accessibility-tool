# 快速接入

## 1. 引入产物

普通页面只需引入 IIFE：

```html
<script defer src="/assets/accessibility-tool.min.js"></script>
```

脚本本身不会打开工具或扫描页面。

## 2. 配置站点参数

```js
AccessibilityTool.configure({
  locale: "zh-CN",
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

## 4. 标记页面区域

```html
<header data-a11y-region="viewport" data-a11y-label="页面视窗"></header>
<nav data-a11y-region="2" data-a11y-label="主导航"></nav>
<form data-a11y-region="interaction" data-a11y-label="站内检索"></form>
<section data-a11y-region="service" data-a11y-label="在线服务"></section>
<section data-a11y-region="list" data-a11y-label="办事清单"></section>
<main data-a11y-region="content" data-a11y-label="正文"></main>
```

未显式标记时，默认仅保守识别有明确语义的 `nav`、`form`、`main`、`article` 等结构。可以使用 `regions.autoDetect: false` 关闭。

## 5. 销毁

单页应用卸载整个站点壳或测试环境清理时，可调用：

```js
await AccessibilityTool.destroy();
```

这会移除工具节点、监听器、观察器及工具补充的 DOM 状态，并恢复接入页面原值。
