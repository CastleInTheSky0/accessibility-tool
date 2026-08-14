# AccessibilityTool v0.2 existing dependency research

## Baseline

- Branch: `feat/accessibility-tool-v0.2`
- Commit: `2bc1930`
- Runtime dependencies: zero
- Desktop layout contract: 1024px and above, one-row toolbar

## Existing speech flow

```text
DOM focus / pointer / click
  → ReadingController
  → getAccessibleText + getElementLanguage
  → SpeechController
  → BrowserSpeechAdapter
  → SpeechSynthesisUtterance
```

- `getElementLanguage()` checks the closest `[lang]`, then the owner document root, then hard-codes `zh-CN`.
- `SpeechController` owns request invalidation and suppresses stale end/error callbacks.
- `BrowserSpeechAdapter` already accepts `SpeechRequestOptions.lang` and assigns it to `utterance.lang`.
- `speechstart` currently exposes only `textLength`; `speechend` has no payload.

## Existing preference flow

- `PreferenceStore` persists one versioned `PersistedPreferences` payload.
- Speech rate and reading enabled state are already hydrated and saved through `AccessibilityToolRuntime`.
- There is no saved language or voice preference yet.
- `config.locale` currently serves both tool feedback locale and speech fallback language.

## Existing dynamic/lifecycle flow

- `ReadingController` resolves the target when focus, pointer or click occurs.
- `RegionScanner` refreshes on mutation and route changes.
- Route changes cancel current speech and reading.
- `close()` stops reading and speech but preserves registered DOM metadata.
- `destroy()` tears down all runtime nodes, listeners and registrations.

## Dependency conclusions

1. Language resolution is the first reusable speech primitive and can land without UI changes.
2. Voice selection must consume normalized resolved languages, so it follows language detection.
3. Continuous reading must reuse request invalidation and scanner roots; it should not build a parallel speech adapter.
4. Captions need the effective spoken text and request lifecycle, so they follow the continuous-reading contract work.
5. Mobile/tablet layouts should wait until all new controls and overlays are known, then pass their explicit design gates.

## Risks

- Extending the persisted preference payload must continue to accept v0.1 payloads.
- Tool-authored Chinese announcements and host-page content need separate language semantics.
- Mixed-language text can only use one `SpeechSynthesisUtterance.lang` per utterance unless future continuous reading splits segments.
- Browser voices vary by platform; language resolution must not promise a voice exists.
