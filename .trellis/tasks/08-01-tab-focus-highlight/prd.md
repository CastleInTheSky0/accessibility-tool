# Tab Focus Highlight

## Goal

When the accessibility tool is open, make focus and blind-path context easy to locate using the interaction verified on the 常山县政府阅读辅助 product: a yellow outline on the real currently focused page node and a deep-orange outline on the real active blind-path region while focus moves through its descendants.

## What I already know

- The highlight is active only while the accessibility tool is open.
- Tab and Shift+Tab continue to use the browser's native focus order.
- The currently focused page node receives the highlight; the previous node loses it.
- The project already isolates toolbar styles in a Shadow Root and must clean up page-side effects on close or destroy.
- The toolbar already has its own orange focus treatment.
- Reading retains the existing `.a11y-highlight` overlay; focus and blind-path context need independent node-owned outline state so speech cleanup cannot clear them.
- Blind-path shortcut navigation currently announces the resolved region label, category, and ordinal count, but the product now requires a complete entry instruction such as “提示：您已进入要闻视窗区，按下 Tab 键浏览信息”。

## Confirmed Product Decisions

- "Page node" means focusable content in the host document, excluding controls rendered inside the accessibility toolbar.
- The focus highlight supplements native focus behavior and must not manufacture a readable-node focus order or change activation behavior.
- Every visible recognized region container that is not already a native tab stop receives a temporary `tabindex="0"` while the tool is open. Ordinary Tab stops on the region before entering its descendants, and the prior value is restored when the region is no longer recognized or the tool closes.
- Plain readable elements such as `p`, `span`, headings, list items, and `img` do not enter the Tab order merely because of their tag name. They remain available to reading and screen-reader browsing.
- A visible non-native element with an explicit standalone interactive ARIA role (`button`, `link`, `checkbox`, `switch`, `slider`, `spinbutton`, `scrollbar`, `textbox`, `searchbox`, or `combobox`) may receive temporary `tabindex="0"` only when it has no author-provided `tabindex` and is not disabled or ignored.
- Auto-focusability does not synthesize Enter/Space activation; the host widget remains responsible for the keyboard behavior required by its ARIA role.
- Valid `role="tab"` options are managed by the tabs controller: every option remains in sequential Tab order, while arrow keys and Home/End remain available. Other composite-widget item roles such as `radio`, `menuitem`, `option`, and `treeitem` are not auto-tabbed because their owning widget must manage roving focus and keyboard behavior.
- `data-a11y-activation` and `data-a11y-trigger-event` belong to each corresponding `role="tab"` option. The tabs controller does not inherit either custom attribute from `role="tablist"`; the tablist remains only the standard grouping and orientation container.
- Missing or invalid per-option activation falls back to `tabs.defaultActivation`. Missing or empty per-option trigger events fall back to `tabs.triggerEvents`, then `click`; whitespace-separated events are deduplicated.
- Tab and arrow navigation decide automatic activation from the target option, while Enter or Space decides manual activation from the currently focused option.
- Ordinary host `role="tabpanel"` elements and configured non-native floating panels use the boolean `data-a11y-hidden` attribute for visual state, with host CSS `[role="tabpanel"][data-a11y-hidden] { display: none; }`; these host panels do not directly use native `hidden`.
- Host-page original events own `data-a11y-hidden`. The accessibility tool only dispatches those events and reversibly synchronizes `aria-selected` / `aria-hidden`, so neither attribute replaces the other's responsibility.
- Native `<dialog>` remains on its platform lifecycle through `showModal()`, `open`, and `close()`.
- A successful explicit `open()` persists an independent, versioned open intent derived from `storageKey`. The existing preference payload and version remain unchanged.
- On refresh or same-origin navigation to another page that loads the same tool script, the runtime waits for DOM ready and uses the final pre-`DOMContentLoaded` site configuration before deciding whether to restore.
- Automatic restoration starts the complete runtime and applies saved preferences, but it does not infer the current focused element as a trigger, move focus, or repeat the toolbar-open announcement.
- `close()`, toolbar exit, and `destroy()` clear the open intent. `reset()` keeps the toolbar open and preserves the intent. `persistOpenState` defaults to `true`; setting it to `false` disables restoration and clears the current key.
- Changing `storageKey` clears the previous true marker and migrates the intent when currently open. Failed automatic or explicit opening leaves no true marker.
- Blocked storage falls back to page memory without throwing; inability to restore after a reload is expected in that mode.
- The implementation should resist host-page CSS conflicts by applying reversible `!important` outline styles directly to the real target node.
- The indicator follows every host-page focus change, including Tab, Shift+Tab, blind-path navigation, programmatic focus, and mouse-initiated focus.
- Current page focus uses yellow `#ffb800`; the active blind-path region uses deep orange `#ff6c00`.
- When the region container itself first receives focus, show only the yellow focus outline; after Tab enters a descendant, show the deep-orange outline on the region and the yellow outline on the descendant.
- The blue-and-orange double frame currently seen on the demo is the host page's native blue `:focus-visible` outline plus the old product overlay. Direct reversible ownership of the node outline must leave only the yellow current-focus color visible.
- `data-a11y-label` and legacy `aria-readlabel` continue to carry only the integration-provided region name, such as `要闻`; they do not need to repeat the category or the complete instructional sentence.
- Shortcut/category navigation supplements the category from the recognized region type and announces a complete instruction, for example `要闻` + `viewport` becomes “提示：您已进入要闻视窗区，按下 Tab 键浏览信息”。 Existing ordinal information for multiple matching regions remains available after the instruction.
- Category supplementation is a literal concatenation of the resolved label and `REGION_LABELS[type]`; it does not trim the label or attempt semantic de-duplication. For example, `主导航` + `导航区` becomes `主导航导航区`.
- Ordinary focus activation and automatic recovery after a region mutation do not repeat the shortcut/category entry announcement.

