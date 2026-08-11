# Continuous reading sequence and start options

## Interaction patterns considered

The repo constraints align with three established read-aloud patterns:

1. **Context-first reading**: start from an explicit selection/caret/focus when one exists, otherwise fall back to the beginning.
2. **Document-order reading**: follow rendered source/composed-tree order instead of inventing a category order or rewriting `tabindex`.
3. **Non-focus-stealing playback**: visual reading position advances independently while keyboard focus remains under user control; an explicit user focus/click/navigation action takes priority over automation.

These patterns fit the existing focus, blind-path region, and speech ownership model better than automatically moving focus for every segment.

## Default start approaches

### A. Last eligible page focus first (recommended)

Order:

1. Last connected, visible, readable page focus/target retained before focus enters the toolbar.
2. If unavailable, the first readable descendant of the current visible blind-path region.
3. If unavailable, the first readable segment in composed page order.

Advantages:

- Matches the user's immediate context.
- Starting from a toolbar button still works because the page target is retained before toolbar focus.
- Provides deterministic fallbacks for body/tool focus, removed nodes, and non-readable containers.

Trade-off:

- Requires explicit last-page-target tracking; `document.activeElement` alone is insufficient with a closed Shadow Root toolbar.

### B. Current blind-path region first

Start at the first readable descendant of the current region, then fall back to page start.

Advantages:

- Strong alignment with the six-category blind-path navigation model.
- Predictable after the user explicitly chooses a region.

Trade-off:

- Discards a more precise focused descendant and is less useful outside marked/semantic regions.

### C. Always start from the page beginning

Start at the first eligible segment in composed page order.

Advantages:

- Simplest mental model and implementation.

Trade-off:

- Repeated use on long pages is inefficient and ignores current user context.

## Reading order recommendation

- Use a composed-tree depth-first order: light DOM in source order, entering an open Shadow Root or same-origin iframe at its host position.
- Do not reorder content by the six region categories. When the sequence leaves one region, continue to the next eligible segment in composed document order, including unregioned content.
- Region containers are structural context, not continuous-reading speech segments. The full region-focus instruction remains owned by actual region focus/navigation.
- Only the currently visible tab panel or dialog context contributes content. Inactive/hidden panels are skipped and are never auto-activated.
- Treat interactive controls and media alternatives as atomic segments. Text containers should avoid repeating the same descendant text; exact atomization belongs in a shared sequence builder with unit fixtures for nested links, lists, tables, labels, and controls.

## Dynamic DOM recommendation

- Build a stable sequence for the current session, then revalidate each segment immediately before it is spoken.
- Removed/hidden/ignored/sensitive/empty queued nodes are skipped.
- Newly inserted ordinary content is not injected into the current session; it is included on the next start. This prevents live feeds or infinite scroll from extending playback indefinitely.
- A route change always stops the session. Modal/dialog context changes are handled as an explicit context decision rather than ordinary mutation.

## Focus and scrolling recommendation

- Starting and auto-advancing do not move keyboard focus.
- The reading highlight follows the current segment, and the segment scrolls into view using `auto` when reduced motion is requested and restrained smooth behavior otherwise.
- Manual focus, click, tab activation, region navigation, or another explicit speech action must have a single documented priority rule so two speech streams cannot coexist.
