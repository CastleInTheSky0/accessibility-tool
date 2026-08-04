# AccessibilityTool v0.1.0（桌面端）

## Goal

在当前项目中实现一套可嵌入不同网站的桌面端无障碍工具 `AccessibilityTool`。工具由接入页面显式调用后打开，提供朗读、页面视觉辅助、全屏、读屏专用盲道导航，以及对标准选项卡和关联面板的键盘增强。

本任务只实现已确认的 v0.1.0 范围，不增加移动端、连读、大字幕、音色选择或第三方插件能力。

## Existing Context

- 新项目根目录为当前目录 `accessibility-tool/`。
- 父目录中的旧文件保持不变。
- 可只读参考 `../accessible-help.js` 中以下已有逻辑：
  - 触发原页面事件完成选项卡切换；
  - `Alt + ArrowDown` 进入关联面板；
  - `Escape` 返回原选项；
  - 面板焦点和原页面事件兼容处理。
- 新版不是旧脚本的增量修改，应重新组织模块、API、属性协议、UI 和测试。

## Requirements

### 1. Project and build

- 版本号：`0.1.0`。
- 使用 TypeScript、Vite Library Mode、pnpm。
- 使用原生 DOM，不引入 React、Vue 等 UI 框架。
- 运行时零依赖。
- 支持现代 Chrome、Edge、Firefox、Safari。
- 首版只适配桌面端，最低支持宽度为 1024px；更窄时允许工具栏内部横向滚动，但不实现移动端布局。
- 构建产物必须包括：
  - `accessibility-tool.min.js`：IIFE 浏览器版，暴露全局 `AccessibilityTool`；
  - `accessibility-tool.es.js`：ESM 版；
  - `accessibility-tool.css`：严格 CSP 场景使用的外部样式；
  - TypeScript 类型声明文件。
- 生产构建不生成 source map。
- 不使用 `eval`、`new Function` 或内联事件处理器。
- 支持 CSP nonce 或外部样式地址。

### 2. Public API and lifecycle

公开单例 API：

```ts
AccessibilityTool.configure(config);
AccessibilityTool.open({ trigger? });
AccessibilityTool.close();
AccessibilityTool.toggle();
AccessibilityTool.reset();
AccessibilityTool.refresh();
AccessibilityTool.destroy();
AccessibilityTool.getState();
AccessibilityTool.on(eventName, listener);
AccessibilityTool.off(eventName, listener);
```

- 每个页面只允许一个工具实例。
- 脚本加载后不自动显示、不扫描页面、不绑定高频全局事件。
- 首次调用 `open()` 时延迟创建工具栏并扫描页面。
- 页面可以有多个唤醒按钮，但共用同一个实例。
- `open({ trigger })` 优先使用显式传入的触发元素；未传时回退到当时的 `document.activeElement`。
- 工具自动维护唤醒按钮的 `aria-controls` 和 `aria-expanded`，销毁时恢复原始值。
- 退出后焦点返回最近一次使用的唤醒按钮；该按钮已被移除时，返回其他仍存在的唤醒按钮；没有可用按钮时聚焦页面主体。
- 配置优先级：内置默认值 < `configure()` 站点配置 < `open()` 本次临时配置。
- 本次临时配置关闭后失效，不写入持久偏好。
- 接入方可以隐藏不需要的功能，但不能改变已确认功能的相对顺序。

### 3. Isolation and theming

- 可见工具栏必须位于 Shadow DOM 内。
- 生产环境默认使用 `closed` Shadow Root，`debug: true` 时使用 `open`。
- 工具栏执行完整样式重置，避免被宿主页面 CSS 污染。
- 只暴露 `AccessibilityTool` 一个全局对象，其他状态和模块保持封装。
- 事件、类名、DOM ID 和本地存储键使用统一命名空间。
- 允许在普通 DOM 中加入少量不可见辅助节点，用于 `aria-live`、`aria-describedby` 和焦点恢复；关闭或销毁时必须清理。
- 高亮和十字线使用不拦截操作的独立覆盖层，设置 `pointer-events: none`。
- 默认视觉为深灰工具栏、浅色按钮、橙色焦点及激活状态。
- 所有按钮始终同时显示内置 SVG 图标和文字，不使用字体图标或第三方图标库。
- 仅开放颜色、字号、按钮尺寸、圆角、间距和工具栏高度等主题变量，不开放任意 CSS 注入。
- 用户切换网页配色时，工具栏继续保持默认工具栏主题。
- 支持 `prefers-reduced-motion` 和 `forced-colors`；系统强制配色优先。

