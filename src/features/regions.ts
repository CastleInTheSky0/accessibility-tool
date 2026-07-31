import {
  REGION_ALIASES,
  REGION_LABELS,
  REGION_TYPES,
  TOOL_HOST_ATTRIBUTE,
} from "../core/constants";
import type { ResolvedAccessibilityToolConfig } from "../core/config";
import { DomLedger } from "../core/dom-ledger";
import {
  isHTMLElement,
  isVisible,
  normalizeText,
  querySelectorAllSafe,
} from "../core/dom";
import type { RegionType, ScanRoot } from "../types";

export type RegionSource = "config" | "data" | "legacy" | "semantic";

export interface ScannedRegion {
  type: RegionType;
  element: HTMLElement;
  label: string;
  source: RegionSource;
}

export type RegionScanReason = "initial" | "mutation" | "route" | "manual";

interface RegionScannerCallbacks {
  onUpdate: (
    regions: readonly ScannedRegion[],
    roots: readonly (Document | ShadowRoot)[],
    reason: RegionScanReason,
  ) => void;
  onRouteChange: () => void;
  onError: (error: unknown, message: string) => void;
}

const SEMANTIC_SELECTORS: Readonly<Record<RegionType, string>> = {
  viewport: "",
  navigation: 'nav, [role="navigation"]',
  interaction: 'form, [role="form"], [role="search"]',
  service: "",
  list: [
    '[role="list"][aria-label]',
    '[role="list"][aria-labelledby]',
    '[role="list"][data-a11y-label]',
    '[role="list"][aria-readlabel]',
  ].join(","),
  content: 'main, article, [role="main"], [role="article"]',
};

export class RegionScanner {
  private readonly observers: MutationObserver[] = [];
  private readonly observedFrames = new Set<HTMLIFrameElement>();
  private readonly debugLedger = new DomLedger();
  private readonly invalidSelectors = new Set<string>();
  private readonly reportedIssues = new Set<string>();
  private regions: ScannedRegion[] = [];
  private roots: (Document | ShadowRoot)[] = [];
  private running = false;
  private scanTimer: number | null = null;
  private originalPushState: History["pushState"] | null = null;
  private originalReplaceState: History["replaceState"] | null = null;
  private pushStateWrapper: History["pushState"] | null = null;
  private replaceStateWrapper: History["replaceState"] | null = null;

  constructor(
    private config: ResolvedAccessibilityToolConfig,
    private readonly callbacks: RegionScannerCallbacks,
  ) {}

  updateConfig(config: ResolvedAccessibilityToolConfig): void {
    this.config = config;
    this.invalidSelectors.clear();
    this.reportedIssues.clear();
    if (this.running) {
      this.scan("manual");
    }
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.bindRouteEvents();
    this.scan("initial");
  }

  stop(): void {
    this.running = false;
    this.cancelScheduledScan();
    this.disconnectObservers();
    this.unbindFrameListeners();
    this.unbindRouteEvents();
    this.debugLedger.restore();
    this.regions = [];
    this.roots = [];
  }

  refresh(): void {
    if (this.running) {
      this.scan("manual");
    }
  }

  getRegions(type?: RegionType): readonly ScannedRegion[] {
    return type
      ? this.regions.filter((region) => region.type === type)
      : this.regions;
  }

  getRoots(): readonly (Document | ShadowRoot)[] {
    return this.roots;
  }

  private scan(reason: RegionScanReason): void {
    if (!this.running) {
      return;
    }
    const started = performance.now();
    const seenElements = new Set<HTMLElement>();
    const seenRoots = new Set<ScanRoot>();
    const nextRoots: (Document | ShadowRoot)[] = [];
    const nextRegions: ScannedRegion[] = [];
    const nextFrames = new Set<HTMLIFrameElement>();

    const visitRoot = (root: ScanRoot): void => {
      if (seenRoots.has(root)) {
        return;
      }
      seenRoots.add(root);
      if (isDocument(root) || isShadowRoot(root)) {
        nextRoots.push(root);
      }

      const elements: HTMLElement[] = [];
      if (isHTMLElement(root)) {
        elements.push(root);
      }
      elements.push(...querySelectorAllSafe<HTMLElement>(root, "*"));

      for (const element of elements) {
        if (seenElements.has(element)) {
          continue;
        }
        seenElements.add(element);

        const region = this.classify(element);
        if (region) {
          nextRegions.push(region);
        }

        if (element.hasAttribute(TOOL_HOST_ATTRIBUTE)) {
          continue;
        }

        if (element.shadowRoot) {
          visitRoot(element.shadowRoot);
        }
        if (element.tagName === "IFRAME") {
          const frame = element as HTMLIFrameElement;
          nextFrames.add(frame);
          if (!isVisible(frame)) {
            continue;
          }
          try {
            const frameDocument = frame.contentDocument;
            if (frameDocument?.documentElement) {
              visitRoot(frameDocument);
            }
          } catch {
            // Cross-origin frames remain atomic and are never traversed.
          }
        }
      }
    };

    visitRoot(document);
    for (const root of this.config.regions.additionalRoots) {
      visitRoot(root);
    }

    this.regions = nextRegions;
    this.roots = dedupe(nextRoots);
    this.rebindFrameListeners(nextFrames);
    this.updateDebugMarkers();
    this.rebindObservers();
    this.callbacks.onUpdate(this.regions, this.roots, reason);

    if (this.config.debug) {
      const elapsed = performance.now() - started;
      console.info(
        `[AccessibilityTool] 区域扫描完成：${this.regions.length} 个，${elapsed.toFixed(1)}ms。`,
      );
    }
  }

