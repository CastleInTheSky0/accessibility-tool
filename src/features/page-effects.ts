import type { ResolvedAccessibilityToolConfig } from "../core/config";
import { TOOL_HOST_ATTRIBUTE } from "../core/constants";
import { DomLedger } from "../core/dom-ledger";
import {
  isHTMLElement,
  isVisible,
  querySelectorAllSafe,
} from "../core/dom";
import type { AccessibilityToolState } from "../types";
import type { ToolbarUI } from "../ui/toolbar";

interface PageEffectsCallbacks {
  onFullscreenChange: (isFullscreen: boolean) => void;
  onError: (error: unknown, message: string) => void;
}

export class PageEffectsController {
  private readonly effectLedger = new DomLedger();
  private readonly placementLedger = new DomLedger();
  private readonly focusPresentationLedger = new DomLedger();
  private state: AccessibilityToolState | null = null;
  private readingHighlightedElement: HTMLElement | null = null;
  private regionHighlightedElement: HTMLElement | null = null;
  private focusedElement: HTMLElement | null = null;
  private focusPresentationElement: HTMLElement | null = null;
  private roots: (Document | ShadowRoot)[] = [document];
  private readonly boundRoots = new Set<Document | ShadowRoot>();
  private readonly boundWindows = new Set<Window>();
  private focusSyncTimer: number | null = null;
  private crosshairBound = false;
  private started = false;

