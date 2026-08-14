# Existing Voice Flow and Web Speech Constraints

## Scope of this research

This note maps the current repository speech path, toolbar constraints, persistence boundary, and the browser Web Speech API behavior that the voice-selection task must preserve.

## Files inspected

- `src/features/speech.ts`
- `src/features/language.ts`
- `src/features/reading.ts`
- `src/ui/toolbar.ts`
- `src/styles/accessibility-tool.scss`
- `src/core/storage.ts`
- `src/core/constants.ts`
- `src/tool.ts`
- `src/types.ts`
- `tests/unit/speech.test.ts`
- `tests/unit/storage.test.ts`
- `tests/unit/toolbar.test.ts`
- `tests/unit/tool.test.ts`
- `tests/e2e/language-detection.spec.ts`
- `tests/e2e/toolbar.spec.ts`
- `docs/api.md`
- `docs/compatibility.md`
- `docs/manual-testing.md`
- `.trellis/spec/frontend/accessibility-tool-contract.md`

## Current runtime flow

1. `AccessibilityTool.open()` loads the version-1 preference payload, normalizes the optional `preferredLanguage`, hydrates state, and creates the runtime controllers.
2. `ReadingController.speakElement()` derives accessible text and resolves a fresh normalized language for every effective request. It does not cache the language on the element.
3. `ReadingController` calls the single `SpeechController` with `{ text, lang, rate }`.
4. `SpeechController` cancels the previous request, increments a request identifier, and ignores stale callbacks from interrupted requests.
5. The default `BrowserSpeechAdapter` creates one `SpeechSynthesisUtterance`, sets `lang` and `rate`, and sends it through `speechSynthesis.speak()`.
6. A configured custom `SpeechAdapter` replaces only the adapter; the rest of the controller, event, cancellation, and reading path remains unchanged.

The voice feature therefore needs to add a selected native voice to this path rather than create another playback controller.

## Browser API findings

Primary references:

- MDN: `SpeechSynthesis.getVoices()` returns the voices currently available on the device and its example refreshes the list after `voiceschanged`.
- MDN: `voiceschanged` fires when the list returned by `getVoices()` changes.
- MDN: `SpeechSynthesisUtterance.voice` must be one of the current objects returned by `getVoices()`; if it is unset, the browser selects a suitable default using `utterance.lang`.
- MDN: `SpeechSynthesisVoice.localService` distinguishes a local synthesizer (`true`) from a remote service (`false`). Remote voices may involve latency, bandwidth, or cost.
- MDN: `SpeechSynthesisVoice.voiceURI` is a generic URI. It can identify a local or remote service and must not by itself be treated as proof that a voice is local.

Repository implications:

- Call `getVoices()` immediately, but treat an empty initial result as a loading/empty state rather than a permanent failure.
- Subscribe with `addEventListener("voiceschanged", ...)` while the runtime is active and remove the listener during teardown.
- Only expose voices with `localService === true`; this is required by the v0.2 local-only/privacy boundary.
- Store a serializable descriptor, never a `SpeechSynthesisVoice` object. Re-resolve the current object from the latest catalog before every effective speech request.
- Leave `utterance.voice` unset when no compatible local voice can be resolved so the browser retains its documented `lang`-based fallback.

## Language compatibility and ordering

The existing `normalizeLanguageTag()` function should remain the single normalization boundary.

Recommended compatible-voice order for a resolved speech language:

1. exact normalized language tag;
2. same normalized primary language;
3. no forced voice, allowing the browser to use its `lang`-based default.

Within compatible voices, use deterministic ordering:

1. exact language before primary-language fallback;
2. browser-marked default voice before other voices;
3. localized name comparison for a stable UI order.

Do not force a voice from a different primary language merely because it is the only installed local voice.

## Persisted identity

`voiceURI` is the best first lookup key available in the API, but the API does not promise that it is portable across browsers or devices. Voice names can also vary, so neither key is sufficient alone.

Recommended optional preference shape:

```ts
interface PersistedVoicePreference {
  voiceURI: string;
  name: string;
  lang: string;
}
```

Recommended restore algorithm:

1. find a compatible current local voice with the same non-empty `voiceURI`;
2. otherwise find one with the same `name` and normalized `lang`;
3. otherwise use the compatible browser-marked default;
4. otherwise leave `utterance.voice` unset.

Keep the unmatched saved descriptor instead of deleting it automatically. A later `voiceschanged` event can restore it if the browser initially returned an empty or partial list. Only an explicit user clear/reset removes it.

The version-1 preference payload already tolerates the optional `preferredLanguage` field. Add the voice descriptor as another independently validated optional field so old v0.1/v0.2 payloads stay valid and one corrupt optional field does not discard valid sibling preferences.

## Public adapter compatibility

Existing custom adapters implement `speak(text, options)`, `cancel()`, and `isSupported()`. The task must not make existing adapter implementations fail.

Recommended boundary:

