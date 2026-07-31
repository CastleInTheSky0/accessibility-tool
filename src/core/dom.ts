import { TOOL_HOST_ATTRIBUTE } from "./constants";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    isVisible,
  );
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
  const selection = element.ownerDocument.getSelection?.()?.toString().trim();
  if (selection) {
    return normalizeText(selection);
  }

  const explicit =
    element.getAttribute("data-a11y-label") ??
    element.getAttribute("aria-readlabel") ??
    element.getAttribute("aria-label");
  if (explicit?.trim()) {
    return appendElementState(element, normalizeText(explicit));
  }

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const root = element.getRootNode();
    const text = labelledBy
      .split(/\s+/)
      .map((id) => getElementById(root, id)?.textContent ?? "")
      .join(" ");
    if (text.trim()) {
      return appendElementState(element, normalizeText(text));
    }
  }

  if (element.tagName === "IMG") {
    return normalizeText((element as HTMLImageElement).alt);
  }

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
    return appendElementState(
      element,
      normalizeText(`${labelText} ${value}`),
    );
  }

  return appendElementState(
    element,
    normalizeText(element.innerText || element.textContent || ""),
  );
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
    element.getAttribute("aria-checked") ??
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

  const pressed = element.getAttribute("aria-pressed");
  if (pressed === "true") {
    states.push("已按下");
  } else if (pressed === "false") {
    states.push("未按下");
  }

  const expanded = element.getAttribute("aria-expanded");
  if (expanded === "true") {
    states.push("已展开");
  } else if (expanded === "false") {
    states.push("已收起");
  }

  const selected = element.getAttribute("aria-selected");
  if (selected === "true") {
    states.push("已选中");
  } else if (selected === "false") {
    states.push("未选中");
  }

  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") {
    states.push("不可用");
  }
  if (element.hasAttribute("aria-current")) {
    states.push("当前项");
  }
  return normalizeText([text, ...new Set(states)].join("，"));
}
