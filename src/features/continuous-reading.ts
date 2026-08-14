import type { ResolvedAccessibilityToolConfig } from "../core/config";
import {
  getContinuousAccessibleText,
  getContinuousReferencedElements,
  isHTMLElement,
  isVisible,
  normalizeText,
  shouldIgnoreReadingTarget,
} from "../core/dom";

export type ContinuousReadingRoot = Document | ShadowRoot;

export type ContinuousReadingCandidate =
  | {
      readonly source: HTMLElement;
      readonly element: HTMLElement;
      readonly kind: "element";
      readonly boundaries: readonly HTMLElement[];
    }
  | {
      readonly source: Text;
      readonly element: HTMLElement;
      readonly kind: "text";
      readonly boundaries: readonly HTMLElement[];
    };

interface SequenceOptions {
  roots: readonly ContinuousReadingRoot[];
  scope: HTMLElement | null;
  config: ResolvedAccessibilityToolConfig;
  isTabControl: (element: HTMLElement) => boolean;
}

const ATOMIC_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "img",
  "summary",
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

const TEXT_BLOCK_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "label",
  "dt",
  "dd",
  "blockquote",
  "figcaption",
  "td",
  "th",
].join(",");

export function buildContinuousReadingSequence(
  options: SequenceOptions,
): ContinuousReadingCandidate[] {
  const candidates: ContinuousReadingCandidate[] = [];
  const visitedRoots = new Set<ContinuousReadingRoot>();
  const visitedElements = new Set<HTMLElement>();
  const ignoreSelectors = getContinuousIgnoreSelectors(options.config);
  const consumedReferences = new Set<HTMLElement>();

  const visitText = (
    node: Text,
    boundaries: readonly HTMLElement[],
  ): void => {
    const element = node.parentElement;
    if (
      !element ||
      !node.isConnected ||
      !normalizeText(node.data) ||
      isWithinConsumedReference(element, consumedReferences) ||
      isIgnored(element, ignoreSelectors)
    ) {
      return;
    }
    candidates.push({ source: node, element, kind: "text", boundaries });
  };

  const visitChildren = (
    parent: ParentNode,
    collectText: boolean,
    boundaries: readonly HTMLElement[],
  ): void => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (collectText) {
          visitText(child as Text, boundaries);
        }
        continue;
      }
      if (isHTMLElement(child)) {
        visitElement(child, collectText, boundaries);
      }
    }
  };

  const visitRoot = (
    root: ContinuousReadingRoot,
    boundaries: readonly HTMLElement[] = [],
    collectText = true,
  ): void => {
    if (visitedRoots.has(root)) {
      return;
    }
    visitedRoots.add(root);
    if (root.nodeType === Node.DOCUMENT_NODE) {
      const documentRef = root as Document;
      const start = documentRef.body ?? documentRef.documentElement;
      if (start) {
        visitElement(start, collectText, boundaries);
      }
      return;
    }
    visitChildren(root, collectText, boundaries);
  };

  const visitElement = (
    element: HTMLElement,
    collectText: boolean,
    boundaries: readonly HTMLElement[],
  ): void => {
    if (visitedElements.has(element)) {
      return;
    }
    visitedElements.add(element);
    if (isIgnored(element, ignoreSelectors)) {
      return;
    }

    if (element.tagName === "IFRAME") {
      try {
        const frameDocument = (element as HTMLIFrameElement).contentDocument;
        if (frameDocument?.documentElement) {
          visitRoot(frameDocument, [...boundaries, element], collectText);
        }
      } catch {
        // Cross-origin frames remain atomic and are never traversed.
      }
      return;
    }

    if (element.tagName === "SLOT") {
      const assigned = (element as HTMLSlotElement).assignedNodes({
        flatten: true,
      });
      const slotBoundaries = [...boundaries, element];
      if (assigned.length > 0) {
        for (const node of assigned) {
          if (node.nodeType === Node.TEXT_NODE) {
            if (collectText) {
              visitText(node as Text, slotBoundaries);
            }
          } else if (isHTMLElement(node)) {
            visitElement(node, collectText, slotBoundaries);
          }
        }
        return;
      }
      visitChildren(element, collectText, slotBoundaries);
      return;
    }

    if (options.isTabControl(element) || element.matches(ATOMIC_SELECTOR)) {
      const candidate: ContinuousReadingCandidate = {
        source: element,
        element,
        kind: "element",
        boundaries,
      };
      if (resolveContinuousReadingCandidate(candidate, options.config)) {
        for (const reference of getContinuousReferencedElements(
          element,
          (reference) => !isIgnored(reference, ignoreSelectors),
        )) {
          consumedReferences.add(reference);
        }
        candidates.push(candidate);
      }
      return;
    }

    if (element.shadowRoot) {
      visitRoot(element.shadowRoot, [...boundaries, element], collectText);
      return;
    }

    if (element.matches(TEXT_BLOCK_SELECTOR)) {
      if (element.tagName === "LABEL" && hasAssociatedControl(element)) {
        visitChildren(element, false, boundaries);
        return;
      }
      if (
        hasNestedReadingBoundary(
          element,
          options.isTabControl,
          ignoreSelectors,
        )
      ) {
        visitChildren(element, true, boundaries);
        return;
      }
      const candidate: ContinuousReadingCandidate = {
        source: element,
        element,
        kind: "element",
        boundaries,
      };
      if (
        !isWithinConsumedReference(element, consumedReferences) &&
        resolveContinuousReadingCandidate(candidate, options.config)
      ) {
        candidates.push(candidate);
      }
      return;
    }

    visitChildren(element, collectText, boundaries);
  };

  if (options.scope) {
    visitElement(options.scope, true, []);
  } else {
    const primaryDocument =
      options.roots.find(
        (root): root is Document => root.nodeType === Node.DOCUMENT_NODE,
      ) ?? document;
    visitRoot(primaryDocument);
    for (const root of options.roots) {
      visitRoot(root);
    }
  }

  return candidates.filter((candidate) => {
    if (
      candidate.kind === "element" &&
      (options.isTabControl(candidate.element) ||
        candidate.element.matches(ATOMIC_SELECTOR))
    ) {
      return true;
    }
    return !isWithinConsumedReference(candidate.element, consumedReferences);
  });
}

