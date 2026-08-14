# 连续朗读

## Goal

在现有 `ReadingController`、`SpeechController`、`BrowserSpeechAdapter`、区域扫描、焦点、tabs 和请求取消机制上，增加一个可开始、暂停、继续、停止且不会播报过期内容的页面连续阅读流程。该流程保持默认离线，不移动用户键盘焦点，并为后续“大字幕”提供唯一的当前有效段落状态。

## What I Already Know

- 当前单次朗读已统一经过 `ReadingController -> SpeechController -> SpeechAdapter`，并按目标在每次请求前重新解析文本、语言、语速和本地音色。
- `SpeechController` 已通过 `requestId` 屏蔽被取消请求的过期 start/end/error 回调；连续朗读必须复用该边界，不能创建第二套 adapter 或直接调用 `speechSynthesis`。
- `RegionScanner` 已发现 document、open Shadow Root、同源 iframe 和额外 roots，并在 mutation／SPA 路由后更新；roots 是发现边界，不能简单按 root 拼接为阅读顺序。
- 工具栏位于 Shadow Root 内。点击“连续朗读”时页面焦点已经可能进入工具栏，因此必须保留进入工具栏前最后一个有效页面目标，不能只读取当时的 `document.activeElement`。
- 现有阅读高亮、页面焦点黄框和盲道区域橙框拥有独立状态；连续朗读只复用阅读高亮，不应逐段移动键盘焦点。
- `SpeechAdapter` 没有可移植的暂停／继续接口。为兼容自定义 adapter 和不同浏览器，暂停应取消当前段，继续时从被中断段落开头重播，再按队列前进。
- `close()`、`reset()`、`destroy()`、关闭朗读、SPA 路由和任何更新的显式请求都必须先使连续会话代次失效，再取消当前语音。

## Requirements

### 1. Single playback owner

- 连续朗读由现有 reading 层编排，每个段落仍调用唯一的 `SpeechController.speak()`。
- 每段在真正发声前重新获取可访问文本、规范化语言、当前语速和兼容本地音色。
- 连续会话使用独立 generation 保护队列和推进回调；单段仍由 `SpeechController.requestId` 保护。
- 新的单次朗读、试听、工具提示或连续会话不得与旧连续段落排队共存。

### 2. Session state and controls

- 状态至少为 `idle`、`playing`、`paused`。
- 支持开始、暂停、继续、停止，重复操作幂等。
- 暂停会取消当前语音并保留当前段；继续从该段开头重播，不承诺从句中或词中恢复。
- 自然读完、用户停止、被其他交互抢占、路由变化、生命周期清理和错误结束必须具有可区分的停止原因。
- 主工具栏新增独立 `连续朗读` 入口，固定放在现有 `朗读` 与 `语速` 之间；`语速 -> 音色 -> 配色` 的既有相邻顺序保持不变。
- 读屏专用模式在现有 `朗读` 后提供同一连续会话入口；切换模式不会创建第二个会话或重置状态。
- 入口显示 `未开始`、`朗读中` 或 `已暂停`，并打开 anchored、非模态 `连续朗读控制` 面板。
- 面板提供显式开始、暂停／继续和停止按钮；Esc、关闭按钮或面板外操作只关闭面板，不隐式停止仍在播放的会话。
- 面板显式关闭后焦点返回当前连接的 `连续朗读` 入口；非模态面板不形成焦点陷阱。
- 继续使用已确认的 `1280px` 桌面版心上限，不扩大到 `1300px` 以上；主工具栏由 14 个增加为 15 个控制，1024～1279px 保持紧凑单排、无裁切和横向滚动。
- 点击连续朗读“开始”时，如现有 `readingEnabled` 为 `false`，先把它提交并持久化为 `true`，再建立连续会话；不要求用户先执行第二个开关动作。
- 连续会话自然完成、发生错误或按“停止”结束后不自动关闭 `readingEnabled`；用户主动关闭主模式／读屏模式的 `朗读` 开关时，以 `disabled` 原因停止 playing 或 paused 会话。
- 播放中调整语速、默认语言或本地音色不取消当前段；当前段使用启动时参数读完，下一段在请求前重新解析并使用最新设置。
- 连续会话 playing／paused 时，语速和音色选择等设置确认只写入 live region，不合成一条会抢占当前段的工具提示；显式音色试听仍作为新的语音请求终止连续会话。
- 开始前先检查 `SpeechAdapter.isSupported()`。不支持时不改变 `readingEnabled`，不创建连续会话，也不触发连续会话 start／stop 事件；状态保持 `idle`，面板开始按钮以 `aria-disabled="true"` 暴露不可用状态，并通过 live region 提示 `当前浏览器不支持语音合成`。
- 浏览器支持语音但当前范围没有有效可读段落时，保留“开始”已自动开启并持久化的 `readingEnabled`，连续状态保持 `idle`，不触发连续会话 start／stop 事件；只通过 live region 提示 `当前范围没有可朗读内容`，不移动焦点。