  private classify(element: HTMLElement): ScannedRegion | null {
    if (
      element.closest(`[${TOOL_HOST_ATTRIBUTE}]`) ||
      this.shouldIgnore(element) ||
      !isVisible(element)
    ) {
      return null;
    }

    const configured = this.matchConfiguredType(element);
    if (configured) {
      return this.createRegion(configured, element, "config");
    }

    const dataValue = element.getAttribute("data-a11y-region");
    if (dataValue !== null) {
      const type = REGION_ALIASES[dataValue.trim().toLowerCase()];
      if (type) {
        return this.createRegion(type, element, "data");
      }
      this.reportOnce(
        `data-region:${dataValue}`,
        new Error(`Unknown region value: ${dataValue}`),
        `忽略无法识别的 data-a11y-region 值“${dataValue}”。`,
      );
    }

    const legacyValue = element.getAttribute("aria-role");
    if (legacyValue !== null) {
      const type = REGION_ALIASES[legacyValue.trim().toLowerCase()];
      if (type) {
        return this.createRegion(type, element, "legacy");
      }
      this.reportOnce(
        `legacy-region:${legacyValue}`,
        new Error(`Unknown legacy region value: ${legacyValue}`),
        `忽略无法识别的 aria-role 值“${legacyValue}”。`,
      );
    }

    if (this.config.regions.autoDetect) {
      for (const type of REGION_TYPES) {
        const selector = SEMANTIC_SELECTORS[type];
        if (selector && this.matchesSafe(element, selector)) {
          return this.createRegion(type, element, "semantic");
        }
      }
    }
    return null;
  }

  private matchConfiguredType(element: HTMLElement): RegionType | null {
    for (const type of REGION_TYPES) {
      const raw = this.config.regions.selectors[type];
      const selectors = typeof raw === "string" ? [raw] : raw ?? [];
      for (const selector of selectors) {
        if (this.matchesSafe(element, selector)) {
          return type;
        }
      }
    }
    return null;
  }

  private createRegion(
    type: RegionType,
    element: HTMLElement,
    source: RegionSource,
  ): ScannedRegion {
    return {
      type,
      element,
      source,
      label: this.resolveLabel(element, type),
    };
  }

  private resolveLabel(element: HTMLElement, type: RegionType): string {
    const explicit =
      element.getAttribute("data-a11y-label") ??
      element.getAttribute("aria-readlabel") ??
      element.getAttribute("aria-label");
    if (explicit?.trim()) {
      return normalizeText(explicit);
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

    const heading = querySelectorAllSafe<HTMLElement>(
      element,
      "h1, h2, h3, h4, h5, h6",
    ).find(isVisible);
    if (heading?.textContent?.trim()) {
      return normalizeText(heading.textContent);
    }
    return REGION_LABELS[type];
  }

  private shouldIgnore(element: HTMLElement): boolean {
    if (element.closest("[data-a11y-ignore]")) {
      return true;
    }
    return this.config.regions.ignoreSelectors.some((selector) => {
      if (this.invalidSelectors.has(selector)) {
        return false;
      }
      try {
        return Boolean(element.closest(selector));
      } catch (error) {
        this.invalidSelectors.add(selector);
        this.reportOnce(
          `ignore-selector:${selector}`,
          error,
          `区域忽略选择器无效：${selector}`,
        );
        return false;
      }
    });
  }

  private matchesSafe(element: HTMLElement, selector: string): boolean {
    if (!selector) {
      return false;
    }
    if (this.invalidSelectors.has(selector)) {
      return false;
    }
    try {
      return element.matches(selector);
    } catch (error) {
      this.invalidSelectors.add(selector);
      this.reportOnce(
        `selector:${selector}`,
        error,
        `区域选择器无效：${selector}`,
      );
      return false;
    }
  }

  private rebindObservers(): void {
    this.disconnectObservers();
    if (!this.config.regions.observe) {
      return;
    }
    for (const root of this.roots) {
      const target = isDocument(root) ? root.documentElement : root;
      const ViewMutationObserver =
        root.ownerDocument?.defaultView?.MutationObserver ?? MutationObserver;
      const observer = new ViewMutationObserver(() => {
        this.scheduleScan("mutation");
      });
      try {
        observer.observe(target, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: [
            "hidden",
            "inert",
            "style",
            "class",
            "role",
            "aria-hidden",
            "aria-label",
            "aria-labelledby",
            "aria-role",
            "aria-readlabel",
            "data-a11y-region",
            "data-a11y-label",
            "data-a11y-ignore",
          ],
        });
        this.observers.push(observer);
      } catch (error) {
        this.report(error, "无法观察一个页面区域根节点。");
      }
    }
  }

