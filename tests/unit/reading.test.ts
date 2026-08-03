import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config";
import type { PageEffectsController } from "../../src/features/page-effects";
import { ReadingController } from "../../src/features/reading";
import { RegionNavigationController } from "../../src/features/region-navigation";
import type { ScannedRegion } from "../../src/features/regions";
import type { SpeechController } from "../../src/features/speech";

describe("ReadingController region focus coordination", () => {
  it.each(["reading-first", "region-first"] as const)(
    "keeps one region announcement when listeners register %s",
    (listenerOrder) => {
      document.body.innerHTML = `
        <section id="service-region">
          <a id="inside" href="#inside">内部链接</a>
        </section>
      `;
      const regionElement = get("service-region");
      const inside = get("inside");
      const announce = vi.fn();
      const speak = vi.fn();
      const speech = {
        speak,
        cancel: vi.fn(),
      } as unknown as SpeechController;
      const effects = {
        setHighlight: vi.fn(),
        clearHighlight: vi.fn(),
        setRegionHighlight: vi.fn(),
        clearRegionHighlight: vi.fn(),
      };
      const regionNavigation = new RegionNavigationController(effects, {
        getToolbarOffset: () => 102,
        onCountsChange: vi.fn(),
        onAnnounce: (message) => {
          announce(message);
          speak(message, "zh-CN", 1, {});
        },
        onRegionChange: vi.fn(),
        onReturnToCategory: vi.fn(),
        onDynamicUpdate: vi.fn(),
      });
      const reading = new ReadingController(
        DEFAULT_CONFIG,
        speech,
        effects as unknown as PageEffectsController,
        { isEnabled: () => true, getRate: () => 1 },
        {
          isRegionContainer: (element) =>
            regionNavigation.isRegionContainer(element),
        },
      );
      const scannedRegion: ScannedRegion = {
        type: "service",
        element: regionElement,
        label: "办事",
        source: "data",
      };

      if (listenerOrder === "reading-first") {
        reading.setRoots([document]);
        reading.start();
        regionNavigation.start();
        regionNavigation.update([scannedRegion], [document], "initial");
      } else {
        regionNavigation.start();
        regionNavigation.update([scannedRegion], [document], "initial");
        reading.setRoots([document]);
        reading.start();
      }

      regionElement.focus();

      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(
        "提示：您已进入办事服务区，按下 Tab 键浏览信息；第 1 个，共 1 个",
      );
      expect(speak).toHaveBeenCalledTimes(1);
      expect(speak).toHaveBeenCalledWith(
        "提示：您已进入办事服务区，按下 Tab 键浏览信息；第 1 个，共 1 个",
        "zh-CN",
        1,
        {},
      );

      reading.speakElement(regionElement, true);
      expect(speak).toHaveBeenCalledTimes(1);

      inside.focus();

      expect(announce).toHaveBeenCalledTimes(1);
      expect(speak).toHaveBeenCalledTimes(2);
      expect(speak).toHaveBeenLastCalledWith(
        "链接，内部链接",
        "zh-CN",
        1,
        expect.any(Object),
      );
      expect(effects.clearRegionHighlight).not.toHaveBeenCalled();

      reading.stop();
      regionNavigation.stop();
    },
  );
});

function get(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}
