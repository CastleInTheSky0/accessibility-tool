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

允许同类多个区域和区域嵌套。区域按页面结构顺序参与导航；普通隐藏区域会排除，只有显式标记且能通过同一根节点内标准选项关系激活的隐藏 `tabpanel` 会保留在分类顺序中。

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
5. 关联 `role="tab"` 的可访问名称（显式面板区域）
6. 区域内第一个可见标题
7. 默认分类名称

## 区域名称与导航播报

`data-a11y-label` 和兼容属性 `aria-readlabel` 都只填写接入方提供的区域短名称，例如 `要闻`。接入方不需要写 `要闻视窗区`，也不需要写完整提示句。

用户通过快捷键或工具栏选择某类盲道区域时，工具根据识别到的区域类型补齐分类名称和 Tab 操作提示。例如：

```html
<section data-a11y-region="viewport" data-a11y-label="要闻"></section>
```

分类导航到该区域时播报：

```text
提示：您已进入要闻视窗区，按下 Tab 键浏览信息；第 1 个，共 2 个
```

- 多个同类区域仍保留“第 N 个，共 M 个”的序号信息。
- 工具严格按 `区域名称 + 分类名称` 字面拼接，不裁剪前后空白，也不判断或去除名称中已有的分类词。例如 `主导航` 与 `导航区` 会生成 `主导航导航区`，`正文区` 与 `正文区` 会生成 `正文区正文区`；接入方应按期望提供短名称。
- 快捷键、工具栏分类导航、Tab、Shift+Tab 或脚本让区域容器本身获得焦点时，都朗读同一条完整提示且每次只朗读一次；焦点进入区域内部节点后只朗读当前节点，不重复区域提示。页面变化触发的自动区域恢复保持静默。

## 自动识别

默认保守映射：

- `nav`、`role="navigation"` → 导航区
- `form`、`role="form"`、`role="search"` → 交互区
- `article`、`role="main"`、`role="article"` → 正文区
- 原生 `main` 不自动识别；需要通过 `data-a11y-region`、旧站兼容属性或接入配置显式声明
- 有明确名称的 `role="list"` → 列表区
- 普通 `ul` / `ol` 不自动识别
- 视窗区和服务区不自动推测

```js
AccessibilityTool.configure({
  regions: { autoDetect: false },
});
```

## 排除内容

`hidden`、`display:none`、`visibility:hidden`、`aria-hidden="true"`、`inert` 或位于未显示面板内的普通区域不计数。例外是接入方显式添加合法区域分类、并能通过同一 `Document` 或 open Shadow Root 中 `role="tab"` + `aria-controls` 标准关系找到来源选项的隐藏 `role="tabpanel"`：这类面板保留在分类计数和 DOM 顺序中，但显示前不会进入普通 Tab 顺序。使用 `data-a11y-ignore` 仍会排除整个子树：

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
<section
  id="panel-1"
  role="tabpanel"
  data-a11y-region="viewport"
  aria-labelledby="tab-1"
></section>
<section
  id="panel-2"
  role="tabpanel"
  data-a11y-region="viewport"
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

- 面板区域分类必须由接入方显式添加；工具不会因为存在 `role="tabpanel"` 就自动推测分类，`regions.autoDetect: false` 也不会关闭显式分类。
- 面板未提供 `data-a11y-label` 时，工具通过 `aria-labelledby` / `aria-controls` 关系使用来源选项名称；面板自己的显式名称仍有更高优先级。
- 激活模式未声明或不是 `automatic` / `manual` 时，回退到 `tabs.defaultActivation`。
- 触发事件未声明或为空时，回退到 `tabs.triggerEvents`；配置仍为空时最终使用 `click`。
- 多个事件使用空格分隔并自动去重，因此不同选项可以分别触发不同的页面原有事件。
- 页面原有事件负责在普通 `role="tabpanel"` 或非原生浮层上添加、移除布尔属性 `data-a11y-hidden`，不要在这些宿主面板上直接使用原生 `hidden`。
- 工具只触发页面原事件并同步 `aria-selected` / `aria-hidden`，不直接写入 `data-a11y-hidden` 或控制业务视觉样式；`aria-hidden` 不能替代显隐属性，`data-a11y-hidden` 也不能替代无障碍状态。
- 原生 `<dialog>` 不使用 `data-a11y-hidden`，继续由页面通过 `showModal()`、`open` 和 `close()` 控制。
- 每个有效 `role="tab"` 获得焦点时只朗读一次完整提示：普通选项为 `Tab，{名称}，{区域分类}，当前有浮动窗口，按 ALT+下键进入窗口`，带 `href` 的 `<a role="tab">` 为 `链接：{名称}，Tab，{区域分类}，当前有浮动窗口，按 ALT+下键进入窗口`。区域分类只取关联面板自身扫描到的显式六类分类，不回退到选项或面板的外层区域；关联面板未显式分类时省略该片段。不要在选项上重复添加区域属性，选项不会作为独立盲道区域计数。
- 显式标记的隐藏面板仍参与区域数量和分类循环；分类快捷键或工具栏按钮命中时，工具复用来源选项的触发事件，等待页面显示成功后才添加可逆区域 Tab 锚点、聚焦并朗读。超时、停止或较新的导航使请求过期时，不切换当前区域，也不朗读成功提示。
- Alt+下进入关联面板时使用面板自身的显式区域分类，朗读来源选项、Tab 遍历和 Esc 返回方法；该次聚焦抑制通用区域进入播报，因此只朗读一次。面板没有可通过 Tab 聚焦的后代时改为提示“当前面板暂无可通过 Tab 遍历的信息”，不会给静态内容增加 `tabindex`。
- Esc 只有在面板成功退出并将焦点返回来源选项后才朗读 `已返回{名称}选项`；返回失败时不朗读成功提示。

## 对话框关闭钩子

真正浮层优先使用原生 `<dialog>`。非原生浮层可在已有关闭按钮上增加：

```html
<button type="button" data-a11y-dialog-close>关闭</button>
```

该属性只标识页面已有关闭入口；工具会触发按钮原事件，不擅自隐藏业务 DOM。
