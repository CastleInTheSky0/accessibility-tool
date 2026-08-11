# Continuous reading runtime flow research

## Baseline

- Branch: `feat/accessibility-tool-v0.2`
- Baseline commit inspected: `c8f8936`
- Runtime dependencies: zero
- Existing supported speech path: `ReadingController -> SpeechController -> SpeechAdapter`
- Existing dynamic-content path: `RegionScanner -> AccessibilityToolRuntime -> reading / region navigation / tabs`

## Existing request and lifecycle flow

```text
focus / pointer / click
  -> ReadingController.speakElement()
  -> getAccessibleText() + resolveSpeechLanguage()
  -> SpeechController.speak()
  -> current SpeechAdapter
  -> speechstart / speechend / error
```

- `SpeechController` is already the single request-validity boundary. Every new request and every `cancel()` increments `requestId`, so stale start/end/error callbacks cannot mutate current state.
- `SpeechController.speak()` cancels the previous request first and exposes request-scoped `onEnd`, `onError`, and `onCancel` callbacks.
- `SpeechAdapter` intentionally exposes only `speak()`, `cancel()`, and synchronous `isSupported()`. It has no portable pause/resume capability.
- `BrowserSpeechAdapter` resolves the latest compatible local voice for every utterance. Continuous reading must continue to submit one ordinary request per segment so language and voice are re-resolved per segment.
- Runtime route callbacks already cancel current speech and reading. `close()` and `teardownRuntimeNodes()` stop reading before controllers and DOM nodes are released. `destroy()` uses the same cleanup path.

## Reading controller findings

- `ReadingController` owns page focus, pointer, click, hover-delay, reading highlight, duplicate suppression, language resolution, and the existing sensitive-selector exclusions.
- Region containers and valid tab/panel speech targets are deliberately excluded from generic single-target reading because their controllers own exact announcements.
- The controller already receives the scanner roots, but it does not expose a page-reading sequence or a stable last page focus.
- Activating a toolbar control moves focus into the toolbar Shadow Root. Therefore a continuous-reading start action cannot reliably use `document.activeElement` at click time; the runtime must retain the last eligible page focus/target or receive it from an existing page-focus owner.
- The reading highlight is visually independent from the page-focus and current-region outlines. Continuous reading can reuse that reading highlight without stealing keyboard focus.

## DOM, regions, tabs, and dialogs

- `RegionScanner` discovers the document, open Shadow Roots, same-origin iframe documents, and configured additional roots. It rescans after coalesced mutations and route events.
- Scanner roots are discovery boundaries, not a ready-made composed reading order. Concatenating `querySelectorAll()` results root-by-root would move Shadow Root or iframe content out of its host position. Continuous reading needs a composed-tree traversal that enters an open Shadow Root or same-origin iframe at the host element's position.
- `RegionNavigationController` owns current region selection, region Tab anchors, region announcements, and dynamic recovery. Continuous reading should consume region context but must not imitate category navigation or emit its full focus instruction when focus did not enter the region.
- `TabsController` already knows which tabs and linked panels own dedicated speech, whether a panel is visible, and how modal dialogs are entered/closed. Continuous reading must not activate inactive tabs merely to discover content.
- Hidden, inert, `aria-hidden="true"`, `data-a11y-hidden`, disconnected, tool-owned, ignored, and sensitive nodes can be rejected with the existing DOM predicates plus the existing speech exclusion list.

## State and event implications

- A continuous session needs a generation independent from the speech request ID. The session generation invalidates the queue, pending advancement, mutation reconciliation, and route/dialog callbacks; `SpeechController.requestId` continues to invalidate the active utterance callbacks.
- The minimum internal session state is `idle | playing | paused`, plus the current segment, generation, and remaining sequence.
- The current segment must be the only internal source for the later large-caption feature. A caption must not infer text from DOM focus or create another queue.
- Existing public `speechstart` only exposes `textLength`. Continuous reading needs distinct public lifecycle events for session start, segment change, pause, resume, and stop, while the full current text can remain in an internal provider for captions.

## Recommended implementation boundaries

1. Extend the existing reading layer with continuous-session orchestration; do not add another speech adapter or bypass `SpeechController`.
2. Keep one request per readable segment. Resolve text, language, rate, and current local voice immediately before each request.
3. Implement pause deterministically as cancel-current-request plus saved segment/resume position. Resume replays the interrupted segment from its beginning, avoiding browser-global `speechSynthesis.pause()` inconsistencies and preserving custom-adapter compatibility.
4. Do not move keyboard focus while auto-advancing. Move only the existing reading highlight and scroll the active segment into view with reduced-motion-safe behavior.
5. Revalidate every queued element immediately before speech. Disconnected, hidden, ignored, sensitive, or empty elements are skipped without an error.
6. Route changes, `close()`, `reset()`, `destroy()`, disabling reading, and any newer explicit speech/session request invalidate the active continuous generation before canceling speech.

## Files likely affected after PRD approval

- `src/features/reading.ts`
- `src/features/speech.ts`
- `src/core/dom.ts`
- `src/tool.ts`
- `src/types.ts`
- `src/core/constants.ts`
- `src/ui/toolbar.ts`
- `src/styles/accessibility-tool.scss`
- unit and E2E suites for reading, speech, tool, toolbar, regions, tabs, and lifecycle
- README/API/compatibility/manual-testing/runtime contract documentation
