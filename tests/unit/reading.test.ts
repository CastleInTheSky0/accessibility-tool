import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config";
import type { PageEffectsController } from "../../src/features/page-effects";
import { ReadingController } from "../../src/features/reading";
import { RegionNavigationController } from "../../src/features/region-navigation";
import type { ScannedRegion } from "../../src/features/regions";
import type { SpeechController } from "../../src/features/speech";
import { TabsController } from "../../src/features/tabs";

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
          isTabSpeechTarget: () => false,
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

  it.each(["reading-first", "tabs-first"] as const)(
    "keeps tab, panel and return speech single when listeners register %s",
    async (listenerOrder) => {
      document.body.innerHTML = `
        <div role="tablist">
          <button id="tab" role="tab" aria-controls="panel"><span id="tab-label">概览</span></button>
        </div>
        <section id="panel" role="tabpanel"><a id="inside-panel" href="#inside">面板链接</a></section>
      `;
      const speak = vi.fn();
      const speech = {
        speak,
        cancel: vi.fn(),
      } as unknown as SpeechController;
      const effects = {
        setHighlight: vi.fn(),
        clearHighlight: vi.fn(),
      };
      const tabs = new TabsController(DEFAULT_CONFIG, {
        onAnnounce: (message) => {
          reading.cancel();
          speak(message, "zh-CN", 1, {});
        },
        onError: vi.fn(),
        getRegionType: () => "content",
      });
      const reading = new ReadingController(
        DEFAULT_CONFIG,
        speech,
        effects as unknown as PageEffectsController,
        { isEnabled: () => true, getRate: () => 1 },
        {
          isRegionContainer: () => false,
          isTabSpeechTarget: (element) => tabs.isTabSpeechTarget(element),
        },
      );

      if (listenerOrder === "reading-first") {
        reading.setRoots([document]);
        reading.start();
        tabs.start([document]);
      } else {
        tabs.start([document]);
        reading.setRoots([document]);
        reading.start();
      }

      const tab = get("tab");
      const panel = get("panel");
      const inside = get("inside-panel");
      tab.focus();

      expect(speak).toHaveBeenCalledTimes(1);
      expect(speak).toHaveBeenLastCalledWith(
        "Tab，概览，正文区，当前有浮动窗口，按 ALT+下键进入窗口",
        "zh-CN",
        1,
        {},
      );

      get("tab-label").click();
      expect(speak).toHaveBeenCalledTimes(1);

      tab.dispatchEvent(key("ArrowDown", { altKey: true }));
      await frame();
      expect(document.activeElement).toBe(panel);
      expect(speak).toHaveBeenCalledTimes(2);
      expect(speak).toHaveBeenLastCalledWith(
        "您已进入概览正文区标签面板，按 Tab 键遍历信息，按 Esc 键退出面板并返回概览选项",
        "zh-CN",
        1,
        {},
      );

      inside.focus();
      expect(speak).toHaveBeenCalledTimes(3);
      expect(speak).toHaveBeenLastCalledWith(
        "链接，面板链接",
        "zh-CN",
        1,
        expect.any(Object),
      );

      inside.dispatchEvent(key("Escape"));
      await frame();
      expect(document.activeElement).toBe(tab);
      expect(speak).toHaveBeenCalledTimes(4);
      expect(speak).toHaveBeenLastCalledWith(
        "已返回概览选项",
        "zh-CN",
        1,
        {},
      );

      reading.stop();
      tabs.stop();
    },
  );

  it.each(["reading-first", "tabs-first"] as const)(
    "suppresses host autofocus only during panel entry when listeners register %s",
    async (listenerOrder) => {
      document.body.innerHTML = `
        <style>[role="tabpanel"][data-a11y-hidden] { display: none; }</style>
        <div role="tablist">
          <button id="autofocus-tab" role="tab" aria-controls="autofocus-panel" aria-selected="true">设置</button>
        </div>
        <section id="autofocus-panel" role="tabpanel" data-a11y-hidden>
          <button id="autofocus-control">自动聚焦控件</button>
        </section>
      `;
      const speak = vi.fn();
      const speech = {
        speak,
        cancel: vi.fn(),
      } as unknown as SpeechController;
      const effects = {
        setHighlight: vi.fn(),
        clearHighlight: vi.fn(),
      };
      const tab = get("autofocus-tab");
      const panel = get("autofocus-panel");
      const control = get("autofocus-control");
      tab.addEventListener("click", () => {
        panel.removeAttribute("data-a11y-hidden");
        control.focus();
      });
      const tabs = new TabsController(DEFAULT_CONFIG, {
        onAnnounce: (message) => {
          reading.cancel();
          speak(message, "zh-CN", 1, {});
        },
        onError: vi.fn(),
        getRegionType: () => "interaction",
      });
      const reading = new ReadingController(
        DEFAULT_CONFIG,
        speech,
        effects as unknown as PageEffectsController,
        { isEnabled: () => true, getRate: () => 1 },
        {
          isRegionContainer: () => false,
          isTabSpeechTarget: (element) => tabs.isTabSpeechTarget(element),
        },
      );

      if (listenerOrder === "reading-first") {
        reading.setRoots([document]);
        reading.start();
        tabs.start([document]);
      } else {
        tabs.start([document]);
        reading.setRoots([document]);
        reading.start();
      }

      tab.focus();
      speak.mockClear();
      tab.dispatchEvent(key("ArrowDown", { altKey: true }));
      await frame();

      expect(document.activeElement).toBe(panel);
      expect(speak).toHaveBeenCalledTimes(1);
      expect(speak).toHaveBeenLastCalledWith(
        "您已进入设置交互区标签面板，按 Tab 键遍历信息，按 Esc 键退出面板并返回设置选项",
        "zh-CN",
        1,
        {},
      );

      control.focus();
      expect(speak).toHaveBeenCalledTimes(2);
      expect(speak).toHaveBeenLastCalledWith(
        "按钮，自动聚焦控件",
        "zh-CN",
        1,
        expect.any(Object),
      );

      reading.stop();
      tabs.stop();
    },
  );

  it.each(["reading-first", "tabs-first"] as const)(
    "keeps Escape close-button and host-return side effects silent when listeners register %s",
    async (listenerOrder) => {
      document.body.innerHTML = `
        <style>[role="dialog"][data-a11y-hidden] { display: none; }</style>
        <div role="tablist">
          <button id="escape-tab" role="tab" aria-controls="escape-panel">设置</button>
        </div>
        <section id="escape-panel" role="dialog">
          <button id="escape-close" data-a11y-dialog-close>关闭窗口</button>
        </section>
      `;
      const speak = vi.fn();
      const speech = {
        speak,
        cancel: vi.fn(),
      } as unknown as SpeechController;
      const effects = {
        setHighlight: vi.fn(),
        clearHighlight: vi.fn(),
      };
      const tab = get("escape-tab");
      const panel = get("escape-panel");
      get("escape-close").addEventListener("click", () => {
        panel.setAttribute("data-a11y-hidden", "");
        tab.focus();
      });
      const tabs = new TabsController(DEFAULT_CONFIG, {
        onAnnounce: (message) => {
          reading.cancel();
          speak(message, "zh-CN", 1, {});
        },
        onError: vi.fn(),
        getRegionType: () => null,
      });
      const reading = new ReadingController(
        DEFAULT_CONFIG,
        speech,
        effects as unknown as PageEffectsController,
        { isEnabled: () => true, getRate: () => 1 },
        {
          isRegionContainer: () => false,
          isTabSpeechTarget: (element) => tabs.isTabSpeechTarget(element),
        },
      );

      if (listenerOrder === "reading-first") {
        reading.setRoots([document]);
        reading.start();
        tabs.start([document]);
      } else {
        tabs.start([document]);
        reading.setRoots([document]);
        reading.start();
      }

      tab.focus();
      tab.dispatchEvent(key("ArrowDown", { altKey: true }));
      await frame();
      expect(document.activeElement).toBe(panel);
      speak.mockClear();

      panel.dispatchEvent(key("Escape"));
      await frame();

      expect(document.activeElement).toBe(tab);
      expect(speak.mock.calls).toEqual([
        ["已返回设置选项", "zh-CN", 1, {}],
      ]);

      reading.stop();
      tabs.stop();
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

function key(value: string, options: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: value,
    bubbles: true,
    cancelable: true,
    ...options,
  });
}

async function frame(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25));
}
