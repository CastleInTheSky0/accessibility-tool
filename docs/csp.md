# CSP 接入

工具不使用 `eval`、`new Function` 或内联事件处理器。

接入页面仍只需引用一次 `accessibility-tool.min.js`。发布目录还必须在主入口同目录包含 `accessibility-tool-opencc.js` 和 `accessibility-tool-pinyin.js`；它们由主入口首次使用简繁或拼音能力时作为 ESM 自动加载，并带当前包版本查询参数，不要再手写额外 `<script>` 标签。升级时应原子发布同一构建生成的三个文件。

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
- 两个语言分包必须满足 `script-src`。主入口与分包同源部署时，上例的 `'self'` 已足够；主入口托管在静态 CDN 时，需要把该源加入 `script-src`，并让 CDN 为 ESM 分包返回正确的 JavaScript MIME 类型和 CORS 响应头。
- 只发布主入口而遗漏语言分包不会阻断工具或朗读，但简繁／拼音会安全回退为原文，并在后续操作中使用带查询参数的新 URL 重试。
- 大鼠标使用 `data:` SVG 光标；如策略单独限制相关资源，请允许受信任的 `data:` 图像。
- 严格 CSP 演示位于 `/demos/csp.html`。
