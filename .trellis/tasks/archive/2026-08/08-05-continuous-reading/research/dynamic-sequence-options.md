# Continuous reading dynamic sequence options

## Existing constraints

- `RegionScanner` coalesces page mutations and can notify the reading layer after DOM/visibility/context changes.
- Every queued element must still be revalidated immediately before speech because a node can change again between scanner updates.
- Infinite scroll, live feeds, timers, and framework hydration can continuously append content.
- Existing element text, language ancestry, visibility, and sensitive/ignore status are already designed to be resolved at request time rather than cached.

## Option A: stable membership with live revalidation (recommended)

- Capture the eligible sequence membership when the session starts.
- Before each segment, re-resolve current text/language and skip nodes that are disconnected, hidden, ignored, sensitive, or empty.
- Text or attributes changed on an existing queued node are reflected when that node is reached.
- Ordinary newly inserted nodes are not added to the current session; they appear on the next start.

Advantages:

- A session has a finite, predictable end.
- Live feeds and infinite scroll cannot extend playback indefinitely.
- Deletions and safety changes are still handled immediately.

Trade-off:

- New content added after start waits for the next session.

## Option B: insert new nodes after the current position

- On every mutation scan, merge newly eligible nodes that occur after the current segment into the remaining queue.

Advantages:

- More closely follows live page updates.

Trade-offs:

- Infinite feeds may never finish.
- Reordering and framework replacement make deduplication and “already read” identity complex.

## Option C: stop on structural mutation

- Any relevant add/remove/reorder stops the session and asks the user to restart.

Advantages:

- No ambiguity about a changed page.

Trade-off:

- Modern pages mutate frequently for unrelated reasons, causing excessive interruption.

## Recommendation

Choose Option A. It combines a finite user-visible session with live safety and text/language correctness.
