# 通过 JavaScript 注册盲道区域

## Goal

为无法直接改写原页面 HTML 的接入方提供公开 JavaScript API，使其可在调用时通过 CSS 选择器或现有 `Element` 注册普通盲道区域，以及显式配对的选项卡与面板。注册结果必须立即进入现有区域扫描、区域导航、tabs、焦点和朗读流程，并能通过独立句柄或工具销毁完整恢复 DOM。

## Requirements

### Public API and types

- 导出 `RegionCode = 1 | 2 | 3 | 4 | 5 | 6`，固定映射为视窗、导航、交互、服务、列表、正文六类区域。
- 导出 `DomTarget = string | Element`、`RegistrationHandle`、`RegionRegistrationConfig`、`TabRegistrationItem`。
- 在 `AccessibilityToolApi`、IIFE 全局单例和 ESM 默认导出上增加：
  - `registerRegions(configs): RegistrationHandle`
  - `registerTabs(configs): RegistrationHandle`
- API 可在 `open()` 前或后调用，首版只解析调用时已经存在的 DOM。

### Ordinary region registration

- CSS 选择器匹配全部节点；`Element` 只处理该节点。
- 仅处理已连接且属于有效文档的节点；无匹配、断开节点、无效选择器或配置只跳过自身。
- 运行时校验区域数字；1～6 以外的值不抛错、不影响同批有效配置，并只在 debug 模式输出明确警告。
- 写入数字形式的 `data-a11y-region`；传入 `label` 时写入区域短名称，并复用现有扫描器的名称和朗读规则。
- 注册后在工具已打开时同步刷新区域扫描；未打开时仍立即写入属性，之后打开可识别。

### Tab and panel registration

- `registerTabs()` 直接接收扁平的 `TabRegistrationItem[]`，调用方不传 `tablist` 或 `items` 包装层。
- tab 与 panel 均支持 CSS 选择器或 `Element`。CSS 选择器可同时匹配多个当前节点；同一配置中的 tab 与 panel 按各自 DOM 顺序、相同索引显式配对。
- 同一配置的 tab/panel 有效匹配数量必须相等且大于零；数量不一致时跳过该配置并在 debug 模式警告，避免静默错配。无效配置不影响同次调用中的其他配置。
- 每个 tab 的直接父节点由工具自动作为其 `tablist`；同一批选择器命中多个选项卡组件时，按 tab 的直接父节点拆分为多个独立 tablist，各组分别初始化选中项，键盘边界和选中状态互不影响。工具不猜测更外层祖先。
- 每一对 tab/panel 必须位于同一 `Document` 或 Shadow Root；重复 tab、重复 panel 或 tab/panel 指向同一节点时仅跳过冲突配对。
- 自动补充并可逆登记标准 tablist/tab/tabpanel 语义、唯一 ID、ARIA 关联、顺序 Tab 所需状态、区域数字、激活模式、触发事件和面板状态。
- 现有 ID 唯一时复用；缺失时生成同一根节点内不冲突的 ID；重复现有 ID 的项安全跳过。
- `data-a11y-activation` 与 `data-a11y-trigger-event` 只写到 tab 节点，默认值和合法值复用现有 tabs 配置与解析规则。
- tab 与 panel 写入相同数字区域。注册 tab 的区域属性作为 tabs 元数据使用，不应让 tab 变成第二个区域容器或产生重复区域播报；panel 继续作为区域扫描与隐藏面板导航目标。
- `label` 是选项短名称覆盖值；未提供时复用现有可访问名称提取。panel 的扫描短名称与 tab 名称保持一致。
- 不新增、删除或修改原生 `hidden`。注册初始选中状态沿用现有 tabs 规则，并使用 `data-a11y-hidden` 表示非活动普通面板；继续同步 `aria-selected` / `aria-hidden`。
- 页面原事件和 CSS 继续负责真实业务显示；现有 `TabsController` 仍是键盘、触发事件、Alt+下、Esc 和朗读的唯一实现。

### Lifecycle and coexistence

- 每次调用返回独立、幂等的 `RegistrationHandle`。
- 同类和跨类型注册可同时存在；同一节点/属性存在多个注册时，后注册值生效，释放任一注册不得破坏仍有效的其他注册。
- 精确恢复注册前的属性三态：不存在、空字符串、非空值。
- 使用并扩展现有 `DomLedger` 的属性恢复能力，避免建立不兼容的备份机制。
- `dispose()` 后立即刷新已打开工具的扫描/tabs 状态。
- `destroy()` 自动释放所有尚未释放的注册；`close()` 不注销注册，因此重新打开仍可识别。
- 不重复创建 tabs 根监听器、焦点节点或朗读路径。

### Compatibility and scope

- 现有 HTML 属性接入、区域配置、自动识别、扫描 MutationObserver、tabs、焦点与朗读行为保持兼容。
- 在现有 `public/index.html` 演示页增加独立的 JavaScript 注册章节，真实调用两个公开 API，并提供注册、独立注销和 `destroy()` 恢复操作；保留页面已有内容与宿主事件演示。
- 不改工具栏 UI、样式、自动识别规则或其他一期功能。
- 不实现未来 DOM 自动匹配、SPA 路由配置、DOM 重建自动绑定、JSON 配置中心或可视化标注。

## Acceptance Criteria