### 4. Toolbar layout and keyboard behavior

主工具栏固定顺序：

1. 朗读
2. 语速
3. 配色
4. 放大
5. 缩小
6. 大鼠标
7. 十字线
8. 大界面
9. 固定
10. 重置
11. 帮助
12. 读屏专用
13. 退出

- 工具栏使用 `role="toolbar"`。
- 工具打开后，焦点进入工具栏容器，并播报“无障碍工具栏已打开，使用左右方向键选择功能”。
- 左右方向键移动功能按钮，Home/End 移动到首尾，Enter/Space 执行，Tab 离开工具栏。
- 水平空间不足时工具栏内部可滚动，并自动将当前键盘项滚入可视范围。
- 不受当前浏览器支持的功能不隐藏：保持可聚焦，设置 `aria-disabled="true"`，执行时播报不可用原因。
- 开关型功能使用 `aria-pressed` 表示状态。

### 5. Page placement and pinning

- 默认打开后在页面顶部预留工具栏高度，将宿主页面内容向下推。
- 支持配置为顶部覆盖模式。
- 页面已有 `fixed` 或 `sticky` 顶部元素时，只偏移接入方配置的选择器，不自动移动所有固定元素。
- “固定”开启后，工具栏吸附视口顶部。
- 鼠标和键盘焦点离开约 1.5 秒后自动收起；设置面板打开、工具栏仍有焦点或正在键盘操作时不得收起。
- 收起后只保留顶部窄条高度；展开内容覆盖页面，不重新推开整页。
- 鼠标移入、键盘聚焦、触屏点击窄条或按 `Alt + Shift + A` 时展开。
- 读屏专用模式开启时不得自动收起。
- 固定状态持久化；下次打开时先完整展开，离开后再按规则收起。

### 6. Persistence, close and reset

- 使用 `localStorage` 保存用户偏好；不可用时退化为当前页面内存状态，不使用 Cookie。
- 保存朗读开关、语速、配色、缩放、大鼠标、十字线、固定和读屏专用状态。
- 不保存全屏状态。
- 恢复已保存的朗读状态时不得立刻发声，需等用户再次聚焦、点击或悬停页面内容。
- `close()` / “退出”必须：
  - 停止朗读；
  - 退出全屏；
  - 撤销配色、缩放、光标、十字线等当前页面效果；
  - 停止观察器和高频监听；
  - 隐藏工具栏；
  - 保留用户偏好供下次打开重新应用。
- `reset()` 必须：
  - 保持工具栏打开；
  - 停止语音并退出全屏；
  - 恢复原始配色、100% 缩放和普通光标；
  - 关闭十字线和读屏专用；
  - 取消固定；
  - 清除持久偏好；
  - 播报“已恢复默认设置”；
  - 焦点保持在重置按钮。
- `destroy()` 必须移除运行时节点、监听器、观察器和工具补充的 DOM 状态，并恢复宿主页面原值。

### 7. Reading and speech rate

- 语音架构可插拔，首版默认使用浏览器 `speechSynthesis`，不依赖后端或云端服务。
- 开启“朗读”后：
  - 键盘焦点进入页面内容时立即朗读；
  - 鼠标悬停约 500ms 后朗读；
  - 鼠标点击内容也可触发；
  - 用户选中文本时优先朗读选中内容；
  - 新目标出现时取消旧语音，不建立语音队列；
  - 对重复目标去重；
  - 标签页进入后台时停止朗读。
