# Continuous reading control entry options

## Current desktop geometry

- The approved inner frame is capped at `1280px`, below the user's `1300px` maximum.
- The current main toolbar has 14 controls, a `90px` brand rail, and `6px` horizontal item padding on each side.
- At `1280px`, current controls are approximately `84px` wide. Adding one fifteenth control within the same frame yields approximately `(1280 - 90 - 12) / 15 = 78.5px` per control.
- At `1024px`, the compact layout uses an `88px` brand rail; fifteen controls yield approximately `(1024 - 88 - 12) / 15 = 61.6px` per control instead of the current ~66px.
- The four-character label `连续朗读` fits the compact single-line label budget, but automated geometry and truncation coverage must be updated from 14 to 15 controls.

## Option A: independent toolbar entry and anchored controller (recommended)

- Add one `连续朗读` control immediately after the existing `朗读` control and before `语速`.
- The entry exposes session metadata (`未开始` / `朗读中` / `已暂停`) and opens an anchored, non-modal `连续朗读控制` panel.
- The panel owns explicit start, pause/continue, and stop buttons. Escape/close/outside dismissal closes only the panel; it does not implicitly stop an active session.
- Add the same continuous-reading entry to read-screen mode near its existing `朗读` control so both modes expose the same session.

Advantages:

- Preserves the existing direct `朗读` toggle and its backward-compatible semantics.
- Start/pause/continue/stop remain explicit, keyboard reachable, and easy to label.
- Fits the approved `1280px` frame without exceeding `1300px`.

Trade-offs:

- Main toolbar grows from 14 to 15 controls and needs slightly narrower compact widths.
- Introduces one more anchored panel, which should reuse the voice-settings dismissal/focus pattern without coupling their state.

## Option B: convert the existing `朗读` control into a combined reading panel

- Activating `朗读` opens a panel containing the existing single-target reading toggle and continuous controls.
- No new main-toolbar slot is required.

Advantages:

- Keeps 14 main controls and current widths.
- Groups all reading functions in one place.

Trade-offs:

- Breaks the current direct-toggle interaction: click/Enter/Space would no longer immediately enable or disable single-target reading.
- Adds an extra step to a frequently used existing function and complicates `aria-pressed` semantics.

## Option C: expose continuous reading only in read-screen mode

- Keep the main toolbar unchanged and add controls only beside the read-screen `朗读` entry.

Advantages:

- No main-toolbar width change.

Trade-offs:

- Makes a core v0.2 feature hard to discover and unavailable without switching modes.
- Creates unnecessary mode coupling even though continuous reading is useful outside blind-path navigation.

## Recommendation

Choose Option A. It preserves existing behavior, keeps the approved `1280px` cap, and gives the four session actions clear semantics. The controller panel should be a new focused component that reuses established non-modal panel behavior, not a second speech or session owner.
