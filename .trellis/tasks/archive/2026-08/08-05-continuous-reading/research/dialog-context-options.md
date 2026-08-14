# Continuous reading dialog context options

## Existing constraints

- Continuous reading never activates controls or opens a dialog by itself.
- A dialog usually opens because of a user click/focus action; the confirmed interaction rule already stops the continuous session before the existing target/dialog announcement takes over.
- A modal can also appear asynchronously from host code. Background content may become `inert` or `aria-hidden`, so continuing the old queue would be invalid.
- `TabsController` already owns dialog focus trapping, entry/return announcements, close integration, and modal-background management where configured.
- Automatically reading a dialog in addition to screen-reader dialog/focus announcements risks duplicate speech and focus disorientation.

## Option A: stop and require an explicit restart inside the dialog (recommended)

- Any newly active modal dialog invalidates and stops the background continuous session with reason `dialog`.
- Existing focus/tab/dialog speech handles the dialog entry.
- If the user wants continuous reading within the dialog, they activate `连续朗读` again; the confirmed current-focus-first start chain naturally begins in the dialog.
- Closing the dialog never resumes the old background queue automatically.

Advantages:

- No background leakage, duplicate dialog speech, or unexpected automatic restart.
- Keeps host focus management and existing dialog semantics authoritative.
- One session and one visible context at a time.

Trade-off:

- Reading the dialog continuously requires one explicit start action.

## Option B: suspend background, auto-read dialog, then resume background

- Save the interrupted background segment, build a dialog-only sequence, then resume the background after close.

Advantages:

- Hands-free flow across temporary dialogs.

Trade-offs:

- A modal can contain a decision or warning that should not be auto-advanced.
- Closing or replacing nested dialogs makes the saved background state complex and potentially stale.
- Can duplicate screen-reader dialog/focus output.

## Option C: stop background and auto-start a dialog-only session

- Discard the background queue, automatically read the dialog, and stop when the dialog closes or finishes.

Advantages:

- Keeps reading within the active context without retaining background state.

Trade-offs:

- An asynchronously opened modal starts speech without an explicit continuous-reading action in that context.
- Still risks duplicate dialog and focus announcements.

## Recommendation

Choose Option A. A modal is a strong context boundary and should require explicit user intent before long-form playback begins inside it.
