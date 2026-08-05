# 前端自动语言检测

## Goal

为所有宿主页面内容朗读提供纯前端、本地、可预测的语言解析能力。解析优先尊重当前目标及页面显式 `lang`，在缺少标记时使用已保存偏好和轻量文本特征，始终返回安全回退语言且绝不因检测失败阻断朗读。该能力作为后续本地音色选择、连续朗读和字幕同步的基础。

## Current State

- `src/core/dom.ts#getElementLanguage()` 当前使用“最近 `[lang]` → 文档根 `lang` → 硬编码 `zh-CN`”。
- 它无法区分目标自身与祖先来源，不读取用户偏好，不规范化标签，也不检查文本特征。
- `ReadingController` 是当前页面元素语言解析的唯一调用方。
- `SpeechController` 已接收明确的 `lang`，`BrowserSpeechAdapter` 已写入 `SpeechSynthesisUtterance.lang`。
- `config.locale` 当前是工具反馈与语音回退语言；默认 `zh-CN`。
- 当前偏好 payload 没有语言字段，且必须继续兼容 v0.1 已保存数据。

## Scope

### Language resolution priority

每次准备朗读宿主页面内容时，按以下顺序解析，首个合法候选立即生效：

1. 当前目标元素自身的 `lang`
2. 最近的组合树祖先元素 `lang`
3. 当前目标所属 `document.documentElement.lang`
4. 用户已保存的默认语言
5. 当前朗读文本的本地特征检测
6. 项目默认语言 `activeConfig.locale`

补充规则：

- 每一级候选都先规范化和校验；空值、非法标签、`und`、`zxx` 视为不可用并继续下一级。
- 目标位于 open Shadow Root 时，祖先查找从 Shadow Root 继续到 `host`，形成组合树祖先链。
- 目标位于同源 iframe 时，文档语言只读取该目标自己的 owner document；不跨 iframe 猜测外层页面语言。
- 没有目标元素的工具内置提示继续明确使用 `activeConfig.locale`，不让宿主页面 `lang` 改变工具自身中文提示的发音。

### Language tag normalization

- 将 `_` 兼容转换为 `-`，例如 `en_US` → `en-US`。
- 优先使用浏览器内置 `Intl.getCanonicalLocales()` 或 `Intl.Locale` 规范化大小写和别名，例如 `ZH-hans-cn` → `zh-Hans-CN`。
- 内置 API 不可用或抛错时使用小型、确定性的 BCP 47 基础回退：语言小写、四字母 script 首字母大写、两字母 region 大写。
- 不为了规范化引入第三方运行时依赖。
- 规范化失败不抛错，不向 `SpeechController` 传空字符串。

### User-saved default boundary

- 在现有版本化偏好 payload 中增加可选的规范化语言字段，旧 payload 缺少该字段时仍有效，不因此清空其他偏好。
- 本任务只建立存储兼容和语言解析读取边界，不新增工具栏语言按钮或设置弹窗。
- 下一任务“浏览器本地音色／发音人选择”负责提供用户可操作的语言／音色入口并写入该偏好。
- 在该 UI 落地前，resolver 接受“无用户偏好”状态并自然进入文本检测。
- `config.locale` 仍是项目默认和工具提示语言，不伪装成“用户已保存偏好”。

### Local text-feature detection

文本检测必须是同步、纯本地、无网络、无大型词典的轻量逻辑：

- 仅分析规范化后的当前朗读文本，不读取或缓存整页正文。
- 忽略空白、数字、标点、emoji、URL 和电子邮箱等非语言主体。
- 首版识别以下高价值脚本组：
  - 存在平假名／片假名且日文组占优 → `ja-JP`
  - 韩文 Hangul 占优 → `ko-KR`
  - Han 汉字占优且无日文／韩文强特征 → `zh-CN`
  - Latin 拉丁字母占优 → `en-US`
- 至少存在 2 个强语言字符，且主导组占强字符总数不少于 60%，才返回检测结果。
- 无主导组、只有数字／符号、未知脚本或检测异常时返回“无结果”，继续项目默认语言。
- 纯汉字日文无法可靠区分时会落到 `zh-CN`；接入方应使用显式 `lang="ja"` 消除歧义。

### Mixed-language fallback

- 一次 `SpeechSynthesisUtterance` 只选择一个语言，不在本任务内拆分同一字符串或切换多音色。
- 显式 `lang`、文档语言或用户偏好存在时，整段始终服从其高优先级值。
- 只有前三层和用户偏好都缺失时，才使用文本脚本占比。
- 主导脚本达到 60% 时使用主导语言；未达到时使用项目默认语言。
- 后续连续朗读可以按 DOM 节点／段落逐段重新解析，但仍不在单段内部做词级切换。

### Dynamic DOM and lifecycle

