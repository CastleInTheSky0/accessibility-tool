import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/core/config";
import { ToolbarUI } from "../../src/ui/toolbar";
import type {
  AccessibilityToolState,
  ColorScheme,
  RegionChangeEvent,
  RegionType,
} from "../../src/types";

describe("ToolbarUI", () => {
  it("keeps the brand rail non-interactive and preserves screen-mode order", () => {
    const { host, shadow, ui } = createToolbar();
    ui.updateState({ ...defaultState, isReadScreen: true });
    ui.setRegionCounts({
      viewport: 7,
      navigation: 3,
      interaction: 2,
      service: 1,
      list: 0,
      content: 4,
    });

    const brand = shadow.querySelector<HTMLElement>(".a11y-toolbar__brand");
    expect(brand?.getAttribute("aria-hidden")).toBe("true");
    expect(brand?.querySelectorAll("i")).toHaveLength(6);
    expect(brand?.querySelector("[data-toolbar-item]")).toBeNull();

    const actions = Array.from(
      shadow.querySelectorAll<HTMLElement>(
        '[data-mode="screen"] [data-toolbar-item]',
      ),
    ).map((control) => control.dataset.action);
    expect(actions).toEqual([
      "region:viewport",
      "region:navigation",
      "region:interaction",
      "region:service",
      "region:list",
      "region:content",
      "screenSound",
      "help",
      "readScreen",
      "exit",
    ]);

    const viewport = getControl(shadow, "region:viewport");
    expect(viewport.getAttribute("aria-label")).toBe("视窗区，共 7 个");
    expect(viewport.querySelector("[data-region-count]")?.textContent).toBe("7");
    expect(viewport.querySelector("[data-control-meta]")?.textContent).toBe(
      "ALT + 1",
    );
    const list = getControl(shadow, "region:list");
    expect(list.getAttribute("aria-disabled")).toBe("true");
    expect(list.querySelector("[data-control-meta]")?.textContent).toBe(
      "ALT + 5",
    );

    const sound = getControl(shadow, "screenSound");
    expect(sound.getAttribute("aria-label")).toBe("朗读，当前关闭");
    expect(sound.querySelector(".a11y-control__label")?.textContent).toBe(
      "朗读",
    );
    expect(sound.querySelector("[data-control-meta]")?.textContent).toBe(
      "关闭",
    );
    const readScreen = getControls(shadow, "readScreen")[1];
    expect(readScreen?.getAttribute("aria-pressed")).toBe("true");
    expect(readScreen?.querySelector("[data-control-meta]")?.textContent).toBe(
      "当前模式",
    );

    expect(ui.getToolbarHeight()).toBe(146);
    ui.destroy();
    host.remove();
  });

  it("renders one current region, moves it between categories and clears it", () => {
    const { host, shadow, ui } = createToolbar();
    ui.updateState({ ...defaultState, isReadScreen: true });
    ui.setRegionCounts({
      viewport: 7,
      navigation: 3,
      interaction: 2,
      service: 1,
      list: 0,
      content: 4,
    });

    const viewport = getControl(shadow, "region:viewport");
    const navigation = getControl(shadow, "region:navigation");
    ui.setCurrentRegion(regionChange("viewport", 0, 7));

    expect(viewport.getAttribute("aria-current")).toBe("location");
    expect(viewport.hasAttribute("data-region-current")).toBe(true);
    expect(viewport.getAttribute("aria-pressed")).toBeNull();
    expect(viewport.querySelector("[data-region-count]")?.textContent).toBe(
      "1/7",
    );
    expect(viewport.getAttribute("aria-label")).toBe("视窗区，共 7 个");
    expect(shadow.querySelectorAll('[aria-current="location"]')).toHaveLength(1);

    ui.setCurrentRegion(regionChange("viewport", 1, 7));
    expect(viewport.querySelector("[data-region-count]")?.textContent).toBe(
      "2/7",
    );

    ui.setCurrentRegion(regionChange("navigation", 0, 3));
    expect(viewport.hasAttribute("data-region-current")).toBe(false);
    expect(viewport.querySelector("[data-region-count]")?.textContent).toBe(
      "7",
    );
    expect(navigation.getAttribute("aria-current")).toBe("location");
    expect(navigation.querySelector("[data-region-count]")?.textContent).toBe(
      "1/3",
    );
    expect(shadow.querySelectorAll('[aria-current="location"]')).toHaveLength(1);

    ui.setRegionCounts({
      viewport: 7,
      navigation: 2,
      interaction: 2,
      service: 1,
      list: 0,
      content: 4,
    });
    expect(navigation.querySelector("[data-region-count]")?.textContent).toBe(
      "1/2",
    );

    ui.setRegionCounts({
      viewport: 7,
      navigation: 0,
      interaction: 2,
      service: 1,
      list: 0,
      content: 4,
    });
    expect(navigation.hasAttribute("data-region-current")).toBe(false);
    expect(navigation.hasAttribute("aria-current")).toBe(false);
    expect(navigation.querySelector("[data-region-count]")?.textContent).toBe(
      "0",
    );

    ui.setCurrentRegion(regionChange("content", 2, 4));
    ui.hide();
    expect(shadow.querySelector('[aria-current="location"]')).toBeNull();
    expect(
      getControl(shadow, "region:content").querySelector("[data-region-count]")
        ?.textContent,
    ).toBe("4");

    ui.destroy();
    host.remove();
  });

  it("applies hidden feature configuration to read-screen controls", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const config = mergeConfig(DEFAULT_CONFIG, {
      features: {
        reading: false,
        help: false,
        exit: false,
      },
    });
    const ui = new ToolbarUI(host, shadow, config, {
      onAction: vi.fn(),
      onRateChange: vi.fn(),
      onCollapsedChange: vi.fn(),
    });
    ui.updateState({ ...defaultState, isReadScreen: true });

    const actions = Array.from(
      shadow.querySelectorAll<HTMLElement>(
        '[data-mode="screen"] [data-toolbar-item]',
      ),
    ).map((control) => control.dataset.action);
    expect(actions).toEqual([
      "region:viewport",
      "region:navigation",
      "region:interaction",
      "region:service",
      "region:list",
      "region:content",
      "readScreen",
    ]);
    ui.destroy();
    host.remove();
  });

  it("keeps only the reading target as a toolbar-owned overlay", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const ui = new ToolbarUI(host, shadow, mergeConfig(DEFAULT_CONFIG), {
      onAction: vi.fn(),
      onRateChange: vi.fn(),
      onCollapsedChange: vi.fn(),
    });
    const target = document.createElement("button");
    document.body.prepend(target);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(
      new DOMRect(-20, -10, 100, 50),
    );

    ui.positionHighlight(target);
    const readingOverlay = shadow.querySelector<HTMLElement>(".a11y-highlight");
    expect(readingOverlay?.hidden).toBe(false);
    expect(readingOverlay?.style.getPropertyValue("--a11y-highlight-x")).toBe(
      "-20px",
    );
    expect(readingOverlay?.style.getPropertyValue("--a11y-highlight-y")).toBe(
      "-10px",
    );
    expect(shadow.querySelector(".a11y-region-highlight")).toBeNull();
    expect(shadow.querySelector(".a11y-focus-highlight")).toBeNull();

    ui.hideHighlight();
    expect(readingOverlay?.hidden).toBe(true);

    ui.destroy();
    target.remove();
    host.remove();
  });

  it("keeps every switch icon synchronized with its final pressed state", () => {
    const { host, shadow, ui } = createToolbar();
    ui.updateState(defaultState);

    const offStates = {
      reading: "sound-off",
      largeCursor: "cursor-off",
      crosshair: "crosshair-off",
      fullscreen: "fullscreen-enter",
      pin: "pin-off",
      readScreen: "read-screen-off",
      screenSound: "sound-off",
    } as const;
    const offMarkup = new Map<string, string>();
    for (const [action, iconState] of Object.entries(offStates)) {
      for (const control of getControls(shadow, action)) {
        expect(control.getAttribute("aria-pressed")).toBe("false");
        expectIconState(control, iconState);
        offMarkup.set(action, getIcon(control).innerHTML);
      }
    }
    expect(getControl(shadow, "speechRate").hasAttribute("aria-pressed")).toBe(
      false,
    );
    expect(getControl(shadow, "exit").hasAttribute("aria-pressed")).toBe(false);

    ui.updateState({
      ...defaultState,
      readingEnabled: true,
      largeCursor: true,
      crosshair: true,
      isFullscreen: true,
      isPinned: true,
      isReadScreen: true,
    });

    const onStates = {
      reading: "sound-on",
      largeCursor: "cursor-on",
      crosshair: "crosshair-on",
      fullscreen: "fullscreen-exit",
      pin: "pin-on",
      readScreen: "read-screen-on",
      screenSound: "sound-on",
    } as const;
    for (const [action, iconState] of Object.entries(onStates)) {
      for (const control of getControls(shadow, action)) {
        expect(control.getAttribute("aria-pressed")).toBe("true");
        expectIconState(control, iconState);
        expect(getIcon(control).innerHTML).not.toBe(offMarkup.get(action));
      }
    }
    expect(getIcon(getControl(shadow, "reading")).innerHTML).toBe(
      getIcon(getControl(shadow, "screenSound")).innerHTML,
    );
    expect(getControl(shadow, "reading").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(getControl(shadow, "pin").getAttribute("aria-pressed")).toBe(
      "true",
    );

    ui.destroy();
    host.remove();
  });

  it("renders the current palette and rate while keeping zoom icons fixed", () => {
    const { host, shadow, ui } = createToolbar();
    const rate = getControl(shadow, "speechRate");
    const color = getControl(shadow, "colorScheme");
    const zoomIn = getControl(shadow, "zoomIn");
    const zoomOut = getControl(shadow, "zoomOut");

    ui.updateState({ ...defaultState, speechRate: 0.5, zoom: 0.75 });
    expectIconState(rate, "rate-0.5");
    const slowPointer = getIndicator(rate, "rate");
    const zoomInMarkup = getIcon(zoomIn).innerHTML;
    const zoomOutMarkup = getIcon(zoomOut).innerHTML;

    ui.updateState({ ...defaultState, speechRate: 2, zoom: 2 });
    expectIconState(rate, "rate-2");
    expect(getIndicator(rate, "rate")).not.toBe(slowPointer);
    expect(getIcon(zoomIn).innerHTML).toBe(zoomInMarkup);
    expect(getIcon(zoomOut).innerHTML).toBe(zoomOutMarkup);
    expect(zoomInMarkup).not.toBe(zoomOutMarkup);
    expect(zoomIn.querySelector("[data-control-meta]")?.textContent).toBe(
      "200%",
    );
    expect(zoomOut.getAttribute("aria-label")).toBe("缩小，当前 200%");

    const schemes: readonly ColorScheme[] = [
      "original",
      "white-black",
      "black-yellow",
      "yellow-black",
      "blue-white",
    ];
    const paletteMarkup = new Set<string>();
    for (const scheme of schemes) {
      ui.updateState({ ...defaultState, colorScheme: scheme });
      expectIconState(color, `scheme-${scheme}`);
      const svg = getIcon(color).querySelector("svg");
      expect(svg?.getAttribute("data-color-scheme")).toBe(scheme);
      paletteMarkup.add(getIcon(color).innerHTML);
    }
    expect(paletteMarkup.size).toBe(schemes.length);

    ui.destroy();
    host.remove();
  });

  it("renders descriptive metadata for every main toolbar action", () => {
    const { host, shadow, ui } = createToolbar();
    ui.updateState({
      ...defaultState,
      readingEnabled: true,
      speechRate: 1.25,
      colorScheme: "black-yellow",
      zoom: 1.25,
      largeCursor: true,
      isFullscreen: true,
      isPinned: true,
    });

    const expectedMeta = {
      reading: "开启",
      speechRate: "1.25×",
      colorScheme: "黑底黄字",
      zoomIn: "125%",
      zoomOut: "125%",
      largeCursor: "开启",
      crosshair: "关闭",
      fullscreen: "全屏",
      pin: "已开启",
      reset: "恢复默认",
      help: "操作说明",
      readScreen: "标准模式",
      exit: "关闭工具",
    } as const;
    for (const [action, meta] of Object.entries(expectedMeta)) {
      const control = getControls(shadow, action)[0];
      expect(control?.querySelector("[data-control-meta]")?.textContent).toBe(
        meta,
      );
    }
    expect(getControl(shadow, "reading").getAttribute("aria-label")).toBe(
      "朗读，当前开启",
    );
    expect(getControl(shadow, "pin").getAttribute("aria-label")).toBe(
      "固定，当前已固定",
    );

    ui.destroy();
    host.remove();
  });
});