- 调整语速时取消当前语音，并使用新速度朗读“当前语速 X 倍”的确认提示；后续内容继续使用新速度。
- 朗读文本只取最小语义单元，例如标题、段落、列表项、链接、按钮或表单控件，不一次朗读整个大型容器。
- 原生输入框、文本域、`role="textbox"` / `role="searchbox"` / `role="spinbutton"` 及可编辑输入区域使用 `输入框：{名称、当前值或占位提示}`；链接、图片、按钮、复选框、单选框和下拉框继续使用各自语义前缀，其它内容使用 `文本：{内容}`。
- 文本提取优先级：
  1. `data-a11y-label`；
  2. 兼容属性 `aria-readlabel`；
  3. `aria-label`；
  4. `aria-labelledby`；
  5. 图片 `alt`；
  6. 表单关联标签、当前值或占位提示；
  7. 按钮和链接的可访问名称与状态；
  8. 可见文本。
- 必须跳过隐藏内容、工具栏自身、`script/style/template`、密码框、验证码、支付/安全键盘配置区域和 `data-a11y-ignore` 区域。
- 朗读文本不得写入日志、存储或统计事件。
- 语言选择优先使用元素最近的 `lang`，再使用 `html[lang]`，最后回退 `zh-CN`；首版不做自动语言检测和音色选择。
- 朗读时用覆盖层高亮当前元素，不包裹或拆分宿主文本。
- “语速”是可通过点击、Enter 或空格直接执行的按钮，按 0.75×、1×、1.25×、1.5× 循环并在末档后回到首档；非预设配置或持久化值取第一个严格更大的预设，无更大值时回到 0.75×。
- 每次切换保持焦点在语速按钮，同步显示、播报和持久化当前速度；不创建设置面板、预设子按钮或滑块，也不使用弹窗相关 ARIA。

### 8. Color schemes

PC 首版点击“配色”按固定顺序循环：

1. 原始配色
2. 白底黑字
3. 黑底黄字
4. 黄底黑字
5. 蓝底白字

- 调整宿主页面的文字、背景、边框和表单控件。
- 图片、视频、Canvas、二维码和地图保持原色。
- 支持配置例外选择器。
- 系统 `forced-colors` 开启时以系统配色为准。
- 关闭、退出或重置时完整恢复原始状态。

### 9. Page zoom

- 放大/缩小作用于 `body` 中除工具栏外的页面内容，工具栏保持原尺寸。
- 支持配置自定义缩放根节点。
- 缩放范围为 75%～200%，每次调整 25%。
- 页面布局应随缩放重新排版，不使用截图式整体拉伸方案。
- 退出时恢复页面原有缩放相关状态。

### 10. Large cursor and crosshair

- “大鼠标”为普通/大鼠标两档，大光标约 48px，具有高对比描边。
- 保留光标语义：普通区域使用大箭头，链接和按钮使用大手型，文本输入使用大文本光标。
- 大鼠标同时作用于宿主页面和工具栏，关闭后恢复网站原有光标。
- 十字线在鼠标操作时跟随指针，在键盘操作时跟随当前焦点元素。
- 十字线不得拦截点击、滚动或焦点。
- 指针或焦点进入工具栏区域时暂停十字线显示，避免遮挡按钮。

### 11. Fullscreen (“大界面”)

- 使用标准 `document.documentElement.requestFullscreen()`。
- 页面和工具栏一起进入全屏。
- 成功后播报“已进入全屏，按 Esc 退出”，退出后播报“已退出全屏”。
- 同一个按钮可进入或退出全屏。
- 不支持或权限被拒绝时给出明确提示。
- 全屏状态不持久化。
- 处于全屏时，第一次按 Esc 优先退出浏览器全屏，不同时退出面板或对话框。

### 12. Help

- “帮助”在新标签页打开，使用标准链接行为和 `rel="noopener"`。
- 打开前播报“将在新窗口打开”。
- 帮助地址可由接入方配置；未配置时使用项目自带静态帮助页。
- 主工具栏和读屏专用界面的帮助是同一个功能。

### 13. Read-screen mode