  constructor(
    private config: ResolvedAccessibilityToolConfig,
    private readonly ui: ToolbarUI,
    private readonly callbacks: PageEffectsCallbacks,
  ) {}

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    this.bindRootListeners();
    this.synchronizeFocusHighlight();
  }

  setRoots(roots: readonly (Document | ShadowRoot)[]): void {
    const nextRoots = Array.from(new Set([document, ...roots]));
    const rootsChanged =
      nextRoots.length !== this.roots.length ||
      nextRoots.some((root, index) => root !== this.roots[index]);
    if (rootsChanged) {
      this.unbindRootListeners();
      this.roots = nextRoots;
      if (this.started) {
        this.bindRootListeners();
      }
    }
    if (this.started) {
      this.synchronizeFocusHighlight();
    }
  }

  updateConfig(config: ResolvedAccessibilityToolConfig): void {
    this.config = config;
    if (this.state) {
      this.apply(this.state);
    }
  }

  apply(state: AccessibilityToolState): void {
    this.state = state;
    this.effectLedger.restore();

    if (state.colorScheme !== "original") {
      this.effectLedger.setAttribute(
        document.documentElement,
        "data-a11y-color-scheme",
        state.colorScheme,
      );
      this.markColorExclusions();
    }

    if (state.largeCursor) {
      this.effectLedger.setAttribute(
        document.documentElement,
        "data-a11y-large-cursor",
        "",
      );
    }

    const zoomTarget = this.resolveZoomTarget();
    if (zoomTarget && state.zoom !== 1) {
      if (zoomTarget === document.body) {
        for (const child of Array.from(document.body.children)) {
          if (
            child instanceof HTMLElement &&
            !child.hasAttribute("data-a11y-tool-host") &&
            !["SCRIPT", "STYLE", "LINK"].includes(child.tagName)
          ) {
            this.effectLedger.setStyle(child, "zoom", String(state.zoom));
          }
        }
      } else {
        this.effectLedger.setStyle(zoomTarget, "zoom", String(state.zoom));
      }
    }

    this.applyPlacement(state);
    this.setCrosshairActive(state.crosshair);
  }

  deactivate(): void {
    this.setCrosshairActive(false);
    this.effectLedger.restore();
    this.placementLedger.restore();
    this.clearHighlight();
    this.clearRegionHighlight();
    this.clearFocusHighlight();
    this.cancelFocusSync();
    this.unbindRootListeners();
    if (this.started) {
      document.removeEventListener(
        "fullscreenchange",
        this.handleFullscreenChange,
      );
    }
    this.started = false;
    this.state = null;
  }

  async toggleFullscreen(): Promise<boolean> {
    if (!this.isFullscreenSupported()) {
      throw new Error("当前浏览器不支持全屏功能。");
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return false;
    }
    await document.documentElement.requestFullscreen();
    return true;
  }

  async exitFullscreen(): Promise<void> {
    if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
      try {
        await document.exitFullscreen();
      } catch (error) {
        this.callbacks.onError(error, "退出全屏失败。");
      }
    }
  }

  isFullscreenSupported(): boolean {
    return typeof document.documentElement.requestFullscreen === "function";
  }

  setHighlight(element: HTMLElement | null): void {
    this.readingHighlightedElement = element;
    if (element?.isConnected) {
      this.ui.positionHighlight(element);
    } else {
      this.ui.hideHighlight();
    }
  }

  clearHighlight(element?: HTMLElement): void {
    if (element && this.readingHighlightedElement !== element) {
      return;
    }
    this.readingHighlightedElement = null;
    this.ui.hideHighlight();
  }

  setRegionHighlight(element: HTMLElement | null): void {
    if (!element) {
      this.clearRegionHighlight();
      return;
    }
    this.regionHighlightedElement = element;
    if (element.isConnected && isVisible(element)) {
      this.ui.positionRegionHighlight(element);
    } else {
      this.regionHighlightedElement = null;
      this.ui.hideRegionHighlight();
      return;
    }
    if (this.focusedElement === element) {
      this.ui.hideFocusHighlight();
    }
  }

  clearRegionHighlight(element?: HTMLElement): void {
    if (element && this.regionHighlightedElement !== element) {
      return;
    }
    const previousRegion = this.regionHighlightedElement;
    this.regionHighlightedElement = null;
    this.ui.hideRegionHighlight();
    if (
      previousRegion &&
      this.focusedElement === previousRegion &&
      this.isFocusHighlightTarget(previousRegion) &&
      isElementCurrentlyFocused(previousRegion)
    ) {
      this.ui.positionFocusHighlight(previousRegion);
    }
  }

  destroy(): void {
    this.deactivate();
  }

  private applyPlacement(state: AccessibilityToolState): void {
    this.placementLedger.restore();
    if (
      !state.isOpen ||
      state.isPinned ||
      this.config.toolbar.layoutMode !== "push"
    ) {
      return;
    }
    const height = this.ui.getToolbarHeight();
    const body = document.body;
    const bodyPadding = getComputedStyle(body).paddingTop || "0px";
    this.placementLedger.setStyle(
      body,
      "padding-top",
      `calc(${bodyPadding} + ${height}px)`,
    );

    for (const selector of this.config.toolbar.offsetSelectors) {
      for (const element of querySelectorAllSafe<HTMLElement>(document, selector)) {
        const position = getComputedStyle(element).position;
        if (position !== "fixed" && position !== "sticky") {
          continue;
        }
        const top = getComputedStyle(element).top;
        const baseline = top === "auto" ? "0px" : top;
        this.placementLedger.setStyle(
          element,
          "top",
          `calc(${baseline} + ${height}px)`,
        );
      }
    }
  }

  private markColorExclusions(): void {
    for (const selector of this.config.colorExclusions) {
      for (const element of querySelectorAllSafe<HTMLElement>(document, selector)) {
        this.effectLedger.setAttribute(
          element,
          "data-a11y-color-excluded",
          "",
        );
      }
    }
  }

  private resolveZoomTarget(): HTMLElement | null {
    const target = this.config.zoom.target;
    if (target instanceof HTMLElement) {
      return target.isConnected ? target : null;
    }
    if (typeof target === "string" && target) {
      try {
        return document.querySelector<HTMLElement>(target);
      } catch (error) {
        this.callbacks.onError(error, `缩放根节点选择器无效：${target}`);
        return null;
      }
    }
    return document.body;
  }

  private setCrosshairActive(active: boolean): void {
    if (active === this.crosshairBound) {
      if (!active) {
        this.ui.hideCrosshair();
      }
      return;
    }
    this.crosshairBound = active;
    if (active) {
      document.addEventListener("pointermove", this.handlePointerMove, {
        capture: true,
        passive: true,
      });
      document.addEventListener("focusin", this.handleFocus, true);
    } else {
      document.removeEventListener("pointermove", this.handlePointerMove, true);
      document.removeEventListener("focusin", this.handleFocus, true);
      this.ui.hideCrosshair();
    }
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.ui.containsEvent(event)) {
      this.ui.hideCrosshair();
      return;
    }
    this.ui.positionCrosshair(event.clientX, event.clientY);
  };

  private readonly handleFocus = (event: FocusEvent): void => {
    if (this.ui.containsEvent(event)) {
      this.ui.hideCrosshair();
      return;
    }
    const target = event.composedPath().find(
      (item): item is HTMLElement => item instanceof HTMLElement,
    );
    if (!target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    this.ui.positionCrosshair(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
  };

  private readonly handleFocusIn = (event: Event): void => {
    this.cancelFocusSync();
    if (this.ui.containsEvent(event)) {
      this.clearFocusHighlight();
      return;
    }
    const target = event
      .composedPath()
      .find((item): item is HTMLElement => isHTMLElement(item));
    if (!target || !this.isFocusHighlightTarget(target)) {
      this.clearFocusHighlight();
      return;
    }
    this.presentFocusTarget(target);
  };

  private readonly handleFocusOut = (): void => {
    this.scheduleFocusSync();
  };

  private readonly repositionHighlights = (): void => {
    if (this.readingHighlightedElement?.isConnected) {
      this.ui.positionHighlight(this.readingHighlightedElement);
    } else if (this.readingHighlightedElement) {
      this.clearHighlight();
    }
    if (
      this.regionHighlightedElement?.isConnected &&
      isVisible(this.regionHighlightedElement)
    ) {
      this.ui.positionRegionHighlight(this.regionHighlightedElement);
    } else if (this.regionHighlightedElement) {
      this.clearRegionHighlight();
    }
    if (
      this.focusedElement &&
      this.isFocusHighlightTarget(this.focusedElement) &&
      isElementCurrentlyFocused(this.focusedElement)
    ) {
      this.presentFocusTarget(this.focusedElement);
    } else if (this.focusedElement) {
      this.clearFocusHighlight();
    }
  };

  private readonly handleFullscreenChange = (): void => {
    this.callbacks.onFullscreenChange(Boolean(document.fullscreenElement));
  };

  private bindRootListeners(): void {
    for (const root of this.roots) {
      if (this.boundRoots.has(root)) {
        continue;
      }
      root.addEventListener("focusin", this.handleFocusIn, true);
      root.addEventListener("focusout", this.handleFocusOut, true);
      root.addEventListener("scroll", this.repositionHighlights, {
        capture: true,
        passive: true,
      });
      this.boundRoots.add(root);

      const view = getRootDocument(root).defaultView;
      if (view && !this.boundWindows.has(view)) {
        view.addEventListener("resize", this.repositionHighlights, {
          passive: true,
        });
        this.boundWindows.add(view);
      }
    }
  }

  private unbindRootListeners(): void {
    for (const root of this.boundRoots) {
      root.removeEventListener("focusin", this.handleFocusIn, true);
      root.removeEventListener("focusout", this.handleFocusOut, true);
      root.removeEventListener("scroll", this.repositionHighlights, true);
    }
    this.boundRoots.clear();
    for (const view of this.boundWindows) {
      view.removeEventListener("resize", this.repositionHighlights);
    }
    this.boundWindows.clear();
  }

  private scheduleFocusSync(): void {
    this.cancelFocusSync();
    this.focusSyncTimer = window.setTimeout(() => {
      this.focusSyncTimer = null;
      this.synchronizeFocusHighlight();
    }, 0);
  }

  private cancelFocusSync(): void {
    if (this.focusSyncTimer !== null) {
      window.clearTimeout(this.focusSyncTimer);
      this.focusSyncTimer = null;
    }
  }

  private synchronizeFocusHighlight(): void {
    if (
      this.focusedElement &&
      this.isFocusHighlightTarget(this.focusedElement) &&
      isElementCurrentlyFocused(this.focusedElement)
    ) {
      this.presentFocusTarget(this.focusedElement);
      return;
    }
    const activeElement = this.findActivePageElement();
    if (!activeElement) {
      this.clearFocusHighlight();
      return;
    }
    this.presentFocusTarget(activeElement);
  }

  private findActivePageElement(): HTMLElement | null {
    for (const root of this.roots) {
      const activeElement = getDeepActiveElement(root);
      if (
        activeElement &&
        this.isFocusHighlightTarget(activeElement) &&
        isElementCurrentlyFocused(activeElement)
      ) {
        return activeElement;
      }
    }
    return null;
  }

  private isFocusHighlightTarget(element: HTMLElement): boolean {
    return (
      element !== element.ownerDocument.body &&
      element !== element.ownerDocument.documentElement &&
      !isInsideToolHost(element) &&
      isVisible(element)
    );
  }

  clearFocusHighlight(): void {
    this.focusedElement = null;
    this.ui.hideFocusHighlight();
    this.releaseFocusPresentation();
  }

  private presentFocusTarget(element: HTMLElement): void {
    this.focusedElement = element;
    this.claimFocusPresentation(element);
    if (element === this.regionHighlightedElement) {
      this.ui.hideFocusHighlight();
    } else {
      this.ui.positionFocusHighlight(element);
    }
  }

  private claimFocusPresentation(element: HTMLElement): void {
    if (this.focusPresentationElement === element) {
      return;
    }
    this.releaseFocusPresentation();
    this.focusPresentationElement = element;
    this.focusPresentationLedger.setAttribute(
      element,
      "data-a11y-page-focus-owned",
      "",
    );
    const view = element.ownerDocument.defaultView;
    if (view?.getComputedStyle(element).outlineStyle !== "none") {
      this.focusPresentationLedger.setStyle(
        element,
        "outline-style",
        "none",
        "important",
      );
    }
  }

  private releaseFocusPresentation(): void {
    this.focusPresentationLedger.restore();
    this.focusPresentationElement = null;
  }
}

function getRootDocument(root: Document | ShadowRoot): Document {
  return root.nodeType === 9
    ? (root as Document)
    : (root.ownerDocument ?? document);
}

function getDeepActiveElement(
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

function isElementCurrentlyFocused(element: HTMLElement): boolean {
  let current: Element = element;
  while (true) {
    const root = current.getRootNode();
    if (root.nodeType === 9) {
      const documentRef = root as Document;
      if (documentRef.activeElement !== current) {
        return false;
      }
      const frame = documentRef.defaultView?.frameElement;
      if (!isHTMLElement(frame)) {
        return true;
      }
      current = frame;
      continue;
    }
    if (
      "activeElement" in root &&
      "host" in root &&
      (root as ShadowRoot).activeElement === current
    ) {
      current = (root as ShadowRoot).host;
      continue;
    }
    return false;
  }
}

function isInsideToolHost(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (current.closest(`[${TOOL_HOST_ATTRIBUTE}]`)) {
      return true;
    }
    const root = current.getRootNode();
    current =
      "host" in root && isHTMLElement(root.host) ? root.host : null;
  }
  return false;
}
