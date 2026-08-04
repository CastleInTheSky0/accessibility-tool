import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/core/config";
import { ToolbarUI } from "../../src/ui/toolbar";
import type { AccessibilityToolState, ColorScheme } from "../../src/types";

describe("ToolbarUI", () => {
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