进入读屏专用后，主工具栏切换为以下固定顺序：

1. 视窗区
2. 导航区
3. 交互区
4. 服务区
5. 列表区
6. 正文区
7. 读屏专用
8. 声音开关
9. 帮助
10. 退出

- 六类区域显示实时数量，例如“导航区(3)”。
- 数量为零的分类置灰，并在工具栏方向键导航中跳过。
- 对零数量分类使用快捷键时，播报“当前页面没有导航区”等提示，焦点保持不变。
- “声音开关”和主工具栏“朗读”使用同一个状态；关闭声音即停止语音并关闭朗读。
- 再次点击已高亮的“读屏专用”返回主工具栏。
- 主/专用界面切换时，焦点保持在读屏专用开关，并播报模式变化。
- 专用界面的“退出”直接关闭整个工具。
- 读屏专用状态持久化，下次打开时恢复专用界面。

快捷键仅在读屏专用开启时生效：

- `Alt + Shift + 1`：视窗区；
- `Alt + Shift + 2`：导航区；
- `Alt + Shift + 3`：交互区；
- `Alt + Shift + 4`：服务区；
- `Alt + Shift + 5`：列表区；
- `Alt + Shift + 6`：正文区。

输入框、文本域和可编辑元素中不得拦截这些快捷键。

分类导航行为：

- 点击分类或按快捷键时，按 DOM 顺序定位该类型的下一个区域。
- 到最后一个后循环回第一个。
- 每种类型分别记住上次位置；切换到其他类型再回来时继续下一个。
- 不显示或展开额外区域名称列表。
- 跳转使用短暂平滑滚动；用户启用减少动态效果时立即跳转。
- 滚动位置必须避开顶部工具栏高度。
- 焦点先落在区域容器；必要时临时补充 `tabindex="-1"`。
- 播报格式类似“主导航，导航区，第 1 个，共 3 个”。
- 焦点位于区域或其内部时持续显示高亮，离开后移除。
- 朗读未开启时，只更新焦点和标准 ARIA，由专业读屏软件播报。
- 当前区域被动态删除或隐藏时，移动到同类下一个区域；没有同类区域时返回对应分类按钮。

### 14. Blind-path region protocol

固定类型映射：

- `1` / `viewport`：视窗区；
- `2` / `navigation`：导航区；
- `3` / `interaction`：交互区；
- `4` / `service`：服务区；
- `5` / `list`：列表区；
- `6` / `content`：正文区。

新版推荐标记：

```html
<nav
  data-a11y-region="navigation"
  data-a11y-label="主导航"
></nav>
```

同时支持数字值：

```html
<nav data-a11y-region="2" data-a11y-label="主导航"></nav>
```

兼容读取旧站属性：

```html
<nav aria-role="2" aria-readlabel="主导航"></nav>
```

- 工具自身不得生成 `aria-role` 或 `aria-readlabel`，新版文档不得推荐这些非标准属性。
- 识别优先级：JS CSS 选择器配置 > `data-a11y-region` > 兼容 `aria-role` > 语义自动识别。
- 名称优先级：`data-a11y-label` > `aria-readlabel` > `aria-label` > `aria-labelledby` > 区域内第一个标题 > 默认分类名称和序号。
- 允许同类多个区域和区域嵌套，所有可见区域均按 DOM 顺序参与导航。
- 语义自动识别默认开启，但可以关闭。
- 默认保守映射：
  - `nav`、`role="navigation"` → 导航区；
  - `form`、`role="form"`、`role="search"` → 交互区；
  - `article`、`role="main"`、`role="article"` → 正文区；原生 `main` 不自动识别，需显式声明；
  - 有明确名称且显式设置 `role="list"` → 列表区；
  - 普通 `ul/ol` 不自动识别；
  - 视窗区和服务区不自动推测。
- `display:none`、`hidden`、`aria-hidden="true"`、`inert` 或位于未显示面板内的区域不计数、不导航。

### 15. Dynamic pages, iframe and Shadow DOM

