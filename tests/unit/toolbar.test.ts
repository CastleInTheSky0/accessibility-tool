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
