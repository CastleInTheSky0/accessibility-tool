import { describe, expect, it } from "vitest";
import { MAIN_FEATURE_ORDER } from "../../src/core/constants";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/core/config";

describe("configuration", () => {
  it("deep-merges site configuration without losing defaults", () => {
    const config = mergeConfig(DEFAULT_CONFIG, {
      features: { crosshair: false },
      toolbar: {
        layoutMode: "overlay",
        theme: { accent: "#0af" },
      },
      regions: {
        selectors: { service: "[data-service]" },
      },
      tabs: { dialogSelectors: [".floating"] },
    });

    expect(config.toolbar.layoutMode).toBe("overlay");
    expect(config.persistOpenState).toBe(true);
    expect(config.toolbar.theme.accent).toBe("#0af");
    expect(config.toolbar.theme.background).toBe("#181b1e");
    expect(config.toolbar.theme.controlBackground).toBe("#292e32");
    expect(config.toolbar.theme.controlForeground).toBe("#f5f5f2");
    expect(config.toolbar.theme.danger).toBe("#ff1f1f");
    expect(config.toolbar.theme.height).toBe("146px");
    expect(config.toolbar.theme.controlRadius).toBe("13px");
    expect(config.toolbar.theme.controlSize).toBe("84px");
    expect(config.toolbar.theme.gap).toBe("0px");
    expect(config.features.crosshair).toBe(false);
    expect(config.features.reading).toBe(true);
    expect(config.regions.selectors.service).toBe("[data-service]");
    expect(config.tabs.dialogSelectors).toEqual([".floating"]);
  });

  it("keeps the confirmed feature order", () => {
    expect(MAIN_FEATURE_ORDER).toEqual([
      "reading",
      "continuousReading",
      "speechRate",
      "voiceSelection",
      "colorScheme",
      "zoomIn",
      "zoomOut",
      "largeCursor",
      "crosshair",
      "fullscreen",
      "largeCaption",
      "pin",
      "reset",
      "help",
      "readScreen",
      "exit",
    ]);
  });
});