function createToolbar(): {
  host: HTMLDivElement;
  shadow: ShadowRoot;
  ui: ToolbarUI;
} {
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const ui = new ToolbarUI(host, shadow, mergeConfig(DEFAULT_CONFIG), {
    onAction: vi.fn(),
    onRateChange: vi.fn(),
    onCollapsedChange: vi.fn(),
  });
  return { host, shadow, ui };
}

function getControls(shadow: ShadowRoot, action: string): HTMLElement[] {
  return Array.from(
    shadow.querySelectorAll<HTMLElement>(`[data-action="${action}"]`),
  );
}

function getControl(shadow: ShadowRoot, action: string): HTMLElement {
  const control = getControls(shadow, action)[0];
  if (!control) {
    throw new Error(`Missing toolbar control: ${action}`);
  }
  return control;
}

function getIcon(control: HTMLElement): HTMLElement {
  const icon = control.querySelector<HTMLElement>(".a11y-control__icon");
  if (!icon) {
    throw new Error(`Missing icon for ${control.dataset.action ?? "control"}`);
  }
  return icon;
}

function expectIconState(control: HTMLElement, state: string): void {
  expect(control.getAttribute("data-icon-state")).toBe(state);
  const icon = getIcon(control);
  expect(icon.getAttribute("data-icon-state")).toBe(state);
  const svg = icon.querySelector("svg");
  expect(svg?.getAttribute("aria-hidden")).toBe("true");
  expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
  expect(svg?.getAttribute("focusable")).toBe("false");
}

function getIndicator(control: HTMLElement, type: "rate"): string {
  const indicator = getIcon(control).querySelector(
    `[data-icon-indicator="${type}"]`,
  );
  const path = indicator?.getAttribute("d");
  if (!path) {
    throw new Error(`Missing ${type} icon indicator`);
  }
  return path;
}

function regionChange(
  type: RegionType,
  index: number,
  count: number,
): RegionChangeEvent {
  return {
    type,
    index,
    count,
    element: document.createElement("section"),
    label: type,
  };
}

const defaultState: AccessibilityToolState = {
  isOpen: true,
  isPinned: false,
  isCollapsed: false,
  isReadScreen: false,
  readingEnabled: false,
  speechRate: 1,
  colorScheme: "original",
  zoom: 1,
  largeCursor: false,
  crosshair: false,
  isFullscreen: false,
};
