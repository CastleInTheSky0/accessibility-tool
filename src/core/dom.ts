import { TOOL_HOST_ATTRIBUTE } from "./constants";

const NATIVE_TABSTOP_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "details > summary:first-of-type",
  "audio[controls]",
  "video[controls]",
  "iframe",
  "object",
  "embed",
  "[contenteditable]:not([contenteditable='false'])",
].join(",");

const FOCUSABLE_SELECTOR = `${NATIVE_TABSTOP_SELECTOR},[tabindex]`;

const READABLE_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "a",
  "button",
  "label",
  "input",
  "select",
  "textarea",
  "img",
  "summary",
  "dt",
  "dd",
  "blockquote",
  "figcaption",
  "td",
  "th",
  "[role~='link']",
  "[role~='img']",
  "[role~='button']",
  "[role~='checkbox']",
  "[role~='radio']",
  "[role~='combobox']",
  "[role~='listbox']",
  "[role~='textbox']",
  "[role~='searchbox']",
  "[role~='spinbutton']",
  "[contenteditable]:not([contenteditable='false'])",
].join(",");

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!isElement(target)) {
    return false;
  }
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable='true'], [role='textbox']",
    ),
  );
}

export function isVisible(element: Element): boolean {
  if (!isHTMLElement(element) || !element.isConnected) {
    return false;
  }
  let current: HTMLElement | null = element;
  while (current) {
    if (
      current.hidden ||
      current.closest("[hidden], [inert], [aria-hidden='true']")
    ) {
      return false;
    }
    const view: Window | null = current.ownerDocument.defaultView;
    const style = view?.getComputedStyle(current);
    if (
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.visibility === "collapse"
    ) {
      return false;
    }
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      current = parent;
      continue;
    }
    const rootNode: Node = current.getRootNode();
    const shadowHost: Element | null = isShadowRootNode(rootNode)
      ? rootNode.host
      : null;
    if (isHTMLElement(shadowHost)) {
      current = shadowHost;
      continue;
    }
    if (rootNode.nodeType === Node.DOCUMENT_NODE) {
      try {
        const frameElement = (rootNode as Document).defaultView?.frameElement;
        current = isHTMLElement(frameElement) ? frameElement : null;
        continue;
      } catch {
        return false;
      }
    }
    current = null;
  }
  return true;
}

export function getDeepActiveElement(
  root: Document | ShadowRoot,
): HTMLElement | null {
  let activeElement: Element | null = root.activeElement;
  while (activeElement) {
    if (!isHTMLElement(activeElement)) {
      return null;
    }
    const shadowActiveElement = activeElement.shadowRoot?.activeElement;
    if (isHTMLElement(shadowActiveElement)) {
      activeElement = shadowActiveElement;
      continue;
    }
    if (activeElement.tagName === "IFRAME") {
      try {
        const frameActiveElement = (
          activeElement as HTMLIFrameElement
        ).contentDocument?.activeElement;
        if (isHTMLElement(frameActiveElement)) {
          activeElement = frameActiveElement;
          continue;
        }
      } catch {
        // Cross-origin frames stay atomic and are not inspected.
      }
    }
    return activeElement as HTMLElement;
  }
  return null;
}

export function getFocusableElements(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isTabbable);
}

export function isTabbable(element: HTMLElement): boolean {
  if (
    !isVisible(element) ||
    element.hasAttribute("disabled") ||
    (element.tagName === "INPUT" &&
      element.getAttribute("type")?.toLowerCase() === "hidden")
  ) {
    return false;
  }

  if (element.hasAttribute("tabindex")) {
    return element.tabIndex >= 0;
  }

  return element.matches(NATIVE_TABSTOP_SELECTOR);
}

export function getClosestReadableElement(
  target: EventTarget | null,
): HTMLElement | null {
  if (!isHTMLElement(target)) {
    return null;
  }
  return target.closest<HTMLElement>(READABLE_SELECTOR) ?? target;
}