## Requirements (evolving)

- Track focus changes while the tool is open.
- Respond to all host-page focus sources rather than trying to infer the input modality.
- Show a yellow `#ffb800` visual indicator around the currently focused host-page element.
- Follow both forward and reverse keyboard focus navigation.
- Remove the previous indicator immediately when focus changes.
- Remove all listeners and visual artifacts on close or destroy.
- Do not infer focusability from static tag names or rewrite an author-provided `tabindex`. Only recognized region containers and explicit standalone ARIA interactive nodes may temporarily become `tabindex="0"` navigation anchors.
- Keep toolbar controls on their existing Shadow DOM focus treatment rather than drawing a second page-level indicator around them.
- Let the indicator naturally follow the target node because it is applied directly to that node rather than positioned as a viewport overlay.
- Hide the indicator when the focused element is disconnected, becomes non-rendered, or focus leaves the page content.
- Give blind-path regions a node-owned outline state independent from both current focus and reading highlights.
- Recognized regions are automatically inserted into the native Tab sequence in DOM order while the tool is open.
- Focusing a recognized region through ordinary Tab automatically makes it the active region; the next Tab enters its native focusable descendants.
- Selecting a blind-path category focuses the already-tab-enabled selected region.
- Pressing Tab from the focused region follows the browser's native DOM order into focusable descendants; Shift+Tab follows the native reverse order.
- While focus remains inside the selected region, keep the deep-orange outer outline visible and move only the yellow current-focus outline.
- When focus leaves the region, the region is removed, or another region is selected, clear or move the region frame accordingly.
- Repeated category navigation cycles through matching regions in page DOM order with wraparound.
- Do not trap focus or add descendant `tabindex` values to manufacture a custom sequence.
- Do not directly toggle the host panel's `data-a11y-hidden` or visual styles from the tabs controller.
- With no valid saved open intent, importing the script must remain lazy and must not render, scan, or bind high-frequency listeners.
- Automatic restoration applies only to same-origin pages that load the same script; do not add cross-origin, cross-tab synchronization, or script injection.
- Shortcut/category navigation must combine the short integration name with the recognized category and announce a complete region-entry description rather than only the short name/category and count.

## Acceptance Criteria (evolving)

- [x] Opening the tool enables host-page focus highlighting.
- [x] Pressing Tab moves focus normally and highlights only the newly focused page element.
- [x] Pressing Shift+Tab updates the highlight in reverse focus order.
- [x] Programmatic focus and mouse-initiated focus update the same indicator.
- [x] The focus highlight is yellow `#ffb800` and clearly visible without changing layout.
- [x] The focused page node shows a single yellow focus treatment rather than the host page's blue outline plus a second product frame.
- [x] Toolbar-internal controls retain their existing focus treatment.
- [x] Closing or destroying the tool removes the indicator and related listeners.
- [x] Unit and browser tests cover activation, focus movement, exclusion, and cleanup.
- [x] Repeated selection of one category cycles through its regions in DOM order and wraps to the first region.
- [x] Ordinary Tab stops on each recognized region container in DOM order before visiting focusable descendants inside that region.
- [x] A region reached through ordinary Tab becomes active without requiring a category button or shortcut first.
- [x] Selecting a blind-path region focuses the region container and shows only its yellow focus outline.
- [x] Tab enters focusable descendants in native DOM order; the deep-orange region outline remains while the yellow focus outline follows the current descendant.
- [x] Leaving the active region removes its frame without altering the page's native focus destination.
- [x] Plain `p`, `span`, heading, list, label, and `img` nodes remain outside the Tab order unless the page explicitly makes them interactive.
- [x] Explicit standalone ARIA controls without an author-provided `tabindex` receive temporary `tabindex="0"` and participate in native DOM-order Tab navigation.
- [x] Author-provided `tabindex`, disabled/ignored nodes, and composite-widget item roles are not overridden.
- [x] Auto-added ARIA-control tab stops are restored when the role becomes invalid, the node is hidden/removed, or the tool closes/destroys.
- [x] Every valid tab option receives `tabindex="0"`; Tab and Shift+Tab move through options in DOM order without trapping focus at the ends.
- [x] Tab focus activates the newly focused option in automatic mode, while manual mode waits for Enter or Space.
- [x] Arrow keys and Home/End continue to navigate options, and Alt+Down/Escape continue to enter and leave the linked panel.
- [x] Different options in one standard tablist can independently declare automatic/manual activation and original trigger events.
- [x] Parent `role="tablist"` behavior attributes are ignored; per-option values and configuration/click fallbacks are covered by tests and documentation.
- [x] Demo tab panels and the configured non-native floating panel use `data-a11y-hidden`, host event handlers own the toggle, and no host `[role="tabpanel"][hidden]` is introduced.
- [x] `aria-hidden` remains tool-synchronized while `data-a11y-hidden` remains host-owned; native dialog behavior is unchanged.
- [x] Successful explicit open persists a separate versioned marker; reset preserves it, while close/exit/destroy remove it.
- [x] Reload and same-origin navigation restore the full runtime using final site configuration without focus theft or a repeated open announcement.
- [x] Invalid/blocked storage, disabled persistence, key changes, failed opens, and pending restore races are covered without leaving stale true markers.
- [x] With `data-a11y-label="要闻"` on a `viewport` region, shortcut/category navigation speaks “提示：您已进入要闻视窗区，按下 Tab 键浏览信息” before any ordinal detail.
- [x] Category supplementation always uses literal `label + category` concatenation, including outputs such as “主导航导航区” when the label itself already contains “导航”.

