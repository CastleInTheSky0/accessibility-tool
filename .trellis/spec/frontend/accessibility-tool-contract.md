# AccessibilityTool Runtime Contract

## Scenario: Embeddable desktop accessibility toolbar

### 1. Scope / Trigger

- Trigger: any change to the public singleton API, toolbar feature set, blind-path region protocol, tab/dialog enhancement, preference persistence, or build output.
- Runtime scope: browser-native TypeScript with zero runtime dependencies; desktop layouts start at 1024px.
- Lifecycle boundary: importing the bundle with no valid saved open intent must not render UI, scan the host page, or bind high-frequency listeners. A successful explicit `open()` may persist an open intent; on later same-origin pages that load the same bundle, runtime work may resume after DOM ready. All runtime work remains reversible through `close()`, `reset()`, or `destroy()`.
- Styling boundary: author SCSS lives at `src/styles/accessibility-tool.scss`; Vite embeds it for the default bundle and emits `dist/accessibility-tool.css` for strict CSP integrations.

### 2. Signatures

```ts
interface AccessibilityToolApi {
  configure(config: AccessibilityToolConfig): AccessibilityToolApi;
  open(options?: {
    trigger?: HTMLElement;
    config?: AccessibilityToolConfig;
  }): Promise<AccessibilityToolApi>;
  close(): Promise<AccessibilityToolApi>;
  toggle(options?: AccessibilityToolOpenOptions): Promise<AccessibilityToolApi>;
  reset(): Promise<AccessibilityToolApi>;
  refresh(): AccessibilityToolApi;
  destroy(): Promise<void>;
  getState(): Readonly<AccessibilityToolState>;
  on<K extends keyof AccessibilityToolEventMap>(
    eventName: K,
    listener: (payload: AccessibilityToolEventMap[K]) => void,
  ): AccessibilityToolApi;
  off<K extends keyof AccessibilityToolEventMap>(
    eventName: K,
    listener: (payload: AccessibilityToolEventMap[K]) => void,
  ): AccessibilityToolApi;
}

interface AccessibilityToolConfig {
  storageKey?: string;
  persistOpenState?: boolean; // default true
}
```

Build signatures:

```text
dist/accessibility-tool.min.js  -> IIFE, window.AccessibilityTool
dist/accessibility-tool.es.js   -> ESM default export
dist/accessibility-tool.css     -> external CSP stylesheet
dist/index.d.ts                  -> public TypeScript entry declaration
```

Development serving is isolated from those build signatures:

- A true Vite dev server (`command === "serve" && !isPreview`) uses `public` as its root with nested public-directory copying disabled. `/`, `/help.html`, and `/demos/*.html` are the source demo pages.
- Only in that development mode, `/accessibility-tool.min.js` resolves to `src/index.ts`, and response-time HTML transformation promotes existing local defer scripts to modules so demo JavaScript and tool source participate in Vite's module graph and update handling. Source HTML files are never rewritten.
- Vite build keeps the project root, library formats, filenames, declaration generation, external stylesheet emission, and `public` copying unchanged. Vite preview remains a `dist` production preview and must never receive the development root, alias, or HTML transformation.

Internal visual ownership keeps reading, blind-path context, and current focus
independent:

```ts
interface RegionHighlightController {
  setRegionHighlight(element: HTMLElement | null): void;
  clearRegionHighlight(element?: HTMLElement): void;
}

interface ReadingOverlayController {
  positionHighlight(element: HTMLElement): void;
  hideHighlight(): void;
}
```

### 3. Contracts

Configuration precedence is:

```text
DEFAULT_CONFIG < configure(siteConfig) < open({ config: sessionConfig })
```

