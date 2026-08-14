# AccessibilityTool v0.2 总体规划

## Goal

在现有 `accessibility-tool` 本地目录和既有 Git 历史上完成 AccessibilityTool v0.2 的六项前端体验增强，并严格保持默认离线、零云端正文上传、零自建后端依赖以及 v0.1 公共 API 向后兼容。二期以 `feat/accessibility-tool-v0.2` 为集成基线，每次只开发、验证和完成一个独立功能任务。

## Product Authority and Baseline

- 产品阶段范围以 `docs/product-roadmap.md` 为权威。
- 本地目录固定为 `D:\前端\工具\无障碍辅助工具\accessibility-tool`。
- 二期集成分支为 `feat/accessibility-tool-v0.2`，从已完成 `dom-region-registration` 的 `2bc1930` 基线开始。
- `main` 继续保留 v0.1.0 发布基线；二期所有功能直接顺序提交到 `feat/accessibility-tool-v0.2`，最终由该分支面向 `main` 完成二期集成。
- 六个子任务不再创建独立 Git 分支；独立性由 Trellis 任务、PRD、提交范围、测试记录和归档状态保证。
- 二期开始实现时把 `package.json` 版本调整为 `0.2.0`；npm 包名、IIFE 全局名和既有公共 API 名称不变。
- 不提前创建 `v0.2.0` Git 标签，不强制推送，不删除 `v0.1.0` 标签。

## Scope

二期只包含以下六个独立功能任务：

1. 前端自动语言检测
2. 浏览器本地音色／发音人选择
3. 连续朗读
4. 大字幕
5. 移动端专用布局
6. 平板端专用布局

每项功能必须拥有独立 PRD、独立验收标准、Definition of Done、单元测试计划、E2E 计划和文档更新计划。所有功能共用 `feat/accessibility-tool-v0.2` 工作分支；前一项完成提交、验证并处理 Trellis 状态后，才能在同一分支进入下一项，禁止并行混入多个功能。

## Task Decomposition

| 顺序 | Trellis 任务 | 工作分支 | 最终 PR 目标 | 当前阶段 |
| --- | --- | --- | --- | --- |
| 1 | `08-05-language-detection` | `feat/accessibility-tool-v0.2` | `main` | 已完成并归档 |
| 2 | `08-05-voice-selection` | `feat/accessibility-tool-v0.2` | `main` | PRD 框架 |
| 3 | `08-05-continuous-reading` | `feat/accessibility-tool-v0.2` | `main` | PRD 框架 |
| 4 | `08-05-large-caption` | `feat/accessibility-tool-v0.2` | `main` | PRD 框架 |
| 5 | `08-05-mobile-layout` | `feat/accessibility-tool-v0.2` | `main` | 仅设计规划，禁止实现 |
| 6 | `08-05-tablet-layout` | `feat/accessibility-tool-v0.2` | `main` | 仅设计规划，禁止实现 |

## Dependency Analysis

```text
前端自动语言检测
        ↓
浏览器本地音色选择
        ↓
    连续朗读
        ↓
      大字幕
        ↓
移动端设计确认 → 移动端实现
        ↓
平板端设计确认 → 平板端实现
```

### 1. Language detection → voice selection

- `ReadingController` 当前直接调用 `getElementLanguage()`，该函数只检查最近 `lang`、文档 `lang`，最后硬编码 `zh-CN`。
- `BrowserSpeechAdapter` 已把传入语言写入 `SpeechSynthesisUtterance.lang`，因此语言解析可以作为独立、低耦合基础能力先完成。
- 音色筛选和已保存音色回退必须以规范化后的语言为输入，先完成语言解析可避免音色任务重复实现语言规则。

### 2. Voice selection → continuous reading

- 连续朗读会产生多个顺序语音请求；每个请求都需要同时确定语言和本地音色。
- 先稳定 `voiceschanged`、语言匹配和音色失效回退，连续朗读即可复用同一选择器，而不在队列中复制音色逻辑。

### 3. Continuous reading → large caption

- 当前 `speechstart` 只暴露 `{ textLength }`，无法直接驱动字幕文本。
- 连续朗读需要先定义有效请求、当前段落、取消、暂停和过期内容语义；大字幕再订阅统一语音生命周期，才能与单次朗读和连续队列保持一致。
- 大字幕不得自行触发朗读，也不得形成第二套队列。

### 4. Functional UI → mobile/tablet layouts

- 音色入口、连续朗读控制和大字幕都会改变工具栏或浮层的真实内容。
- 手机和平板设计必须覆盖这些最终控件，过早实现响应式布局会导致重复设计和交互返工。
- 移动端和平板端仍分别执行“设计 → 用户确认 → 调整 → 再确认 → 实现”的门禁。

## Recommended Implementation Order

保持用户建议顺序，不调整：

1. 前端自动语言检测
2. 浏览器本地音色／发音人选择
3. 连续朗读
4. 大字幕
5. 移动端专用布局
6. 平板端专用布局