- 使用节流后的 `MutationObserver`，进行增量扫描，避免每次变化遍历整页。
- 支持动态添加、删除、隐藏和显示区域。
- 支持 SPA 路由变化；路由变化时停止当前朗读、重置分类位置并重新扫描。
- 保留 `refresh()` 供接入方主动刷新。
- 读屏专用开启时，区域数量变化应合并播报一次“页面区域已更新”，不得逐条播报。
- 自动扫描普通 DOM 和开放式 Shadow Root。
- 关闭式 Shadow Root 可由接入方通过配置传入额外扫描根节点。
- 同源 iframe 可以扫描内部内容。
- 跨域 iframe 作为不可深入的原子内容处理；只有显式区域属性或配置时才加入六类区域。

### 16. Standard tabs and linked panels

默认自动扫描标准结构：

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

- 标准选项卡增强默认开启，可通过 `tabs.enabled: false` 关闭。
- 通过 `aria-controls` 和 ID 关联，禁止根据 DOM 顺序猜测。
- 元素只缺少自身 ID 且关联关系明确时可以生成稳定 ID。
- 缺少 `aria-controls`、关联 ID 不存在或 ID 重复时，默认警告并跳过该组件；调试模式显示可视化诊断；严格模式可抛错。
- 每组选项卡只占一个 Tab 停靠点，使用 roving `tabindex`。
- 横向 `tablist` 使用左右方向键，纵向使用上下方向键，Home/End 到首尾。
- 使用 `data-a11y-activation="automatic|manual"` 声明激活方式，默认 `automatic`。
- 自动模式在焦点移动时触发原页面事件；手动模式在 Enter/Space 时触发。
- 每次键盘首次进入一组选项卡时，只播报一次“有关联内容面板，按 Alt+下方向键进入”；组内切换不重复说明。
- `Alt + ArrowDown` 等待目标面板可见后把焦点放到面板容器，默认等待上限约 2 秒，可配置。
- 面板内按 Esc 返回原选项；内部组件已取消 Esc 时不得同时退出面板。
- 面板只有显式带盲道属性或被选择器配置时才加入六类盲道区域。

### 17. Reuse original page events

- 新版选项卡默认复用原页面事件完成视觉切换，不直接修改面板显示样式。
- 默认触发 `click`。
- 支持在 tablist 或单个选项上配置事件：

```html
<div role="tablist" data-a11y-trigger-event="click">
  <button
    role="tab"
    aria-controls="panel-1"
    data-a11y-trigger-event="mouseover"
  >选项一</button>
</div>
```

- 事件优先级：选项节点 > tablist > 全局配置 > 默认 `click`。
- 支持空格分隔多个事件并自动去重。
- 对链接型选项触发事件时默认阻止原生跳转，可配置关闭。
- 原页面事件完成后，工具补充 `aria-selected`、roving `tabindex` 和面板 `aria-hidden`，但不修改面板样式。
- 下一帧检查目标面板是否实际显示；未成功时输出诊断。

### 18. Dialogs

- 通过原生 `<dialog>`、`role="dialog"`、`aria-modal="true"` 或配置识别真正浮层。
- 普通内联 `tabpanel` 不使用对话框语义。
- 模态对话框约束 Tab/Shift+Tab，非模态对话框允许焦点正常离开。
- Esc 关闭后返回原触发选项。
- 页面背景的 `inert` / `aria-hidden` 默认由业务组件管理，接入方可显式开启工具托管。
- 关闭优先级：
  1. 原生 `<dialog>` 标准关闭；
  2. 面板内 `[data-a11y-dialog-close]` 按钮的原有事件；
  3. 接入方关闭回调；
  4. 无关闭方式时提示失败，不擅自隐藏 DOM。

### 19. Error handling, debug and privacy

- 单个区域或组件配置错误不得导致整套工具失效。
- 普通模式警告并跳过错误组件。
- `debug: true` 时显示匹配来源、区域边界、关联错误和可见性状态；调试入口不得出现在普通用户工具栏。
- 严格模式允许将配置错误转为异常。
- 工具不得生成无效 ARIA 属性。
- 默认不发送统计请求，不上传页面内容、朗读文本或用户操作。
- `on/off` 至少支持 open、close、statechange、regionchange、speechstart、speechend 和 error 等本地事件，供接入方自行接入统计。

