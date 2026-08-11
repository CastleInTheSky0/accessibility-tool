# Continuous reading region-transition options

## Existing region speech contract

- The full region instruction is tied to actual focus on a recognized region container and includes `按下 Tab 键浏览信息` plus category index/count.
- Continuous reading does not move keyboard focus, so emitting that exact instruction during automatic traversal would describe an action that did not occur.
- Regions can be nested, semantically detected, explicitly marked, or absent. Their short label may duplicate the first visible heading.
- Continuous reading follows one composed-tree document order rather than grouping by region category.

## Option A: seamless DOM continuation with silent region context (recommended)

- Continue from the last eligible segment of one region to the next eligible segment in composed-tree order without inserting a synthetic region utterance.
- Preserve optional containing-region type/label in the internal current-segment context and minimal public segment metadata for future UI/caption use.
- Actual region focus/navigation continues to own the full region instruction.

Advantages:

- No false focus/navigation message or duplicated heading/label.
- Nested and unmarked content follow one consistent rule.
- Keeps continuous reading focused on page content.

Trade-off:

- Audio alone does not always announce that a structural region boundary was crossed.

## Option B: insert a short boundary announcement

- When the nearest containing region changes, insert a tool-authored message such as `进入要闻视窗区` before the next content segment.

Advantages:

- Provides explicit structural orientation.

Trade-offs:

- May duplicate headings and become noisy on nested/densely marked pages.
- Requires deterministic precedence when several nested regions change at once.

## Option C: pause at each region boundary

- Finish the current region, pause, and require Continue to enter the next region.

Advantages:

- Strong user control over long pages.

Trade-off:

- Makes ordinary continuous reading fragmented and action-heavy.

## Recommendation

Choose Option A. Region navigation already provides explicit structural speech when requested; continuous reading should preserve document flow and expose region context as state rather than extra audio.