export function shouldIgnoreReadingTarget(
  element: HTMLElement,
  extraSelectors: readonly string[],
): boolean {
  if (
    element.closest(`[${TOOL_HOST_ATTRIBUTE}]`) ||
    element.closest("[data-a11y-ignore]") ||
    element.closest("script, style, template") ||
    element.matches("input[type='password']") ||
    hasSensitiveAutocomplete(element)
  ) {
    return true;
  }
  return extraSelectors.some((selector) => {
    try {
      return Boolean(element.closest(selector));
    } catch {
      return false;
    }
  });
}

interface AccessibleTextOptions {
  isReferenceAllowed?: ((element: HTMLElement) => boolean) | undefined;
}

export function getAccessibleText(
  element: HTMLElement,
  options: AccessibleTextOptions = {},
): string {
  const name = getAccessibleName(element, options);
  const text = formatElementSpeech(element, name);
  return appendElementState(element, text);
}

function hasSensitiveAutocomplete(element: HTMLElement): boolean {
  const labelControl =
    element.tagName === "LABEL"
      ? ((element as HTMLLabelElement).control ??
        element.querySelector<HTMLElement>("input, select, textarea"))
      : null;
  const candidates = [
    element.closest<HTMLElement>("[autocomplete]"),
    labelControl,
  ];
  return candidates.some((candidate) =>
    (candidate?.getAttribute("autocomplete") ?? "")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .some(
        (token) => token.startsWith("cc-") || token === "one-time-code",
      ),
  );
}

export function getContinuousAccessibleText(
  element: HTMLElement,
  options: AccessibleTextOptions = {},
): string {
  if (!isEditableTextElement(element)) {
    if (getElementSpeechKind(element) === "select") {
      const name = appendMissingText(
        getAccessibleName(element, options),
        getCurrentOptionText(element, options.isReferenceAllowed),
      );
      return appendElementState(element, formatElementSpeech(element, name));
    }
    return getAccessibleText(element, options);
  }
  const name = getAccessibleName(element, {
    includeEditableValue: false,
    includeDescription: true,
    includeSelection: false,
    textFallback: false,
    isReferenceAllowed: options.isReferenceAllowed,
  });
  const continuousName = appendMissingText(
    name,
    element.getAttribute("aria-placeholder") ||
      element.getAttribute("placeholder") ||
      "",
    getReferencedText(
      element,
      "aria-describedby",
      options.isReferenceAllowed,
    ),
  );
  return appendElementState(
    element,
    formatElementSpeech(element, continuousName),
  );
}

export function getContinuousReferencedElements(
  element: HTMLElement,
  isReferenceAllowed?: (element: HTMLElement) => boolean,
): readonly HTMLElement[] {
  const references: HTMLElement[] = [];
  const hasDirectName = [
    "data-a11y-label",
    "aria-readlabel",
    "aria-label",
  ].some((attribute) => Boolean(element.getAttribute(attribute)?.trim()));
  if (!hasDirectName) {
    const labelledBy = getReferencedElements(
      element,
      "aria-labelledby",
      isReferenceAllowed,
    ).filter((reference) =>
      Boolean(getElementText(reference, isReferenceAllowed)),
    );
    if (labelledBy.length > 0) {
      references.push(...labelledBy);
    }
  }
  if (isEditableTextElement(element)) {
    references.push(
      ...getReferencedElements(element, "aria-describedby").filter(
        (reference) =>
          (isReferenceAllowed?.(reference) ?? true) &&
          Boolean(getElementText(reference, isReferenceAllowed)),
      ),
    );
  }
  if (getElementSpeechKind(element) === "select") {
    const currentOption = getCurrentOptionElement(
      element,
      isReferenceAllowed,
    );
    if (currentOption && currentOption !== element) {
      references.push(currentOption);
    }
  }
  return Array.from(new Set(references));
}