### 3. Start position

- 默认采用“最后一个有效页面焦点优先”，完整回退链固定为：
  1. 工具栏接管焦点前最后一个仍连接、可见、非忽略、非敏感且可读的页面目标；
  2. 当前可见盲道区域中的第一个有效可读段落；
  3. composed-tree 页面顺序中的第一个有效可读段落。
- 页面目标在开始前已删除、隐藏、变为敏感／忽略或文本变空时，立即进入下一层回退，不报错、不朗读旧缓存文本。
- 起点只决定队列位置；开始连续朗读不会把键盘焦点移动到该目标。

### 4. Reading order and segment eligibility

- 使用 composed-tree DOM 顺序：light DOM 按源顺序，并在宿主位置进入 open Shadow Root 或同源 iframe。
- 不按六类区域重新分组；离开一个区域后按 composed-tree 页面顺序无缝继续到下一个有效段落，未标记区域的内容也可参与。
- 跨越区域边界时不插入区域名称、提示音或暂停，不自动播报完整“进入区域”焦点指令；该指令仍只由真实区域焦点／导航拥有。最近区域类型／标签可保留为内部当前段落上下文，但 v0.2 不把它加入公共事件 payload。
- 仅处理当前可见上下文；`hidden`、`inert`、`aria-hidden="true"`、`data-a11y-hidden`、断开 DOM、工具自身、`data-a11y-ignore` 和配置忽略项均跳过。
- 密码、验证码、支付字段、`data-a11y-sensitive`、安全键盘和现有敏感选择器永不进入队列。
- 原生／ARIA 交互控件、图片替代文本和表单控件按既有可访问文本语义朗读；不得通过修改正 `tabindex` 人造阅读顺序。
- 编辑型文本 input、textarea、ARIA textbox 和 contenteditable 在连续自动遍历中只朗读可访问标签、控件类型、占位／说明与非文本状态，不朗读用户当前输入值；`readonly`／非编辑内容、select／combobox 当前选项、checkbox／radio／pressed／expanded／disabled／current 状态按既有语义处理。
- 用户主动聚焦、点击编辑控件触发的现有单次朗读保持不变，可继续按现有规则朗读当前值；密码、验证码、支付和显式敏感控件在两种模式中仍完整排除。
- 文本容器与其可读后代不得重复播报相同文本；序列构建器需覆盖嵌套链接、列表、表格、label／control 和组合控件。
- 当前可见的有效 tab 控件按现有专用语义作为原子项，并包含名称与选中状态；只有会话启动时可见的当前 panel 内容可成为队列成员，不读取或自动激活隐藏 tab/panel。

### 5. Focus, pointer, regions, tabs, and dialogs

- 自动推进只更新阅读高亮和必要滚动，不移动键盘焦点。
- 用户主动移动页面焦点、点击其他朗读目标、激活 tab、执行区域导航或触发另一条显式页面语音时，立即以 `interaction` 原因停止连续会话并清空恢复点，然后由现有单次目标、tab 或区域播报接管。
- 暂停状态下发生上述交互同样终止会话，不把新目标偷偷写成恢复点；用户再次点击“开始”时自然按“当前页面焦点优先”规则从新位置建立队列。
- 工具栏内部仅用于操作连续阅读面板的焦点移动不视为页面交互，不会自行停止会话；其他会发起语音的工具栏动作仍按“更新请求优先”规则使旧段落失效。
- 新的模态 dialog 成为强上下文边界：无论由用户还是宿主异步打开，都以 `dialog` 原因停止背景连续会话并清空恢复点，不自动建立 dialog 队列。
- 用户可在模态 dialog 内显式重新开始；此时阅读范围限制为当前最内层活动模态 dialog 的可见 composed subtree，不越过 dialog 继续朗读背景。
- dialog 关闭、替换或失效时终止其内部连续会话，不自动恢复此前背景队列。
- 非活动／隐藏 panel 和背景中的 inert 内容不得被朗读。

