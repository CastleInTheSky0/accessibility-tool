# Continuous reading and the existing reading toggle

## Existing semantics

- `AccessibilityToolState.readingEnabled` is persisted and controls the existing focus/hover/click reading listeners.
- The main `朗读` control and read-screen `朗读` (`screenSound`) expose the same `readingEnabled` state.
- Tool-authored synthesized announcements also check `readingEnabled` before speaking.
- Speech capability availability currently disables the reading and rate controls together.

## Option A: starting continuous reading enables the existing reading state (recommended)

- If `readingEnabled` is false, pressing continuous `开始` first commits it to true, then starts the session.
- Turning `朗读` off while a continuous session is playing or paused stops the session with reason `disabled`.
- Natural completion or pressing continuous `停止` does not turn `readingEnabled` back off; the user explicitly entered a reading function and the ordinary reading state remains enabled.

Advantages:

- The visible `朗读` state never says “关闭” while speech is actively playing.
- Continuous start works in one action and retains the existing master speech/read semantics.
- Unsupported speech behavior and persistence stay on the existing path.

Trade-off:

- Starting continuous reading can leave ordinary focus/hover reading enabled after the session ends.

## Option B: require the user to enable `朗读` first

- The continuous Start button is unavailable while `readingEnabled` is false and explains the dependency.

Advantages:

- Never changes another persisted setting implicitly.

Trade-offs:

- Requires two actions for a core function.
- The independent continuous entry appears usable but cannot start until another control is changed.

## Option C: make continuous reading independent

- Continuous speech can play while the existing `朗读` control remains off.

Advantages:

- Users can disable focus/hover speech but still run long-form reading.

Trade-offs:

- The visible/read-screen sound state can say `关闭` while audio is playing.
- Splits the current public `readingEnabled` meaning and complicates capability, announcement, and lifecycle rules.

## Recommendation

Choose Option A. It preserves one coherent reading-enabled state and makes the new entry immediately operable.
