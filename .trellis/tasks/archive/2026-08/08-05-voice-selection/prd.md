# 浏览器本地音色与发音人选择

## Goal

使用浏览器／操作系统通过 `speechSynthesis.getVoices()` 暴露的本地音色，为用户提供按语言筛选、选择、试听和保存偏好的能力，并在音色缺失、异步加载或页面语言变化时安全回退。

## Requirements

- 只展示 `SpeechSynthesisVoice.localService === true` 的本地音色，不选择浏览器标记的远程 voice。
- 首次打开立即读取 `getVoices()`；初始空列表不视为永久失败，并监听 `voiceschanged` 刷新。
- 使用现有 `normalizeLanguageTag()` 规范化语言；音色兼容顺序为精确语言、同主语言、浏览器默认回退。
- 设置界面提供默认语言、`自动选择`、兼容本地音色、试听和清除偏好。
- 选择默认语言时写入现有可选 `preferredLanguage` 偏好；选择音色时保存可序列化的 `{ voiceURI, name, lang }` 描述符。
- 每次有效朗读都从最新 voice catalog 重新解析当前 `SpeechSynthesisVoice` 对象，不缓存可能失效的原生对象。
- 保存音色按 `voiceURI`、`name + normalized lang` 分层恢复；无法恢复时使用兼容默认 voice，再由浏览器根据 `utterance.lang` 自动选择。
- 试听使用固定短文案、当前语速和现有 `SpeechController`；新的试听立即取消旧请求，不建立队列。
- 自定义 `SpeechAdapter` 继续保持兼容；其生效时明确说明浏览器本地音色设置不可用。
- 语音目录与播放实现保持解耦；允许预留非导出的内部 provider／capability 接缝，供三期接入云端音色目录与播放适配器时复用，但 v0.2 只注册浏览器本地实现。
- 该内部接缝不得在 v0.2 接收服务地址、密钥或厂商配置，不得发起网络请求，也不作为公共插件 API 对外承诺。
- 关闭设置、关闭工具、`reset()`、`close()` 或 `destroy()` 时取消试听并清理事件和焦点状态。
- 桌面工具栏继续保持单行；共享版心上限由 1200px 调整为 1280px，不得超过 1300px。
- “音色”作为独立完整主控件显示在“语速”和“配色”之间，点击后打开语音设置浮层。

## Scope

- 正确处理初始空列表和 `voiceschanged` 异步事件。
- 按前一任务输出的规范化语言筛选和排序音色。
- 支持用户选择、试听、保存和清除音色偏好。
- 已保存音色不存在、语言不兼容或设备变化时安全回退。
- 页面目标语言变化时重新选择兼容音色。
- 保持 `SpeechController` 和 `BrowserSpeechAdapter` 为唯一语音请求链路。
- 为后续云端服务保留内部音色来源／能力边界，使设置 UI 不直接依赖 `speechSynthesis.getVoices()` 的原生对象；本期只有 `browser-local` 能力可用。
- 在 `MAIN_FEATURE_ORDER` 中把 `voiceSelection` 插入 `speechRate` 与 `colorScheme` 之间；其他既有功能相对顺序不变，语速按钮继续直接循环。

## Non-goals

- 云端 TTS、远程音色目录、厂商音色 ID、SDK、密钥和远程音频的实际实现。
- 导出或承诺稳定的公共 voice-provider／第三方插件 API；本期预留项仅为内部实现接缝。
- 承诺跨浏览器、跨设备相同音色列表或相同音质。
- 在此任务内实现连续朗读、大字幕或移动布局。
- 保存或承诺跨设备可移植的原生 `SpeechSynthesisVoice` 对象。
- 强制使用与当前朗读语言主语言不兼容的已保存音色。
- 为自定义语音适配器定义厂商音色目录或映射协议。

## Technical Approach

- 新增本地 voice catalog／selection controller，集中处理获取、`voiceschanged`、本地过滤、语言兼容、排序和稳定标识匹配。
- catalog 通过内部 provider／capability 边界向设置层提供可序列化音色描述和可用状态；浏览器原生 `SpeechSynthesisVoice` 仅存在于本地 provider 与 `BrowserSpeechAdapter` 边界内。该内部边界不从包入口导出。
- catalog 生命周期跟随已打开的运行时；关闭或销毁时移除监听，保持 bundle import 的惰性边界。
- 语音请求只增加可选 voice 语义，由 `BrowserSpeechAdapter` 将当前原生对象赋给 `SpeechSynthesisUtterance.voice`；现有取消、事件和过期回调防护不变。
- 偏好 payload 继续使用版本 1，新增独立验证的可选 voice 描述符；旧 payload 和有效兄弟字段继续可用。
- 设置界面采用 Shadow DOM 内锚定式非模态 `role="dialog"`；Escape／关闭／外部交互关闭并把焦点返回入口。
- 桌面入口采用独立完整“音色”主控件，位于“语速”和“配色”之间；该按钮拥有独立的 roving toolbar 焦点位置和浮层语义。
- 工具栏外层继续占满视口；共享品牌／控件版心改为 `width: 100%; max-width: 1280px`，1280px 以上居中，1024～1279px 使用全宽紧凑回退。