风险控制：

- `feat/accessibility-tool-v0.2` 同一时间只允许一个功能任务进入生产实现；每个提交批次只包含当前任务及必要共享基础改动。
- 当前任务完成提交、验证和归档后，下一项才在该分支最新提交上启动，不创建新的功能分支。
- 若实现中发现上一项契约不足，返回上一任务补 PRD、提交和验证，不在当前任务提交中偷偷补齐另一功能。
- 移动／平板任务在设计获明确确认前不得修改 `src/`、正式 `public/` 页面结构、运行时 CSS、公共 API 或构建产物。

## Cross-cutting Requirements

- 默认不联网，不主动上传页面正文或朗读文本。
- 不持有云厂商密钥，不引入云厂商 SDK，不依赖自建后端。
- 浏览器本地语音失败时安全退化，不阻断既有页面交互。
- 继续保持零运行时依赖；如确需依赖，必须先说明体积、许可证和无依赖替代方案并等待确认。
- 生产 closed Shadow DOM、debug open Shadow DOM、CSP 外部样式和既有构建文件名保持兼容。
- `close()`、`destroy()`、SPA 路由变化、动态 DOM 和旧请求取消必须继续满足现有运行时契约。
- 现有桌面端、区域导航、tabs、焦点轮廓、朗读事件和公开 DOM 注册 API 不回归。

## Version Strategy

- 在首个功能进入实现阶段后，将 `package.json` 版本从 `0.1.0` 调整为 `0.2.0`。
- `name: "accessibility-tool"` 不变。
- `window.AccessibilityTool`、ESM 默认导出和已有方法名称不变。
- 二期开发期间不创建正式版本标签；六项全部完成并通过发布门禁后再单独决定发布和打标。

## Overall Acceptance Criteria

- [ ] 六项功能分别拥有独立 Trellis 任务和 PRD。
- [ ] 六项功能按既定顺序直接提交到 `feat/accessibility-tool-v0.2`，同一时间不混入多个功能任务。
- [ ] 六项功能均通过各自单元、E2E、类型、lint、构建和人工测试门禁。
- [ ] 手机和平板均有规定尺寸的设计稿和两轮明确确认记录后才进入生产实现。
- [ ] 二期产物默认不联网，不包含任何三期代码、密钥、远程请求或 Node.js 网关。
- [ ] v0.1 公共 API、IIFE 名称、npm 包名、桌面端行为和已有测试保持兼容。
- [ ] `package.json` 为 `0.2.0`，但未提前创建 `v0.2.0` 标签。
- [ ] README、API、属性、兼容性、人工测试和产品路线文档与最终行为一致。

## Definition of Done

- 六个子任务全部完成、验证并归档。
- 所有二期工作提交均位于 `feat/accessibility-tool-v0.2`，不存在功能专用长期分支。
- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e` 全部通过。
- Chrome、Edge 自动化通过；Firefox、Safari、NVDA、VoiceOver 按人工测试清单记录结果。
- 移动端和平板端设计确认记录可追溯。
- 无用户文件被误删、覆盖、暂存或提交。
- 无三期范围代码进入二期分支。

## Out of Scope

- 云端 TTS、远程音频、云端语言检测。
- `RemoteSpeechAdapter`、`HybridSpeechAdapter`。
- Node.js `accessibility-tts-gateway`。
- 腾讯云或其他云厂商 SDK、音色 ID、密钥。
- 服务端鉴权、限流、配额、缓存、数据库、Redis、对象存储、计费与监控。
- 第三方公开插件 API。
- 未经确认的移动端或平板端生产实现。

## Documentation Plan

- `README.md`：版本、二期能力、隐私与使用入口。
- `docs/api.md`：新增配置、状态、事件和兼容行为。
- `docs/attributes.md`：`lang` 与页面标记约定。
- `docs/compatibility.md`：浏览器语音、音色和设备差异。
- `docs/manual-testing.md`：桌面、移动、平板、读屏和浏览器人工矩阵。
- `docs/product-roadmap.md`：只记录阶段状态，不扩大二期范围。
- `.trellis/spec/frontend/accessibility-tool-contract.md`：每项功能的可执行运行时契约和测试门禁。

## Technical Notes

- 当前语言入口：`src/core/dom.ts#getElementLanguage`。
- 当前语音边界：`src/features/speech.ts`。
- 当前页面朗读：`src/features/reading.ts`。
- 当前运行时与偏好：`src/tool.ts`、`src/core/storage.ts`、`src/types.ts`。
- 当前区域与动态 DOM：`src/features/regions.ts`、`src/features/region-navigation.ts`。
- 当前 tabs 与弹窗：`src/features/tabs.ts`。
- 当前 UI：`src/ui/toolbar.ts`、`src/styles/accessibility-tool.scss`。
- 详细代码依赖研究见 `research/existing-v0-2-dependencies.md`。
