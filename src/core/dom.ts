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
  if (
    element.hidden ||
    element.closest("[hidden], [inert], [aria-hidden='true']")
  ) {
    return false;
  }
  let current: HTMLElement | null = element;
  while (current) {
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
    current = isHTMLElement(shadowHost) ? shadowHost : null;
  }
  return true;
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
    element.matches("input[type='password']")
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

export function getAccessibleText(element: HTMLElement): string {
  const name = getAccessibleName(element);
  const text = formatElementSpeech(element, name);
  return appendElementState(element, text);
}

export function getAccessibleName(
  element: HTMLElement,
  options: { readingFallbacks?: boolean } = {},
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
    const root = element.getRootNode();
    const text = labelledBy
      .split(/\s+/)
      .map((id) => getElementById(root, id)?.textContent ?? "")
      .join(" ");
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

    const formText = getFormText(element);
    if (formText) {
      return formText;
    }

    const selection = getSelectedTextWithin(element);
    if (selection) {
      return selection;
    }
  }

  return normalizeText(element.innerText || element.textContent || "");
}

function getFormText(element: HTMLElement): string {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)) {
    const field = element as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement;
    const labelText = field.labels
      ? Array.from(
          new Set(
            Array.from(field.labels)
              .map((label) => normalizeText(label.textContent ?? ""))
              .filter(Boolean),
          ),
        ).join(" ")
      : "";
    const fieldType = element.getAttribute("type")?.toLowerCase();
    const value =
      fieldType === "checkbox" || fieldType === "radio"
        ? ""
        : element.tagName === "SELECT"
          ? (element as HTMLSelectElement).selectedOptions[0]?.textContent ?? ""
          : field.value || element.getAttribute("placeholder") || "";
    return normalizeText(`${labelText} ${value}`);
  }

  const speechKind = getElementSpeechKind(element);
  if (speechKind === "textbox") {
    return normalizeText(
      element.getAttribute("aria-placeholder") ||
        element.getAttribute("placeholder") ||
        "",
    );
  }

  if (speechKind !== "select") {
    return "";
  }

  const root = element.getRootNode();
  const activeId = element.getAttribute("aria-activedescendant")?.trim();
  const activeOption = activeId ? getElementById(root, activeId) : null;
  if (activeOption && activeOption !== element) {
    const activeName = getAccessibleName(activeOption);
    if (activeName) {
      return activeName;
    }
  }

  const selectedOption = Array.from(
    element.querySelectorAll<HTMLElement>("[role~='option']"),
  ).find(
    (option) =>
      option.getAttribute("aria-selected")?.trim().toLowerCase() === "true",
  );
  return selectedOption ? getAccessibleName(selectedOption) : "";
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

export function getElementLanguage(element: Element): string {
  return (
    element.closest<HTMLElement>("[lang]")?.lang ||
    element.ownerDocument.documentElement.lang ||
    "zh-CN"
  );
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function createUniqueId(prefix: string, documentRef = document): string {
  const id = `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  return documentRef.getElementById(id)
    ? createUniqueId(prefix, documentRef)
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
