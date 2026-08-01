# HTML 属性协议

## 六类盲道区域

| 数字 | 英文值 | 中文名称 |
| --- | --- | --- |
| `1` | `viewport` | 视窗区 |
| `2` | `navigation` | 导航区 |
| `3` | `interaction` | 交互区 |
| `4` | `service` | 服务区 |
| `5` | `list` | 列表区 |
| `6` | `content` | 正文区 |

推荐写法：

```html
<nav data-a11y-region="navigation" data-a11y-label="主导航"></nav>
<main data-a11y-region="6" data-a11y-label="办事正文"></main>
```

允许同类多个区域和区域嵌套。所有可见区域按页面结构顺序参与导航。

## 识别优先级

1. `regions.selectors` 接入配置
2. `data-a11y-region`
3. 旧站兼容属性 `aria-role`
4. 保守语义自动识别

工具不会生成 `aria-role` 或 `aria-readlabel`。这两个名称不是标准 ARIA，只用于读取无法立即改造的旧页面；新页面不要使用。

## 名称优先级

1. `data-a11y-label`
2. 旧站兼容属性 `aria-readlabel`
3. `aria-label`
4. `aria-labelledby`
5. 区域内第一个可见标题
6. 默认分类名称

## 自动识别

默认保守映射：

- `nav`、`role="navigation"` → 导航区
- `form`、`role="form"`、`role="search"` → 交互区
- `main`、`article`、`role="main"`、`role="article"` → 正文区
- 有明确名称的 `role="list"` → 列表区
- 普通 `ul` / `ol` 不自动识别
- 视窗区和服务区不自动推测

```js
AccessibilityTool.configure({
  regions: { autoDetect: false },
});
```

## 排除内容

`hidden`、`display:none`、`visibility:hidden`、`aria-hidden="true"`、`inert` 或位于未显示面板内的区域不计数。使用 `data-a11y-ignore` 可排除整个子树：

```html
<section data-a11y-ignore>不会扫描或朗读</section>
```

## 选项卡属性

标准关联必须使用 `aria-controls` 与 ID：

```html
<div role="tablist" aria-orientation="horizontal">
  <button
    id="tab-1"
    role="tab"
    aria-controls="panel-1"
    aria-selected="true"
    data-a11y-activation="manual"
    data-a11y-trigger-event="mouseover click"
  >选项一</button>
  <button
    id="tab-2"
    role="tab"
    aria-controls="panel-2"
    aria-selected="false"
    data-a11y-activation="manual"
    data-a11y-trigger-event="mouseover click"
  >选项二</button>
</div>
<section id="panel-1" role="tabpanel" aria-labelledby="tab-1"></section>
<section
  id="panel-2"
  role="tabpanel"
  aria-labelledby="tab-2"
  data-a11y-hidden
></section>
```

接入站点必须为普通关联面板提供显隐样式：

```css
[role="tabpanel"][data-a11y-hidden] {
  display: none;
}
```

`data-a11y-activation` 与 `data-a11y-trigger-event` 只从各自的 `role="tab"` 选项节点读取，`role="tablist"` 仅用于标准分组和 `aria-orientation` 方向语义。

- 激活模式未声明或不是 `automatic` / `manual` 时，回退到 `tabs.defaultActivation`。
- 触发事件未声明或为空时，回退到 `tabs.triggerEvents`；配置仍为空时最终使用 `click`。
- 多个事件使用空格分隔并自动去重，因此不同选项可以分别触发不同的页面原有事件。
- 页面原有事件负责在普通 `role="tabpanel"` 或非原生浮层上添加、移除布尔属性 `data-a11y-hidden`，不要在这些宿主面板上直接使用原生 `hidden`。
- 工具只触发页面原事件并同步 `aria-selected` / `aria-hidden`，不直接写入 `data-a11y-hidden` 或控制业务视觉样式；`aria-hidden` 不能替代显隐属性，`data-a11y-hidden` 也不能替代无障碍状态。
- 原生 `<dialog>` 不使用 `data-a11y-hidden`，继续由页面通过 `showModal()`、`open` 和 `close()` 控制。

## 对话框关闭钩子

真正浮层优先使用原生 `<dialog>`。非原生浮层可在已有关闭按钮上增加：

```html
<button type="button" data-a11y-dialog-close>关闭</button>
```

该属性只标识页面已有关闭入口；工具会触发按钮原事件，不擅自隐藏业务 DOM。
