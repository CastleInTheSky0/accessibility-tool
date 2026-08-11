# Continuous reading speech-setting changes

## Existing constraints

- A `SpeechSynthesisUtterance` receives its rate, language, and voice before playback; those values cannot be portably changed mid-utterance.
- Continuous reading already plans one ordinary `SpeechController` request per segment, so each next segment naturally re-resolves current rate, language preference, and local voice.
- The existing speech-rate action currently synthesizes its own confirmation. During continuous playback that confirmation would cancel the active segment unless it becomes live-region-only for the session.
- Voice selection and preferred-language changes already retain serializable preferences and re-resolve the current native voice per new request.
- Voice preview is itself an explicit speech request and cannot coexist with the active continuous segment.

## Option A: apply changes from the next segment (recommended)

- Let the current segment finish with the values it started with.
- The next segment uses the updated rate, preferred language, and local voice.
- While a continuous session is playing, setting confirmations use the live region only and do not inject a synthesized message between segments.
- Voice preview remains an explicit takeover and stops the continuous session before previewing.

Advantages:

- No repeated text or abrupt cancellation.
- Reuses the existing per-request language/voice resolution exactly as designed.
- Easy to explain: “current paragraph finishes; the new setting starts with the next paragraph.”

Trade-off:

- A long current segment does not reflect the new setting immediately.

## Option B: cancel and replay the current segment

- Setting changes cancel the active segment and replay it from the beginning with new values.

Advantages:

- The new setting is heard immediately.

Trade-offs:

- Repeats part or all of the current segment.
- Rapid adjustments repeatedly restart the same text.

## Option C: stop the session

- Any rate/language/voice change stops continuous reading; the user must start again.

Advantages:

- Simplest request ownership.

Trade-off:

- Makes ordinary speech customization unnecessarily disruptive.

## Recommendation

Choose Option A. Segment boundaries are the stable portability boundary for browser and custom adapters.
