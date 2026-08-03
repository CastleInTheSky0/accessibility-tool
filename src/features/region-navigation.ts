import {
  REGION_LABELS,
  REGION_TYPES,
  TOOL_HOST_ATTRIBUTE,
} from "../core/constants";
import { DomLedger } from "../core/dom-ledger";
import {
  isHTMLElement,
  isTabbable,
  isVisible,
  querySelectorAllSafe,
} from "../core/dom";
import type { RegionChangeEvent, RegionType } from "../types";
import type {
  RegionScanReason,
  ScannedRegion,
} from "./regions";

interface RegionHighlightController {
  setRegionHighlight(element: HTMLElement | null): void;
  clearRegionHighlight(element?: HTMLElement): void;
}

interface RegionNavigationCallbacks {
  getToolbarOffset: () => number;
  onCountsChange: (counts: Readonly<Record<RegionType, number>>) => void;
  onAnnounce: (message: string) => void;
  onRegionChange: (event: RegionChangeEvent) => void;
  onReturnToCategory: (type: RegionType) => void;
  onDynamicUpdate: () => void;
}

const AUTO_TABSTOP_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "switch",
  "slider",
  "spinbutton",
  "scrollbar",
  "textbox",
  "searchbox",
  "combobox",
]);

export class RegionNavigationController {
  private readonly ledger = new DomLedger();
  private readonly tabIndexSnapshots = new Map<HTMLElement, string | null>();
  private readonly lastIndexes = new Map<RegionType, number>();
  private regions: readonly ScannedRegion[] = [];
  private current: ScannedRegion | null = null;
  private currentIndex = -1;
  private roots: readonly (Document | ShadowRoot)[] = [];
  private started = false;