export function getAccessibleName(
  element: HTMLElement,
  options: {
    readingFallbacks?: boolean;
    includeEditableValue?: boolean;
    includeDescription?: boolean;
    includeSelection?: boolean;
    textFallback?: boolean;
    isReferenceAllowed?: ((element: HTMLElement) => boolean) | undefined;
  } = {},
): string {
  for (const attribute of [
    "data-a11y-label",
    "aria-readlabel",
    "aria-label",
  ]) {
    const value = element.getAttribute(attribute);
    if (value?.trim()) {
      return normalizeText(value);
    }
  }

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = getReferencedText(
      element,
      "aria-labelledby",
      options.isReferenceAllowed,
    );
    if (text.trim()) {
      return normalizeText(text);
    }
  }

  const title = element.getAttribute("title");
  if (title?.trim()) {
    return normalizeText(title);
  }

  if (options.readingFallbacks !== false) {
    if (
      getElementSpeechKind(element) === "image" ||
      element.tagName === "IMG" ||
      element.tagName === "AREA" ||
      (element.tagName === "INPUT" &&
        element.getAttribute("type")?.toLowerCase() === "image")
    ) {
      const alt = element.getAttribute("alt");
      if (alt?.trim()) {
        return normalizeText(alt);
      }
    }

    const formText = getFormText(
      element,
      options.includeEditableValue !== false,
      options.includeDescription === true,
      options.isReferenceAllowed,
    );
    if (formText) {
      return formText;
    }

    if (options.includeSelection !== false) {
      const selection = getSelectedTextWithin(element);
      if (selection) {
        return selection;
      }
    }
  }

  if (options.textFallback === false) {
    return "";
  }
  return getElementText(element, options.isReferenceAllowed);
}

function getFormText(
  element: HTMLElement,
  includeEditableValue = true,
  includeDescription = false,
  isReferenceAllowed?: (element: HTMLElement) => boolean,
): string {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)) {
    const field = element as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement;
    const labelText = field.labels
      ? Array.from(
          new Set(
            Array.from(field.labels)
              .filter((label) => isReferenceAllowed?.(label) ?? true)
              .map((label) => getElementText(label, isReferenceAllowed))
              .filter(Boolean),
          ),
        ).join(" ")
      : "";
    const fieldType = element.getAttribute("type")?.toLowerCase();
    const value =
      fieldType === "checkbox" || fieldType === "radio"
        ? ""
        : element.tagName === "SELECT"
          ? getCurrentOptionText(element, isReferenceAllowed)
          : includeEditableValue
            ? field.value || element.getAttribute("placeholder") || ""
            : element.getAttribute("placeholder") || "";
    const description = includeDescription
      ? getReferencedText(
          element,
          "aria-describedby",
          isReferenceAllowed,
        )
      : "";
    return normalizeText(`${labelText} ${value} ${description}`);
  }

  const speechKind = getElementSpeechKind(element);
  if (speechKind === "textbox") {
    const description = includeDescription
      ? getReferencedText(
          element,
          "aria-describedby",
          isReferenceAllowed,
        )
      : "";
    return normalizeText(
      `${element.getAttribute("aria-placeholder") || element.getAttribute("placeholder") || ""} ${description}`,
    );
  }

  if (speechKind !== "select") {
    return "";
  }

  return getCurrentOptionText(element, isReferenceAllowed);
}

function getCurrentOptionText(
  element: HTMLElement,
  isReferenceAllowed?: (element: HTMLElement) => boolean,
): string {
  const currentOption = getCurrentOptionElement(element, isReferenceAllowed);
  if (!currentOption) {
    return "";
  }
  return element.tagName === "SELECT"
    ? getElementText(currentOption, isReferenceAllowed)
    : getAccessibleName(currentOption, { isReferenceAllowed });
}

function getCurrentOptionElement(
  element: HTMLElement,
  isReferenceAllowed?: (element: HTMLElement) => boolean,
): HTMLElement | null {
  if (element.tagName === "SELECT") {
    const selectedOption = (element as HTMLSelectElement).selectedOptions[0];
    return selectedOption && (isReferenceAllowed?.(selectedOption) ?? true)
      ? selectedOption
      : null;
  }

  const root = element.getRootNode();
  const activeId = element.getAttribute("aria-activedescendant")?.trim();
  const activeOption = activeId ? getElementById(root, activeId) : null;
  if (
    activeOption &&
    activeOption !== element &&
    (isReferenceAllowed?.(activeOption) ?? true)
  ) {
    if (getAccessibleName(activeOption, { isReferenceAllowed })) {
      return activeOption;
    }
  }

  const selectedOption = Array.from(
    element.querySelectorAll<HTMLElement>("[role~='option']"),
  ).find(
    (option) =>
      option.getAttribute("aria-selected")?.trim().toLowerCase() === "true" &&
      (isReferenceAllowed?.(option) ?? true),
  );
  return selectedOption ?? null;
}

