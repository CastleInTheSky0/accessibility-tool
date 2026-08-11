# Continuous reading session finish options

## Constraints

- Auto-advancing does not move keyboard focus, so completion should not introduce a new focus move without a strong reason.
- The reading highlight represents only the active spoken segment. Keeping it after speech ends would blur the distinction between active and historical state.
- The later caption feature needs the active current segment to become `null` when speech is no longer effective; the caption task can separately decide whether its presentation temporarily retains a visual copy.
- `SpeechController` already emits one effective error and ignores canceled/stale errors. A continuous session should not silently continue after an unclassified effective adapter failure.

## Option A: return to idle and clear active presentation (recommended)

- Natural completion: state becomes `idle`, current segment and reading highlight clear, focus stays wherever the user left it, and the live region announces `连续朗读已完成` without synthesizing another page-reading request.
- Effective speech error: state becomes `idle`, current segment and highlight clear, the existing `error` event remains authoritative, and a short live-region status says the session stopped.
- The toolbar metadata returns to `未开始` after the completion/error feedback has been announced.

Advantages:

- Active state exactly matches active sound.
- No stale highlight/caption source and no focus theft.
- Errors cannot create a loop that repeatedly fails later segments.

Trade-off:

- The last completed segment is not retained as active state.

## Option B: retain the last segment and completed state

- Keep the final segment highlighted and expose `已完成` until stop or restart.

Advantages:

- Gives a visible final position.

Trade-offs:

- Makes the highlight/current-segment contract ambiguous after audio ends.
- Encourages the later caption feature to treat historical text as active speech.

## Option C: move focus back to the toolbar controller

- On completion/error, focus the visible `连续朗读` entry and expose the final status.

Advantages:

- Makes replay controls immediately available.

Trade-offs:

- Unexpectedly steals focus after potentially long playback and disrupts the user's page position.

## Recommendation

Choose Option A. It preserves the non-focus-stealing contract and keeps active speech, highlight, public state, and future caption input synchronized.