  constructor(
    private readonly effects: RegionHighlightController,
    private readonly callbacks: RegionNavigationCallbacks,
  ) {
    this.resetPositions();
  }

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.started = false;
    this.detachRootListeners();
    this.roots = [];
    this.clearActiveRegion();
    this.restoreAllTabStops();
    this.resetPositions();
  }

  update(
    regions: readonly ScannedRegion[],
    roots: readonly (Document | ShadowRoot)[],
    reason: RegionScanReason,
  ): void {
    const previousCounts = this.getCounts();
    const previousCurrent = this.current;
    const previousIndex = this.currentIndex;
    this.regions = regions;
    this.setRoots(roots);
    this.reconcileTabStops();
    const counts = this.getCounts();
    this.callbacks.onCountsChange(counts);

    const currentStillTracked = previousCurrent
      ? regions.some(
          (region) =>
            region.type === previousCurrent.type &&
            region.element === previousCurrent.element,
        )
      : false;
    if (
      previousCurrent &&
      (!previousCurrent.element.isConnected ||
        !isVisible(previousCurrent.element) ||
        !currentStillTracked)
    ) {
      this.recoverRemovedRegion(previousCurrent.type, previousIndex);
    } else if (previousCurrent) {
      const sameType = this.getRegions(previousCurrent.type);
      this.currentIndex = sameType.findIndex(
        (region) => region.element === previousCurrent.element,
      );
      this.effects.setRegionHighlight(previousCurrent.element);
    }

    if (
      reason === "mutation" &&
      REGION_TYPES.some((type) => previousCounts[type] !== counts[type])
    ) {
      this.callbacks.onDynamicUpdate();
    }
  }

  resetPositions(): void {
    for (const type of REGION_TYPES) {
      this.lastIndexes.set(type, -1);
    }
  }

  clearActiveRegion(): void {
    this.current = null;
    this.currentIndex = -1;
    this.ledger.restore();
    this.effects.clearRegionHighlight();
  }

  navigate(type: RegionType): boolean {
    const regions = this.getRegions(type);
    if (regions.length === 0) {
      this.callbacks.onAnnounce(`当前页面没有${REGION_LABELS[type]}`);
      return false;
    }
    const last = this.lastIndexes.get(type) ?? -1;
    const nextIndex = (last + 1) % regions.length;
    const region = regions[nextIndex];
    if (!region) {
      return false;
    }
    this.focusRegion(region, nextIndex, regions.length, true);
    return true;
  }

  getCounts(): Record<RegionType, number> {
    return {
      viewport: this.getRegions("viewport").length,
      navigation: this.getRegions("navigation").length,
      interaction: this.getRegions("interaction").length,
      service: this.getRegions("service").length,
      list: this.getRegions("list").length,
      content: this.getRegions("content").length,
    };
  }

  private getRegions(type: RegionType): ScannedRegion[] {
    return this.regions.filter(
      (region) =>
        region.type === type &&
        region.element.isConnected &&
        isVisible(region.element),
    );
  }

  private focusRegion(
    region: ScannedRegion,
    index: number,
    count: number,
    announceEntry: boolean,
  ): void {
    const element = region.element;
    const frame = element.ownerDocument.defaultView?.frameElement;
    if (isHTMLElement(frame)) {
      frame.scrollIntoView({
        block: "nearest",
        behavior: this.getScrollBehavior(element),
      });
    }
    this.ledger.restore();
    this.current = region;
    this.currentIndex = index;
    this.lastIndexes.set(region.type, index);
    this.effects.setRegionHighlight(element);
    this.ledger.setStyle(
      element,
      "scroll-margin-top",
      `${this.callbacks.getToolbarOffset() + 16}px`,
    );
    element.focus({ preventScroll: true });
    element.scrollIntoView({
      block: "start",
      inline: "nearest",
      behavior: this.getScrollBehavior(element),
    });

    if (announceEntry) {
      const entryLabel = `${region.label}${REGION_LABELS[region.type]}`;
      const message = `提示：您已进入${entryLabel}，按下 Tab 键浏览信息；第 ${index + 1} 个，共 ${count} 个`;
      this.callbacks.onAnnounce(message);
    }
    this.callbacks.onRegionChange({
      type: region.type,
      index,
      count,
      element,
      label: region.label,
    });
    requestAnimationFrame(() => {
      if (this.current?.element === element && element.isConnected) {
        this.effects.setRegionHighlight(element);
      }
    });
  }

  private recoverRemovedRegion(type: RegionType, previousIndex: number): void {
    const regions = this.getRegions(type);
    if (regions.length === 0) {
      this.clearActiveRegion();
      this.lastIndexes.set(type, -1);
      this.callbacks.onReturnToCategory(type);
      return;
    }
    const nextIndex = Math.max(previousIndex, 0) % regions.length;
    const region = regions[nextIndex];
    if (region) {
      this.focusRegion(region, nextIndex, regions.length, false);
    }
  }

  private setRoots(roots: readonly (Document | ShadowRoot)[]): void {
    if (
      roots.length === this.roots.length &&
      roots.every((root, index) => root === this.roots[index])
    ) {
      return;
    }
    this.detachRootListeners();
    this.roots = roots;
    if (this.started) {
      for (const root of roots) {
        root.addEventListener("focusin", this.handleFocusIn, true);
      }
    }
  }

  private detachRootListeners(): void {
    for (const root of this.roots) {
      root.removeEventListener("focusin", this.handleFocusIn, true);
    }
  }

  private readonly handleFocusIn = (event: Event): void => {
    const target = event
      .composedPath()
      .find((item): item is HTMLElement => isHTMLElement(item));
    if (!target) {
      if (this.current) {
        this.clearActiveRegion();
      }
      return;
    }

    const focusedRegion = this.findContainingRegion(target);
    if (focusedRegion) {
      this.activateFocusedRegion(focusedRegion);
      return;
    }

    if (this.current) {
      this.clearActiveRegion();
    }
  };

  private activateFocusedRegion(region: ScannedRegion): void {
    if (this.current?.element === region.element) {
      return;
    }

    this.ledger.restore();
    this.current = region;
    const sameType = this.getRegions(region.type);
    const index = sameType.findIndex(
      (candidate) => candidate.element === region.element,
    );
    this.currentIndex = index;
    if (index >= 0) {
      this.lastIndexes.set(region.type, index);
    }
    this.effects.setRegionHighlight(region.element);
    if (index >= 0) {
      this.callbacks.onRegionChange({
        type: region.type,
        index,
        count: sameType.length,
        element: region.element,
        label: region.label,
      });
    }
  }

  private findContainingRegion(target: HTMLElement): ScannedRegion | null {
    let match: ScannedRegion | null = null;
    for (const region of this.regions) {
      if (
        !region.element.isConnected ||
        !isVisible(region.element) ||
        !isComposedDescendant(region.element, target)
      ) {
        continue;
      }
      if (
        !match ||
        isComposedDescendant(match.element, region.element)
      ) {
        match = region;
      }
    }
    return match;
  }

  private reconcileTabStops(): void {
    const regionElements = new Set(
      this.regions
        .filter(
          (region) => region.element.isConnected && isVisible(region.element),
        )
        .map((region) => region.element),
    );
    const currentElements = new Set(regionElements);

    for (const root of this.roots) {
      for (const element of querySelectorAllSafe<HTMLElement>(root, "[role]")) {
        if (this.isAutoInteractiveTabStop(element)) {
          currentElements.add(element);
        }
      }
    }

    for (const element of this.tabIndexSnapshots.keys()) {
      if (!currentElements.has(element)) {
        this.restoreTabStop(element);
      }
    }

    for (const element of currentElements) {
      if (regionElements.has(element)) {
        this.ensureRegionTabStop(element);
      } else {
        this.ensureInteractiveTabStop(element);
      }
    }
  }

  private ensureRegionTabStop(element: HTMLElement): void {
    if (element.tabIndex >= 0) {
      return;
    }
    if (!this.tabIndexSnapshots.has(element)) {
      this.tabIndexSnapshots.set(element, element.getAttribute("tabindex"));
    }
    element.setAttribute("tabindex", "0");
  }

  private ensureInteractiveTabStop(element: HTMLElement): void {
    if (this.tabIndexSnapshots.has(element)) {
      const currentValue = element.getAttribute("tabindex");
      if (currentValue === "0") {
        return;
      }
      this.tabIndexSnapshots.delete(element);
      if (currentValue !== null) {
        return;
      }
    }
    if (element.hasAttribute("tabindex") || isTabbable(element)) {
      return;
    }
    this.tabIndexSnapshots.set(element, null);
    element.setAttribute("tabindex", "0");
  }

  private isAutoInteractiveTabStop(element: HTMLElement): boolean {
    const role = element
      .getAttribute("role")
      ?.trim()
      .split(/\s+/)[0]
      ?.toLowerCase();
    return Boolean(
      role &&
        AUTO_TABSTOP_ROLES.has(role) &&
        element.isConnected &&
        isVisible(element) &&
        !element.closest(
          `[${TOOL_HOST_ATTRIBUTE}], [data-a11y-ignore]`,
        ) &&
        !element.hasAttribute("disabled") &&
        element.getAttribute("aria-disabled")?.toLowerCase() !== "true",
    );
  }

  private restoreTabStop(element: HTMLElement): void {
    if (!this.tabIndexSnapshots.has(element)) {
      return;
    }
    const original = this.tabIndexSnapshots.get(element) ?? null;
    if (original === null) {
      element.removeAttribute("tabindex");
    } else {
      element.setAttribute("tabindex", original);
    }
    this.tabIndexSnapshots.delete(element);
  }

  private restoreAllTabStops(): void {
    for (const element of Array.from(this.tabIndexSnapshots.keys())) {
      this.restoreTabStop(element);
    }
  }

  private getScrollBehavior(element: HTMLElement): ScrollBehavior {
    return element.ownerDocument.defaultView?.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
      ? "auto"
      : "smooth";
  }
}

function isComposedDescendant(
  container: HTMLElement,
  target: HTMLElement,
): boolean {
  let current: HTMLElement | null = target;
  while (current) {
    if (current === container || container.contains(current)) {
      return true;
    }
    const root = current.getRootNode();
    if ("host" in root && isHTMLElement(root.host)) {
      current = root.host;
      continue;
    }
    if (root.nodeType === 9) {
      try {
        const frame = (root as Document).defaultView?.frameElement;
        current = isHTMLElement(frame) ? frame : null;
        continue;
      } catch {
        return false;
      }
    }
    return false;
  }
  return false;
}
