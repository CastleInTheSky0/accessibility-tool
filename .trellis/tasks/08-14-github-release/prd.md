# 配置 GitHub Actions 并发布 v0.2.0 生产包

## Goal

为 AccessibilityTool 建立可审计、可重复的标签驱动发布流程，在 `v0.2.0` 标签通过完整质量门禁后自动创建 GitHub Release，并发布能够保持主入口与两个动态语言分包同目录关系的生产包。

## Requirements

- 新增一个仅由 SemVer 标签 `v*.*.*` 触发的 GitHub Actions 工作流；普通 `main` 推送不得创建 Release。
- 发布前校验标签严格等于 `v${package.json.version}`，并校验标签提交属于远端 `main` 历史。
- 固定使用 Node.js 22 与 pnpm 10.28.0，执行 `pnpm install --frozen-lockfile`。
- 发布门禁依次覆盖 lint、单元测试、生产构建和 Chrome/Edge E2E；任一门禁失败时不得创建 Release。
- 修复 Vite 声明文件输出，使 `package.json` 已声明的 `dist/index.d.ts` 实际存在。
- 扩展构建验证，检查公开 `main`、`module`、`types` 和 `exports` 入口均指向实际产物，并拒绝旧的 `dist/src/index.d.ts` 布局。
- Release ZIP 只包含以下可交付文件，并将五个运行时文件保持在同一目录：
  - `accessibility-tool.min.js`
  - `accessibility-tool.es.js`
  - `accessibility-tool.css`
  - `accessibility-tool-opencc.js`
  - `accessibility-tool-pinyin.js`
  - `LICENSE`
- Release 同时附带 `SHA256SUMS`，用于校验 ZIP 完整性。
- 使用 GitHub 托管 runner 自带的 `gh release create` 和仓库 `GITHUB_TOKEN`；不新增第三方 Release Action 或自定义密钥。
- 工作流默认权限为只读，仅发布 job 授予 `contents: write`。
- Actions 依赖固定到已核验版本的完整提交 SHA。
- 当前任务只配置、验证、提交并推送工作流；创建和推送 `v0.2.0` 标签需等待用户再次确认。
- 不修改、暂存或提交用户现有的 `.gitignore`、`README.md`、`docs/cloud-tts-future-plan.md`、`docs/product-roadmap.md`、`public/index.html` 和 Logo 文件。

## Acceptance Criteria

- [x] `pnpm build` 生成 `dist/index.d.ts`，且不再生成 `dist/src/index.d.ts`。
- [x] 构建校验能够发现缺失的包入口、意外的语言脚本或错误的类型输出布局。
- [x] 工作流只在 `v*.*.*` 标签推送时运行，并在版本或主分支祖先校验失败时终止。
- [x] 工作流在创建 Release 前通过 lint、210 项单元测试、构建和 Chrome/Edge E2E。
- [x] ZIP 根目录只含约定的五个运行时产物与 `LICENSE`，没有 demo HTML/JS/CSS、Logo 或其他 `public` 资源。
- [x] 主入口仍引用同目录、带包版本参数的 OpenCC 与拼音分包。
- [x] Release 由 `gh release create --verify-tag --generate-notes` 创建，并附带 ZIP 与 `SHA256SUMS`。
- [x] 工作流 YAML 通过静态语法检查，发布打包命令在本地或等价环境中完成内容校验。
- [x] 所有用户已有未提交文件保持原状且未进入提交。

## Definition of Done

- 类型声明缺陷已修复并加入自动回归验证。
- GitHub Actions 工作流与生产包清单已落库。
- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e` 全部通过。
- 变更经独立检查代理审查，无未处理发现。
- 任务代码提交到 `feat/accessibility-tool-v0.2`，再以非快进方式合入并推送 `main`。
- `v0.2.0` 标签尚未创建，等待单独发布确认。

## Technical Approach

- 在 `vite-plugin-dts` 配置中设置 `entryRoot: "src"`，使声明目录与包入口契约一致。
- 在现有 `scripts/verify-build.mjs` 中复用 `package.json` 作为入口真源，验证所有公开文件路径与固定语言分包集合。
- 采用单 job 标签工作流，避免构建产物在 job 间传递，也避免额外 artifact action；同一 job 完成检出、验证、打包、校验和发布。
- 生产 ZIP 从干净 checkout 的 `dist` 中精选文件，不直接压缩整个 `dist`，以排除演示站点和 `public` 资源。
- GitHub Actions 依赖使用完整提交 SHA，并在行尾注释对应版本，兼顾供应链固定与可维护性。

## Decision (ADR-lite)

**Context**: 项目尚无 Actions 或 Release，`dist` 会复制演示资源，且大字幕运行时要求主入口与 OpenCC/拼音分包原子部署。当前 TypeScript 声明入口还与实际构建布局不一致。

**Decision**: 使用 SemVer 标签驱动的单工作流，先通过完整质量门禁，再精选生产文件生成 ZIP，最后使用 GitHub CLI 创建 Release；发布前同步修复并验证类型声明入口。

**Consequences**: 发布必须显式创建版本标签，避免普通代码推送误发布；E2E 会增加发布时间，但 Release 的产物与已验证代码完全一致。README 和演示站点不会进入浏览器生产 ZIP。

## Out of Scope

- 本任务不发布到 npm registry。
- 本任务不创建移动端或平板端布局。
- 本任务不修改任何运行时公共 API、交互或云端服务范围。
- 本任务不自动递增 `package.json` 版本。
- 本任务不在配置合入时提前创建 `v0.2.0` 标签或 GitHub Release。

## Research References

- [`research/github-release-actions.md`](research/github-release-actions.md) — GitHub 权限、标签发布、Action 固定版本和仓库约束。

## Technical Notes

- 当前包版本为 `0.2.0`，已有标签只有 `v0.1.0`。
- 当前构建正确生成四个 JavaScript 入口/分包和外部 CSS，但声明文件位于 `dist/src/**`。
- `.trellis/spec/frontend/accessibility-tool-contract.md` 要求发布前通过 typecheck、lint、单测、build、Chrome/Edge E2E，并保持语言分包同目录原子部署。