### 6. Dynamic DOM and navigation

- 会话开始时建立成员稳定的有限序列，每段发声前重新验证；被删除、隐藏、忽略、变敏感或变空的节点静默跳过。
- 已在序列中的节点若文本、状态、语言祖先、语速或音色偏好发生变化，在轮到该节点时使用最新有效值，不使用启动时正文缓存。
- 当前正在朗读的节点若变为断开、隐藏、inert、忽略、敏感或不可读，立即取消该段并在同一会话中推进到下一个有效成员；该内部取消不触发 `speechend`、`error` 或连续会话 stop。若只是文本、语言、语速或音色在发声中变化，当前 utterance 使用已提交快照读完，后续段落再使用最新值。
- 普通新增节点、启动时不可见但后来显示的非模态内容，以及框架新建的替代节点不插入当前队列，在下一次开始时纳入，避免无限滚动或直播区域让会话无限增长。
- tab/panel 状态在会话中异步变化时，已变为隐藏的候选项按重新验证规则跳过，新显示 panel 的内容不插入当前队列；用户显式激活 tab 仍按 `interaction` 规则停止会话。
- mutation 更新不得让已读段落重新进入队列，也不得让旧回调推进新会话。
- `pushState`、`replaceState`、`popstate`、`hashchange` 和 `accessibility-tool:route` 一律停止连续朗读并清空恢复点，不在新页面自动继续。

### 7. Current segment and public events

- `AccessibilityToolState` 新增非持久化字段 `continuousReadingState: "idle" | "playing" | "paused"`；初始化、重新打开、reset 和运行时重建的稳定状态均为 `idle`。
- reading 层维护唯一内部当前段落，至少包含 element、最终 text、language、scope、session generation、队列 index/count 和可选区域上下文；结束／取消后按规则清空。
- 后续大字幕只消费该内部当前段落 provider，不根据 DOM 焦点、`speechstart.textLength` 或另一套队列推断文本。
- 公共类型与事件契约冻结为：

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

- `index`／`count` 描述启动时冻结的候选队列；运行中失效并被跳过的成员不触发 `continuousreadingsegmentchange`，因此 index 允许跳号。公共 payload 不暴露正文、Element、语言、区域标签或 generation。
- 首次有效启动的顺序固定为：必要时先触发 `readingEnabled` 对应的 `statechange`；随后 `continuousReadingState="playing"` 的 `statechange`；再依次触发 `continuousreadingstart`、首段 `continuousreadingsegmentchange` 和该 utterance 的 `speechstart`。
- 普通段落推进的顺序固定为：当前 utterance 的 `speechend` → 下一段 `continuousreadingsegmentchange` → 下一 utterance 的 `speechstart`。
- 暂停会取消当前 utterance 且不触发 `speechend`，随后触发 paused `statechange` 和一次 `continuousreadingpause`；当前段落与高亮保留。继续前先重新验证恢复点：有有效段落时触发 playing `statechange`、一次 `continuousreadingresume`，若位置已前移再触发 `continuousreadingsegmentchange`，随后重播；没有剩余有效段落时直接按 `completed` 结束，不触发 resume。
- 用户停止、交互、dialog、路由、关闭朗读或生命周期清理先使 session generation 失效并取消语音，不触发旧 utterance 的 `speechend`；清空当前段落／高亮并触发 idle `statechange` 后，再触发一次带原因的 `continuousreadingstop`。
- 自然读完时最后一段先触发有效 `speechend`，随后触发 idle `statechange` 和 reason=`completed` 的 `continuousreadingstop`；有效语音错误先触发现有唯一 `error`，随后触发 idle `statechange` 和 reason=`error` 的 stop。所有过期 start/end/error/cancel 回调均不得再触发公共事件或推进新会话。
- 自然完成通过非合成 live region 提示 `连续朗读已完成`；错误使用简短非合成状态提示，避免失败后再次创建语音请求。
- toolbar metadata 在提示后显示 `未开始`，不保留“已完成”伪播放状态；后续字幕接收 `currentSegment = null`，是否短暂保留视觉副本由字幕任务决定。