- 语言在每次有效朗读请求创建前重新解析，不按 Element 永久缓存。
- 动态修改当前节点或祖先的 `lang` 后，下一次朗读必须读取新值。
- DOM 节点移动到不同语言祖先后，下一次朗读必须使用新的组合树上下文。
- `configure({ locale })` 在工具已打开时更新项目回退语言；下一次朗读生效。
- `close()`、`destroy()` 和 SPA 路由变化继续沿用现有语音取消机制，不保留页面文本或检测结果。

### Runtime integration

- 新增一个纯语言解析模块，输入至少包含 `text`、可选目标 Element、项目默认语言和可选用户偏好。
- `ReadingController` 在获得 `getAccessibleText()` 后调用 resolver，再把结果交给现有 `SpeechController`。
- `SpeechController` 继续只负责请求失效、事件和 adapter 调用，不复制 DOM 或文本检测逻辑。
- `BrowserSpeechAdapter` 继续把最终规范化语言写到 `utterance.lang`。
- 自定义 `SpeechAdapter` 继续收到同一个 `SpeechRequestOptions.lang` 字段，签名不破坏。
- 区域、tabs、工具栏等工具自有中文提示继续走 `activeConfig.locale`；宿主页面标签和正文走自动解析。

## Public API and Compatibility

- 不删除或重命名任何已有公共 API、类型、事件或 IIFE 全局名称。
- `AccessibilityToolConfig.locale` 继续有效，语义明确为工具提示语言和最终项目回退语言。
- 本任务不增加必填配置。
- 已有自定义 `SpeechAdapter` 无需修改即可接收更准确、已规范化的 `options.lang`。
- v0.1 偏好 payload 必须继续加载；新增语言字段为可选字段。
- 继续保持零运行时依赖和默认离线。

## Failure and Safety Behavior

| 情况 | 要求行为 |
| --- | --- |
| `lang` 为空或非法 | 跳过该候选，继续下一优先级 |
| `Intl` 规范化不可用／抛错 | 使用小型回退规范化；仍失败则继续下一候选 |
| 用户偏好损坏 | 忽略语言字段，保留可验证的其他偏好 |
| 文本为空或只有符号 | 不做文本判断，使用项目默认语言 |
| 混合语言无明显主导 | 使用项目默认语言 |
| 项目 `locale` 也非法 | 最终使用 `DEFAULT_CONFIG.locale`（`zh-CN`） |
| 动态 DOM 在请求前变化 | 使用请求创建时的最新目标上下文 |
| 检测逻辑异常 | 捕获并安全回退，不发出语音错误事件，不阻断朗读 |
| 浏览器不支持语音合成 | 保持现有不可用提示和退化行为 |

## Acceptance Criteria

- [ ] 目标元素自身合法 `lang` 高于祖先、文档、偏好、文本和默认值。
- [ ] 最近组合树祖先 `lang` 高于文档根语言，并可跨 open Shadow Root 到 host。
- [ ] 同源 iframe 内元素使用自己的 owner document 语言。
- [ ] 文档根语言高于用户偏好；用户偏好高于文本检测。
- [ ] `zh-cn`、`ZH-hans-cn`、`en_US` 等输入规范化为稳定标签。
- [ ] 空、非法、`und`、`zxx` 候选不会阻断解析。
- [ ] 无显式语言和偏好时，可本地识别主导中文、英文、日文和韩文文本。
- [ ] 混合语言遵循 60% 主导阈值；无主导时回退项目默认语言。
- [ ] 动态修改或移动 DOM 后，下一次朗读重新判断语言。
- [ ] 检测失败、未知脚本或只有符号时仍能朗读，并使用安全默认值。
- [ ] 工具自有中文提示不被宿主页面 `lang` 错误改写。
- [ ] 自定义 `SpeechAdapter` 收到最终规范化的 `options.lang`。
- [ ] v0.1 已保存偏好继续加载；可选语言字段损坏只影响自身。
- [ ] 不产生任何网络请求，不上传或持久化朗读文本。
- [ ] 不新增运行时依赖。
- [ ] `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e` 全部通过。

## Definition of Done

- 语言解析逻辑集中在一个可单测模块，不在阅读、连续阅读或音色模块复制。
- 页面元素朗读全部通过 resolver；工具自有提示保持明确 locale。
- 偏好兼容、动态 DOM、Shadow DOM、iframe 和混合语言有自动化覆盖。
- 文档明确检测优先级、已知限制、隐私边界和接入方使用 `lang` 的责任。
- 运行时依赖仍为 0，构建产物和公共名称保持兼容。
- Trellis 上下文、检查、规范更新、提交和归档流程完成后，才进入音色选择任务。

## Technical Approach

### Proposed module boundary

- 新增 `src/features/language.ts`，提供纯函数／轻量 resolver：
  - `normalizeLanguageTag(value)`
  - `detectTextLanguage(text)`
  - `resolveSpeechLanguage(input)`
