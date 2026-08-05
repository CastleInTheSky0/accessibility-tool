# Existing runtime integration notes

## Public API and lifecycle

- `AccessibilityToolRuntime` directly implements `AccessibilityToolApi`; the singleton is exported from `src/tool.ts`, assigned to `window.AccessibilityTool`, and re-exported as the ESM default from `src/index.ts`.
- Runtime nodes, scanner, region navigation and tabs controllers only exist while the tool has been opened at least once. Public registration therefore needs a separate always-available state holder so attributes can be written before `open()`.
- `refresh()` synchronously scans while open. The scanner callback updates region navigation and starts or refreshes the single tabs controller.
- `close()` stops live enhancements but retains the runtime instance. `destroy()` tears down all nodes and is the required boundary for automatically disposing outstanding registrations.

## Region pipeline

- Region values already map numeric and English aliases through `REGION_ALIASES`; DOM output for this feature must deliberately use numeric strings.
- Scanner label resolution already owns `data-a11y-label`, legacy/name attributes, linked-tab names, headings and category fallback. Registration should feed this protocol instead of adding a second name resolver.
- Region navigation consumes scanner results, owns reversible region tab stops, produces exact region entry speech and handles hidden linked panels through `TabsController.requestPanelVisibility()`.
- A registered tab must carry `data-a11y-region` per the new API contract but cannot be returned as a second `ScannedRegion`, otherwise focus would produce both a region-entry announcement and the dedicated tab announcement. An internal registration lookup can skip only API-registered tabs while preserving legacy HTML behavior.

## Tabs pipeline

- `TabsController` discovers standard `role=tablist` / `role=tab` / `aria-controls` markup and already owns root listeners, Tab/Shift+Tab behavior, arrows, Enter/Space, configured host events, Alt+Down, Esc and dedicated speech.
- It intentionally reads `data-a11y-activation` and `data-a11y-trigger-event` from each tab only, and it never uses native `hidden` for ordinary panels.
- Existing defaults are `automatic` activation and `click` trigger events. Trigger values are whitespace-split and deduplicated, with an ultimate `click` fallback.
- The controller has a single `DomLedger` for reversible ARIA/tabindex/temporary ID changes. Registration removal while open must release ledger snapshots for the affected list/tab/panel elements before restoring registration-owned attributes, then run the normal refresh pipeline.

## DOM restoration

- `DomLedger` accurately distinguishes a missing attribute (`null`) from an empty or non-empty value, but currently restores only the entire ledger.
- Independent ledgers are insufficient for overlapping registrations: disposing an earlier registration can overwrite a later one, and disposing the later one can resurrect the earlier value.
- A compatible extension is to add per-attribute and per-element restore methods, then keep one registration ledger plus an owner stack per `(Element, attribute)`.

## Test and documentation impact

- Unit coverage belongs in a focused registration test plus small ledger/tabs/scanner regression assertions.
- E2E can create fixtures dynamically and call the new global methods, avoiding changes to the user's dirty `public/index.html`.
- Existing documentation locations already own API, attribute protocol, quick start and runtime contract content; no additional public document is needed.
