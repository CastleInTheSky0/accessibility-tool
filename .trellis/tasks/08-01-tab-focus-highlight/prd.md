# Tab Focus Highlight

## Goal

When the accessibility tool is open, make focus and blind-path context easy to locate with two coordinated, isolated indicators: an orange indicator for the current page focus and a distinct high-contrast indicator that remains around the active blind-path region while focus moves through its descendants.

## What I already know

- The highlight is active only while the accessibility tool is open.
- Tab and Shift+Tab continue to use the browser's native focus order.
- The currently focused page node receives the highlight; the previous node loses it.
- The project already isolates toolbar styles in a Shadow Root and must clean up page-side effects on close or destroy.
- The toolbar already has its own orange focus treatment.
- Reading and blind-path navigation share an existing `.a11y-highlight` overlay, so the persistent focus indicator needs an independent overlay to avoid being cleared when speech ends or region navigation resets.

## Confirmed Product Decisions

- "Page node" means focusable content in the host document, excluding controls rendered inside the accessibility toolbar.
- The orange highlight supplements native focus behavior and must not change `tabindex`, focus order, or activation behavior.
- The implementation should resist host-page CSS conflicts and remain visible near viewport edges.
- The indicator follows every host-page focus change, including Tab, Shift+Tab, blind-path navigation, programmatic focus, and mouse-initiated focus.
- The active blind-path region uses a separate cyan/black/white high-contrast frame so it is visually distinct from the orange current-focus frame.
- When the region container itself first receives focus, show only the region frame; after Tab enters a descendant, keep the region frame and show the orange frame around the descendant.
- The blue-and-orange double frame currently seen on the demo is the host page's native blue `:focus-visible` outline plus the tool's orange overlay. While the tool owns the isolated focus indicator, the host outline must be suppressed reversibly so only one current-focus color is shown.

## Requirements (evolving)

- Track focus changes while the tool is open.
- Respond to all host-page focus sources rather than trying to infer the input modality.
- Show an orange visual indicator around the currently focused host-page element.
- Follow both forward and reverse keyboard focus navigation.
- Remove the previous indicator immediately when focus changes.
- Remove all listeners and visual artifacts on close or destroy.
- Do not mutate host-page focus order or activation semantics.
- Keep toolbar controls on their existing Shadow DOM focus treatment rather than drawing a second page-level indicator around them.
- Reposition the indicator when the focused element moves because of scrolling or viewport resizing.
- Hide the indicator when the focused element is disconnected, becomes non-rendered, or focus leaves the page content.
- Give blind-path regions an overlay independent from both current focus and reading highlights.
- Selecting a blind-path category focuses the selected region and shows its high-contrast region frame.
- Pressing Tab from the focused region follows the browser's native DOM order into focusable descendants; Shift+Tab follows the native reverse order.
- While focus remains inside the selected region, keep the outer region frame visible and move only the orange current-focus frame.
- When focus leaves the region, the region is removed, or another region is selected, clear or move the region frame accordingly.
- Do not trap focus or add descendant `tabindex` values to manufacture a custom sequence.

## Acceptance Criteria (evolving)

- [ ] Opening the tool enables host-page focus highlighting.
- [ ] Pressing Tab moves focus normally and highlights only the newly focused page element.
- [ ] Pressing Shift+Tab updates the highlight in reverse focus order.
- [ ] Programmatic focus and mouse-initiated focus update the same indicator.
- [ ] The highlight is orange and clearly visible without changing layout.
- [ ] The focused page node shows a single orange focus treatment rather than the host page's blue outline plus the orange overlay.
- [ ] Toolbar-internal controls retain their existing focus treatment.
- [ ] Closing or destroying the tool removes the indicator and related listeners.
- [ ] Unit and browser tests cover activation, focus movement, exclusion, and cleanup.
- [ ] Selecting a blind-path region shows only a distinct high-contrast region frame around the region container.
- [ ] Tab enters focusable descendants in native DOM order; the region frame remains while the orange frame follows the current descendant.
- [ ] Leaving the active region removes its frame without altering the page's native focus destination.

## Definition of Done

- Tests added or updated.
- `pnpm typecheck`, `pnpm lint`, relevant unit tests, build, and relevant E2E tests pass.
- Runtime contract documentation is updated if this introduces a durable lifecycle rule.

## Out of Scope

- Changing native tab order or adding focusability to otherwise non-focusable nodes.
- Mouse-hover highlighting.
- Mobile-specific focus presentation.
- A user-facing color or thickness setting in this version.
- Highlighting elements inside cross-origin iframes.

## Technical Notes

- Likely touchpoints: `src/features/page-effects.ts`, `src/ui/toolbar.ts`, `src/styles/accessibility-tool.scss`, and unit/E2E coverage.
- Add dedicated fixed-position, pointer-transparent focus and region overlays inside the existing closed Shadow Root. This avoids host layout changes and host CSS conflicts while reusing the current global-rectangle handling for same-origin nested contexts.
- Keep reading, active-region, and current-focus overlays as separate responsibilities so one lifecycle cannot clear or reposition another.
- Temporarily activate a document-level focus-outline suppression rule only while the tool's page-focus indicator is active; remove it during close/destroy so the host page's original focus presentation returns unchanged.
- The focus path is: host-page focus event -> page effects lifecycle -> toolbar overlay position -> isolated SCSS presentation.
- Future configurability of focus color/thickness is intentionally deferred; the MVP uses the existing theme accent and a fixed accessible treatment.

## Decision (ADR-lite, provisional)

**Context**: Host-page focus rules can either suppress the tool or produce duplicate blue/orange frames, while sharing one overlay among reading, blind-path context, and current focus creates lifecycle conflicts.

**Decision**: Use independent reading, active-region, and current-focus overlays owned by the toolbar Shadow Root. The active region uses a cyan high-contrast treatment; current focus uses orange; the host outline is reversibly suppressed while the tool's focus overlay is active.

**Consequences**: The indicators are isolated and do not shift layout, but they must be repositioned on focus, scroll, and resize, coordinate when the region itself has focus, and be explicitly hidden during teardown.

## Implementation Plan

1. Add dedicated focus and active-region overlays and positioning APIs to the isolated toolbar UI.
2. Split blind-path highlighting from the existing reading highlight and bind host-page focus tracking through the page-effects lifecycle.
3. Preserve native Tab order through region descendants, coordinate the two visible layers, and suppress duplicate host outlines reversibly.
4. Add unit and browser coverage for focus sources, region entry/exit, toolbar exclusion, movement, and cleanup.