- [ ] 1～6 六个数字区域均可通过选择器或 `Element` 注册；普通选择器支持多匹配。
- [ ] 非法 region、选择器、断开节点和单条无效配置不会阻断同批有效配置，debug 下有明确警告。
- [ ] `label` 进入现有区域名称、完整进入提示和区域导航流程。
- [ ] `open()` 前后注册都可被立即/后续识别。
- [ ] `registerTabs()` 使用扁平配置，不接受也不需要调用方提供 tablist。
- [ ] tab/panel 选择器支持多匹配并按 DOM 顺序一一配对；数量不一致时安全跳过该配置且不影响其他配置。
- [ ] 相同类名可一次注册同一组件或多个组件中的全部选项；每个 tab 的直接父节点自动获得独立 tablist 语义，切换一组不影响其他组。
- [ ] tab/panel 配对、ID 生成、ARIA 关联、区域数字、行为属性和 `data-a11y-hidden` 均正确。
- [ ] 注册 tabs 完整接入 Tab/Shift+Tab、原页面事件、Alt+下、Esc、隐藏面板区域导航与既有朗读，且不重复播报。
- [ ] 注册过程从不修改原生 `hidden`。
- [ ] 多注册重叠、重复 `dispose()`、单独释放和 `destroy()` 均正确恢复 DOM。
- [ ] 原有 HTML 属性、区域自动识别、焦点/区域框与现有测试不回归。
- [ ] 首页 JavaScript 注册演示可展示选择器多匹配、Element 目标、临时 ID/ARIA、原页面事件、独立 `dispose()` 与 `destroy()` 恢复。
- [ ] `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过。
- [ ] `pnpm test:e2e` 通过；若本机浏览器环境阻塞，准确记录已运行范围和原因。
- [ ] `docs/api.md`、`docs/attributes.md`、`docs/quick-start.md` 和运行时 contract 已更新。

## Definition of Done

- 公共类型和方法进入生成的类型声明与全局 API。
- 实现保持零运行时依赖并通过严格 TypeScript、lint、单元和 E2E 验证。
- 生命周期、重叠属性所有权、工具打开前后行为和动态 DOM 限制有自动化覆盖。
- `public/index.html` 仅按用户后续明确授权加入本功能 Demo；两张用户 Logo 保持原始内容且不被暂存。
- 本轮不提交、不推送、不合并、不打标签、不发布。

## Technical Approach

- 新增一个 DOM registration controller，负责目标解析、运行时校验、属性所有权和句柄生命周期。
- 为 `DomLedger` 增加按元素/属性精确恢复能力；注册 controller 在其上维护每个属性的注册所有者栈，从而支持重叠注册而不重复备份原值。
- tabs 注册先把每条扁平配置展开为按 DOM 顺序配对的 tab/panel，再按 tab 的直接父节点分组并生成现有 `TabsController` 已识别的 DOM 协议。注册变化时仅释放受影响元素上由 tabs controller 暂存的属性，再调用现有 scanner/tabs refresh，不新增键盘或事件监听系统。
- `RegionScanner` 通过内部回调识别由 `registerTabs()` 登记的 tab，把 tab 上的区域数字作为 tabs 元数据而非第二个可导航区域；既有 HTML 属性方式不受影响。
- 选项卡缺省激活与触发事件复用从现有 tabs 模块抽出的纯解析函数，避免规则分叉。

## Decision (ADR-lite)

**Context**: 多个句柄可能同时覆盖同一 DOM 属性；简单地为每个句柄建立独立 `DomLedger` 会在乱序释放时恢复错误值。tabs controller 还会在运行时同步同一批 ARIA 属性。

**Decision**: 使用一个基于现有 `DomLedger` 的分层属性所有权表。每个属性只保存一次真正原值，注册按创建顺序叠加；释放顶层所有者时回退到下一有效注册，释放最后一个所有者时由 ledger 恢复原始三态。tabs controller 提供受影响元素级的 ledger 释放入口，以避免其生命周期在注册注销后重新写回旧增强值。

**Consequences**: 注册之间可以安全交错释放，且无需复制扫描、键盘、事件或朗读逻辑。实现需要对 ledger 增加小范围、向后兼容的精确恢复方法，并为注册 tabs 提供内部扫描排除回调。

### Flat tab registration update

**Context**: 接入页面常用相同类名标记一组选项和面板，要求一条配置即可注册多个配对节点，并且不希望暴露 tablist 配置。

**Decision**: `registerTabs()` 改为接收扁平 `TabRegistrationItem[]`。字符串目标解析全部当前匹配，tab/panel 数量相等时按 DOM 顺序索引配对；每个 tab 的直接父节点自动成为所属 tablist，同一选择器可跨多个直接父节点自动拆组。数量不一致的配置整体跳过并在 debug 模式警告。

**Consequences**: 常见类名接入只需配置一次，API 更简单；DOM 顺序成为多匹配选择器的公开配对规则，接入方需要保证两组选择器数量和顺序一致。

## Out of Scope

- 保存选择器并监听未来节点。
- SPA 路由级自动重注册或框架重建恢复。
- 修改工具栏 UI、视觉样式、自动识别规则或现有朗读文案。
- 替代接入页面的 tabs 业务状态、点击处理或面板渲染。
- 本轮 Git 提交、推送、合并、标签与发布。

## Technical Notes

- 公开 API：`src/types.ts`、`src/tool.ts`、`src/index.ts`。
- 区域扫描与名称：`src/features/regions.ts`、`src/core/constants.ts`、`src/core/dom.ts`。
- 区域导航：`src/features/region-navigation.ts`。
- tabs 行为：`src/features/tabs.ts`。
- DOM 恢复：`src/core/dom-ledger.ts`。
- 详细现状研究见 `research/existing-runtime-integration.md`。
