# API 与配置

## 单例 API

```ts
AccessibilityTool.configure(config);
await AccessibilityTool.open({ trigger?, config? });
await AccessibilityTool.close();
await AccessibilityTool.toggle({ trigger?, config? });
await AccessibilityTool.reset();
AccessibilityTool.refresh();
await AccessibilityTool.destroy();
AccessibilityTool.getState();
AccessibilityTool.on(eventName, listener);
AccessibilityTool.off(eventName, listener);
```

配置优先级为：内置默认值 `<` `configure()` 站点配置 `<` `open()` 本次临时配置。本次临时配置在关闭后失效。

站点级功能显隐和自定义语音适配器应在首次 `open()` 前配置；工具已经打开后修改这两类配置，将在下次关闭并重新打开时完整生效。主题、区域选择器等运行时配置可以即时刷新。

自动恢复在 DOM ready 后读取最终站点配置，因此自定义 `storageKey` 应在 `DOMContentLoaded` 前通过 `configure()` 设置。显式 `open()` 成功后才写入打开意图；自动恢复失败或显式打开失败都会清理标记，避免后续页面重复失败。

## 顶层配置

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `debug` | `false` | 使用 open Shadow Root，并输出匹配与诊断信息 |
| `strict` | `false` | 将区域或选项卡配置错误升级为异常 |
| `locale` | `zh-CN` | 工具反馈与语音回退语言 |
| `storageKey` | `accessibility-tool:preferences` | 本地偏好键 |
| `persistOpenState` | `true` | 是否在同源刷新/导航后恢复打开状态；关闭时清理当前键的标记 |
| `features` | 全部开启 | 按功能 ID 隐藏功能，不改变剩余功能相对顺序 |
| `toolbar` | 见下表 | 布局、帮助、样式与主题 |
| `speech` | 见下表 | 语音适配器、悬停延迟和排除项 |
| `zoom` | 见下表 | 缩放目标、范围和步长 |
| `regions` | 见下表 | 盲道扫描与自定义选择器 |
| `tabs` | 见下表 | 标准选项卡和浮层增强 |
| `colorExclusions` | `[]` | 不参与页面配色的 CSS 选择器 |

### 打开状态持久化

- 打开意图使用 `${storageKey}:open-state` 独立存储，并有自己的版本字段；不会修改现有偏好 payload 或偏好版本。
- 没有有效标记时保持原有懒加载：不显示工具栏、不扫描页面、不绑定高频监听。
- 显式 `open({ trigger })` 继续注册触发器、聚焦首项并播报。自动恢复不把当前焦点当作触发器、不移动焦点，也不再次写入“工具栏已打开”的 live region 提示。
- 自动恢复仍会创建工具栏、加载偏好并启动页面效果、区域扫描、选项卡增强和快捷键。
- `close()`、工具栏“退出”和 `destroy()` 清除打开意图；`reset()` 只清除偏好并保持当前打开状态和标记。
- 运行中更改 `storageKey` 时会清理旧键；若工具当前打开，会把意图迁移到新键。`persistOpenState: false` 会清理当前键并阻止自动恢复。
- 只保证同源、且目标页面继续引入并配置同一工具脚本。不做跨域、跨标签页实时同步，也不会向未引入脚本的页面注入工具。
- `localStorage` 不存在、损坏或被阻止时不会抛错；退化为当前页面内存，无法跨刷新恢复属于预期限制。

### `toolbar`

| 字段 | 默认值 |
| --- | --- |
| `layoutMode` | `push`，可选 `overlay` |
| `helpUrl` | `./help.html` |
| `styleUrl` | 空；填写后从外部样式加载 |
| `styleNonce` | 空；用于 CSP nonce |
| `pinHideDelayMs` | `1500` |
| `offsetSelectors` | `[]`；仅偏移明确配置的 fixed/sticky 顶部元素 |
| `theme` | 可覆盖背景、前景、按钮色、强调色、危险色、高度、字号、按钮尺寸、圆角和间距 |

主题键：`background`、`foreground`、`controlBackground`、`controlForeground`、`accent`、`danger`、`height`、`controlRadius`、`fontSize`、`controlSize`、`gap`。

### `speech`

```ts
interface SpeechAdapter {
  speak(text: string, options: SpeechRequestOptions): void;
  cancel(): void;
  isSupported(): boolean;
}
```

| 字段 | 默认值 |
| --- | --- |
| `adapter` | 浏览器 `speechSynthesis` |
| `hoverDelayMs` | `500` |
| `defaultRate` | `1` |
| `ignoreSelectors` | `[]` |

### `zoom`

| 字段 | 默认值 |
| --- | --- |
| `target` | `body`；可传 CSS 选择器或 HTMLElement |
| `min` | `0.75` |
| `max` | `2` |
| `step` | `0.25` |

### `regions`

| 字段 | 默认值 |
| --- | --- |
| `autoDetect` | `true` |
| `observe` | `true` |
| `mutationDebounceMs` | `120` |
| `selectors` | 六类区域的额外 CSS 选择器 |
| `ignoreSelectors` | `[]` |
| `additionalRoots` | `[]`；可传关闭式 Shadow Root 等已授权根节点 |

### `tabs`

| 字段 | 默认值 |
| --- | --- |
| `enabled` | `true` |
| `defaultActivation` | `automatic` |
| `triggerEvents` | `click` |
| `preventDefaultNavigation` | `true` |
| `panelReadyTimeoutMs` | `2000` |
| `manageModalBackground` | `false` |
| `dialogSelectors` | `[]` |
| `closeDialog` | 未配置 |

## 状态

`getState()` 返回只读快照：

```ts
interface AccessibilityToolState {
  isOpen: boolean;
  isPinned: boolean;
  isCollapsed: boolean;
  isReadScreen: boolean;
  readingEnabled: boolean;
  speechRate: number;
  colorScheme: ColorScheme;
  zoom: number;
  largeCursor: boolean;
  crosshair: boolean;
  isFullscreen: boolean;
}
```

## 本地事件

支持 `open`、`close`、`statechange`、`regionchange`、`speechstart`、`speechend` 和 `error`。

```js
const onRegion = ({ type, index, count, label }) => {
  // 接入方可以自行记录功能统计；工具本身不联网。
};

AccessibilityTool.on("regionchange", onRegion);
AccessibilityTool.off("regionchange", onRegion);
```
