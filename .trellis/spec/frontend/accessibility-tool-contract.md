# AccessibilityTool Runtime Contract

## Scenario: Embeddable desktop accessibility toolbar

### 1. Scope / Trigger

- Trigger: any change to the public singleton API, toolbar feature set, blind-path region protocol, tab/dialog enhancement, preference persistence, or build output.
- Runtime scope: browser-native TypeScript with zero runtime dependencies; desktop layouts start at 1024px.
- Lifecycle boundary: importing the bundle must not render UI, scan the host page, or bind high-frequency listeners. Runtime work begins on the first `open()` call and is reversible through `close()`, `reset()`, or `destroy()`.
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
```

Build signatures:

```text
dist/accessibility-tool.min.js  -> IIFE, window.AccessibilityTool
dist/accessibility-tool.es.js   -> ESM default export
dist/accessibility-tool.css     -> external CSP stylesheet
dist/index.d.ts                  -> public TypeScript entry declaration
```

### 3. Contracts

Configuration precedence is:

```text
DEFAULT_CONFIG < configure(siteConfig) < open({ config: sessionConfig })
```

- Session configuration expires on `close()` and is never persisted.
- Configure feature visibility and the speech adapter before `open()`; changes to an already-mounted control list take effect on the next open.
- The production toolbar uses a closed Shadow Root; `debug: true` uses an open Shadow Root and adds diagnostics.
- `open({ trigger })` registers the trigger, manages `aria-controls` / `aria-expanded`, and returns focus to the latest connected trigger on close.
- Persist only reading, speech rate, color scheme, zoom, large cursor, crosshair, pinning, and read-screen mode. Never persist fullscreen or spoken page text.
- Main toolbar order is fixed by `MAIN_FEATURE_ORDER`; feature flags may remove controls but must not reorder the remaining controls.
- Region value mapping is fixed:

```text
1/viewport, 2/navigation, 3/interaction,
4/service, 5/list, 6/content
```

- Region source priority is `regions.selectors` > `data-a11y-region` > legacy `aria-role` > semantic detection.
- Region label priority is `data-a11y-label` > legacy `aria-readlabel` > `aria-label` > `aria-labelledby` > first visible heading > category label.
- Standard tabs require `role="tablist"`, `role="tab"`, and an `aria-controls` ID reference. The tool dispatches the configured original page events and only supplements focus and ARIA state.
- `Alt+ArrowDown` enters the linked panel after it becomes visible; `Escape` returns to the originating tab. Only modal dialogs trap Tab.
- Mutation observers batch page changes by `regions.mutationDebounceMs`; observers, reading listeners, pointer listeners, and shortcuts must be detached while closed.
- Theme customization is limited to typed `toolbar.theme` variables. Arbitrary CSS injection is not part of the API.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Unsupported speech synthesis | Keep reading/rate controls focusable, set `aria-disabled="true"`, announce the reason, and do not enable reading. |
| Unsupported or denied fullscreen | Keep the control focusable and emit/announce a clear capability error; never emulate fullscreen. |
| Missing/duplicate tab or panel ID | Warn and skip that tab group; add a debug marker in debug mode; throw when `strict: true`. |
| Invalid region or dialog selector | Emit `error`, skip only the invalid selector/component, and continue; throw when `strict: true`. |
| Invalid zoom target selector | Emit `error`, leave page zoom unapplied, and keep the rest of the tool running. |
| Unknown `data-a11y-region` / legacy value | Ignore the element as an explicit region, report once per value, and continue scanning. |
| Hidden, inert, or `aria-hidden="true"` region | Exclude it from counts and navigation. |
| Current region removed, hidden, or reclassified | Move to the next same-type region with wraparound; otherwise return focus to the category control. |
| Corrupt, incompatible, or blocked localStorage | Do not throw; use validated defaults or the in-memory fallback. |
| Stale speech callback after interruption | Ignore it; do not emit a false `error` or `speechend` for the canceled request. |
| Cross-origin iframe | Never read its document; treat the iframe element as atomic only when explicitly configured or marked. |
| External code replaces `history.pushState` after open | Do not overwrite the newer integration when the tool stops. |

### 5. Good / Base / Bad Cases

- Good: a site calls `configure()` before opening, uses `data-a11y-region` and stable tab/panel IDs, and provides `styleUrl` under strict CSP.
- Base: an unmarked semantic page is conservatively detected (`nav`, named `form`, `main`, `article`) and works with default browser speech and localStorage.
- Bad: malformed selectors, duplicate IDs, unavailable storage, denied fullscreen, and cross-origin frames must degrade locally without disabling the rest of the tool.

### 6. Tests Required

- Unit: config deep merge and immutable feature order.
- Unit: storage validation, version rejection, clear, and unavailable-storage fallback.
- Unit: accessible-name priority, control state text, hidden content, and Shadow Root `aria-labelledby`.
- Unit: region source priority, numeric/English/legacy mapping, semantic-off mode, open Shadow Roots, safe history restoration, current-region wrap and reclassification recovery.
- Unit: automatic/manual tabs, multiple original events, panel entry/Escape return, and non-modal dialog focus behavior.
- Unit: interrupted speech must not emit stale errors.
- Unit: hidden features must be consistent between main and read-screen toolbars.
- E2E: lazy open, fixed order, roving toolbar keyboard model, pin/collapse shortcut, zoom isolation, reset, and Fullscreen API.
- E2E: six live region counts, DOM-order navigation, editable-field shortcut exclusion, dynamic add/hide/remove, recovery, and persistence.
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
```

```js
// Creates site-specific behavior outside the singleton/config contract.
document.querySelector(".toolbar").style.cssText = customCss;
```

#### Correct

```html
<nav data-a11y-region="navigation" data-a11y-label="主导航"></nav>

<div role="tablist" data-a11y-trigger-event="click">
  <button
    id="tab-news"
    role="tab"
    aria-controls="panel-news"
    aria-selected="true"
  >新闻</button>
</div>
<section id="panel-news" role="tabpanel" aria-labelledby="tab-news">...</section>
```

```js
AccessibilityTool.configure({
  toolbar: {
    theme: { accent: "#ff7a00" },
    styleUrl: "/assets/accessibility-tool.css",
  },
});

launcher.addEventListener("click", () => {
  void AccessibilityTool.open({ trigger: launcher });
});
```