- Session configuration expires on `close()` and is never persisted.
- Configure feature visibility and the speech adapter before `open()`; changes to an already-mounted control list take effect on the next open.
- Automatic restoration waits for DOM ready and reads the final site configuration, including any `configure({ storageKey })` call made before `DOMContentLoaded`.
- The production toolbar uses a closed Shadow Root; `debug: true` uses an open Shadow Root and adds diagnostics.
- `open({ trigger })` registers the trigger, manages `aria-controls` / `aria-expanded`, and returns focus to the latest connected trigger on close.
- Explicit `open()` writes an open intent only after the runtime has opened successfully. Automatic restoration starts the full runtime and hydrates preferences, but must not infer a trigger from `document.activeElement`, move focus, or repeat the "toolbar opened" announcement.
- The open intent uses an independent, versioned `${storageKey}:open-state` payload. It must not change the existing preference payload or preference version. Persist only reading, speech rate, color scheme, zoom, large cursor, crosshair, pinning, and read-screen mode in the preference payload; never persist fullscreen or spoken page text.
- `close()`, the toolbar exit action, and `destroy()` clear the open intent. `reset()` clears preferences while preserving the current open state and open intent. `persistOpenState: false` clears the current marker and disables restoration.
- Changing `storageKey` must clear any true marker under the previous key. If the runtime is open and persistence remains enabled, migrate the intent to the new derived key.
- Restoration covers only same-origin navigation where the destination also loads and configures the same tool script. It does not inject into pages without the script, synchronize tabs in real time, or cross origins.
- Main toolbar order is fixed by `MAIN_FEATURE_ORDER`; feature flags may remove controls but must not reorder the remaining controls.
- Region value mapping is fixed:

```text
1/viewport, 2/navigation, 3/interaction,
4/service, 5/list, 6/content
```

