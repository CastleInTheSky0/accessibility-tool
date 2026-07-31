import { REGION_LABELS, REGION_TYPES } from "../core/constants";
import { DomLedger } from "../core/dom-ledger";
import { isHTMLElement, isVisible } from "../core/dom";
import type { RegionChangeEvent, RegionType } from "../types";
import type {
  RegionScanReason,
  ScannedRegion,
} from "./regions";

interface RegionHighlightController {
  setHighlight(element: HTMLElement | null): void;
  clearHighlight(element?: HTMLElement): void;
}

interface RegionNavigationCallbacks {
  getToolbarOffset: () => number;
  onCountsChange: (counts: Readonly<Record<RegionType, number>>) => void;
  onAnnounce: (message: string) => void;
  onRegionChange: (event: RegionChangeEvent) => void;
  onReturnToCategory: (type: RegionType) => void;
  onDynamicUpdate: () => void;
}

export class RegionNavigationController {
  private readonly ledger = new DomLedger();
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
    this.current = null;
    this.currentIndex = -1;
    this.effects.clearHighlight();
    this.ledger.restore();
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
    this.focusRegion(region, nextIndex, regions.length);
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
  ): void {
    const element = region.element;
    const frame = element.ownerDocument.defaultView?.frameElement;
    if (isHTMLElement(frame)) {
      frame.scrollIntoView({
        block: "nearest",
        behavior: this.getScrollBehavior(element),
      });
    }
    if (!isNaturallyFocusable(element) && !element.hasAttribute("tabindex")) {
      this.ledger.setAttribute(element, "tabindex", "-1");
    }
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

    this.current = region;
    this.currentIndex = index;
    this.lastIndexes.set(region.type, index);
    this.effects.setHighlight(element);

    const message = `${region.label}，${REGION_LABELS[region.type]}，第 ${index + 1} 个，共 ${count} 个`;
    this.callbacks.onAnnounce(message);
    this.callbacks.onRegionChange({
      type: region.type,
      index,
      count,
      element,
      label: region.label,
    });
    requestAnimationFrame(() => {
      if (this.current?.element === element && element.isConnected) {
        this.effects.setHighlight(element);
      }
    });
  }

  private recoverRemovedRegion(type: RegionType, previousIndex: number): void {
    const regions = this.getRegions(type);
    if (regions.length === 0) {
      this.current = null;
      this.currentIndex = -1;
      this.effects.clearHighlight();
      this.lastIndexes.set(type, -1);
      this.callbacks.onReturnToCategory(type);
      return;
    }
    const nextIndex = Math.max(previousIndex, 0) % regions.length;
    const region = regions[nextIndex];
    if (region) {
      this.focusRegion(region, nextIndex, regions.length);
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
    if (!this.current) {
      return;
    }
    const path = event.composedPath();
    if (!path.includes(this.current.element)) {
      const target = path.find((item): item is HTMLElement => isHTMLElement(item));
      if (!target || !this.current.element.contains(target)) {
        this.current = null;
        this.currentIndex = -1;
        this.effects.clearHighlight();
      }
    }
  };

  private getScrollBehavior(element: HTMLElement): ScrollBehavior {
    return element.ownerDocument.defaultView?.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
      ? "auto"
      : "smooth";
  }
}

function isNaturallyFocusable(element: HTMLElement): boolean {
  if (element.hasAttribute("disabled")) {
    return false;
  }
  if (["BUTTON", "INPUT", "SELECT", "TEXTAREA", "IFRAME"].includes(element.tagName)) {
    return true;
  }
  return (
    (element.tagName === "A" || element.tagName === "AREA") &&
    element.hasAttribute("href")
  );
}