## Entry Options

### A. 语速槽位的紧凑次级入口（已撤销）

- 保持原“语速”按钮单击／Enter／空格直接循环。
- 在同一视觉槽位增加独立的小型“语音设置”按钮，打开锚定浮层。
- 不占用新的完整轨道宽度，最适合现有 1024px 单行约束。

### B. 新增完整“音色”主控件（已选择）

- 顺序固定为“语速 → 音色 → 配色”，共 14 个完整主控件。
- 1280px 版心下每个控件约 84px，接近原 1200px／13 控件的单项宽度；1024px 继续使用紧凑回退。

### C. 只在读屏专用模式提供入口

- 不占主模式宽度，但通用语音设置的可发现性较差，且额外依赖模式切换。

## Desktop UI Decision (ADR-lite)

**Context**: 语速按钮必须保留直接循环行为，音色设置需要更直观的常驻入口。原 1200px／13 控件的可用单项宽度约为 84px；1280px／14 控件仍可维持接近的单项宽度，且用户要求新版心不得超过 1300px。

**Decision**: 采用方案 B，新增完整 `voiceSelection` 控件并插入 `speechRate` 与 `colorScheme` 之间；点击打开锚定浮层。共享版心上限保持 1280px，工具栏高度仍为 146px。

**Consequences**: 主工具栏增至 14 个完整轨道控件，入口更直观且键盘模型更一致；1200px 与 1024px 必须验证全宽紧凑布局、字号、图标、焦点、裁切和目标尺寸。

## Design Approval

- 2026-08-05：用户先确认方案 A，随后明确改为方案 B；方案 A 设计稿仅保留为历史版本。
- 共享版心实现基线确认为 `max-width: 1280px`，并明确不得超过 1300px。
- 2026-08-05：用户明确确认 v2 作为实现基线。
- 最终确认预览包含“语速 → 音色 → 配色”三个相邻完整主控件，以及锚定到“音色”的“语音设置”浮层。
- 当前设计图：[`design/voice-settings-toolbar-v2.png`](design/voice-settings-toolbar-v2.png)。
- 当前可重复渲染源：[`design/voice-settings-toolbar-v2.html`](design/voice-settings-toolbar-v2.html)。
- 历史 v1：[`design/voice-settings-toolbar-v1.png`](design/voice-settings-toolbar-v1.png)。

## Preference and Fallback Decision (ADR-lite)

**Context**: `voiceURI` 和音色名称都不保证跨浏览器／设备稳定，且 `getVoices()` 返回的原生对象会随列表刷新失效。

**Decision**: 保存 `{ voiceURI, name, lang }`，恢复时先匹配兼容音色的 `voiceURI`，再匹配 `name + normalized lang`；仍无匹配则使用兼容默认或不设置 `utterance.voice`。

**Consequences**: 同设备恢复成功率较高；设备变化时安全退化，不承诺跨设备找到相同发音人；保存描述符可在后续 `voiceschanged` 后重新恢复。

## Future Cloud Extension Decision (ADR-lite)

**Context**: v0.2 必须保持默认离线和仅使用浏览器本地音色，但用户希望减少三期接入云端服务时对设置 UI、偏好模型和朗读主链路的重构。

**Decision**: 在内部保留“音色目录能力”和“播放适配器”两个可组合边界。v0.2 只提供并注册浏览器本地目录与现有 `BrowserSpeechAdapter`；边界不导出、不包含厂商字段、不读取凭据、不发起网络请求。三期若获批准，可在不改变现有本地实现和工具栏交互的前提下增加远端实现。

**Consequences**: 本期会多一层轻量内部抽象和契约测试；本地隐私边界保持不变；该接缝不构成对未来公共插件 API 或具体云厂商协议的兼容承诺。

## Preview Decision (ADR-lite)

**Decision**: 按语言使用固定短文案，使用当前语速和单一 `SpeechController` 请求；再次试听立即取消并重启，关闭／切换／重置均取消，结束后不自动恢复被打断的页面朗读。

## Acceptance Criteria