  private disconnectObservers(): void {
    for (const observer of this.observers) {
      observer.disconnect();
    }
    this.observers.length = 0;
  }

  private rebindFrameListeners(frames: ReadonlySet<HTMLIFrameElement>): void {
    for (const frame of this.observedFrames) {
      if (!frames.has(frame)) {
        frame.removeEventListener("load", this.handleFrameLoad);
        this.observedFrames.delete(frame);
      }
    }
    for (const frame of frames) {
      if (!this.observedFrames.has(frame)) {
        frame.addEventListener("load", this.handleFrameLoad);
        this.observedFrames.add(frame);
      }
    }
  }

  private unbindFrameListeners(): void {
    for (const frame of this.observedFrames) {
      frame.removeEventListener("load", this.handleFrameLoad);
    }
    this.observedFrames.clear();
  }

  private scheduleScan(reason: Exclude<RegionScanReason, "initial" | "manual">): void {
    if (!this.running) {
      return;
    }
    this.cancelScheduledScan();
    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = null;
      this.scan(reason);
    }, this.config.regions.mutationDebounceMs);
  }

  private cancelScheduledScan(): void {
    if (this.scanTimer !== null) {
      window.clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }

  private updateDebugMarkers(): void {
    this.debugLedger.restore();
    if (!this.config.debug) {
      return;
    }
    for (const region of this.regions) {
      this.debugLedger.setAttribute(
        region.element,
        "data-a11y-tool-debug-region",
        `${region.type}:${region.source}`,
      );
    }
  }

  private bindRouteEvents(): void {
    window.addEventListener("popstate", this.handleRouteEvent);
    window.addEventListener("hashchange", this.handleRouteEvent);
    window.addEventListener("accessibility-tool:route", this.handleRouteEvent);
    const originalPush: History["pushState"] = Reflect.get(
      history,
      "pushState",
    );
    const originalReplace: History["replaceState"] = Reflect.get(
      history,
      "replaceState",
    );

    const dispatchRoute = (): void => {
      window.dispatchEvent(new Event("accessibility-tool:route"));
    };
    const pushStateWrapper: History["pushState"] = function (
      this: History,
      ...args
    ): void {
      Reflect.apply(originalPush, this, args);
      dispatchRoute();
    };
    const replaceStateWrapper: History["replaceState"] = function (
      this: History,
      ...args
    ): void {
      Reflect.apply(originalReplace, this, args);
      dispatchRoute();
    };
    this.originalPushState = originalPush;
    this.originalReplaceState = originalReplace;
    this.pushStateWrapper = pushStateWrapper;
    this.replaceStateWrapper = replaceStateWrapper;
    history.pushState = pushStateWrapper;
    history.replaceState = replaceStateWrapper;
  }

  private unbindRouteEvents(): void {
    window.removeEventListener("popstate", this.handleRouteEvent);
    window.removeEventListener("hashchange", this.handleRouteEvent);
    window.removeEventListener("accessibility-tool:route", this.handleRouteEvent);
    if (
      this.originalPushState &&
      this.pushStateWrapper &&
      Reflect.get(history, "pushState") === this.pushStateWrapper
    ) {
      history.pushState = this.originalPushState;
    }
    if (
      this.originalReplaceState &&
      this.replaceStateWrapper &&
      Reflect.get(history, "replaceState") === this.replaceStateWrapper
    ) {
      history.replaceState = this.originalReplaceState;
    }
    this.originalPushState = null;
    this.originalReplaceState = null;
    this.pushStateWrapper = null;
    this.replaceStateWrapper = null;
  }

  private readonly handleRouteEvent = (): void => {
    this.callbacks.onRouteChange();
    this.scheduleScan("route");
  };

  private readonly handleFrameLoad = (): void => {
    this.scheduleScan("mutation");
  };

  private report(error: unknown, message: string): void {
    this.callbacks.onError(error, message);
    if (this.config.strict) {
      throw error instanceof Error ? error : new Error(message);
    }
  }

  private reportOnce(key: string, error: unknown, message: string): void {
    if (this.config.strict || !this.reportedIssues.has(key)) {
      this.reportedIssues.add(key);
      this.report(error, message);
    }
  }
}

function isDocument(root: unknown): root is Document {
  return Boolean(
    root &&
      typeof root === "object" &&
      "nodeType" in root &&
      (root as Node).nodeType === 9,
  );
}

function isShadowRoot(root: unknown): root is ShadowRoot {
  return Boolean(
    root &&
      typeof root === "object" &&
      "host" in root &&
      "mode" in root,
  );
}

function getElementById(root: Node, id: string): HTMLElement | null {
  if ("getElementById" in root) {
    return (root as Document | ShadowRoot).getElementById(id);
  }
  return root.ownerDocument?.getElementById(id) ?? null;
}

function dedupe<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}
