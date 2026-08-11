# Continuous reading form-control options

## Existing behavior and privacy boundary

- Single-target focus/click reading currently includes native text-input values when available, then placeholders, and appends control state.
- Continuous reading is automatic traversal rather than an explicit request for each field.
- Password, captcha, payment, security-keyboard, configured ignore, and `data-a11y-sensitive` targets are already excluded completely.
- Even with no network or persistence, automatically speaking an ordinary text field or editor can disclose user-entered personal information to nearby people.
- Select choices, checkbox/radio state, button names, and read-only page content are important form context and do not require the same treatment as arbitrary editable text.

## Option A: omit user-entered editable text values (recommended)

- For editable text inputs, textareas, ARIA textboxes, and contenteditable regions, continuous reading speaks the accessible label/type and placeholder/instruction but not the current entered value.
- Password/captcha/payment/sensitive controls remain fully excluded.
- Select/combobox current option, checkbox/radio/pressed/expanded/disabled/current state, buttons, and non-editable controls keep the existing semantics.
- Explicit focus/click single-target reading remains unchanged and may read the current value because the user intentionally targeted that control.

Advantages:

- Reduces unexpected spoken disclosure during hands-free traversal.
- Keeps enough form structure for orientation.
- Does not regress existing explicit single-target behavior.

Trade-off:

- Continuous review cannot verify text already entered into an editable field.

## Option B: reuse full existing form semantics

- Continuous reading speaks current editable values except for the existing explicit sensitive exclusions.

Advantages:

- Complete parity with single-target reading and useful for form review.

Trade-off:

- Automatically speaks ordinary personal or draft text without a field-by-field action.

## Option C: skip editable controls entirely

- Do not add editable text fields or editors to the continuous sequence.

Advantages:

- Strongest privacy boundary.

Trade-off:

- Loses field labels and page structure, making forms harder to understand.

## Recommendation

Choose Option A. It separates automatic traversal from explicit target reading while retaining useful control names and states.