- [ ] `getVoices()` 初始为空时界面保持可用，并在 `voiceschanged` 后刷新。
- [ ] 仅展示浏览器标记为本地服务的音色；远程音色不会出现在列表或赋给 utterance。
- [ ] 音色按规范化的精确语言／主语言筛选和稳定排序，用户可选择、试听和切回自动选择。
- [ ] 用户偏好可保存；刷新或同源导航后恢复。
- [ ] 保存的音色按 `voiceURI`、`name + lang` 恢复；不存在时回退到兼容默认音色，再回退浏览器默认行为。
- [ ] 页面语言变化后下一次朗读使用兼容音色。
- [ ] 无可用音色或不支持语音合成时保持现有不可用／回退行为。
- [ ] 自定义 `SpeechAdapter` 的现有朗读、事件和取消行为不回归，并清楚提示本地音色设置不可用。
- [ ] 设置层只依赖内部音色目录能力，不持有浏览器原生 voice；v0.2 运行时只注册本地实现，且构建产物不包含云端地址、密钥、SDK 或远程请求路径。
- [ ] 设置浮层支持键盘进入、Escape／关闭退出、焦点返回和高对比／减少动态效果。
- [ ] 主工具栏顺序包含“语速 → 音色 → 配色”；语速仍直接循环，完整“音色”控件独立打开设置，二者名称、焦点和动作不会混淆。
- [ ] 工具栏外层保持视口全宽，内部版心最大 1280px 且不超过 1300px；1280px 以上居中，1200px 和 1024px 不滚动、不裁切、不换行。
- [ ] 重复试听、音色变化、关闭、重置和销毁不会留下排队语音或过期回调。
- [ ] 不出现任何云厂商音色 ID、SDK、密钥或网络请求。

## Definition of Done

- 本地音色目录、选择、试听、持久化和回退均有自动化覆盖。
- 内部 provider／capability 接缝有契约覆盖，并确认未从公共包入口导出。
- 浏览器／设备差异和隐私边界有文档说明。
- 既有语速、朗读、事件、取消和自定义 adapter 不回归。
- `voiceschanged` 和所有浮层事件监听在关闭／销毁后完成清理。
- 全部质量门禁通过并完成 Trellis 收尾。

## Unit Test Plan

- catalog/provider：空列表、同步列表、`voiceschanged`、仅远程音色、重复音色、替换原生对象、能力状态、唯一注册的本地实现和事件清理。
- selection：精确语言、主语言、默认 voice、浏览器默认回退和不兼容音色隔离。
- persistence：v0.1 payload、可选 voice 字段、损坏字段隔离、`voiceURI`／`name + lang` 恢复、设备列表和语言变化。
- speech：native voice 转发、未匹配时不设置 voice、自定义 adapter 兼容、试听取消、过期回调和错误回退。
- toolbar：入口、浮层语义、列表状态、roving 导航不回归、Escape／外部关闭和焦点返回。
- lifecycle：`reset()`、`close()`、`destroy()` 清理偏好、试听、监听和浮层。

## E2E Test Plan

- 在页面脚本前注入确定性原生 `speechSynthesis`／`SpeechSynthesisUtterance` fixture，验证初始空列表、`voiceschanged`、本地过滤、选择、实际 `utterance.voice`、试听和刷新恢复。
- Chrome／Edge 覆盖 14 控件固定顺序、音色入口键盘操作、浮层 Escape／关闭、焦点返回、2048／1440／1280px 版心上限、1200／1024px 单行紧凑布局和无兼容本地音色情况。
- 通过多语言目标验证精确语言、主语言和不兼容语言回退；设备列表替换后不得继续使用旧 voice 对象。
- 断言不产生工具发起的远程语音请求、不显示远程 voice、不出现厂商配置。

## Implementation Plan (same branch)

全部工作顺序提交到现有 `feat/accessibility-tool-v0.2` 分支，不再创建功能分支。

1. 本地 voice catalog、语言兼容排序、分层标识恢复和偏好兼容读取／写入，并先补齐单元测试。
2. 扩展现有语音请求链路，在 `MAIN_FEATURE_ORDER` 中加入 `voiceSelection`，实现 14 控件工具栏、1280px 版心和可访问设置浮层。
3. 接入试听、生命周期清理、自定义 adapter 不可用状态、Chrome／Edge E2E，并完成契约／API／兼容性／人工测试文档和全部质量门禁。

## Documentation Update Plan

- 在不覆盖用户现有修改的前提下更新 README、API、兼容性和人工测试清单；如文件仍有用户脏改动，先单独协调合并边界。
- 在运行时 contract 中记录 `localService` 边界、voice 标识、异步事件、回退、浮层键盘模型和测试契约。
- 文档明确内部扩展接缝不是 v0.2 公共 API，也不代表云端服务已启用或获得三期实施批准。

## Research References

- [`research/existing-voice-flow.md`](research/existing-voice-flow.md) — 当前语音链路、工具栏／存储约束、Web Speech API 行为和失败矩阵。

## Design/Implementation Gate

自动语言检测已经完成并归档，方案 B 与 v2 设计稿已经确认。完整 PRD 获最终实施确认前，不运行 `task.py start`，不实现生产代码。

2026-08-05：用户确认可预留后续云端服务接入接口；本 PRD 将其限定为未导出的内部扩展接缝，v0.2 仍保持本地-only、零凭据、零网络请求。
