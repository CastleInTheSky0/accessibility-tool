import type { ResolvedAccessibilityToolConfig } from "../core/config";
import { DomLedger } from "../core/dom-ledger";
import { querySelectorAllSafe } from "../core/dom";
import type { AccessibilityToolState } from "../types";
import type { ToolbarUI } from "../ui/toolbar";

interface PageEffectsCallbacks {
  onFullscreenChange: (isFullscreen: boolean) => void;
  onError: (error: unknown, message: string) => void;
}

export class PageEffectsController {
  private readonly effectLedger = new DomLedger();
  private readonly placementLedger = new DomLedger();
  private state: AccessibilityToolState | null = null;
  private highlightedElement: HTMLElement | null = null;
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
    window.addEventListener("resize", this.repositionHighlight, { passive: true });
    document.addEventListener("scroll", this.repositionHighlight, {
      capture: true,
      passive: true,
    });
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
    this.highlightedElement = element;
    if (element?.isConnected) {
      this.ui.positionHighlight(element);
    } else {
      this.ui.hideHighlight();
    }
  }

  clearHighlight(element?: HTMLElement): void {
    if (element && this.highlightedElement !== element) {
      return;
    }
    this.highlightedElement = null;
    this.ui.hideHighlight();
  }

  destroy(): void {
    this.deactivate();
    if (this.started) {
      document.removeEventListener(
        "fullscreenchange",
        this.handleFullscreenChange,
      );
      window.removeEventListener("resize", this.repositionHighlight);
      document.removeEventListener("scroll", this.repositionHighlight, true);
    }
    this.started = false;
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

  private readonly repositionHighlight = (): void => {
    if (this.highlightedElement?.isConnected) {
      this.ui.positionHighlight(this.highlightedElement);
    }
  };

  private readonly handleFullscreenChange = (): void => {
    this.callbacks.onFullscreenChange(Boolean(document.fullscreenElement));
  };
}