- Region source priority is `regions.selectors` > `data-a11y-region` > legacy `aria-role` > semantic detection.
- Region label priority is `data-a11y-label` > legacy `aria-readlabel` > `aria-label` > `aria-labelledby` > first visible heading > category label.
- `data-a11y-label` and legacy `aria-readlabel` remain integration-provided short names such as `要闻`; integrations do not provide the complete spoken instruction. Every exact region-container focus caused by shortcut/category navigation, Tab, Shift+Tab, pointer, script, or return from a descendant must literally concatenate `label + REGION_LABELS[type]` without trimming, semantic correction, or category deduplication and announce `提示：您已进入<名称与分类>，按下 Tab 键浏览信息；第 N 个，共 M 个`. Controller-owned focus suppresses its synchronous `focusin` duplicate but still announces once. Automatic mutation/reclassification recovery keeps that focus announcement suppressed. Focusing a descendant does not repeat the region instruction, and `RegionChangeEvent.label` remains the unmodified scanner-resolved label.
- When reading is enabled, ordinary focus speech must consult the region controller's exact-container predicate and skip recognized region containers so it cannot duplicate or overwrite the complete region instruction. This coordination must be correct regardless of `focusin` listener registration order; descendant element reading and the independent active-region highlight remain intact.
- Element speech resolves the first non-empty value in this fixed order: `data-a11y-label` > legacy `aria-readlabel` > `aria-label` > `aria-labelledby` > `title` > applicable `alt` (`img`, `area`, and image inputs) > form labels and value/current option > a text selection contained by that same element > visible text. A selection elsewhere in the document must never override the focused or pointed element. Native elements and equivalent ARIA roles share the same formatting: new-window links `打开新窗口链接，<名称>`, links/areas `链接，<名称>`, images `图片，<描述>`, buttons (including button-like inputs) `按钮，<名称>`, checkboxes `复选框，<名称>`, radios `单选框，<名称>`, and selects/comboboxes/listboxes `下拉框，<名称或当前选项>`. An unnamed ARIA combobox/listbox resolves its current option from a valid `aria-activedescendant`, then from a descendant `role="option"[aria-selected="true"]`. Every other readable element uses `文本：<内容>`. Existing checked, pressed, expanded, selected, disabled, and current states append after the content; `aria-current="false"` is explicitly not current.
- While open, every host-page focus source (Tab, Shift+Tab, pointer, script, or region navigation) applies a reversible `2px solid #ffb800 !important` outline to the real focused node. Toolbar-internal focus keeps the toolbar's own Shadow DOM treatment and must not receive page focus ownership.
- Reading retains the Shadow Root `.a11y-highlight` overlay. Active blind-path regions and current page focus instead use separate node-owned ledgers; clearing one owner must not clear the other or the reading overlay.
- While open, the region controller reconciles every visible recognized region into the native Tab sequence. Any region container whose current `tabIndex` is negative receives temporary `tabindex="0"`; its exact prior attribute value is restored when the region is no longer recognized, becomes invalid, or the tool closes/destroys.
- Ordinary Tab stops on the region container in DOM order before entering native focusable descendants. Focusing a recognized region or one of its descendants automatically activates that region; the container is yellow while focused, then becomes deep orange while a descendant keeps the yellow outline.
- Category navigation focuses the same already-tab-enabled region anchors and keeps DOM-order wraparound. The tool must not infer focusability from static/readable tag names, trap Tab, or manufacture a custom descendant order. A visible non-native node with an explicit standalone interactive ARIA role may receive temporary `tabindex="0"` only when the author supplied no `tabindex`. Valid `role="tab"` options are handled separately: every option stays in sequential Tab order while other composite widget item roles remain owned by their widget's roving-focus model. The host remains responsible for each custom widget's Enter/Space/arrow-key behavior.
- The active-region outline and `aria-regionactive="true"` move when another region is selected and clear when focus leaves the composed region tree, the region becomes invalid, or focus returns to the toolbar. Open Shadow Roots and same-origin iframe documents count as part of the composed region tree; cross-origin content remains atomic.
- Focus and region owners preserve original inline outline values and `!important` priorities and restore them on focus change, region switch/exit, close, or destroy. When both own the region container, restore focus first and region second; rebuild region first and focus second.
- Direct node outlines require no viewport geometry or scroll/resize repositioning and naturally follow open Shadow Root and same-origin iframe content. Captured scroll and relevant-window resize listeners continue only for the reading overlay.
- Standard tabs require `role="tablist"`, `role="tab"`, and an `aria-controls` ID reference. Every valid option receives reversible `tabindex="0"`, so Tab/Shift+Tab traverse options in DOM order and leave the group naturally at either end. `data-a11y-activation` and `data-a11y-trigger-event` are read only from each corresponding `role="tab"`; values on `role="tablist"` are ignored. Missing/invalid activation falls back to `tabs.defaultActivation`; missing/empty trigger events fall back to `tabs.triggerEvents`, then `click`, with whitespace splitting and deduplication. Tab or arrow focus uses the target option's mode, while Enter/Space uses the current option's mode. `role="tablist"` remains responsible only for standard grouping and orientation. For ordinary host `role="tabpanel"` elements and non-native floating panels, host events own visual state through the boolean `data-a11y-hidden` attribute and host CSS `[role="tabpanel"][data-a11y-hidden] { display: none; }`; these panels must not directly use native `hidden`. The tool only dispatches configured host events and reversibly synchronizes `aria-selected` / `aria-hidden`, so visual and accessibility state remain separate. Native `<dialog>` continues to use `showModal()`, `open`, and `close()`. Alt+Down panel entry and Escape return remain supported.
- Every exact focus of a valid `role="tab"`, whether caused by Tab, Shift+Tab, arrow navigation, pointer/script focus, or Escape return handling, is a dedicated speech target. Ordinary reading must skip valid tabs and their exact linked panel containers regardless of listener registration order. Except for the explicitly suppressed Escape return, a non-link option announces exactly `Tab，<名称>[，<区域分类>]，当前有浮动窗口，按 ALT+下键进入窗口`; an `<a role="tab" href>` announces exactly `链接：<名称>，Tab[，<区域分类>]，当前有浮动窗口，按 ALT+下键进入窗口`. No selected/unselected state is appended. The tab name uses the first non-empty `data-a11y-label` > `aria-readlabel` > `aria-label` > `aria-labelledby` > `title` > visible-text value. The optional category is `REGION_LABELS[type]` from the most deeply containing live `ScannedRegion.type`, traversing composed Shadow/iframe ancestry; the scanned region's short label is never included.
- `Alt+ArrowDown` enters the linked panel after it becomes visible and focuses the panel container without changing descendant Tab order. Entry announces exactly `您已进入<选项名称><区域分类>标签面板，按 Tab 键遍历信息，按 Esc 键退出面板并返回<选项名称>选项`; if no descendant is currently tabbable, replace the traversal clause with `当前面板暂无可通过 Tab 遍历的信息` and never add `tabindex` to static descendants. Host activation may move focus into a panel descendant before the tool focuses the container, so the complete composed panel subtree is temporarily excluded from ordinary reading for the duration of that entry operation; after entry completes, descendants immediately resume ordinary semantic reading. `Escape` similarly owns a temporary exit suppression window before invoking host close behavior, so a host that proactively focuses the originating tab cannot emit the full tab message before the short return message. Concurrent entry/exit attempts for the same panel are ignored. Escape announces exactly `已返回<选项名称>选项` only after any required dialog close succeeds and the originating tab truly owns focus. A failed close or focus return must not announce success. Only modal dialogs trap Tab.
- Mutation observers batch page changes by `regions.mutationDebounceMs`; observers, reading listeners, pointer listeners, and shortcuts must be detached while closed.
- Theme customization is limited to typed `toolbar.theme` variables. Arbitrary CSS injection is not part of the API.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Unsupported speech synthesis | Keep reading/rate controls focusable, set `aria-disabled="true"`, announce the reason, and do not enable reading. |
| Unsupported or denied fullscreen | Keep the control focusable and emit/announce a clear capability error; never emulate fullscreen. |
| Missing/duplicate tab or panel ID | Warn and skip that tab group; add a debug marker in debug mode; throw when `strict: true`. |
| Valid tab receives focus | Emit one complete dedicated tab message, skip generic reading and selection-state suffixes, and resolve only the containing scanned region category. |
| Linked panel has no tabbable descendant | Focus the panel container, use the no-traversable-information entry message, and leave every static descendant's `tabindex` untouched. |
| Host activation/close handler moves focus during panel entry or exit | Suppress generic/intermediate focus speech only for the active operation, emit the final entry/return message once, then restore normal descendant reading. |
| Escape close or origin-focus restoration fails | Keep the actual resulting focus/state and do not announce `已返回...选项`. |
| Invalid region or dialog selector | Emit `error`, skip only the invalid selector/component, and continue; throw when `strict: true`. |
| Invalid zoom target selector | Emit `error`, leave page zoom unapplied, and keep the rest of the tool running. |
| Unknown `data-a11y-region` / legacy value | Ignore the element as an explicit region, report once per value, and continue scanning. |
| Hidden, inert, or `aria-hidden="true"` region | Exclude it from counts and navigation. |
| Current region removed, hidden, or reclassified | Move to the next same-type region with wraparound; otherwise return focus to the category control. |
| Region container is the current focused element | Show only the yellow focus outline; the yellow owner overrides the underlying orange region owner. When reading is enabled, announce exactly one complete region-entry instruction. |
| Focus moves to a descendant of the active region | Restore the outer region to deep orange, move the yellow focus outline to the descendant, and read only the descendant semantics without repeating the region instruction. |
| Focus leaves the active region or enters the toolbar | Restore the region's exact outline, `aria-regionactive`, and navigation scroll margin without changing the browser's native focus destination; keep its temporary region tab stop until the region becomes invalid or the tool closes. |
| Visible recognized region is added, removed, hidden, or reclassified | Reconcile region-container `tabindex="0"` ownership and restore the exact prior value for every element that leaves the recognized set. |
| Visible standalone ARIA control has no native focusability or author `tabindex` | Temporarily add `tabindex="0"`; restore it when the role is removed, the node becomes hidden/disabled/ignored, or the tool closes. Never auto-tab static `p`/`span`/heading/list/`img` content by tag name. |
| Focused page element is removed, hidden, or no longer focused | Release the yellow outline and restore the exact original inline values and priorities. |
| Host focus outline uses inline values or `!important` | Override it only while owned, then restore the exact original values and priorities. |
| Open Shadow Root or same-origin iframe gains focus | Resolve the deepest focused page element, exclude the toolbar composed tree, and apply the outline directly to that real node. |
| Corrupt, incompatible, or blocked localStorage | Do not throw; use validated defaults or the in-memory fallback. |
| Missing or invalid saved open intent | Preserve lazy loading: do not render, scan, or bind high-frequency listeners. Remove malformed/incompatible open-state payloads. |
| Automatic restoration fails | Catch the error, tear down incomplete runtime nodes, and clear the attempted/current open-intent keys so later pages do not repeat the failure. |
| Explicit `open()` fails | Reject normally, tear down incomplete runtime nodes, and leave no true open intent. |
| Automatic restoration races with explicit open/close | Serialize the pending open. Explicit open retains trigger/focus/announcement semantics; close waits for the pending restoration, then closes and clears intent. |
| `localStorage` is unavailable | Continue with in-page memory and no exception. Cross-refresh restoration is unavailable by design. |
| Stale speech callback after interruption | Ignore it; do not emit a false `error` or `speechend` for the canceled request. |
| Page selection is outside the reading target | Ignore that selection and continue the target's documented name fallback; never read unrelated selected text. |
| Unnamed ARIA combobox/listbox has no valid active or selected option | Keep the semantic-only `下拉框` fallback; do not read an unrelated option or throw. |
| Cross-origin iframe | Never read its document; treat the iframe element as atomic only when explicitly configured or marked. |
| External code replaces `history.pushState` after open | Do not overwrite the newer integration when the tool stops. |