- add only optional voice request data;
- keep `SpeechController` as the sole event and cancellation owner;
- apply the native `SpeechSynthesisVoice` only inside `BrowserSpeechAdapter`;
- mark the local voice UI unavailable when a custom adapter owns playback, because a browser voice selection cannot be guaranteed to affect that adapter.

## Toolbar and focus constraints

- `MAIN_FEATURE_ORDER` currently contains 13 fixed main controls.
- The desktop toolbar is a single row capped at 1200 px and has a compact 1024-1199 px mode with no scrolling or clipping.
- The current speech-rate control is contractually a direct action: click, Enter, and Space cycle the rate. Existing tests explicitly require no popup semantics on that button.
- `ToolbarUI` currently has no settings panel or dialog. Its roving arrow-key model operates on visible `[data-toolbar-item]` controls.
- The brand rail is presentation-only and cannot become a settings entry without breaking its current contract.

Feasible entry approaches:

### A. Compact secondary entry attached to the speech-rate slot

- Keep the existing speech-rate button and its direct action unchanged.
- Add a visually compact sibling button associated with the speech-rate slot that opens an anchored settings popover.
- Avoid allocating another full-width track control, preserving the 1024 px layout.
- The secondary button must have its own accessible name, keyboard reachability, and deterministic focus return.

Trade-off: the toolbar keyboard model must explicitly account for the compact secondary action without changing the primary feature order.

### B. New full-width `音色` main control

- Clear and discoverable.
- Adds a fourteenth full toolbar control and materially increases the risk of 1024 px clipping or smaller targets.

### C. Entry only from read-screen mode or a hidden shortcut

- Preserves main-mode width.
- Poor discoverability and makes a general speech setting depend on entering a specialized mode.

### User decision update (2026-08-05)

- The user selected approach B and fixed the order as `语速 → 音色 → 配色`.
- The shared frame maximum is increased from 1200 px to 1280 px, with an explicit ceiling of 1300 px.
- This width makes the desktop sizing viable: approximately `(1280 - 96) / 14 = 84.6 px` per control before small container padding, close to the previous `(1200 - 96) / 13 = 84.9 px` per control.
- 1200 px and 1024 px still require the compact full-width fallback and explicit no-wrap/no-clip verification.

## Proposed settings popover behavior

- Use an anchored non-modal `role="dialog"` labelled `语音设置`.
- Initial focus moves to the current language control or selected voice.
- Escape, the close button, explicit outside interaction, toolbar close, and `destroy()` close the popover and cancel any preview.
- Escape/close returns focus to the entry button when it is still connected.
- The popover includes:
  - a normalized language selector that writes `preferredLanguage`;
  - an `自动选择` option plus compatible local voices labelled with name and language;
  - a `试听` action;
  - a `清除偏好` action;
  - loading, no-compatible-local-voice, and custom-adapter unavailable states.

## Preview behavior

- Use a short fixed local phrase selected by normalized primary language, with a deterministic fallback phrase.
- Use the same `SpeechController` and current speech rate.
- Starting any preview cancels the previous preview or page-reading request through the existing request-id path.
- Repeated preview immediately restarts the one current preview request; no queued previews are allowed.
- Changing language/voice, closing the popover, closing the toolbar, resetting, or destroying cancels the current preview.
- Preview completion does not automatically resume an interrupted page-reading request.

## Failure matrix

| Condition | Required behavior |
| --- | --- |
| `getVoices()` initially returns `[]` | Keep the popover usable, show a loading/empty message, and refresh on `voiceschanged`. |
| Only remote voices are returned | Show no local voices and never assign a remote voice. |
| Saved voice is absent | Try layered matching; otherwise use a compatible default or leave the native voice unset. |
| Resolved page language changes | Re-resolve a compatible voice for the next request; never reuse an incompatible object. |
| Voice objects are replaced after `voiceschanged` | Resolve from the latest catalog; never retain the stale object. |
| Custom speech adapter is configured | Keep existing speech working and explain that browser-local voice selection is unavailable. |
| Speech synthesis is unsupported | Keep existing disabled/unavailable behavior without throwing. |
| Storage is blocked or corrupt | Continue with in-page memory and independently ignore invalid optional voice data. |
| Preview is interrupted | Ignore stale end/error callbacks through the existing request-id guard. |
| Popover entry disappears after config/reopen | Close safely and do not attempt focus return to a disconnected element. |

## Test seams already available

- Unit tests can stub `speechSynthesis.getVoices()`, `addEventListener`, `removeEventListener`, and deterministic voice objects.
- Existing `SpeechController` tests already cover stale callback suppression and should be extended to verify voice forwarding.
- Storage tests already exercise optional-field isolation and version-1 compatibility.
- Toolbar tests already inspect Shadow DOM, main feature order, roving navigation, metadata, and popup semantics.
- E2E language tests demonstrate deterministic speech capture with injected adapters. Voice E2E should instead inject a deterministic native `speechSynthesis` fixture so it can assert actual `utterance.voice` assignment without depending on operating-system voices.
