# Continuous reading interaction takeover options

## Existing behavior that constrains the choice

- Page focus, pointer, and click currently call `ReadingController.speakElement()`.
- Tab and region navigation own dedicated announcements and cancel generic reading before speaking.
- `SpeechController.speak()` always cancels the current request first, so allowing a manual target to speak necessarily interrupts the active continuous segment.
- The product must define what happens to the continuous session after that interruption; otherwise an old `onEnd`/resume callback can restart automation after the user has taken control.

## Option A: stop the continuous session (recommended)

- Manual page focus, click, tab activation, region navigation, or another explicit page-speech request ends the continuous session with reason `interaction`.
- The existing single-target, tab, or region announcement then runs normally.
- Starting again uses the confirmed current-focus-first start chain, so the new user location naturally becomes the next starting point.

Advantages:

- One clear owner at all times and no unexpected automatic restart.
- Matches the user's explicit interaction taking priority over automation.
- Reuses current cancellation flow and is easiest to explain, test, and recover from.

Trade-off:

- The user must activate continuous reading again after exploring another target.

## Option B: pause and update the resume point

- Manual interaction cancels the current segment, marks the session paused, and moves its resume point to the newly targeted element.
- The manual target announcement runs once; the user presses continue to resume from that target.

Advantages:

- Preserves continuous-reading intent without automatic restart.

Trade-offs:

- Focus caused by scripts, dialogs, or host controls may unexpectedly rewrite the resume point.
- The meaning of “continue” changes from replaying the interrupted segment to jumping elsewhere.

## Option C: jump and continue automatically

- Manual interaction rebuilds the queue from the new target and continues after its announcement.

Advantages:

- Minimal extra input for users who intentionally redirect playback.

Trade-offs:

- A routine click, Tab, or script focus can unexpectedly launch long-form playback.
- Harder to distinguish user exploration from a request to redirect the queue.

## Recommendation

Choose Option A. It is the most predictable accessibility behavior, keeps manual interaction authoritative, and pairs naturally with the already confirmed current-focus-first restart rule.