### 5. Good / Base / Bad Cases

- Good: a marked region contains native links and buttons; ordinary Tab first shows one yellow outline on the container, and the next Tab produces an orange outer region plus a yellow current descendant. After an explicit open, a same-origin reload silently restores the toolbar without moving the page's current focus.
- Base: an unmarked semantic page is conservatively detected (`nav`, named `form`, `main`, `article`); ordinary page focus gets one yellow outline and the host outline returns after close. With no valid open intent, bundle import remains lazy.
- Bad: sharing one mutation owner between region context and current focus corrupts restoration; sharing the reading overlay with either state lets speech cleanup erase navigation context; intercepting Tab, auto-tabbing readable tags, overriding author `tabindex`, flattening composite widgets into multiple Tab stops, restoring before final pre-DOMContentLoaded configuration, or focusing/announcing during automatic restoration is forbidden.

### 6. Tests Required

- Unit: config deep merge and immutable feature order.
- Unit: preference and independent open-state storage validation, version rejection, clear, and unavailable-storage fallback.
- Unit: successful open/close/destroy/reset intent lifecycle, disabled persistence, storage-key migration, failed-open cleanup, silent final-config restoration, and explicit-open/close races with pending restoration.
- Unit: accessible-name empty-value fallback and fixed priority, target-contained versus unrelated selections, area/image-input `alt`, unnamed ARIA select current-option fallback, native/equivalent-ARIA semantic prefixes, generic `文本：` output, `aria-current="false"`, control state text, hidden content, and Shadow Root `aria-labelledby`.
- Unit: region source priority, numeric/English/legacy mapping, semantic-off mode, open Shadow Roots, safe history restoration, current-region wrap and reclassification recovery.
- Unit: every visible recognized region receives a reversible Tab anchor; shortcut and ordinary/reverse/programmatic container focus announce the same instruction once; listener-order-independent reading coordination skips the container but reads descendants; reading overlay, active-region owner, and current-focus owner remain independent; region focus is yellow, descendant focus restores the region to orange, and values/priorities restore exactly.
- Unit: exact tab/link/no-region speech templates; every-focus announcements without selection states; scanned category lookup across ordinary DOM, open Shadow Roots, and same-origin iframe documents; listener-order-independent generic-reading suppression; per-option automatic/manual activation; trigger-event fallback/deduplication; host-owned `data-a11y-hidden` panels without native `hidden`; focusable/static panel entry; host-driven intermediate focus during entry/exit; normal descendant reading after entry; concurrent-operation deduplication; successful and failed Escape return; and non-modal dialog focus behavior.
- Unit: interrupted speech must not emit stale errors.
- Unit: hidden features must be consistent between main and read-screen toolbars.
- E2E: lazy open, fixed order, roving toolbar keyboard model, pin/collapse shortcut, zoom isolation, reset, and Fullscreen API.
- E2E: explicit open followed by reload and same-origin navigation restores silently without focus theft; close followed by reload stays closed.
- E2E: six live region counts, DOM-order navigation, editable-field shortcut exclusion, dynamic add/hide/remove, recovery, and persistence.
- E2E: Tab, Shift+Tab, pointer, and script focus use one yellow real-node outline; the host outline is overridden only while owned and restores across close/destroy/reopen.
- E2E: ordinary Tab reaches recognized region containers before their descendants; category selection uses the same anchors; native Tab shows orange region context plus yellow descendant focus; Shift+Tab returns through the region anchor; dynamic invalidation and close/destroy restore all temporary tab stops.
- E2E: Tab, Shift+Tab, arrow, script, Alt+ArrowDown, and Escape produce the exact single tab/panel/return live message; static panels gain no descendant tab stops; ordinary DOM, open Shadow Roots, and same-origin iframe tabs use their scanned region category.
- E2E: open Shadow Roots, same-origin iframes, strict CSP, scroll/resize, and forced-colors preserve direct-node outline ownership without focus/region geometry overlays.
- E2E: hostile CSS isolation, strict CSP external styles, closed production Shadow Root, semantic-off configuration, and no new serious/critical axe violations.
- Assertion gate: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` must all pass before release.

### 7. Wrong vs Correct

#### Wrong

```html
<!-- Non-standard ARIA used for a new integration. -->
<nav aria-role="2" aria-readlabel="主导航"></nav>