function getReferencedText(
  element: HTMLElement,
  attribute: string,
  isReferenceAllowed?: (element: HTMLElement) => boolean,
): string {
  return normalizeText(
    getReferencedElements(element, attribute, isReferenceAllowed)
      .map((reference) => getElementText(reference, isReferenceAllowed))
      .join(" "),
  );
}

function getReferencedElements(
  element: HTMLElement,
  attribute: string,
  isReferenceAllowed?: (element: HTMLElement) => boolean,
): HTMLElement[] {
  const references = element.getAttribute(attribute)?.trim();
  if (!references) {
    return [];
  }
  const root = element.getRootNode();
  return references
    .split(/\s+/)
    .map((id) => getElementById(root, id))
    .filter(
      (reference): reference is HTMLElement =>
        reference !== null && (isReferenceAllowed?.(reference) ?? true),
    );
}

function getElementText(
  element: HTMLElement,
  isReferenceAllowed?: (element: HTMLElement) => boolean,
): string {
  if (!isReferenceAllowed) {
    return normalizeText(element.innerText || element.textContent || "");
  }
  const parts: string[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (isHTMLElement(node) && !isReferenceAllowed(node)) {
      return;
    }
    for (const child of Array.from(node.childNodes)) {
      visit(child);
    }
  };
  visit(element);
  return normalizeText(parts.join(" "));
}

function appendMissingText(value: string, ...details: string[]): string {
  let result = normalizeText(value);
  for (const detail of details.map(normalizeText).filter(Boolean)) {
    if (!result.includes(detail)) {
      result = normalizeText(`${result} ${detail}`);
    }
  }
  return result;
}

function isEditableTextElement(element: HTMLElement): boolean {
  if (element.tagName === "INPUT") {
    const input = element as HTMLInputElement;
    const type = input.type.toLowerCase();
    return (
      !input.readOnly &&
      ![
        "button",
        "checkbox",
        "color",
        "file",
        "hidden",
        "image",
        "radio",
        "range",
        "reset",
        "submit",
      ].includes(type)
    );
  }
  if (element.tagName === "TEXTAREA") {
    return !(element as HTMLTextAreaElement).readOnly;
  }
  if (element.isContentEditable) {
    return true;
  }
  const role = element.getAttribute("role")?.trim().split(/\s+/)[0];
  return (
    ["textbox", "searchbox", "spinbutton"].includes(role ?? "") &&
    element.getAttribute("aria-readonly") !== "true"
  );
}

function formatElementSpeech(element: HTMLElement, name: string): string {
  switch (getElementSpeechKind(element)) {
    case "link":
      return withSemanticPrefix(
        element.getAttribute("target")?.trim().toLowerCase() === "_blank"
          ? "打开新窗口链接"
          : "链接",
        name,
      );
    case "image":
      return withSemanticPrefix("图片", name);
    case "button":
      return withSemanticPrefix("按钮", name);
    case "checkbox":
      return withSemanticPrefix("复选框", name);
    case "radio":
      return withSemanticPrefix("单选框", name);
    case "select":
      return withSemanticPrefix("下拉框", name);
    case "textbox":
      return name ? `输入框：${name}` : "输入框";
    case "text":
      return name ? `文本：${name}` : "";
  }
}

