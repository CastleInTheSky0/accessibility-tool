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
  registerRegions(configs: RegionRegistrationConfig[]): RegistrationHandle;
  registerTabs(configs: TabRegistrationItem[]): RegistrationHandle;
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

type RegionCode = 1 | 2 | 3 | 4 | 5 | 6;
type DomTarget = string | Element;

interface RegistrationHandle {
  dispose(): void;
}

interface RegionRegistrationConfig {
  target: DomTarget;
  region: RegionCode;
  label?: string;
}

interface TabRegistrationItem {
  tab: DomTarget;
  panel: DomTarget;
  region: RegionCode;
  label?: string;
  activation?: TabActivationMode;
  triggerEvent?: string | readonly string[];
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

Internal page-content language resolution uses these signatures:

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

interface PersistedVoicePreference {
  voiceURI: string;
  name: string;
  lang: string;
}

interface PersistedPreferences {
  // Existing required v0.1 fields remain unchanged.
  preferredLanguage?: string;
  voice?: PersistedVoicePreference;
}

// Internal-only catalog boundary; it is not exported from the package entry.
interface VoiceCatalogCapability {
  readonly providerId: string;
  readonly localOnly: boolean;
  readonly supportsPreview: boolean;
}

interface LocalVoiceDescriptor extends PersistedVoicePreference {
  id: string;
  isDefault: boolean;
}

interface VoiceCatalogSnapshot {
  capability: VoiceCatalogCapability;
  status: "loading" | "ready" | "unsupported";
  voices: readonly LocalVoiceDescriptor[];
}

interface VoiceCatalogProvider {
  readonly capability: VoiceCatalogCapability;
  start(): void;
  stop(): void;
  subscribe(listener: (snapshot: VoiceCatalogSnapshot) => void): () => void;
  getSnapshot(): VoiceCatalogSnapshot;
  getCompatibleVoices(language: string): readonly LocalVoiceDescriptor[];
  resolvePreference(
    preference: PersistedVoicePreference | null,
    language: string,
  ): LocalVoiceDescriptor | null;
}

interface BrowserNativeVoiceResolver {
  resolveNativeVoice(
    preference: PersistedVoicePreference | null,
    language: string,
  ): SpeechSynthesisVoice | null;
}
```

Continuous-reading public state and events use these exact signatures:

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
  index: number;
  count: number;
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

interface AccessibilityToolState {
  // Existing fields remain unchanged.
  continuousReadingState: ContinuousReadingState;
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
- The production toolbar uses a closed Shadow Root; `debug: true` uses an open Shadow Root and adds diagnostics. Every completed region scan logs its region count and elapsed time as `[AccessibilityTool] 区域扫描完成：N 个，X.Xms。` so release tests can measure the scanner without adding a public timing API.
- `open({ trigger })` registers the trigger, manages `aria-controls` / `aria-expanded`, and returns focus to the latest connected trigger on close.
- Explicit `open()` writes an open intent only after the runtime has opened successfully. Automatic restoration starts the full runtime and hydrates preferences, but must not infer a trigger from `document.activeElement`, move focus, or repeat the "toolbar opened" announcement.
- The open intent uses an independent, versioned `${storageKey}:open-state` payload. It must not change the existing preference payload or preference version. Persist only reading, speech rate, color scheme, zoom, large cursor, crosshair, pinning, read-screen mode, the optional normalized preferred language, and the optional `{ voiceURI, name, lang }` voice descriptor in the version-1 preference payload; never persist fullscreen, spoken page text, or native `SpeechSynthesisVoice` objects. A v0.1 payload with no language or voice field remains valid, and an invalid optional field is ignored without discarding valid sibling preferences.
- `close()`, the toolbar exit action, and `destroy()` clear the open intent. `reset()` clears preferences while preserving the current open state and open intent. `persistOpenState: false` clears the current marker and disables restoration.
- Changing `storageKey` must clear any true marker under the previous key. If the runtime is open and persistence remains enabled, migrate the intent to the new derived key.
- Restoration covers only same-origin navigation where the destination also loads and configures the same tool script. It does not inject into pages without the script, synchronize tabs in real time, or cross origins.
- Main toolbar order is fixed by `MAIN_FEATURE_ORDER`; feature flags may remove controls but must not reorder the remaining controls. The full main toolbar has 15 controls, and `reading`, `continuousReading`, `speechRate`, `voiceSelection`, and `colorScheme` remain consecutive in that exact order.
- The desktop toolbar is one fixed-height, single-row blind-path track. Its outer surface and Shadow Host always span the viewport, while one centered inner frame owns the brand rail, active mode controls, and continuous track together; that frame is `width: 100%` with `max-width: 1280px`. Its default height is `146px`; the 15-control main mode fits that frame, while 1024-1279px uses a compact full-width single-row fallback without horizontal scrolling, clipping, or changes to the roving keyboard model.
- The left brand rail is presentation-only: it is `aria-hidden="true"`, contains no `data-toolbar-item`, and never enters the Tab order or accessible toolbar item count. It shows `A11Y / 辅助工具` in main mode and `盲道导航` in read-screen mode.
- Main and read-screen modes use the same Host, root, and toolbar height. Switching `isReadScreen` must not change push-mode body padding or any configured `offsetSelectors` offset. Read-screen order is exactly the six `REGION_TYPES`, `screenSound`, `continuousReading`, `help`, `readScreen`, `exit`; `screenSound` keeps its existing action but exposes the visible and accessible name `朗读` with `开启` / `关闭` metadata, both continuous-reading entries reflect one shared session, and the active read-screen control exposes `当前模式`.
- Default control surfaces are transparent over one continuous low-contrast track. Icon wells use `--a11y-control-bg`; every `aria-pressed="true"` control uses the same accent surface, accent icon well, and enlarged accent node; exit always uses the danger surface, icon well, and node. Hover remains a restrained dark lift, speech rate has no persistent yellow/accent border, and only genuine `:focus-visible` receives a non-accent high-contrast outline.
- Speech rate is one direct action button, not a popup trigger. Click, Enter, or Space advances through `[0.75, 1, 1.25, 1.5]`; an exact preset advances to the next value and `1.5` wraps to `0.75`, while a configured or persisted non-preset value advances to the first strictly greater preset or wraps to `0.75` when none exists. The action keeps focus on the toolbar button, commits and persists the new rate, updates its icon state, visible metadata, and accessible name in the same state pass, and announces exactly `当前语速 X 倍` through the live region and active reading speech. It never toggles `readingEnabled`. No rate dialog, preset buttons, range slider, output node, panel state, or `aria-haspopup` / `aria-expanded` / `aria-controls` popup semantics may exist.
- `voiceSelection` is an independent action/popup control between speech rate and color scheme. It opens an anchored, non-modal `role="dialog"` inside the toolbar Shadow Root without changing the speech-rate action. The panel exposes default-language selection containing the localized common choices plus every unique normalized language in the full current catalog, an `自动选择（推荐）` option, compatible local voices as one radio group, preview, clear-preference, status/privacy text, and a close action. Escape, the close button, and outside interaction close it; explicit panel dismissal returns focus to the connected voice-selection trigger. Closed-Shadow-Root event retargeting must not treat panel interaction as outside interaction, and catalog/selection refreshes preserve the focused radio when it still exists or move focus to the checked fallback. Forced colors and reduced motion must preserve its structure, focus visibility, and operability.
- `continuousReading` is an independent action/popup control immediately after `reading`. It opens one anchored, non-modal `role="dialog"` named `连续朗读控制`, exposes `未开始` / `朗读中` / `已暂停`, and provides explicit start, pause/resume, stop, and close controls. Escape, close, and outside interaction dismiss only the panel and never stop playback; explicit dismissal returns focus to the currently connected entry and never traps focus.
- Continuous start checks `SpeechAdapter.isSupported()` before changing state. Unsupported speech leaves `readingEnabled` and `continuousReadingState` unchanged and emits no continuous start/stop event. A supported but empty scope first persists `readingEnabled=true`, then stays idle with no continuous start/stop event. A valid start automatically enables/persists reading before the continuous playing state; stop, completion, and error never disable reading, while an explicit reading-off action stops playing or paused sessions with reason `disabled`.
- One reading-layer session owns `idle | playing | paused`, a monotonically invalidated generation, one finite queue, and one current-segment provider. Pause cancels the utterance and preserves the segment; resume revalidates and replays that segment from its beginning. Repeated controls are idempotent. Rate, preferred-language, and local-voice changes leave the current request snapshot intact and apply from the next segment; their confirmations use the live region while a session exists. Voice preview is an explicit takeover and stops the session with reason `interaction`.
- Start position is the last connected, visible, readable, non-sensitive page target retained before toolbar focus, then the first eligible member of the current region, then the first page member. The queue follows finite composed-tree order through ordinary DOM, open Shadow Roots, assigned/fallback slots, and same-origin iframes at each host position. It includes body/div/span bare text and unregioned content, never groups by region type, and never moves keyboard focus during automatic advance.
- Sequence atomization prevents text-container/descendant, label/control, `aria-labelledby`, `aria-describedby`, current-option, and tab/panel duplication. Valid visible tabs are atomic and include their live name/state; the visible current panel is traversed by segment, while hidden/inactive panels are excluded and never auto-activated. Editable text controls expose label/type/placeholder/description and non-text state but never their current value. Password, `autocomplete="one-time-code"`, every case-insensitive section-token `cc-*` field, captcha/security-keyboard markers, configured ignore selectors, sensitive nodes, and any ignored/sensitive label, reference, option, or descendant text source are excluded.
- Queue membership freezes at start, but every member resolves its current parent, assigned/fallback slot, composed privacy/visibility boundary, accessible text, language, rate, and voice immediately before use. Ordinary new nodes wait for the next session. Removed, hidden, ignored, sensitive, empty, moved-across-invalid-boundary, or hidden-panel members skip without public segment events. A current invalid member cancels immediately and advances; if an atomic member loses only a newly sensitive/ignored text source, cancel and replay the sanitized same member. Ordinary current text/language/settings changes do not restart the committed utterance snapshot.
- User page focus/click, tab activation, region navigation, another explicit page speech request, or preview stops playing/paused sessions with reason `interaction`. A new or replaced modal stops with `dialog`; explicit restart inside the innermost active modal uses `scope="dialog"` and never escapes to the background. `pushState`, `replaceState`, `popstate`, `hashchange`, and `accessibility-tool:route` stop with `route`. Close/reset/destroy/runtime teardown stop with `lifecycle`, invalidate generation before cancellation, clear queue/current segment/highlight/observers, and never auto-resume.
- Continuous events expose only state, scope, frozen-queue position/count, text length, and stop reason. Valid first-start order is optional reading `statechange` → playing `statechange` → `continuousreadingstart` → first `continuousreadingsegmentchange` → `speechstart`. Advance order is `speechend` → next segmentchange → next speechstart. Valid error order is one `error` → idle `statechange` → reason=`error` stop. Canceled or stale callbacks emit no public speech/end/error/session event and cannot advance a newer generation. Completion clears the current provider/highlight, leaves focus unchanged, and uses a non-synthesized `连续朗读已完成` status.
- Every segment continues through the single `SpeechController -> SpeechAdapter` path. A synchronous adapter `speak()` exception is converted into the same one effective error path; a synchronous adapter `cancel()` exception is contained so pause/stop/lifecycle cleanup still reaches stable state. The queue/current text is never persisted, logged, or uploaded, and v0.2 makes no runtime network request or cloud-TTS call.
- The browser-local catalog reads `speechSynthesis.getVoices()`, starts in `loading` when the first list is empty, and refreshes on `voiceschanged`. It exposes only entries whose native `localService` is exactly `true`, normalizes language tags, deduplicates stable descriptors, and orders exact-language matches before same-primary-language matches, then defaults and stable names. The UI never retains native voice objects. Every effective speech or preview request resolves again from the latest native list, first by compatible `voiceURI`, then by `name + normalized lang`; if neither matches, use a compatible native default when present, otherwise leave `utterance.voice` unset for the browser fallback.
- The catalog/capability seam is internal and source-neutral: consumers depend on `providerId`, `localOnly`, and `supportsPreview`, not browser or vendor fields. v0.2 registers only the `browser-local` provider and the existing browser adapter. This seam is not exported, creates no third-party plugin contract, reads no credentials, includes no cloud SDK or provider voice IDs, and performs no network request; a later approved phase may add another internal provider without changing the v0.2 local behavior.
- Voice catalog listeners exist only while the runtime is open and are removed on close/destroy. Preview owns only its current speech request: repeating preview cancels the previous preview, while a stale preview completion/cancel callback cannot cancel or complete a newer page-reading request. Closing, resetting, or destroying clears queued preview work and stale callbacks; custom speech adapters keep their existing behavior and receive a clear unavailable explanation instead of browser-local voice controls.
- Read-screen region controls expose at most one current location with `aria-current="location"` and `data-region-current`, never `aria-pressed`. A successful click, shortcut, or page-focus navigation updates the same `{ type, index, count }` state; the current control shows `index + 1/count`, while every other category continues to show its total count. Returning focus to the toolbar, closing it, clearing navigation, or invalidating the current region removes the location state and restores total-only counts; count/index refreshes alone do not create a new public event.
- The current read-screen region and every active binary main-mode control use the same track treatment: an accent-filled node separated from an accent outer ring by the toolbar background, plus an independent local accent segment layered above the gray track and below the node. The segment is always present, uses `transform-origin: center`, and transitions between `scaleX(0)` and `scaleX(1)` over `220ms cubic-bezier(0.22, 1, 0.36, 1)`. Multiple binary controls may remain active together; value/action controls and exit must not inherit this state. `prefers-reduced-motion: reduce` disables these node and segment transitions.
- While open, the toolbar Shadow Host is always `position: fixed` at the top of the viewport, including the default unpinned state and `toolbar.layoutMode: "overlay"`; ordinary document scrolling must not move it away from `top: 0`.
- In the default unpinned `toolbar.layoutMode: "push"` state, page placement reserves the toolbar's runtime height on `body` and applies that same height to configured `toolbar.offsetSelectors`. Closing, destroying, switching to overlay, or pinning restores the exact host-page inline styles owned by the tool.
- `toolbar.layoutMode: "overlay"` and `isPinned: true` reserve no page space. A pinned toolbar collapses immediately when the pointer leaves its actual area in both main and read-screen modes, while pin activation and keyboard `focusout` retain the configured `pinHideDelayMs` scheduling semantics. Entering read-screen mode commits `isCollapsed: false` for that mode switch, but no continuing `isReadScreen` guard may block later pointer or scheduled collapse; an unpinned read-screen toolbar remains expanded. Immediate pointer collapse must move any toolbar-owned focus to the visible reveal control with `preventScroll` semantics before leaving the expanded controls hidden; the reveal control, `Alt+Shift+A`, and pointer entry at the viewport top continue to expand the 12px strip in the current mode without pushing or scrolling the page. Persisted pinned + read-screen restoration participates in the same configured collapse scheduling as pinned main-mode restoration. The collapsed Host state, 12px reveal strip, `pointer-events: none`, focus transfer, and placement updates commit immediately, but `.a11y-toolbar` remains `visibility: visible` through its existing `180ms` upward transform and becomes hidden only when that transition ends. Expansion restores visibility with zero delay before easing the transform back into place. Under `prefers-reduced-motion: reduce`, both visibility and transform switch synchronously with no transition or delay.
- Every stateful toolbar icon is rendered from the final `AccessibilityToolState` during the same `ToolbarUI.updateState()` pass that updates `aria-pressed` and control metadata. Reading and read-screen sound share the same sound on/off artwork; large cursor, crosshair, fullscreen, pinning, and read-screen mode each use dedicated two-state artwork. Speech rate and color scheme render the current rate and exact palette. Zoom-in and zoom-out keep fixed magnifier `+` / `-` artwork with no progress, ratio ring, or scale marks; the current zoom percentage remains exclusively in the existing visible metadata and accessible label.
- Stateful controls and their `.a11y-control__icon` wrappers expose the same stable `data-icon-state` value for diagnostics and tests. Icon replacement must preserve the existing control box, label, toolbar order, roving keyboard model, and accessible name; every inline SVG remains `24x24`, `aria-hidden="true"`, `focusable="false"`, and uses `currentColor` without external assets or runtime dependencies.
- Both crosshair axes use the themeable `--a11y-danger` color, whose default is `#ff1f1f` and also drives the exit danger treatment. Each axis is a pure-color `3px` fixed line with `border: 0`, `outline: 0`, and `box-shadow: none`; both remain `aria-hidden` and `pointer-events: none`, so they never intercept host-page pointing, scrolling, or focus.
- The toolbar Shadow Host uses the conventional maximum `z-index: 2147483647`; ordinary host-page stacking contexts must not cover it, including under hostile CSS. Internal toolbar overlays retain their ordered relationship below the Host boundary. Native top-layer content such as a `showModal()` dialog is outside ordinary `z-index` guarantees and may still appear above the toolbar.
- Region value mapping is fixed:

```text
1/viewport, 2/navigation, 3/interaction,
4/service, 5/list, 6/content
```

- Public DOM registration accepts only numeric `RegionCode` values. Invalid runtime values never abort the batch: skip only that item and warn when `debug: true`. Registration always writes the numeric string to `data-a11y-region`.
- `registerRegions()` resolves selector strings with `document.querySelectorAll()` at call time and applies one configuration to every current match. An `Element` target applies only to that connected node. Missing, invalid, disconnected, or document-less targets are skipped independently. A supplied `label` is a short name written through `data-a11y-label`; an omitted label leaves the scanner's existing accessible-name and heading fallback authoritative.
- `registerTabs()` accepts a flat `TabRegistrationItem[]`; callers never pass a `tablist` or `items` wrapper. A selector target resolves every current connected HTML-element match in document order, while an `Element` target resolves only that node. Each item requires equal, non-zero valid tab and panel counts and pairs them by the same DOM-order index. A count mismatch skips that whole item with a debug warning without invalidating unrelated items in the same call.
- Every registered tab's direct parent receives the tablist semantics. Selector matches spanning multiple direct parents are split into independent tablists, each with its own initial selection, keyboard boundary, and selection state; the tool never guesses a higher ancestor. Each tab/panel pair must share one `Document` or Shadow Root. Duplicate tabs, duplicate panels, cross-role node reuse (including an inferred tablist parent reused as a tab or panel), or a tab paired with itself skip only the conflicting pair. Live registrations participate in cross-role conflict checks while same-role overlapping registrations remain supported by layered ownership.
- Registered tabs and panels receive the standard roles, reversible `tabindex`/ARIA state, numeric region values, and stable ID references. Existing unique IDs are retained; missing IDs are generated uniquely within the relationship root and removed on final disposal. `data-a11y-activation` and `data-a11y-trigger-event` are written only on each tab and use the same defaulting, whitespace splitting, deduplication, and final `click` fallback as the tabs controller.
- A registered tab carries the same numeric region value as its panel for option metadata, but the scanner excludes only API-registered tabs from region-container results so they do not double the region count or compete with the dedicated tab announcement. Existing manually authored HTML behavior is unchanged. The panel remains the blind-path region target and uses the tab's resolved short name unless `label` overrides both.
- Registration initializes the same first-selected-tab rule as the tabs controller, synchronizes `aria-selected` / `aria-hidden`, and represents inactive ordinary panels with `data-a11y-hidden`. Native `<dialog>` panels retain their existing `data-a11y-hidden` state and continue to use `open` / `close()`. Registration never adds, removes, or changes native `hidden`. Host events and CSS continue to own visual/business state after activation; the existing tabs controller remains the only keyboard, original-event, Alt+Down, Escape, and speech implementation.
- Each call owns an independent idempotent `RegistrationHandle`. Attribute ownership is layered on the shared DOM ledger: disposing one call reveals the next active registration for that exact attribute, while disposing the last owner restores missing, empty, or valued originals exactly. `close()` retains registrations; `destroy()` releases every outstanding handle after live controllers relinquish their own ledger entries. Registration changes while open synchronously refresh the existing scanner/tabs pipeline without adding listeners.
- Selector matching is intentionally one-shot. Future nodes, SPA route configuration, and framework-recreated DOM require a new registration call; the existing mutation scanner is not expanded into a selector subscription system.

- Region source priority is `regions.selectors` > `data-a11y-region` > legacy `aria-role` > semantic detection.
- Region label priority is `data-a11y-label` > legacy `aria-readlabel` > `aria-label` > `aria-labelledby` > linked tab accessible name for an explicitly classified standard tab panel > first visible heading > category label.
- `data-a11y-label` and legacy `aria-readlabel` remain integration-provided short names such as `要闻`; integrations do not provide the complete spoken instruction. Every exact region-container focus caused by shortcut/category navigation, Tab, Shift+Tab, pointer, script, or return from a descendant must literally concatenate `label + REGION_LABELS[type]` without trimming, semantic correction, or category deduplication and announce `提示：您已进入<名称与分类>，按下 Tab 键浏览信息；第 N 个，共 M 个`. Controller-owned focus suppresses its synchronous `focusin` duplicate but still announces once. Automatic mutation/reclassification recovery keeps that focus announcement suppressed. Focusing a descendant does not repeat the region instruction, and `RegionChangeEvent.label` remains the unmodified scanner-resolved label.
- When reading is enabled, ordinary focus speech must consult the region controller's exact-container predicate and skip recognized region containers so it cannot duplicate or overwrite the complete region instruction. This coordination must be correct regardless of `focusin` listener registration order; descendant element reading and the independent active-region highlight remain intact.
- Element speech resolves the first non-empty value in this fixed order: `data-a11y-label` > legacy `aria-readlabel` > `aria-label` > `aria-labelledby` > `title` > applicable `alt` (`img`, `area`, and image inputs) > form labels and value/current option or native/ARIA placeholder > a text selection contained by that same element > visible text. A selection elsewhere in the document must never override the focused or pointed element. Native elements and equivalent ARIA roles share the same formatting: new-window links `打开新窗口链接，<名称>`, links/areas `链接，<名称>`, images `图片，<描述>`, buttons (including button-like inputs) `按钮，<名称>`, text-entry inputs/textareas/contenteditable/textbox-searchbox-spinbutton roles `输入框：<名称、当前值或占位提示>`, checkboxes `复选框，<名称>`, radios `单选框，<名称>`, and selects/comboboxes/listboxes `下拉框，<名称或当前选项>`. An unnamed ARIA combobox/listbox resolves its current option from a valid `aria-activedescendant`, then from a descendant `role="option"[aria-selected="true"]`. Every other readable element uses `文本：<内容>`. Existing checked, pressed, expanded, selected, disabled, and current states append after the content; `aria-current="false"` is explicitly not current.
- While open, every host-page focus source (Tab, Shift+Tab, pointer, script, or region navigation) applies a reversible `2px solid #ffb800 !important` outline to the real focused node. Focus ownership also temporarily sets `box-shadow: none !important`, so a host blue focus shadow cannot form a second ring; toolbar-internal focus keeps the toolbar's own Shadow DOM treatment and must not receive page focus ownership.
- Reading retains the Shadow Root `.a11y-highlight` overlay. Active blind-path regions and current page focus instead use separate node-owned ledgers; clearing one owner must not clear the other or the reading overlay.
- While open, the region controller reconciles every visible recognized region into the native Tab sequence. Any region container whose current `tabIndex` is negative receives temporary `tabindex="0"`; its exact prior attribute value is restored when the region is no longer recognized, becomes invalid, or the tool closes/destroys.
- An explicitly classified `role="tabpanel"` that has a unique same-root `role="tab"` + `aria-controls` relationship remains in its category count and composed DOM order while host-hidden. It receives no region Tab anchor until visible. Category navigation requests visibility through the originating tab's configured host events, waits up to `tabs.panelReadyTimeoutMs`, and commits index/focus/speech only if the request is still current and the panel is truly visible; the tool never changes `data-a11y-hidden` itself.
- Ordinary Tab stops on the region container in DOM order before entering native focusable descendants. Focusing a recognized region or one of its descendants automatically activates that region; the container is yellow while focused, then uses the distinct high-contrast orange `#ff6c00` context outline while a descendant keeps the yellow focus outline.
- Category navigation focuses the same already-tab-enabled region anchors and keeps DOM-order wraparound. The tool must not infer focusability from static/readable tag names, trap Tab, or manufacture a custom descendant order. A visible non-native node with an explicit standalone interactive ARIA role may receive temporary `tabindex="0"` only when the author supplied no `tabindex`. Valid `role="tab"` options are handled separately: every option stays in sequential Tab order while other composite widget item roles remain owned by their widget's roving-focus model. The host remains responsible for each custom widget's Enter/Space/arrow-key behavior.
- The active-region outline and `aria-regionactive="true"` move when another region is selected and clear when focus leaves the composed region tree, the region becomes invalid, or focus returns to the toolbar. Open Shadow Roots and same-origin iframe documents count as part of the composed region tree; cross-origin content remains atomic.
- The initial region scan target is at most `100ms` on a representative visible 2000-node page in the supported Windows Chrome and Edge release browsers. This is a release-performance assertion rather than a public runtime guarantee for every host page; Firefox/WebKit functional projects do not decide this Chromium-specific timing gate. Mutation-driven rescans remain coalesced by the configured scanner delay and must not create observable input or scrolling stalls.
- Focus and region owners preserve original inline outline and `box-shadow` values plus `!important` priorities and restore them on focus change, region switch/exit, close, or destroy. Both owners suppress host box shadows while active. When both own the region container, restore focus first and region second; rebuild region first and focus second.
- Direct node outlines require no viewport geometry or scroll/resize repositioning and naturally follow open Shadow Root and same-origin iframe content. Captured scroll and relevant-window resize listeners continue only for the reading overlay.
- Standard tabs require `role="tablist"`, `role="tab"`, and an `aria-controls` ID reference. Every valid option receives reversible `tabindex="0"`, so Tab/Shift+Tab traverse options in DOM order and leave the group naturally at either end. `data-a11y-activation` and `data-a11y-trigger-event` are read only from each corresponding `role="tab"`; values on `role="tablist"` are ignored. Missing/invalid activation falls back to `tabs.defaultActivation`; missing/empty trigger events fall back to `tabs.triggerEvents`, then `click`, with whitespace splitting and deduplication. Tab or arrow focus uses the target option's mode, while Enter/Space uses the current option's mode. `role="tablist"` remains responsible only for standard grouping and orientation. Integrations explicitly add `data-a11y-region` to panels they want in blind-path navigation; the tool never classifies every `role="tabpanel"` automatically, and `regions.autoDetect: false` does not disable an explicit panel classification. For ordinary host `role="tabpanel"` elements and non-native floating panels, host events own visual state through the boolean `data-a11y-hidden` attribute and host CSS `[role="tabpanel"][data-a11y-hidden] { display: none; }`; these panels must not directly use native `hidden`. The tool only dispatches configured host events and reversibly synchronizes `aria-selected` / `aria-hidden`, so visual and accessibility state remain separate. Native `<dialog>` continues to use `showModal()`, `open`, and `close()`. Alt+Down panel entry and Escape return remain supported.
- Every exact focus of a valid `role="tab"`, whether caused by Tab, Shift+Tab, arrow navigation, pointer/script focus, or Escape return handling, is a dedicated speech target. Ordinary reading must skip valid tabs and their exact linked panel containers regardless of listener registration order. Except for the explicitly suppressed Escape return, a non-link option announces exactly `Tab，<名称>[，<区域分类>]，当前有浮动窗口，按 ALT+下键进入窗口`; an `<a role="tab" href>` announces exactly `链接：<名称>，Tab[，<区域分类>]，当前有浮动窗口，按 ALT+下键进入窗口`. No selected/unselected state is appended. The tab name uses the first non-empty `data-a11y-label` > `aria-readlabel` > `aria-label` > `aria-labelledby` > `title` > visible-text value. The optional category is `REGION_LABELS[type]` from the exact linked panel's live explicit `config` / `data` / `legacy` `ScannedRegion.type`; it never falls back to a semantic or containing region, and an unclassified panel omits the category. The scanned region's short label is never included, and the tab itself is never counted as another region.
- `Alt+ArrowDown` enters the linked panel after it becomes visible and focuses the panel container without changing descendant Tab order. Entry announces exactly `您已进入<选项名称><区域分类>标签面板，按 Tab 键遍历信息，按 Esc 键退出面板并返回<选项名称>选项`; the category comes from the linked panel's own live explicit region classification, not from the tab's containing region. If no descendant is currently tabbable, replace the traversal clause with `当前面板暂无可通过 Tab 遍历的信息` and never add `tabindex` to static descendants. When that panel is also a region container, Alt+Down suppresses the synchronous generic region-entry announcement so only the panel-specific message is spoken; ordinary region focus still uses the complete region instruction. Host activation may move focus into a panel descendant before the tool focuses the container, so the complete composed panel subtree is temporarily excluded from ordinary reading for the duration of that entry operation; after entry completes, descendants immediately resume ordinary semantic reading. `Escape` similarly owns a temporary exit suppression window before invoking host close behavior, so a host that proactively focuses the originating tab cannot emit the full tab message before the short return message. Concurrent entry/exit attempts for the same panel are ignored. Escape announces exactly `已返回<选项名称>选项` only after any required dialog close succeeds and the originating tab truly owns focus. A failed close or focus return must not announce success. Only modal dialogs trap Tab.
- Mutation observers batch page changes by `regions.mutationDebounceMs`; observers, reading listeners, pointer listeners, and shortcuts must be detached while closed.
- Theme customization is limited to typed `toolbar.theme` variables. Arbitrary CSS injection is not part of the API.
- Host-page content speech resolves language immediately before every effective request in this fixed order: target element `lang` > nearest valid composed-tree ancestor `lang` > the target owner document's `documentElement.lang` > optional saved preferred language > local text-script detection > active `locale`. The document root is reported as the document source rather than an ordinary ancestor. Open Shadow Root ancestry continues through its host; same-origin iframe content uses its own owner document and never guesses from the outer document.
- Every candidate is normalized before use. Replace `_` with `-`, prefer `Intl.getCanonicalLocales()` / `Intl.Locale`, and fall back to deterministic basic BCP 47 casing when `Intl` is missing or throws. Empty or malformed values plus primary languages `und` and `zxx` are unavailable and fall through. Failure always ends at the valid built-in `DEFAULT_CONFIG.locale` and never aborts speech.
- Text detection is synchronous, local, and dependency-free. Remove tool-authored semantic prefixes, then remove email addresses before generic URL/domain patterns so the URL pass cannot leave an email username behind. Ignore whitespace, numbers, punctuation, emoji, URLs, and email. Count dominant Han, Latin, Hiragana/Katakana, and Hangul signals; require at least two strong characters and a `>= 60%` winning score. Kana allows accompanying Han to count as Japanese; Han-only text falls back to Chinese by design. Ambiguous or unknown text produces no detection and uses the project default.
- Page-content speech uses the resolver result, while tool-authored region, tabs, toolbar, and status messages continue to use `activeConfig.locale`. A host page's `lang` must never change the language of built-in Chinese templates. `SpeechController` remains unaware of DOM and persistence; both browser and custom adapters receive the final normalized `SpeechRequestOptions.lang`.
- `BrowserSpeechAdapter` may receive an internal resolver for the current local voice. It assigns `SpeechSynthesisUtterance.voice` only when the freshly resolved native object has `localService === true`; a missing, stale, incompatible, or remote object leaves the property unset. Custom `SpeechAdapter` implementations remain source-neutral and are not given browser-native voice objects.
- Language is never permanently cached by `Element`. A changed own/ancestor/document `lang`, moved node, changed preferred language, or live `configure({ locale })` value must affect the next request. Duplicate-reading suppression includes the resolved language so the same target and text may be spoken again after its language context changes. No page text, detection result, or language-recognition request is uploaded or persisted.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Unsupported speech synthesis | Keep reading/rate controls focusable, set `aria-disabled="true"`, announce the reason, and do not enable reading. |
| Continuous start with unsupported speech | Keep the session idle, do not enable reading, emit no continuous start/stop event, and explain the unavailable capability only through the live region. |
| Continuous start with no eligible member | Preserve the start action's persisted `readingEnabled=true`, keep the session idle, emit no continuous start/stop event, leave focus unchanged, and announce `当前范围没有可朗读内容`. |
| Current continuous member becomes disconnected, hidden, ignored, sensitive, payment/OTP/password, empty, or moves behind an invalid slot/frame/host boundary | Invalidate/cancel the active utterance without `speechend` or `error`, clear its current provider/highlight, and continue from the next valid frozen member. |
| A current atomic member's label, description, option, or descendant becomes ignored/sensitive while other safe text remains | Cancel the old snapshot immediately and replay the sanitized same queue member; ordinary text changes that do not introduce a privacy boundary finish the committed utterance. |
| A label, `aria-labelledby`, `aria-describedby`, native label, active/selected option, or text fallback source is ignored/sensitive | Exclude that source before formatting. Preserve other safe sources or fall back to the control type; never concatenate the protected text through its owner. |
| Unsupported or denied fullscreen | Keep the control focusable and emit/announce a clear capability error; never emulate fullscreen. |
| Fullscreen exits through the browser or host page | Synchronize `isFullscreen`, `aria-pressed`, and the enter/exit fullscreen icon from the resulting `fullscreenchange` event. |
| Missing/duplicate tab or panel ID | Warn and skip that tab group; add a debug marker in debug mode; throw when `strict: true`. |
| Valid tab receives focus | Emit one complete dedicated tab message, skip generic reading and selection-state suffixes, and resolve only the containing scanned region category. |
| Linked panel has no tabbable descendant | Focus the panel container, use the no-traversable-information entry message, and leave every static descendant's `tabindex` untouched. |
| Host activation/close handler moves focus during panel entry or exit | Suppress generic/intermediate focus speech only for the active operation, emit the final entry/return message once, then restore normal descendant reading. |
| Escape close or origin-focus restoration fails | Keep the actual resulting focus/state and do not announce `已返回...选项`. |
| Invalid region or dialog selector | Emit `error`, skip only the invalid selector/component, and continue; throw when `strict: true`. |
| Invalid zoom target selector | Emit `error`, leave page zoom unapplied, and keep the rest of the tool running. |
| Unknown `data-a11y-region` / legacy value | Ignore the element as an explicit region, report once per value, and continue scanning. |
| Invalid public registration region, target, selector, tab/panel count mismatch, or conflicting pair | Warn only in debug mode, skip that item or conflicting pair as specified, preserve every other valid item, and never escalate through `strict`. |
| Registration handle disposed more than once | Treat every call after the first as a no-op. Preserve other live registrations and refresh the open runtime only for the effective first disposal. |
| Hidden, inert, or `aria-hidden="true"` region | Exclude it from counts and navigation, except an explicitly classified standard tab panel with a unique same-root originating tab; retain that panel in category order but not ordinary Tab order until host activation makes it visible. |
| Current region removed, hidden, or reclassified | Move to the next same-type region with wraparound; otherwise return focus to the category control. |
| Region container is the current focused element | Show only the yellow focus outline; the yellow owner overrides the underlying orange region owner. When reading is enabled, announce exactly one complete region-entry instruction. |
| Focus moves to a descendant of the active region | Restore the outer region to high-contrast orange `#ff6c00`, move the yellow focus outline to the descendant, and read only the descendant semantics without repeating the region instruction. |
| Focus leaves the active region or enters the toolbar | Restore the region's exact outline, `aria-regionactive`, and navigation scroll margin without changing the browser's native focus destination; keep its temporary region tab stop until the region becomes invalid or the tool closes. |
| Visible recognized region is added, removed, hidden, or reclassified | Reconcile region-container `tabindex="0"` ownership and restore the exact prior value for every element that leaves the recognized set. |
| Visible standalone ARIA control has no native focusability or author `tabindex` | Temporarily add `tabindex="0"`; restore it when the role is removed, the node becomes hidden/disabled/ignored, or the tool closes. Never auto-tab static `p`/`span`/heading/list/`img` content by tag name. |
| Focused page element is removed, hidden, or no longer focused | Release the yellow outline and restore the exact original inline values and priorities. |
| Host focus outline or blue focus `box-shadow` uses inline values or `!important` | Override it only while owned so no duplicate ring remains, then restore the exact original values and priorities. |
| Open Shadow Root or same-origin iframe gains focus | Resolve the deepest focused page element, exclude the toolbar composed tree, and apply the outline directly to that real node. |
| Corrupt, incompatible, or blocked localStorage | Do not throw; use validated defaults or the in-memory fallback. |
| Missing or invalid saved open intent | Preserve lazy loading: do not render, scan, or bind high-frequency listeners. Remove malformed/incompatible open-state payloads. |
| Automatic restoration fails | Catch the error, tear down incomplete runtime nodes, and clear the attempted/current open-intent keys so later pages do not repeat the failure. |
| Explicit `open()` fails | Reject normally, tear down incomplete runtime nodes, and leave no true open intent. |
| Automatic restoration races with explicit open/close | Serialize the pending open. Explicit open retains trigger/focus/announcement semantics; close waits for the pending restoration, then closes and clears intent. |
| `localStorage` is unavailable | Continue with in-page memory and no exception. Cross-refresh restoration is unavailable by design. |
| Stale speech callback after interruption | Ignore it; do not emit a false `error` or `speechend` for the canceled request. |
| Custom `SpeechAdapter.speak()` throws synchronously | Convert it into one effective public `error`, then continuous idle `statechange` and reason=`error` stop; ignore any callback retained by the throwing adapter. |
| Custom `SpeechAdapter.cancel()` throws synchronously | Contain the exception after invalidating the request so pause, stop, route, and lifecycle cleanup continue to their requested stable state. |
| Initial voice list is empty | Keep the voice settings usable and marked loading; refresh from the same catalog when `voiceschanged` arrives. |
| Voice list contains only remote, malformed, or language-incompatible entries | Expose no selectable local voice, keep automatic selection available, and leave `utterance.voice` unset. |
| Saved voice is absent after refresh, navigation, or device change | Try compatible `voiceURI`, then `name + normalized lang`, then a compatible native default; otherwise use the browser's default behavior without throwing or deleting valid sibling preferences. |
| Voice settings use a custom speech adapter or unsupported synthesis | Keep the toolbar entry focusable, explain that browser-local voice selection/preview is unavailable, and do not change the custom adapter contract. |
| Preview is repeated, panel/runtime closes, preferences reset, or runtime is destroyed | Cancel only the active preview request, remove catalog/panel listeners as applicable, and ignore every stale callback. |
| A voice-panel pointer event is retargeted through the production closed Shadow Root | The document listener ignores the owning Shadow Host, while a listener inside the owning Shadow Root distinguishes panel/anchor interaction from another toolbar control. Panel interaction stays open; a genuine outside interaction closes it. |
| The voice catalog refreshes while a radio option owns focus | Restore focus to the option with the same stable ID; if it disappeared, focus the checked fallback instead of dropping keyboard focus into the host page. |
| Empty, malformed, `und`, or `zxx` language candidate | Skip only that candidate and continue the fixed language priority without emitting a speech error. |
| `Intl` canonicalization is missing or throws | Use the small deterministic BCP 47 casing fallback; if that also fails, continue to the next candidate. |
| Optional saved preferred language is corrupt | Ignore only the language field, preserve every valid v0.1 preference field, and omit the invalid language on the next save. |
| Text has fewer than two strong characters, no 60% winner, or only ignored content | Return no detection and use the normalized project default language. |
| Target or ancestor `lang`, DOM ancestry, saved preference, or configured locale changes | Re-resolve on the next effective request; never reuse an element-cached result. |
| Page selection is outside the reading target | Ignore that selection and continue the target's documented name fallback; never read unrelated selected text. |
| Unnamed ARIA combobox/listbox has no valid active or selected option | Keep the semantic-only `下拉框` fallback; do not read an unrelated option or throw. |
| Cross-origin iframe | Never read its document; treat the iframe element as atomic only when explicitly configured or marked. |
| External code replaces `history.pushState` after open | Do not overwrite the newer integration when the tool stops. |

### 5. Good / Base / Bad Cases

- Good: a marked region contains native links and buttons; ordinary Tab first shows one yellow outline on the container, and the next Tab produces an orange outer region plus a yellow current descendant, with any host blue focus shadow suppressed. A public registration uses numeric regions and explicit tab/panel pairs, enters the same scanner/tabs pipeline exactly once, and restores every owned attribute through its handle. After an explicit open, a same-origin reload silently restores the toolbar without moving the page's current focus. An `en_US` target inside a Japanese ancestor and Korean iframe document speaks with normalized `en-US`, then immediately follows the next valid source when its own `lang` is removed.
- Base: an unmarked semantic page is conservatively detected (`nav`, named `form`, `article`, and explicit main/article ARIA roles), while a native `main` tag alone is not classified as a content region; ordinary page focus gets one yellow outline and the host outline returns after close. A missing registration selector is skipped while valid siblings in the same call still register. With no valid open intent, bundle import remains lazy. Unmarked dominant Latin text uses `en-US`; ambiguous mixed text safely uses the configured locale.
- Bad: sharing one mutation owner between region context and current focus corrupts restoration; using independent per-handle ledgers corrupts out-of-order registration disposal; copying tabs listeners or guessing a panel relationship creates duplicate behavior. Sharing the reading overlay with either focus state lets speech cleanup erase navigation context; intercepting Tab, auto-tabbing readable tags, overriding author `tabindex`, flattening composite widgets into multiple Tab stops, restoring before final pre-DOMContentLoaded configuration, or focusing/announcing during automatic restoration is forbidden. Language resolution must not use only `closest("[lang]")`, hard-code `zh-CN`, permanently cache by element, upload text, or let host language override tool-authored messages.
- Good (voice): an initially empty browser catalog remains loading, then a `voiceschanged` refresh exposes every compatible local language and voice. The UI persists only a descriptor, while the separate native resolver obtains the latest matching `SpeechSynthesisVoice` for each request and preserves panel/radio focus through refreshes.
- Base (voice): no compatible local voice, a missing saved descriptor, or a custom adapter leaves `utterance.voice` unset and keeps the existing speech path usable with an explicit status explanation.
- Bad (voice): caching a native voice, exposing a remote entry, typing runtime consumers to `BrowserLocalVoiceCatalog`, relying only on a document-level outside-click listener for a closed Shadow Root, or replacing a focused radio list without deterministic focus restoration is forbidden.

### 6. Tests Required

- Unit: config deep merge and immutable feature order.
- Unit: preference and independent open-state storage validation, optional preferred-language and voice-descriptor compatibility/isolation, version rejection, clear, and unavailable-storage fallback.
- Unit: successful open/close/destroy/reset intent lifecycle, disabled persistence, storage-key migration, failed-open cleanup, silent final-config restoration, and explicit-open/close races with pending restoration.
- Unit: accessible-name empty-value fallback and fixed priority, target-contained versus unrelated selections, area/image-input `alt`, unnamed ARIA select current-option fallback, native/equivalent-ARIA semantic prefixes including `输入框：`, generic `文本：` output, `aria-current="false"`, control state text, hidden content, and Shadow Root `aria-labelledby`.
- Unit: region source priority, numeric/English/legacy mapping, semantic-off mode, explicitly classified visible/hidden tab panels and source-tab name fallback in ordinary DOM/open Shadow Roots/same-origin iframes, safe history restoration, current-region wrap and reclassification recovery.
- Unit: public region registration covers codes 1-6, selector/Element targets, multi-match selectors, invalid-item isolation, labels entering the existing scanner/navigation speech, before/after-open refresh, overlapping handles, idempotent disposal, exact attribute restoration, and destroy cleanup.
- Unit: every visible recognized region receives a reversible Tab anchor; shortcut and ordinary/reverse/programmatic container focus announce the same instruction once; listener-order-independent reading coordination skips the container but reads descendants; reading overlay, active-region owner, and current-focus owner remain independent; region focus is yellow, descendant focus restores the region to orange, host box shadows stay suppressed while owned, and all values/priorities restore exactly.
- Unit: exact tab/link/no-region speech templates; every-focus announcements without selection states; scanned category lookup across ordinary DOM, open Shadow Roots, and same-origin iframe documents; listener-order-independent generic-reading suppression; per-option automatic/manual activation; trigger-event fallback/deduplication; shared/timeout-safe host activation for hidden panel regions; stale region-navigation suppression; host-owned `data-a11y-hidden` panels without native `hidden`; focusable/static panel entry using the panel's own category; host-driven intermediate focus during entry/exit; normal descendant reading after entry; concurrent-operation deduplication; successful and failed Escape return; and non-modal dialog focus behavior.
- Unit: public tab registration covers the flat signature, selector multi-match DOM-order pairing, count-mismatch isolation, direct-parent tablist inference and cross-parent splitting, conflicting-pair isolation, generated/reused IDs, per-tab behavior attributes, shared tab/panel region/name metadata, `data-a11y-hidden` without native `hidden` mutation, layered overlapping disposal, and destroy cleanup.
- Unit: interrupted speech must not emit stale errors.
- Unit: synchronous adapter `speak()` throw emits one error and leaves continuous reading idle with reason `error`; late callbacks remain inert. A throwing `cancel()` cannot block pause, stop, or `onCancel` cleanup.
- Unit: continuous sequence covers body/div/span bare text, open Shadow Roots, assigned and fallback slot text, same-origin iframes, live slot reassignment, current Text-node parent changes, and composed privacy/visibility boundaries without duplication.
- Unit: continuous privacy covers editable-value omission, password, captcha/security markers, case-insensitive section-token `cc-*`, `one-time-code`, arbitrary configured attribute/ID selectors, accessible-name/description/native-label/current-option sources, and sensitive/ignored descendants of text blocks and atomic controls.
- Unit: current privacy mutations cancel immediately while ordinary current text changes finish their snapshot; deleted/hidden/empty members skip, frozen indices may jump, and ordinary newly inserted nodes do not enter the active queue.
- Unit: valid tabs remain atomic while the visible linked panel is traversed by segment; hidden panels never enter the sequence or receive an activation request.
- Unit: continuous start fallback, page/dialog scopes, idempotent start/pause/resume/stop, reading-toggle integration, setting changes, interaction/dialog/route/lifecycle reasons, current-segment provider, and exact event payload/order are deterministic.
- Unit: browser-local voice catalog covers initial empty/synchronous lists, `voiceschanged`, local-only filtering, malformed/duplicate entries, exact and primary-language ordering, current-object re-resolution, capability snapshots, subscriber cleanup, `voiceURI` then `name + lang` recovery, compatible-default fallback, and no-match browser fallback.
- Unit: browser speech forwards only a freshly resolved local native voice; remote or stale matches remain unset. Repeated preview, close, reset, destroy, and current-request cancellation never let an older callback cancel or complete newer reading.
- Unit: language-tag normalization covers casing, underscores, script/region subtags, unavailable/malformed values, and `Intl` absence. Resolution covers all six priority levels, invalid-candidate fallthrough, open Shadow Root host ancestry, owner-document isolation, dynamic DOM/config/preference changes, and safe final fallback. Text detection covers Chinese, Latin, Japanese kana plus Han, Hangul, two-character/60% thresholds, semantic prefixes, URLs/domains/email preprocessing, Han-only ambiguity, and unknown/ignored content.
- Unit: hidden features must be consistent between main and read-screen toolbars.
- Unit: the brand rail stays `aria-hidden` and outside toolbar navigation; read-screen controls keep their exact order including shared `continuousReading` after `screenSound`, region counts remain independent from `ALT + 1` through `ALT + 6` metadata, `screenSound` uses the `朗读` name/status, and active read-screen mode exposes `当前模式`.
- Unit: current-region notifications set one `aria-current="location"` control, render `index + 1/count`, follow click/shortcut/page-focus navigation, refresh without extra public events, and clear on invalidation, toolbar return, close, and navigation reset.
- Unit: all switch icons follow their final pressed state, reading and read-screen sound share identical artwork, all five palettes are distinct, the rate indicator changes with its current value, direct rate activation covers the complete preset wrap plus non-preset values with no dialog semantics, voice selection remains a separate popup action between rate and color, closed-Shadow-Root pointer retargeting keeps panel interaction open while real outside interaction closes it, voice-list refresh preserves the same focused radio or the checked fallback, and zoom artwork stays fixed while its metadata changes; all SVG accessibility attributes remain intact.
- E2E: lazy open, fixed order, roving toolbar keyboard model, immediate pinned pointer-leave collapse with scroll-stable reveal-focus transfer in both main and read-screen modes, delayed keyboard focusout collapse, reveal/top-edge/shortcut expansion, persisted pinned + read-screen restoration, and collapse/expand visibility timing in normal and reduced-motion modes, plus zoom isolation, reset, and Fullscreen API.
- E2E: at 2048px, 1440px, and 1280px all 15 main controls stay on one row; the outer toolbar remains viewport-wide while the shared brand/control/track frame is exactly capped at 1280px, horizontally centered, and fully contains both the brand rail and exit control. At 1200px and 1024px the frame fills the available width, controls stay on one compact row, and keyboard navigation can still reach and invoke exit. Main/read-screen Host, root, toolbar, frame, body padding, and configured offset values remain equal across mode switches.
- E2E: default surfaces are transparent, active reading and pinning share the same accent treatment, exit uses danger treatment, speech rate has no persistent accent border, and keyboard-driven `:focus-visible` is high contrast and not the accent color.
- E2E: a current read-screen region and concurrently active binary main controls show the accent-filled node, background gap, accent outer ring, and center-expanding local segment; value/action controls and exit remain isolated, and reduced-motion removes the transitions.
- E2E: click, Enter, and Space directly cycle speech rate through the full preset wrap from exact and non-preset values without creating a dialog; state, persistence, icon, metadata, accessible name, live/synthesized announcement, focus, and pinned collapse remain synchronized. Switch and palette icon states stay synchronized through user actions, reset, persisted restoration, and browser-driven fullscreen exit; zoom percentages update without changing the fixed magnifier artwork; both crosshair axes use the default or configured danger color as pure `3px` lines with no border, outline, or shadow and do not accept pointer events.
- E2E: Chrome and Edge hostile-CSS coverage verifies the Shadow Host computes to `z-index: 2147483647` and remains above ordinary fixed page content at lower stacking levels.
- E2E: in Chrome and Edge, real document scrolling keeps the open toolbar Host at viewport `top: 0`; default push mode reserves the measured runtime toolbar height and restores the original page offset on exit, overlay never reserves space, and pin/collapse/expand never reintroduces push placement.
- E2E: explicit open followed by reload and same-origin navigation restores silently without focus theft; close followed by reload stays closed.
- E2E: six live region counts, DOM-order navigation, editable-field shortcut exclusion, dynamic add/hide/remove, recovery, and persistence.
- E2E: Tab, Shift+Tab, pointer, and script focus use one yellow real-node outline; host outline and blue focus-shadow treatments are overridden only while owned and restore across close/destroy/reopen.
- E2E: ordinary Tab reaches recognized region containers before their descendants; category selection uses the same anchors; native Tab shows orange region context plus yellow descendant focus; Shift+Tab returns through the region anchor; dynamic invalidation and close/destroy restore all temporary tab stops.
- E2E: Tab, Shift+Tab, arrow, script, Alt+ArrowDown, and Escape produce the exact single tab/panel/return live message; static panels gain no descendant tab stops; ordinary DOM, open Shadow Roots, and same-origin iframe tabs use their scanned region category.
- E2E: public registrations made before and after open immediately enter native region navigation; selector multi-match and Element targets restore through their own handles. Dynamically registered paired tabs use the existing Tab/Shift+Tab, original-event, Alt+Down, Escape, and hidden-panel region-shortcut pipeline exactly once, while overlapping handles preserve generated IDs and region counts until the final disposal.
- E2E: a deterministic custom speech adapter captures the final normalized `lang` for target, ancestor, document, saved-preference, local text, and project-default sources. Chrome and Edge cover dynamic `lang` removal, open Shadow Root host inheritance, same-origin iframe owner-document language, and ambiguous-text fallback without depending on installed operating-system voices.
- E2E: deterministic browser speech fixtures cover initial empty voices plus `voiceschanged`, local-only filtering, language changes, automatic/local selection, persisted restoration, actual `utterance.voice`, preview replacement, missing saved voices, custom-adapter unavailability, and listener cleanup. Chrome and Edge verify the 15-control order plus continuous/voice-panel keyboard entry, Escape/close/outside dismissal, focus return, forced-colors/reduced-motion behavior, and the absence of tool-originated remote speech requests or vendor configuration.
- E2E: Chrome and Edge run one continuous session across main/read-screen modes, verify focus preservation, pause replay, editable/reference privacy, generic and dynamic content, route/modal/disabled/lifecycle stops, stale-callback suppression, shared metadata, and zero tool-originated network requests.
- E2E: open Shadow Roots, same-origin iframes, strict CSP, scroll/resize, and forced-colors preserve direct-node outline ownership without focus/region geometry overlays.
- E2E: hostile CSS isolation, strict CSP external styles, closed production Shadow Root, semantic-off configuration, and no new serious/critical axe violations.
- E2E: Chrome and Edge create a visible 2000-node fixture before opening the tool, parse the first debug scan diagnostic, assert at least 50 recognized regions, and require the measured initial scan to be `<= 100ms`. Firefox and WebKit skip this timing assertion while retaining the full functional scanner suite.
- Cross-browser focus tests must use controls that participate in each engine's default sequential focus model instead of assuming Safari/WebKit focuses buttons on pointer click or includes unmodified links in Tab order. Inject a deterministic supported speech adapter when a test exercises speech-dependent controls, and skip forced-colors assertions only when the engine cannot expose that media emulation.
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
// Invalid region names and ambiguous selectors cannot define the public
// registration relationship.
AccessibilityTool.registerRegions([
  { target: "#news", region: "viewport" },
]);
AccessibilityTool.registerTabs([
  {
    tablist: "#news-tabs",
    items: [{ tab: ".tab", panel: ".panel", region: 1 }],
  },
]);

// Creates site-specific behavior outside the singleton/config contract.
document.querySelector(".toolbar").style.cssText = customCss;
```

```scss
// Lets the default toolbar scroll away and incorrectly ties viewport anchoring
// to the persisted pin/auto-collapse state.
:host { position: absolute !important; }
:host([data-a11y-tool-pinned]) { position: fixed !important; }
```

```ts
// One shared overlay lets reading cleanup erase blind-path context.
effects.setHighlight(activeRegion);

// Generic reading can cancel the complete region instruction and loses the
// requested semantic wording for links, images, controls, and plain text.
speech.speak(`文本：${element.textContent ?? ""}`, locale, rate);

// Ignores saved preference, text detection, Shadow hosts, normalization, and
// live language changes while duplicating a hard-coded fallback.
const language =
  element.closest("[lang]")?.getAttribute("lang") ?? "zh-CN";

// Reorders the host page instead of following its native focus model.
for (const [index, item] of descendants.entries()) {
  item.tabIndex = index + 1;
}

// Leaks the browser implementation through the catalog seam, caches a native
// object that may be replaced, and misclassifies closed-root panel clicks.
const catalog: BrowserLocalVoiceCatalog = createCatalog();
const cachedVoice = speechSynthesis.getVoices()[0];
document.addEventListener("pointerdown", (event) => {
  if (!event.composedPath().includes(voicePanel)) closeVoicePanel();
});
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
<section
  id="panel-home"
  role="tabpanel"
  data-a11y-region="viewport"
  aria-labelledby="tab-home"
>...</section>
<section
  id="panel-news"
  role="tabpanel"
  data-a11y-region="viewport"
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

const registration = AccessibilityTool.registerTabs([
  {
    tab: ".services-tab-hditem",
    panel: ".services-tabcut-bdcontent",
    region: 1,
    triggerEvent: "click",
  },
  {
    tab: "#news-tab",
    panel: "#news-panel",
    region: 1,
    triggerEvent: "click",
  },
]);

launcher.addEventListener("click", () => {
  void AccessibilityTool.open({ trigger: launcher });
});

registration.dispose();
```

```scss
// Viewport anchoring is unconditional; push versus overlay placement remains
// owned by the reversible page-effects controller.
:host {
  position: fixed !important;
  top: 0 !important;
}
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
  const text = getAccessibleText(element);
  const language = resolveSpeechLanguage({
    element,
    text,
    preferredLanguage: getPreferredLanguage(),
    projectDefault: activeConfig.locale,
  }).language;
  speech.speak(
    text,
    language,
    rate,
  );
}

// Keep the serializable catalog and native-object resolver as separate
// internal capabilities. Resolve the current native object per request, and
// classify closed-root pointer interaction inside the owning Shadow Root.
const { catalog, nativeVoiceResolver } = createBrowserLocalVoiceRuntime();
const descriptor = catalog.resolvePreference(savedVoice, language);
const nativeVoice = nativeVoiceResolver.resolveNativeVoice(
  savedVoice,
  language,
);
owningShadowRoot.addEventListener("pointerdown", classifyVoicePanelPointer, true);
```
