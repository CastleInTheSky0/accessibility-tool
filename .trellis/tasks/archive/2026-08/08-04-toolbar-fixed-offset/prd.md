# 修复工具栏滚动吸顶与页面占位

## Goal

无障碍工具打开后，即使用户向下滚动页面，展开状态的工具栏也始终停留在视口顶部；默认 `push` 布局继续为工具栏保留对应高度，避免页面主要内容在工具栏打开或定位到目标内容时被遮挡。

## What I already know

- 当前 Shadow Host 默认使用 `position: absolute`，仅开启“固定”状态后才切换为 `position: fixed`，因此默认工具栏会随页面滚动离开视口。
- 当前 `PageEffectsController` 仅在 `layoutMode: "push"` 且未开启“固定”时给 `body` 增加工具栏高度的 `padding-top`；`overlay` 模式不预留空间。
- 现有产品约定中，“固定”还负责离开工具栏后自动收起；收起后保留 12px 窄条，重新展开原本允许覆盖页面而不重新推开整页。
- 参考站点在工具开启后采用固定顶部工具栏并给 `body` 增加等高顶部内边距。
- 工具栏高度可通过主题变量定制，页面占位必须继续使用运行时实际配置高度。
- 接入方通过 `toolbar.offsetSelectors` 明确指定的 `fixed` / `sticky` 顶部元素仍需要按工具栏占位高度偏移。

## Confirmed Decisions

- `layoutMode: "overlay"` 仍允许覆盖页面，只修复其滚动后工具栏离开视口的问题。
- 默认模式（`isPinned: false`）始终完整显示在视口顶部；`push` 布局保留完整工具栏高度，`overlay` 布局按配置允许覆盖。
- “固定”模式（`isPinned: true`）完全保留现有逻辑：离开后自动收起为 12px 窄条，重新展开时覆盖页面，不动态推开整页。
- 本次不改变移动端策略，也不新增布局配置项。

## Requirements

- 工具打开期间，工具栏 Host 始终固定在视口顶部，不因页面滚动离开视口。
- 默认 `push` 模式始终完整显示，并保留工具栏实际高度；关闭或销毁后精确恢复宿主原样式。
- `overlay` 模式保持不占位。
- “固定”模式继续使用现有自动收起、12px 窄条和重新展开覆盖页面的行为，不因本次修复产生布局跳动。
- 主题高度以及明确配置的顶部固定/粘性元素偏移继续生效。
- 不修改或覆盖 `public/index.html` 中用户尚未提交的其它内容与 Logo 文件。

## Acceptance Criteria

- [x] 默认打开工具后滚动到页面中下部，工具栏顶部坐标仍为 `0`。
- [x] 默认 `push` 模式打开后页面获得与工具栏一致的顶部占位，关闭后恢复原 `padding-top`。
- [x] `overlay` 模式工具栏同样保持吸顶，但不修改页面顶部占位。
- [x] 点击“固定”后仍取消整页占位，并按既有延时自动收起；展开时不重新推开页面。
- [x] 自定义工具栏高度与 `offsetSelectors` 使用相同的实际高度。
- [x] Chrome 与 Edge 的真实滚动场景通过 E2E 验证。
- [x] 单元测试、类型检查、Lint 和构建通过。

## Definition of Done

- 样式、页面效果逻辑、测试和运行契约同步。
- 页面打开、固定、收起、展开、关闭及销毁流程不遗留工具注入样式。
- 不引入新的宿主 DOM 包装层或接管宿主页面滚动容器。

## Out of Scope (explicit)

- 不修改移动端布局。
- 不新增第三种工具栏布局模式。
- 不自动移动接入方未在 `offsetSelectors` 中声明的宿主 fixed/sticky 元素。
- 不包装、重排或接管宿主页面正文 DOM。

## Technical Notes

- 工具栏定位样式：`src/styles/accessibility-tool.scss`。
- 页面占位及顶部元素偏移：`src/features/page-effects.ts`。
- Host 创建位置和状态同步：`src/tool.ts`、`src/ui/toolbar.ts`。
- 相关测试：`tests/unit/page-effects.test.ts`、`tests/e2e/toolbar.spec.ts`。
- 运行契约：`.trellis/spec/frontend/accessibility-tool-contract.md`。

## Technical Approach

- 将工具栏 Shadow Host 的默认定位从 `absolute` 改为 `fixed`，使默认模式和固定模式都保持视口吸顶。
- 保留 `PageEffectsController.applyPlacement()` 当前的状态分支：仅默认 `push` 模式写入页面占位；`isPinned: true` 与 `overlay` 模式继续不占位。
- 增加真实滚动 E2E，验证默认模式滚动前后 `top === 0`、页面占位保持，以及固定模式仍走现有收起逻辑。

## Decision (ADR-lite)

**Context**：默认模式当前使用绝对定位，页面滚动后工具栏消失；直接统一修改固定模式的占位会破坏已确认的自动收起和展开覆盖体验。

**Decision**：只把 Host 的基础定位改为固定定位，继续由既有 `isPinned` 分支决定页面是否占位。默认 `push` 模式固定且占位；固定模式保持不占位和自动收起；`overlay` 模式固定但按配置覆盖页面。

**Consequences**：改动范围小，不新增宿主包装层或滚动接管；固定模式名称不再表示唯一的 fixed 定位状态，而继续表示“启用自动收起的固定工具栏”这一产品状态。