function isWithinConsumedReference(
  element: HTMLElement,
  references: ReadonlySet<HTMLElement>,
): boolean {
  for (const reference of references) {
    if (reference === element || reference.contains(element)) {
      return true;
    }
  }
  return false;
}

function hasNestedReadingBoundary(
  element: HTMLElement,
  isTabControl: (element: HTMLElement) => boolean,
  ignoreSelectors: readonly string[],
): boolean {
  if (element.querySelector(`${ATOMIC_SELECTOR}, iframe, slot`)) {
    return true;
  }
  return Array.from(element.querySelectorAll<HTMLElement>("*")).some(
    (descendant) =>
      Boolean(descendant.shadowRoot) ||
      isTabControl(descendant) ||
      isIgnored(descendant, ignoreSelectors),
  );
}

export function resolveContinuousReadingCandidate(
  candidate: ContinuousReadingCandidate,
  config: ResolvedAccessibilityToolConfig,
): { element: HTMLElement; text: string } | null {
  const ignoreSelectors = getContinuousIgnoreSelectors(config);
  const element =
    candidate.kind === "text"
      ? candidate.source.parentElement
      : candidate.element;
  const currentSlot = findNearestAssignedSlot(candidate.source);
  const currentFallbackSlot =
    currentSlot?.contains(candidate.source) === true ? currentSlot : null;
  const originallyAssigned = candidate.boundaries.some(
    (boundary) =>
      boundary.tagName === "SLOT" && !boundary.contains(candidate.source),
  );
  if (
    !element ||
    !candidate.source.isConnected ||
    (originallyAssigned && !currentSlot) ||
    (currentFallbackSlot && currentFallbackSlot.assignedNodes().length > 0) ||
    candidate.boundaries.some(
      (boundary) =>
        boundary.tagName !== "SLOT" &&
        isIgnored(boundary, ignoreSelectors),
    ) ||
    (currentSlot && isIgnored(currentSlot, ignoreSelectors)) ||
    isIgnored(element, ignoreSelectors) ||
    (candidate.kind === "element" &&
      element.matches(TEXT_BLOCK_SELECTOR) &&
      hasIgnoredDescendant(element, ignoreSelectors))
  ) {
    return null;
  }
  const text =
    candidate.kind === "text"
      ? withTextPrefix(candidate.source.data)
      : getContinuousAccessibleText(element, {
          isReferenceAllowed: (reference) =>
            !isIgnored(reference, ignoreSelectors),
        });
  return text ? { element, text } : null;
}

export function isContinuousReadingElementIgnored(
  element: HTMLElement,
  config: ResolvedAccessibilityToolConfig,
): boolean {
  return isIgnored(element, getContinuousIgnoreSelectors(config));
}

function hasIgnoredDescendant(
  element: HTMLElement,
  ignoreSelectors: readonly string[],
): boolean {
  return Array.from(element.querySelectorAll<HTMLElement>("*")).some(
    (descendant) => isIgnored(descendant, ignoreSelectors),
  );
}