<!-- Relationship guessed from DOM order; no stable ID contract. -->
<button role="tab">新闻</button>
<section role="tabpanel">...</section>

<!-- Per-option behavior incorrectly declared on the grouping container. -->
<div role="tablist" data-a11y-activation="manual" data-a11y-trigger-event="mouseover"></div>

<!-- Host tab panels must not use native hidden in this integration contract. -->
<section role="tabpanel" hidden>...</section>
```

```js
// Creates site-specific behavior outside the singleton/config contract.
document.querySelector(".toolbar").style.cssText = customCss;
```

```ts
// One shared overlay lets reading cleanup erase blind-path context.
effects.setHighlight(activeRegion);

// Generic reading can cancel the complete region instruction and loses the
// requested semantic wording for links, images, controls, and plain text.
speech.speak(`文本：${element.textContent ?? ""}`, locale, rate);

// Reorders the host page instead of following its native focus model.
for (const [index, item] of descendants.entries()) {
  item.tabIndex = index + 1;
}
```

#### Correct

```html
<nav data-a11y-region="navigation" data-a11y-label="主导航"></nav>

<div role="tablist" aria-orientation="horizontal">
  <button
    id="tab-home"
    role="tab"
    aria-controls="panel-home"
    aria-selected="true"
    data-a11y-activation="automatic"
    data-a11y-trigger-event="click"
  >首页</button>
  <button
    id="tab-news"
    role="tab"
    aria-controls="panel-news"
    aria-selected="false"
    data-a11y-activation="manual"
    data-a11y-trigger-event="mouseover click"
  >新闻</button>
