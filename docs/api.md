# API 与配置

## 单例 API

```ts
AccessibilityTool.configure(config);
const regions = AccessibilityTool.registerRegions(configs);
const tabs = AccessibilityTool.registerTabs(configs);
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

## JavaScript DOM 注册

接入方不能直接修改原页面 HTML 时，可在目标节点已经存在后调用 `registerRegions()` 或 `registerTabs()`。两个方法都会立即写入现有属性协议；工具已经打开时同步刷新现有区域扫描，尚未打开时则在之后打开时识别。

### 公共类型

```ts
type RegionCode = 1 | 2 | 3 | 4 | 5 | 6;
type DomTarget = string | Element;

interface RegistrationHandle {
  dispose(): void;
}

interface RegionRegistrationConfig {
  target: DomTarget;
  region: RegionCode;
  label?: string;
}

interface TabRegistrationItem {
  tab: DomTarget;
  panel: DomTarget;
  region: RegionCode;
  label?: string;
  activation?: "automatic" | "manual";
  triggerEvent?: string | readonly string[];
}
```

| `RegionCode` | 区域分类 |
| --- | --- |
| `1` | 视窗区 |
| `2` | 导航区 |
| `3` | 交互区 |
| `4` | 服务区 |
| `5` | 列表区 |
| `6` | 正文区 |

JavaScript 注册 API 的 `region` 只接受上述数字，不接受英文区域名称。运行时收到其他值时只跳过该项，不影响同一次调用中的有效配置；`debug: true` 时输出明确警告。

### `registerRegions()`

```js
const contentElement = document.querySelector("#content");

const registration = AccessibilityTool.registerRegions([
  {
    target: "#news",
    region: 1,
    label: "要闻",
  },
  {
    target: "#main-nav",
    region: 2,
    label: "主导航",
  },
  {
    target: contentElement,
    region: 6,
    label: "新闻正文",
  },
]);

// 注销本次调用，并恢复所有目标节点注册前的属性值。
registration.dispose();
```

- 字符串按 `document.querySelectorAll()` 解析，同一选择器匹配的全部现有节点使用同一配置。
- `Element` 只处理传入节点；断开节点或不属于有效文档的节点会被跳过。
- `label` 只填写区域自身短名称，例如“要闻”，不要填写“要闻视窗区”或完整提示句。省略时继续使用现有可访问名称和标题回退规则。
- API 写入数字形式的 `data-a11y-region`，并在提供 `label` 时写入 `data-a11y-label`；分类名称与完整朗读文案仍由现有扫描和导航模块生成。

### `registerTabs()`

```js
const registration = AccessibilityTool.registerTabs([
  {
    tab: ".services-tab-hditem",
    panel: ".services-tabcut-bdcontent",
    region: 1,
  },
]);