### 20. Performance

- 工具未打开时不得扫描页面或绑定高频监听。
- 常见页面首次区域识别目标为 100ms 内完成。
- DOM 更新必须节流并优先增量处理。
- 关闭后停止 MutationObserver 和高频输入、指针、滚动监听。
- 不得造成可感知的输入、滚动或交互延迟。

### 21. Documentation and demos

项目必须提供：

- README；
- 快速接入指南；
- 完整配置 API；
- HTML 属性协议；
- 快捷键说明；
- CSP 接入说明；
- 无障碍人工测试清单；
- 自带静态帮助页；
- 版本和浏览器兼容说明。

演示页面必须覆盖：

- 主工具栏所有首版功能；
- 六类盲道区域及数字/英文值；
- 语义自动识别与关闭配置；
- 动态新增、删除和隐藏区域；
- 自动/手动选项卡；
- `click` 和 `mouseover` 事件驱动选项卡；
- 内联面板、模态和非模态浮层；
- SPA 路由刷新；
- 强宿主 CSS 干扰下的 Shadow DOM 隔离；
- CSP 外部样式使用方式。

## Acceptance Criteria

- [ ] 在当前项目中完成 TypeScript + Vite + pnpm 库结构，版本为 0.1.0，运行时零依赖。
- [ ] IIFE、ESM、CSS 和类型声明构建产物名称符合 PRD。
- [ ] 引入脚本后不自动显示或扫描；调用 `AccessibilityTool.open()` 后才启动。
- [ ] 多个唤醒按钮共用单例，退出后焦点能可靠返回。
- [ ] 主工具栏功能、顺序、文字、SVG 图标及键盘模型完全符合 PRD。
- [ ] 工具栏在 hostile CSS 演示页中不受宿主样式污染。
- [ ] 默认顶部推开页面；固定、自动收起、窄条展开及 `Alt + Shift + A` 行为符合 PRD。
- [ ] 用户偏好可保存；localStorage 不可用时工具仍可工作。
- [ ] 退出、重置和销毁均能恢复宿主页面原始状态。
- [ ] 基础朗读、文本提取、排除规则、语言回退、打断和后台停止行为符合 PRD。
- [ ] 语速按钮通过点击、Enter 和空格完整循环四档，非预设值、焦点保持、当前值播报和持久化正确，且不存在设置弹窗或滑块。
- [ ] 五种配色按固定顺序循环，且不改变图片、视频、Canvas 和工具栏主题。
- [ ] 缩放范围为 75%～200%，步长 25%，工具栏尺寸不变。
- [ ] 大鼠标保留箭头、手型和文本光标语义。
- [ ] 十字线可跟随指针和键盘焦点，且不覆盖工具栏或阻塞事件。
- [ ] 大界面使用 Fullscreen API，提示和 Esc 优先级正确，状态不持久化。
- [ ] 帮助在新标签页打开，并支持配置 URL 与本地回退页。
- [ ] 读屏专用界面、六类顺序、数量、零数量行为和 `Alt + Shift + 1～6` 正确。
- [ ] 同类区域按 DOM 顺序循环，每类独立记忆位置，动态删除时焦点能恢复。
- [ ] 推荐 `data-a11y-*` 协议和旧 `aria-*` 兼容读取均正确，工具不生成非法 ARIA。
- [ ] 保守语义自动识别、隐藏过滤、多个/嵌套区域、动态 DOM 和 SPA 路由行为正确。
- [ ] 开放式 Shadow Root 和同源 iframe 可扫描；跨域 iframe 不被越权读取。
- [ ] 标准选项卡 ID 关联、roving tabindex、自动/手动激活和一次性说明符合 PRD。
- [ ] 原页面事件配置、默认 click、链接跳转阻止、异步面板等待和诊断正确。
- [ ] 内联面板、模态/非模态对话框、Esc 冲突和关闭优先级正确。
- [ ] 不支持的功能使用可聚焦 `aria-disabled` 并说明原因。
- [ ] 工具默认不联网、不记录或上报朗读文本。
- [ ] 常见页面首次区域扫描满足约 100ms 性能目标，动态更新不造成明显卡顿。
- [ ] Vitest 单元测试覆盖区域识别、状态、文本提取、选项卡、存储和恢复。
- [ ] Playwright 覆盖完整键盘流程、动态 DOM、样式隔离和关键功能。
- [ ] axe-core 不发现由工具新增的 serious 或 critical 问题。
- [ ] 提供 Chrome/Edge/Firefox + NVDA、Safari + VoiceOver 的人工测试清单。
- [ ] README、API、属性协议、CSP、帮助页和演示页面齐全。