### 8. Lifecycle and privacy

- `close()`、`reset()`、`destroy()`、关闭朗读功能和运行时重建均停止会话、取消语音、清理高亮、监听器、队列、当前段落和过期回调。
- 工具不可保存、上传或记录朗读正文、队列或检测结果；不发起网络请求。
- 继续保持零运行时依赖和自定义 `SpeechAdapter` 向后兼容。

## Technical Approach

1. **Reading layer owns the session**：扩展现有 `ReadingController` 的编排边界，维护最后有效页面目标、有限候选队列、session generation、状态转换和唯一 current-segment provider；可把 composed-tree 遍历与段落去重提取为纯辅助模块，但不建立平行 reading 系统。
2. **Speech remains one request per segment**：所有正文继续通过 `SpeechController.speak()` 和当前 `SpeechAdapter`；暂停、跳过、停止和抢占统一通过 cancel + generation/requestId 双重失效实现，不使用浏览器全局 pause/resume。
3. **Runtime coordinates public state**：`AccessibilityToolRuntime` 负责 `readingEnabled` 自动开启／持久化、`continuousReadingState`、公共事件顺序、路由／dialog／生命周期停止原因，以及现有单次语音与连续会话的唯一所有权。
4. **Toolbar exposes one shared controller**：主模式与读屏专用模式的入口连接同一会话，使用 anchored 非模态面板；UI 只反映 reading 层状态，不自行维护第二套播放状态。
5. **Traversal is composed and finite**：从当前 scope 构建 composed-tree 候选序列，在 host 位置进入 open Shadow Root／同源 iframe；启动时冻结成员，每段前及关键 mutation 后重新验证可见性、隐私与文本。
6. **Tests use deterministic speech**：单元测试使用可控 adapter 验证请求、取消和事件顺序；E2E 在 Chrome／Edge 验证真实焦点、toolbar Shadow Root、tabs/dialog、动态 DOM、滚动和无网络行为。

## MVP Boundary and Future Extension

- 本任务交付本地连续朗读的完整可用闭环：入口与控制面板、有限阅读序列、开始／暂停／继续／停止、交互抢占、动态 DOM、dialog／tabs／路由、公共状态／事件和内部当前段落 provider。
- 当前段落 provider 预留给下一项“大字幕”；`SpeechAdapter` 边界继续允许未来接入云端服务，但本任务不实现字幕呈现、云端请求或远程音频。
- 区域上下文只作为内部可选元数据保留，使未来可以增加视觉区域提示或可配置的区域播报，而不改变 v0.2 的无缝默认行为。

## Out of Scope

- 云端 TTS、流式音频、后端播放列表、网络请求、远程正文缓存或任何新的运行时依赖。
- 大字幕 UI、正文历史、跨会话阅读位置持久化、关闭／路由／dialog 后自动恢复。
- 句中／词中精确续播、浏览器全局 pause/resume、逐词语言或音色切换。
- 自动进入 closed Shadow Root、跨源 iframe，或激活隐藏 tab/panel 以读取其内容。
- 自动朗读 editable 用户输入值、密码、验证码、支付字段或显式敏感内容。
- 公共事件暴露完整正文／Element，或在本任务新增公开的程序化 start/pause/resume/stop 方法。
- 重做现有工具栏信息架构、突破 `1280px` 版心，或为每个实现批次创建新分支。

## Implementation Batches

所有批次继续提交到当前 `feat/accessibility-tool-v0.2` 分支，不创建逐功能分支。