registration.dispose();
```

- `registerTabs()` 直接接收扁平的选项配置，不需要 `tablist` 或 `items` 包装层。
- 字符串目标按 `document.querySelectorAll()` 解析。同一项的 tab 与 panel 有效匹配数量相等且大于零时，按各自 DOM 顺序和相同索引一一配对，因此多个组件复用相同类名时也只需配置一次。
- tab/panel 数量不一致时整项跳过，其他配置继续注册；`debug: true` 时输出包含两侧数量的警告。`Element` 目标仍只表示单个现有节点。
- 每个 tab 的直接父节点自动获得 `role="tablist"`。同一选择器命中多个组件时，会按不同直接父节点自动拆成多个独立 tablist；每组分别初始化首个选项，键盘移动与选中状态不会影响其他组。工具不猜测更外层祖先。
- 每对 tab 与 panel 必须位于同一 `Document` 或 Shadow Root；重复 tab、重复 panel、tab/panel 跨角色复用、同一节点自配对，以及自动推断父节点与 tab/panel 的角色冲突，都只跳过冲突配对。仍在生效的注册也参与跨角色校验，相同角色的重叠注册则继续由属性所有权层安全处理。
- 缺失 ID 时生成同一根节点内不冲突的临时 ID；已有唯一 ID 原样复用。临时 ID 和所有覆盖属性都在注销时恢复。
- API 自动补充 `tablist` / `tab` / `tabpanel` role、`tabindex`、ARIA 关联与选中状态，并给 tab 和 panel 写入相同的数字区域。注册 tab 上的区域值只作为选项分类元数据，不会把选项重复计为第二个盲道区域。
- `data-a11y-activation` 与 `data-a11y-trigger-event` 只写在对应 tab 上。省略时沿用当前 `tabs.defaultActivation`、`tabs.triggerEvents` 和最终 `click` 回退规则；多个事件会按现有规则拆分、去重。
- `label` 是选项短名称覆盖值；省略时使用现有 tab 可访问名称提取逻辑。对应 panel 使用同一短名称和区域分类。
- 初始非活动普通面板使用 `data-a11y-hidden`；原生 `<dialog>` 的该属性保持原样，并继续使用自身的 `open` / `close()`。注册过程不新增、删除或修改原生 `hidden`。接入页面原有事件与 CSS 仍负责真实视觉显示，工具继续只复用现有 tabs 事件、ARIA、键盘、Alt+下、Esc 和朗读流程。

### 生命周期和动态 DOM 限制

- 每次调用返回独立句柄；`dispose()` 幂等，只注销该次调用。多个注册覆盖同一属性时，释放其中一个不会破坏仍有效的注册。
- 恢复会区分原本不存在、原本为空字符串和原本具有非空值的属性。
- `close()` 不注销 DOM 注册，重新打开仍可识别；`destroy()` 会自动释放全部尚未 `dispose()` 的注册并恢复 DOM。
- 首版只解析调用时已经存在的节点，不保存选择器等待未来节点。SPA 路由或框架重建 DOM 后，接入方需要重新调用相应注册方法。

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

桌面主工具栏固定为单排，功能顺序由内部常量保持稳定；完整主模式共有 15 个控件，其中顺序固定为“朗读 → 连续朗读 → 语速 → 音色 → 配色”。工具栏外层继续占满视口，品牌与控件共享的内部版心为 `width: 100%`、`max-width: 1280px`；1024～1279px 使用紧凑单排布局。

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

### 连续朗读

- `features.continuousReading` 依赖 `features.reading`。主模式和读屏专用模式的“连续朗读”入口连接同一会话，并打开 Shadow DOM 内 anchored、非模态“连续朗读控制”面板。
- 面板提供开始、暂停／继续和停止。Esc、关闭按钮或面板外操作只关闭面板，不停止仍在播放的会话；显式关闭后焦点返回当前连接的入口。
- 开始前先检查 `SpeechAdapter.isSupported()`。不支持时保持 `readingEnabled` 和连续状态不变；支持但当前范围为空时会保留自动开启并持久化的 `readingEnabled`，连续状态仍为 `idle`，两种情况都只通过 live region 说明原因。
- 默认起点依次为工具栏接管前最后一个有效页面目标、当前盲道区域首个有效段落、页面首个有效段落。自动推进不移动键盘焦点，只更新朗读高亮并在需要时滚动。
- 每次启动冻结一个有限 composed-tree 队列，按页面顺序进入 open Shadow Root、slot 和同源 iframe；未标记正文也会参与。新插入的普通内容留到下次启动，已有成员在每段前重新解析当前文本、语言、语速和音色。
- 当前有效 tab 控件作为原子项朗读；只有启动时可见的当前 panel 内容逐段进入队列，隐藏 panel 不会被读取或自动激活。模态 dialog 打开会停止背景会话；在 dialog 内重新开始时只读取最内层活动 dialog。
- 自动遍历不朗读 editable 输入值。密码、验证码（含 `autocomplete="one-time-code"`）、支付字段、显式敏感内容、配置忽略项，以及被这些节点提供的 label、ARIA 名称、说明或当前选项文本都会被排除；单次主动聚焦／点击的普通 editable 朗读行为保持不变。
- 暂停通过取消当前请求实现，继续从被中断段落开头重播。用户页面交互、其他显式语音、音色试听、路由、dialog、关闭朗读和生命周期清理都会按对应原因结束会话；语速、默认语言或音色偏好调整从下一段生效，不抢占当前段。
- 所有段落继续经过唯一的 `SpeechController → SpeechAdapter`。自定义 adapter 的同步 `speak()` 异常会转换为一次有效语音错误；`cancel()` 异常不会阻断暂停、停止或清理。连续朗读不保存正文，也不发起网络请求。

### 浏览器本地音色选择

- 默认浏览器语音适配器启用时，“音色”按钮打开 Shadow DOM 内的非模态“语音设置”浮层。浮层可选择默认语言、自动选择或兼容的本地音色，并支持试听和清除语音偏好。
- 音色目录立即调用 `speechSynthesis.getVoices()`，并监听 `voiceschanged` 处理浏览器异步加载。界面只显示 `localService === true` 的音色；远程音色不会显示，也不会被显式赋给 `SpeechSynthesisUtterance.voice`。
- 音色按最终语言的精确标签、相同主语言排序。已保存音色优先按 `voiceURI` 恢复，再按 `name + 规范化 lang` 恢复；无法恢复时使用兼容的浏览器默认本地音色，最后保持 `utterance.voice` 未设置并交给浏览器按 `utterance.lang` 回退。
- 偏好 payload 仍为 version 1，可选保存 `{ voiceURI, name, lang }`。原生 `SpeechSynthesisVoice` 对象不会写入存储；每次有效朗读和试听都会从最新 `getVoices()` 结果重新解析当前对象。
- 试听使用当前语速和固定短句，并继续经过唯一的 `SpeechController`。再次试听会取消旧请求；关闭浮层、关闭工具、重置或销毁时会取消仍有效的试听并清理事件监听。
- 配置自定义 `SpeechAdapter` 时，原有适配器调用和取消契约不变；语音设置浮层会明确说明浏览器本地音色不可用，且不会把浏览器 voice 对象传给自定义适配器。
- 音色目录与播放之间存在未从包入口导出的内部能力边界，便于后续在另行批准后增加其他来源。该边界不是公共插件 API；v0.2 不读取服务地址、凭据或厂商配置，不包含云端 SDK，也不发起音色目录或音频网络请求。

### 页面朗读语言解析

页面元素朗读会在每次有效请求前重新解析语言，并把最终规范化后的 BCP 47 标签传给 `SpeechRequestOptions.lang`。固定优先级为：

1. 当前目标元素自身的 `lang`
2. 最近的组合树祖先元素 `lang`
3. 目标所属 `document.documentElement.lang`
4. 已保存的默认语言（可选偏好字段）
5. 当前朗读文本的纯本地脚本特征
6. `locale` 项目回退语言

- `_` 会兼容转换为 `-`，并优先通过浏览器 `Intl` 规范化，例如 `en_US` → `en-US`、`ZH-hans-cn` → `zh-Hans-CN`。
- 空值、非法值、`und` 和 `zxx` 会跳过，不会阻断朗读。
- open Shadow Root 中会沿组合树继续检查 host；同源 iframe 只使用目标自己的文档语言，不跨到外层页面猜测。
- 无显式标记和已保存偏好时，本地轻量检测可识别主导中文、英文、日文假名和韩文。至少需要 2 个强语言字符且主导组达到 60%；否则使用 `locale`。
- `locale` 继续控制工具自身提示的语言，并作为页面内容的最终回退。宿主页面 `lang` 不会改写“朗读已开启”等工具内置提示。
- “语音设置”中的默认语言选择会写入该可选偏好；选择“跟随页面与自动检测”或清除偏好会移除它。页面自身和祖先／文档 `lang` 仍保持更高优先级。
- 检测同步在浏览器本地完成，不发起网络请求、不上传或保存朗读文本，也不新增运行时依赖。

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
  continuousReadingState: "idle" | "playing" | "paused";
  speechRate: number;
  colorScheme: ColorScheme;
  zoom: number;
  largeCursor: boolean;
  crosshair: boolean;
  isFullscreen: boolean;
}
```

