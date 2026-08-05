# CSP 接入

工具不使用 `eval`、`new Function` 或内联事件处理器。

## 外部样式模式

部署 `accessibility-tool.css`，并配置：

```js
AccessibilityTool.configure({
  toolbar: {
    styleUrl: "/assets/accessibility-tool.css",
  },
});
```

示例策略：

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self';
  img-src 'self' data:;
```

外部样式会同时加载到文档与工具 Shadow Root，用于工具栏隔离及宿主页面辅助效果。

## Nonce 模式

如果站点允许带 nonce 的内联样式：

```js
AccessibilityTool.configure({
  toolbar: {
    styleNonce: window.__CSP_NONCE__,
  },
});
```

对应响应头需包含：

```http
style-src 'self' 'nonce-<server-generated-value>'
```

nonce 必须由服务端为每个响应生成，不要硬编码固定值。

## 注意

- `helpUrl` 和 `styleUrl` 必须满足站点自己的 `default-src` / `style-src`。
- 大鼠标使用 `data:` SVG 光标；如策略单独限制相关资源，请允许受信任的 `data:` 图像。
- 严格 CSP 演示位于 `/demos/csp.html`。