- DOM 组合树祖先遍历可复用／扩展 `src/core/dom.ts` 的节点工具，但脚本判断不放入通用 DOM 名称提取逻辑。
- `ReadingController` 获得一个语言 resolver/provider，避免直接读取持久化状态。
- `AccessibilityToolRuntime` 提供当前 `activeConfig.locale` 和可选用户偏好，并在配置或偏好变化时让后续请求读取最新值。

### Suggested internal contract

```ts
type LanguageResolutionSource =
  | "element"
  | "ancestor"
  | "document"
  | "preference"
  | "text"
  | "project-default";

interface ResolveSpeechLanguageInput {
  element?: Element | null;
  text: string;
  preferredLanguage?: string | null;
  projectDefault: string;
}

interface LanguageResolution {
  language: string;
  source: LanguageResolutionSource;
}
```

`source` 先作为内部诊断和单元测试信息，不新增公共事件或遥测。

## Decision (ADR-lite)

**Context**: 可选方案包括引入通用语言识别库、只依赖 HTML `lang`，或使用浏览器内置规范化加小型脚本启发式。项目要求默认离线、零运行时依赖，并且检测失败不能阻断朗读。

**Decision**: 使用“显式 DOM 语言优先 + 可选用户偏好 + 内置 `Intl` 规范化 + 小型 Unicode 脚本占比检测”。不引入第三方依赖，不做词典级语言识别，不拆分单个混合字符串。

**Consequences**:

- 优点：体积小、同步、隐私边界清晰、容易覆盖动态 DOM 和错误回退。
- 代价：Latin 默认只能稳定回退为英语，纯汉字日文等歧义需要页面显式 `lang`。
- 后续：音色选择直接消费规范化语言；连续朗读可按段落重新解析，提高混合页面效果。

## Unit Test Plan

- `normalizeLanguageTag`：大小写、下划线、script/region、别名、非法值、`und`、`zxx`、Intl 失败回退。
- `resolveSpeechLanguage`：完整六级优先级及每一级非法后移。
- DOM：自身、最近祖先、Shadow host、owner document、同源 iframe。
- 文本：中文、英文、日文、韩文、URL/数字/emoji、未知脚本、空文本。
- 混合：60% 以上主导、临界值、平局和短文本。
- 动态：修改自身／祖先 `lang`、移动节点后再次解析。
- 偏好：v0.1 payload、可选语言、损坏语言、其他字段保持。
- Reading 集成：最终 `SpeechController.speak()` 收到规范化语言。
- 自定义 adapter：`SpeechRequestOptions.lang` 保持兼容。

## E2E Test Plan

- 在演示页／测试 fixture 中覆盖显式中文、英文、祖先语言和文档语言目标。
- 使用确定性的测试 `SpeechAdapter` 捕获 `lang`，不依赖操作系统真实音色。
- 动态改变元素／祖先 `lang` 后再次聚焦，断言语言更新。
- open Shadow Root 和同源 iframe 中断言语言来源正确。
- 无 `lang` 的中文、英文和混合文本验证本地检测与回退。
- 配置非法 locale、检测异常时页面交互和朗读流程不崩溃。
- 断言测试期间无语言识别网络请求。

## Manual Test Plan

- Chrome、Edge、Firefox、Safari 分别检查 `utterance.lang` 对实际本地语音的影响。
- NVDA／VoiceOver 下确认语言变化不造成重复播报或焦点变化。
- 检查页面动态切换语言、SPA 路由和 Shadow DOM 内容。
- 检查未正确标记的混合文本按文档化规则回退，而不是随机切换。

## Documentation Update Plan

- `docs/api.md`：`locale` 最终回退语义、语言解析优先级和自定义 adapter 的 `lang`。
- `docs/attributes.md`：推荐在目标／祖先使用标准 `lang`，说明 Shadow DOM 和 iframe 规则。
- `docs/compatibility.md`：脚本启发式限制、浏览器语音差异和显式标记建议。
- `docs/manual-testing.md`：多语言、动态 DOM、Shadow DOM、iframe 和混合文本清单。
- `README.md`：二期自动语言检测能力和隐私说明。
- `.trellis/spec/frontend/accessibility-tool-contract.md`：签名、优先级、错误矩阵、测试和 Wrong/Correct 示例。

## Out of Scope

- 浏览器音色列表、`voiceschanged`、试听和音色 UI。
- 连续朗读队列、文本分段和逐词语言切换。
- 大字幕。
- 移动端／平板端布局。
- 云端语言识别、远程 API、正文上传、模型或大型词典。
- 自动翻译、音译、内容改写。
- 云端 TTS、远程／混合 SpeechAdapter。

## Research References

- `research/existing-language-flow.md` — 当前语言、语音、偏好和生命周期接入点。

## Confirmation Gate

本 PRD 获用户明确确认后，才进行上下文 JSONL 配置、`task.py start`，并在共享 `feat/accessibility-tool-v0.2` 分支开始生产实现；不创建功能专用 Git 分支。