1. **契约与测试骨架**：新增公共类型／状态／事件定义、确定性 adapter 场景和失败测试，先冻结事件顺序。
2. **阅读核心**：实现 composed-tree 序列、起点回退、段落语义／去重、session generation、暂停恢复、动态重新验证和 current-segment provider。
3. **运行时与 UI 集成**：接入 reading toggle、单次语音抢占、tabs/dialog／路由／生命周期，新增两个模式共用的入口、非模态面板和 1280px 响应式布局。
4. **验证与文档**：补齐 Chrome／Edge E2E、无障碍与无网络断言，更新 API／兼容性／人工测试／runtime contract，并运行完整质量命令。

## Acceptance Criteria

- [ ] 默认起点和完整回退链与最终确认规则一致，工具栏焦点不会丢失此前页面上下文。
- [ ] 阅读顺序遵循 light DOM、open Shadow Root 和同源 iframe 的 composed-tree 顺序，不按区域类型重排；跨区域无额外合成语音或暂停。
- [ ] 文本、控件、图片、表单、可见 tabs 和启动时当前 panel 均无明显重复或漏读；隐藏、忽略和敏感内容不进入队列，也不会自动激活隐藏 panel。
- [ ] 开始、暂停、继续、停止均可由键盘操作，状态、图标、可访问名称和播报反馈同步。
- [ ] 不支持语音与当前范围无可读内容均保持连续状态 idle、只提供明确 live-region 反馈，并遵循已冻结的 `readingEnabled` 与事件规则。
- [ ] 暂停中断当前段，继续从该段开头重播；重复操作不产生额外请求。
- [ ] 自动推进不移动键盘焦点，只更新阅读高亮并以 reduced-motion-safe 方式滚动。
- [ ] 用户焦点、点击、tab、区域导航、弹窗和其他语音请求按最终抢占规则运行，任何时刻只有一条有效语音链。
- [ ] 删除／隐藏／忽略／变敏感的当前或后续节点会安全取消／跳过且继续有效队列；普通新增节点按稳定序列规则留到下次启动。
- [ ] SPA 路由、关闭朗读、`close()`、`reset()`、`destroy()` 和较新请求让旧队列与旧回调立即失效。
- [ ] `continuousReadingState`、五个连续会话事件、payload、index/count 语义和事件顺序与冻结契约一致，既有语音事件不重复、不误报。
- [ ] 大字幕可消费唯一当前有效段落，不建立第二套状态。
- [ ] 默认不联网，不持久化或上传页面正文，不包含任何三期语音代码。

## Definition of Done