function getElementSpeechKind(
  element: HTMLElement,
):
  | "link"
  | "image"
  | "button"
  | "checkbox"
  | "radio"
  | "select"
  | "textbox"
  | "text" {
  const role = element
    .getAttribute("role")
    ?.trim()
    .split(/\s+/)[0]
    ?.toLowerCase();
  switch (role) {
    case "link":
    case "img":
    case "button":
    case "checkbox":
    case "radio":
      return role === "img" ? "image" : role;
    case "combobox":
    case "listbox":
      return "select";
    case "textbox":
    case "searchbox":
    case "spinbutton":
      return "textbox";
  }

  const inputType = element.getAttribute("type")?.toLowerCase();
  if (element.tagName === "INPUT" && inputType === "checkbox") {
    return "checkbox";
  }
  if (element.tagName === "INPUT" && inputType === "radio") {
    return "radio";
  }
  if (element.tagName === "SELECT") {
    return "select";
  }
  if (
    element.tagName === "BUTTON" ||
    (element.tagName === "INPUT" &&
      ["button", "submit", "reset", "image"].includes(inputType ?? ""))
  ) {
    return "button";
  }
  if (
    (element.tagName === "INPUT" && inputType !== "hidden") ||
    element.tagName === "TEXTAREA" ||
    element.isContentEditable
  ) {
    return "textbox";
  }
  if (
    (element.tagName === "A" || element.tagName === "AREA") &&
    element.hasAttribute("href")
  ) {
    return "link";
  }
  if (element.tagName === "IMG") {
    return "image";
  }
  return "text";
}

function withSemanticPrefix(prefix: string, name: string): string {
  return name ? `${prefix}，${name}` : prefix;
}

function getSelectedTextWithin(element: HTMLElement): string {
  const selection = element.ownerDocument.getSelection?.();
  const text = selection?.toString().trim();
  if (!selection || !text || selection.rangeCount === 0) {
    return "";
  }
  for (let index = 0; index < selection.rangeCount; index += 1) {
    try {
      if (element.contains(selection.getRangeAt(index).commonAncestorContainer)) {
        return normalizeText(text);
      }
    } catch {
      return "";
    }
  }
  return "";
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function createUniqueId(
  prefix: string,
  root: Document | ShadowRoot = document,
): string {
  const id = `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  return root.getElementById(id)
    ? createUniqueId(prefix, root)
    : id;
}

export function querySelectorAllSafe<T extends Element>(
  root: ParentNode,
  selector: string,
): T[] {
  try {
    return Array.from(root.querySelectorAll<T>(selector));
  } catch {
    return [];
  }
}

export function isElement(value: unknown): value is Element {
  return Boolean(
    value &&
      typeof value === "object" &&
      "nodeType" in value &&
      (value as Node).nodeType === 1,
  );
}

export function isHTMLElement(value: unknown): value is HTMLElement {
  return isElement(value) && "style" in value && "focus" in value;
}

function isShadowRootNode(value: unknown): value is ShadowRoot {
  return Boolean(
    value && typeof value === "object" && "host" in value && "mode" in value,
  );
}

function getElementById(root: Node, id: string): HTMLElement | null {
  if ("getElementById" in root) {
    return (root as Document | ShadowRoot).getElementById(id);
  }
  return root.ownerDocument?.getElementById(id) ?? null;
}

function appendElementState(element: HTMLElement, text: string): string {
  if (!text) {
    return text;
  }
  const states: string[] = [];
  const checked =
    element.getAttribute("aria-checked")?.trim().toLowerCase() ??
    (["checkbox", "radio"].includes(
      (element.getAttribute("type") ?? "").toLowerCase(),
    )
      ? String((element as HTMLInputElement).checked)
      : null);
  if (checked === "true") {
    states.push("已选中");
  } else if (checked === "false") {
    states.push("未选中");
  } else if (checked === "mixed") {
    states.push("部分选中");
  }

  const pressed = element.getAttribute("aria-pressed")?.trim().toLowerCase();
  if (pressed === "true") {
    states.push("已按下");
  } else if (pressed === "false") {
    states.push("未按下");
  }

  const expanded = element.getAttribute("aria-expanded")?.trim().toLowerCase();
  if (expanded === "true") {
    states.push("已展开");
  } else if (expanded === "false") {
    states.push("已收起");
  }

  const selected = element.getAttribute("aria-selected")?.trim().toLowerCase();
  if (selected === "true") {
    states.push("已选中");
  } else if (selected === "false") {
    states.push("未选中");
  }

  if (
    element.matches(":disabled") ||
    element.getAttribute("aria-disabled")?.trim().toLowerCase() === "true"
  ) {
    states.push("不可用");
  }
  const current = element.getAttribute("aria-current")?.trim().toLowerCase();
  if (current && current !== "false") {
    states.push("当前项");
  }
  return normalizeText([text, ...new Set(states)].join("，"));
}