export function findActiveModalDialog(
  roots: readonly ContinuousReadingRoot[],
): HTMLElement | null {
  let active: HTMLElement | null = null;
  const seen = new Set<HTMLElement>();
  for (const root of roots) {
    const elements = Array.from(
      root.querySelectorAll<HTMLElement>(
        "dialog, [role='dialog'], [aria-modal='true']",
      ),
    );
    for (const element of elements) {
      if (
        seen.has(element) ||
        !isVisible(element) ||
        element.closest("[data-a11y-tool-host]") ||
        !isModal(element)
      ) {
        continue;
      }
      seen.add(element);
      if (!active || composedContains(active, element)) {
        active = element;
      }
    }
  }
  return active;
}

export function findContinuousStartIndex(
  candidates: readonly ContinuousReadingCandidate[],
  target: HTMLElement | null,
): number {
  if (!target) {
    return -1;
  }
  const exact = candidates.findIndex(({ element }) => element === target);
  if (exact >= 0) {
    return exact;
  }
  return candidates.findIndex(
    ({ element }) =>
      composedContains(element, target) || composedContains(target, element),
  );
}

export function composedContains(container: Node, target: Node): boolean {
  const visited = new Set<Node>();
  let current: Node | null = target;
  while (current && !visited.has(current)) {
    if (current === container) {
      return true;
    }
    visited.add(current);
    current = getComposedParent(current);
  }
  return false;
}

function getContinuousIgnoreSelectors(
  config: ResolvedAccessibilityToolConfig,
): readonly string[] {
  return [
    ...config.speech.ignoreSelectors,
    ...config.regions.ignoreSelectors,
    "[data-a11y-sensitive]",
    "[data-a11y-security-keyboard]",
    "[data-captcha]",
    ".captcha",
    '[autocomplete="cc-number"]',
    '[autocomplete="cc-csc"]',
  ];
}

function isIgnored(
  element: HTMLElement,
  selectors: readonly string[],
): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (
      !isVisible(current) ||
      Boolean(current.closest("[data-a11y-hidden]")) ||
      shouldIgnoreReadingTarget(current, selectors)
    ) {
      return true;
    }
    if (current.assignedSlot) {
      current = current.assignedSlot;
      continue;
    }
    const root = current.getRootNode();
    if (isShadowRoot(root) && isHTMLElement(root.host)) {
      current = root.host;
      continue;
    }
    if (root.nodeType === Node.DOCUMENT_NODE) {
      try {
        const frameElement = (root as Document).defaultView?.frameElement;
        current = isHTMLElement(frameElement) ? frameElement : null;
        continue;
      } catch {
        return true;
      }
    }
    current = null;
  }
  return false;
}

function findNearestAssignedSlot(node: Node): HTMLSlotElement | null {
  let current: Node | null = node;
  while (current) {
    if (isHTMLElement(current) && current.tagName === "SLOT") {
      return current as HTMLSlotElement;
    }
    if ("assignedSlot" in current) {
      const assignedSlot = (
        current as Node & { assignedSlot: HTMLSlotElement | null }
      ).assignedSlot;
      if (assignedSlot) {
        return assignedSlot;
      }
    }
    const parentNode: Node | null = current.parentNode;
    if (isHTMLElement(parentNode) && parentNode.shadowRoot) {
      for (const slot of Array.from(
        parentNode.shadowRoot.querySelectorAll<HTMLSlotElement>("slot"),
      )) {
        if (
          slot
            .assignedNodes({ flatten: true })
            .some((assigned) => assigned === current)
        ) {
          return slot;
        }
      }
    }
    current = parentNode;
  }
  return null;
}

function hasAssociatedControl(label: HTMLElement): boolean {
  if (label.querySelector("input, select, textarea, button")) {
    return true;
  }
  const htmlFor = (label as HTMLLabelElement).htmlFor;
  return Boolean(htmlFor && label.ownerDocument.getElementById(htmlFor));
}

function withTextPrefix(value: string): string {
  const text = normalizeText(value);
  return text ? `文本：${text}` : "";
}

function isModal(element: HTMLElement): boolean {
  if (element.getAttribute("aria-modal") === "true") {
    return true;
  }
  if (element.tagName !== "DIALOG") {
    return false;
  }
  try {
    return element.matches(":modal");
  } catch {
    return false;
  }
}

function isShadowRoot(value: Node): value is ShadowRoot {
  return "host" in value && "mode" in value;
}

function getComposedParent(node: Node): Node | null {
  if ("assignedSlot" in node) {
    const assignedSlot = (node as Node & { assignedSlot: HTMLSlotElement | null })
      .assignedSlot;
    if (assignedSlot) {
      return assignedSlot;
    }
  }
  const parent = node.parentNode;
  if (parent) {
    return isShadowRoot(parent) ? parent.host : parent;
  }
  if (node.nodeType === Node.DOCUMENT_NODE) {
    try {
      return (node as Document).defaultView?.frameElement ?? null;
    } catch {
      return null;
    }
  }
  return null;
}