## Definition of Done

- Tests added or updated.
- `pnpm typecheck`, `pnpm lint`, relevant unit tests, build, and relevant E2E tests pass.
- Runtime contract documentation is updated if this introduces a durable lifecycle rule.

## Out of Scope

- Changing descendant tab order or adding focusability to non-region descendant nodes.
- Mouse-hover highlighting.
- Mobile-specific focus presentation.
- A user-facing color or thickness setting in this version.
- Highlighting elements inside cross-origin iframes.
- Cross-origin persistence, real-time cross-tab synchronization, and injection into pages that do not load the tool script.

## Technical Notes

- Likely touchpoints: `src/features/page-effects.ts`, `src/ui/toolbar.ts`, `src/styles/accessibility-tool.scss`, and unit/E2E coverage.
- Keep the reading overlay in the existing closed Shadow Root, but apply focus and active-region outlines directly to the real host-page nodes with reversible inline `!important` styles.
- Keep reading, active-region, and current-focus state as separate responsibilities so one lifecycle cannot clear another.
- Use separate ledgers for current focus and active region so original inline outline values, priorities, state attributes, and temporary `tabindex` values are restored exactly.
- The focus path is: host-page focus event -> page-effects lifecycle -> reversible outline ownership on the real node.
- The region path is: scanner update -> reconcile temporary `tabindex="0"` across visible recognized regions -> native Tab or category navigation -> region state coordination.
- Future configurability of focus color/thickness is intentionally deferred; this version uses the verified yellow/deep-orange pair.
- Open-state persistence is owned by a dedicated store using `${storageKey}:open-state`; it is intentionally separate from `PersistedPreferences`.
- The automatic path waits for actual `DOMContentLoaded` rather than treating `readyState="interactive"` as final, because deferred site configuration scripts still run during that state.
- Region entry speech is formatted by the navigation layer using literal scanner-resolved short label plus `REGION_LABELS[type]`; scanning/source priority remains unchanged and no category de-duplication is applied.

## Decision (ADR-lite, provisional)

**Context**: Host-page focus rules can either suppress the tool or produce duplicate blue/orange frames, while sharing one overlay among reading, blind-path context, and current focus creates lifecycle conflicts.

**Decision**: Keep only the reading target as a toolbar-owned overlay. Apply independent active-region and current-focus outline states directly to the real page nodes. The active region uses deep orange `#ff6c00`; current focus uses yellow `#ffb800`; all page-side mutations are ledger-owned and reversible.

**Consequences**: The indicators do not shift layout and naturally follow complex node geometry, scrolling, open Shadow Roots, and same-origin iframe contents. Inline `!important` ownership must restore exact host values on focus change, region switch, close, and destroy, and the two states must coordinate when the region itself is focused.

## Implementation Plan

1. Replace the focus and active-region fixed overlays with separate reversible outline owners on real nodes; retain the reading overlay.
2. Reconcile temporary `tabindex="0"` across every visible recognized region, auto-activate regions reached through ordinary Tab, preserve category cycling, and coordinate region/self/descendant focus colors.
3. Restore all page-side styles and attributes when a region disappears, configuration changes, the tool closes, or it is destroyed without touching descendant tab order.
4. Update unit and browser coverage for ordinary Tab entry, focus sources, region cycling, entry/exit, dynamic regions, toolbar exclusion, Shadow DOM/iframe behavior, and cleanup.
5. Persist a separate open intent after successful explicit opening, restore it silently after final DOM-ready configuration, and cover lifecycle cleanup, storage failures, key migration, and same-origin navigation.