## Definition of Done

- `pnpm install` 成功。
- `pnpm build` 成功。
- `pnpm test` 成功。
- `pnpm test:e2e` 成功。
- TypeScript 类型检查通过。
- 自动化无障碍检查通过。
- 所有新增页面效果均可通过退出、重置或销毁恢复。
- 最终交付说明包含：实现摘要、主要目录结构、构建产物、测试结果、人工读屏验证项、示例接入代码和已知限制。

## Technical Approach

- 使用原生 TypeScript 模块拆分核心生命周期、状态存储、工具栏、区域扫描、朗读、页面视觉效果、选项卡增强、对话框和覆盖层。
- 使用 Vite 同时输出 IIFE 和 ESM；严格 CSP 使用外部 CSS，普通浏览器版可使用内置样式加载器。
- 工具栏 UI 放入 Shadow DOM；宿主页面效果通过可逆、带命名空间的样式和覆盖层实现。
- 区域扫描器统一归一化 JS 配置、`data-a11y-*`、兼容旧属性和保守语义识别结果。
- 选项卡模块只负责键盘、焦点、ARIA 和触发原页面事件，不接管业务面板视觉样式。
- MutationObserver、路由刷新和可见性检查必须节流并可在关闭时完全停止。

## Decision (ADR-lite)

**Context**：旧脚本仅解决旧页面选项卡键盘问题；新版需要成为可复用、可配置、可测试的完整无障碍工具，同时继续兼容旧站的事件驱动结构。

**Decision**：新建独立 TypeScript/Vite 项目，公开单例 `AccessibilityTool` API；可见 UI 使用 Shadow DOM；新版推荐合法的 `data-a11y-*` 协议，旧 `aria-role` / `aria-readlabel` 只读兼容；标准选项卡通过 ID 关联并触发原业务事件；首版限制为桌面端和已明确功能。

**Consequences**：可获得稳定样式隔离、明确接入协议和可测试生命周期；严格 CSP 需要外部 CSS 或 nonce；旧页面非法 ARIA 可能继续被外部审计工具报告，但新版不会新增此类属性；移动端、连读和大字幕留待后续独立任务。

## Out of Scope

- 连续朗读。
- 大字幕。
- 移动端或平板专用布局。
- 用户音色/发音人选择。
- 自动语言检测。
- 第三方公开插件 API。
- 云端 TTS 或任何后端服务。
- 自动修复宿主页面所有无障碍问题。
- 重写父目录旧脚本或旧示例。
- 创建本 PRD之外的附加产品功能。

## Technical Notes

- 参考文件仅用于理解旧事件与焦点行为：`../accessible-help.js`、`../README.md`。
- 对旧 `aria-role` / `aria-readlabel` 的支持是兼容行为，不代表合法 ARIA；严格 axe 验收应使用 `data-a11y-region` / `data-a11y-label` 示例。
- 全屏必须由用户手势触发，浏览器可能拒绝请求；这是需处理的能力失败，不得使用伪全屏掩盖。
- 跨域 iframe 和关闭式 Shadow Root 受浏览器安全边界限制，不得绕过。
- 本任务不拆分新的产品子任务；所有实现严格以本 PRD 为边界。