- 连续会话状态机、序列构建、起点、抢占、动态 DOM、tabs／dialog、路由和生命周期均有单元与 Chrome／Edge E2E 覆盖。
- 现有单次焦点／悬停／点击朗读、区域导航、tabs、音色、语言和公共 API 向后兼容。
- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e` 和 `git diff --check` 全部通过。
- README、API、兼容性、人工测试和运行时 contract 与最终行为同步。
- 任务提交、验证、归档后才进入“大字幕”。

## Unit Test Plan

- 起点优先级及失效回退；工具栏 Shadow Root 接管焦点前后的页面目标保留。
- composed-tree 顺序：普通 DOM、open Shadow Root、同源 iframe、额外 roots、嵌套区域。
- 原子段落与去重：标题、段落、嵌套链接、列表、表格、图片、label／control、ARIA 控件、tabs／panel。
- 隐藏／忽略／敏感过滤，以及每段语言、语速和本地音色重新解析。
- 不支持语音与空范围启动前检查；`readingEnabled`、连续状态、live region 和零 start／stop 事件行为。
- `idle / playing / paused` 状态转换、幂等、暂停重播当前段、自然结束和错误。
- 焦点／点击／tab／区域／弹窗抢占，动态删除／隐藏／变敏感／新增，路由、关闭朗读、reset、close、destroy。
- 连续 generation 与 speech requestId 的组合过期保护；旧 start/end/error/cancel 不推进或覆盖新会话。
- 公共事件命名、payload、跳号 index/count、停止原因、严格事件顺序和唯一当前段落 provider。

## E2E Test Plan

- Chrome／Edge 覆盖页面起点、当前焦点、当前区域、跨区域和自然读完。
- 键盘开始／暂停／继续／停止，焦点保持、阅读高亮、滚动和 reduced motion。
- tabs、表单、普通浮层、模态 dialog、动态新增／删除／隐藏／变敏感和 SPA 导航。
- open Shadow Root、同源 iframe、closed production toolbar Shadow Root 和自定义 deterministic adapter。
- 不支持语音、空页面、快速重复操作、其他语音抢占、close/reset/destroy 后无残留语音或过期事件。
- 网络断言确认没有工具发起的正文、语言或语音请求；axe 无新增 serious／critical 问题。

## Documentation Update Plan

- `README.md`：连续朗读入口、操作、阅读顺序、隐私与限制。
- `docs/api.md`：新增 feature/state/event、停止原因和兼容行为。
- `docs/compatibility.md`：暂停从当前段开头恢复、浏览器语音差异和自定义 adapter 行为。
- `docs/manual-testing.md`：桌面键盘、读屏、动态 DOM、tabs/dialog、路由和生命周期矩阵。
- `.trellis/spec/frontend/accessibility-tool-contract.md`：可执行状态、顺序、事件、取消和测试契约。

## Research References

- [`research/runtime-flow.md`](research/runtime-flow.md) — 现有 reading、speech、scanner、tabs、生命周期和事件边界。
- [`research/sequence-and-start-options.md`](research/sequence-and-start-options.md) — 起点、composed-tree 顺序、稳定序列和非抢焦点方案比较。
- [`research/control-entry-options.md`](research/control-entry-options.md) — 1280px 版心容量、独立入口与复用现有“朗读”入口的权衡。
- [`research/interaction-takeover-options.md`](research/interaction-takeover-options.md) — 手动焦点、点击、tab 和区域导航抢占连续会话的三种方案。
- [`research/dialog-context-options.md`](research/dialog-context-options.md) — 模态弹窗打开后的停止、自动切换与背景恢复方案。
- [`research/session-finish-options.md`](research/session-finish-options.md) — 自然结束／有效错误后的焦点、高亮、当前段落和反馈方案。
- [`research/reading-toggle-integration-options.md`](research/reading-toggle-integration-options.md) — 连续朗读与现有持久化“朗读”开关的三种集成方式。
- [`research/speech-setting-change-options.md`](research/speech-setting-change-options.md) — 播放中修改语速、默认语言或音色时的生效边界。
- [`research/dynamic-sequence-options.md`](research/dynamic-sequence-options.md) — 动态新增、删除、改写和无限滚动页面的队列成员策略。
- [`research/form-control-reading-options.md`](research/form-control-reading-options.md) — 自动遍历表单时朗读编辑值、只读结构或完全跳过的隐私权衡。
- [`research/region-transition-options.md`](research/region-transition-options.md) — 跨盲道区域时无缝衔接、短提示或暂停的结构反馈方案。

## Decision Log

### Default start position

- **Context**：点击工具栏控制时焦点可能已进入 closed Shadow Root，直接读取 `document.activeElement` 会丢失用户刚才所在的页面上下文。
- **Decision**：采用“最后一个有效页面焦点 → 当前盲道区域首个可读段 → 页面首个可读段”的回退链。
- **Consequences**：reading 层需要持续记录最后一个符合条件的页面目标；每次开始都必须重新验证 DOM、可见性、忽略／敏感状态和当前文本，不能缓存正文。

### Toolbar entry

- **Context**：连续朗读需要开始、暂停／继续和停止四种清晰操作，同时不能改变现有“朗读”按钮点击即开关单次朗读的行为；桌面版心不得超过 1300px。
- **Decision**：新增独立 `连续朗读` 入口，主模式位于 `朗读` 与 `语速` 之间，读屏专用模式位于其 `朗读` 后；入口打开非模态控制面板。
- **Consequences**：主工具栏增加到 15 个控制并在 1280px 内适度压缩；需要新增面板焦点／关闭／outside interaction 测试，但现有“朗读”语义和直接操作保持兼容。

### Manual interaction takeover

- **Context**：现有页面焦点、点击、tab 和区域导航都会发起自己的语音请求；如果连续会话保留恢复回调，用户操作后可能再次自动发声。
- **Decision**：任何主动页面焦点、点击、tab、区域导航或其他显式页面语音都以 `interaction` 原因终止连续会话；暂停会话也同样结束。
- **Consequences**：手动操作始终优先且不会双重播报；用户若要继续长读，需要再次启动，此时已确认的当前焦点优先规则会从新位置开始。

### Modal dialog boundary

- **Context**：模态 dialog 会让背景变为 inert／隐藏，并由现有 tabs/dialog 与宿主焦点逻辑负责入口和关闭；自动切换长读可能与读屏提示重复。
- **Decision**：模态 dialog 打开时停止背景会话，不自动朗读；用户在 dialog 内重新开始时只读取该 dialog，关闭后不恢复背景。
- **Consequences**：每个模态上下文都需要明确用户意图，避免背景泄漏、重复播报和过期恢复点；序列构建器需支持活动 modal scope。

### Natural completion and effective error

- **Context**：阅读高亮和当前段落只应代表仍有效的语音；完成后抢焦点或保留高亮会让播放状态、未来字幕和用户位置不一致。
- **Decision**：自然完成或有效错误均回到 `idle`、清除当前段落和高亮且不移动焦点；完成／错误反馈只使用 live region。有效错误停止整场会话，不自动重试或跳段。
- **Consequences**：active state 与实际声音严格一致；最后段落不作为活动状态保留，字幕任务若需短暂视觉保留必须只在呈现层处理。

### Existing reading toggle integration

- **Context**：现有主模式和读屏模式“朗读”共用持久化 `readingEnabled`；让连续语音在其显示“关闭”时播放会拆分公共状态含义。
- **Decision**：连续“开始”自动开启并持久化 `readingEnabled`；用户手动关闭“朗读”会以 `disabled` 原因停止连续会话，停止／完成连续会话本身不会反向关闭“朗读”。
- **Consequences**：连续朗读可一步启动且保持唯一阅读总状态；此前关闭普通焦点朗读的用户启动连续功能后，普通朗读会继续保持开启，直至其主动关闭。

### Speech setting changes

- **Context**：utterance 的 rate、language 和 voice 无法跨浏览器可靠地在段中修改，但连续会话本来就按段创建独立请求。
- **Decision**：当前段读完后从下一段应用最新语速、默认语言和本地音色；相关状态提示只走 live region。音色试听属于显式新语音并停止连续会话。
- **Consequences**：调整设置不重复当前文本，且每段继续复用现有实时语言／音色解析；用户需等到下一段才能听到变化。

### Dynamic sequence membership

- **Context**：现代页面会持续插入、替换和重排节点；把所有新增内容合并进队列会使无限滚动／直播页面无法自然结束。
- **Decision**：启动时冻结队列成员，但逐段重新验证连接、可见性、忽略／敏感状态并重新解析最新文本、语言和语音设置；普通新增节点下次启动再加入。
- **Consequences**：每场会话有限且可预测，同时删除和安全变化即时生效；用户需要重新启动才能读取会话开始后新增的普通内容。

### Editable form values

- **Context**：连续朗读是自动遍历，直接复用单次焦点朗读的 editable `.value` 会在无逐字段操作时播出普通个人信息或草稿。
- **Decision**：连续模式省略编辑型文本控件的用户输入值，但保留标签、类型、占位／说明和非文本状态；select、choice 状态及用户主动触发的单次朗读保持现有完整语义。
- **Consequences**：降低自动播出个人文本的风险，同时保留表单结构；用户若要核对输入内容需主动聚焦／点击对应字段。

### Region transitions

- **Context**：连续朗读不移动键盘焦点，复用区域导航的完整“进入区域”指令会描述并未发生的焦点动作，也可能与区域首个标题重复。
- **Decision**：跨区域边界时按 composed-tree 顺序无缝继续，不插入区域名称、提示音或暂停；区域上下文只保留为内部可选元数据。
- **Consequences**：长页面保持连续、安静且不产生虚假导航提示；需要显式结构定位时仍由用户主动使用既有区域导航。

## Design / Implementation Gate

- 开放产品决策已清零，本文已达到最终确认版本；当前任务状态继续保持 `planning`。
- 获得用户对完整 PRD 的明确确认前，不运行 `task.py start`，不修改生产代码。
- 确认后先完成 `implement.jsonl`／`check.jsonl` 上下文配置，再激活任务；实现全程留在 `feat/accessibility-tool-v0.2` 分支。
