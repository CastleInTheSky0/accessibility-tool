import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/core/config";
import { ToolbarUI } from "../../src/ui/toolbar";
import type { AccessibilityToolState } from "../../src/types";

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

  it("keeps focus, region and reading overlays independent inside the viewport", () => {
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
    ui.positionRegionHighlight(target);
    ui.positionFocusHighlight(target);
    const readingOverlay = shadow.querySelector<HTMLElement>(".a11y-highlight");
    const regionOverlay = shadow.querySelector<HTMLElement>(
      ".a11y-region-highlight",
    );
    const focusOverlay = shadow.querySelector<HTMLElement>(
      ".a11y-focus-highlight",
    );
    expect(readingOverlay?.hidden).toBe(false);
    expect(regionOverlay?.hidden).toBe(false);
    expect(focusOverlay?.hidden).toBe(false);
    expect(focusOverlay?.style.getPropertyValue("--a11y-focus-highlight-x")).toBe(
      "6px",
    );
    expect(focusOverlay?.style.getPropertyValue("--a11y-focus-highlight-y")).toBe(
      "6px",
    );

    ui.hideHighlight();
    expect(readingOverlay?.hidden).toBe(true);
    expect(regionOverlay?.hidden).toBe(false);
    expect(focusOverlay?.hidden).toBe(false);

    ui.hideRegionHighlight();
    expect(regionOverlay?.hidden).toBe(true);
    expect(focusOverlay?.hidden).toBe(false);

    ui.destroy();
    target.remove();
    host.remove();
  });
});

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