</div>
<section id="panel-home" role="tabpanel" aria-labelledby="tab-home">...</section>
<section
  id="panel-news"
  role="tabpanel"
  aria-labelledby="tab-news"
  data-a11y-hidden
>...</section>

<style>
  [role="tabpanel"][data-a11y-hidden] { display: none; }
</style>
```

```js
AccessibilityTool.configure({
  storageKey: "site-accessibility:preferences",
  persistOpenState: true,
  toolbar: {
    theme: { accent: "#ff7a00" },
    styleUrl: "/assets/accessibility-tool.css",
  },
});

launcher.addEventListener("click", () => {
  void AccessibilityTool.open({ trigger: launcher });
});
```

```ts
// Region context and current focus have separate reversible ledgers. Scanner
// reconciliation gives recognized non-focusable containers temporary
// tabindex="0" before either ordinary Tab or category navigation reaches them.
effects.setRegionHighlight(activeRegion);
activeRegion.focus({ preventScroll: true });

// Do not intercept Tab: the browser enters native focusable descendants in
// DOM order while the region controller keeps the composed-tree context.

// Region containers own the complete entry instruction; ordinary reading
// skips that exact container and formats every descendant by its semantics.
if (!regionNavigation.isRegionContainer(element)) {
  speech.speak(
    getAccessibleText(element),
    getElementLanguage(element),
    rate,
  );
}
```