## 本地事件

支持 `open`、`close`、`statechange`、`regionchange`、`speechstart`、`speechend`、`error`，以及五个连续朗读会话事件。

```ts
type ContinuousReadingState = "idle" | "playing" | "paused";
type ContinuousReadingScope = "page" | "dialog";
type ContinuousReadingStopReason =
  | "completed"
  | "stopped"
  | "interaction"
  | "dialog"
  | "route"
  | "disabled"
  | "lifecycle"
  | "error";

interface ContinuousReadingPosition {
  index: number; // 从 1 开始，位于启动时冻结的候选队列中
  count: number; // 启动时冻结的候选总数
  textLength: number;
}

interface ContinuousReadingEvents {
  continuousreadingstart: {
    state: "playing";
    scope: ContinuousReadingScope;
    count: number;
  };
  continuousreadingsegmentchange: ContinuousReadingPosition & {
    state: "playing";
  };
  continuousreadingpause: ContinuousReadingPosition & {
    state: "paused";
  };
  continuousreadingresume: ContinuousReadingPosition & {
    state: "playing";
  };
  continuousreadingstop: {
    state: "idle";
    reason: ContinuousReadingStopReason;
    lastIndex: number | null;
    count: number;
  };
}
```

`index`／`count` 描述启动时冻结的队列；运行中失效并被跳过的成员不会触发 `continuousreadingsegmentchange`，因此 `index` 可以跳号。公共 payload 不包含正文、Element、语言、区域标签或内部 generation；当前有效段落只由内部 reading provider 暴露给后续大字幕功能。

首次有效启动的事件顺序为：必要的 `readingEnabled` `statechange` → `continuousReadingState="playing"` `statechange` → `continuousreadingstart` → 首段 `continuousreadingsegmentchange` → `speechstart`。有效错误顺序为唯一 `error` → idle `statechange` → reason=`error` 的 `continuousreadingstop`；取消或过期回调不会补发 `speechend`／`error`。

```js
const onRegion = ({ type, index, count, label }) => {
  // 接入方可以自行记录功能统计；工具本身不联网。
};

AccessibilityTool.on("regionchange", onRegion);
AccessibilityTool.off("regionchange", onRegion);
```
