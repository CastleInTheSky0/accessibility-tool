import { afterAll, describe, expect, it, vi } from "vitest";
import { accessibilityTool } from "../../src/tool";
import type {
  SpeechAdapter,
  SpeechRequestOptions,
} from "../../src/types";

const speech: SpeechAdapter = {
  speak: vi.fn((_text: string, options: SpeechRequestOptions) => {
    options.onStart?.();
    options.onEnd?.();
  }),
  cancel: vi.fn(),
  isSupported: () => true,
};

describe("AccessibilityTool singleton lifecycle", () => {
  afterAll(async () => {
    await accessibilityTool.destroy();
  });

  it("opens lazily, preserves feature order and restores trigger focus", async () => {
    document.body.innerHTML = `
      <button id="launcher" aria-expanded="mixed">打开工具</button>
      <nav data-a11y-region="navigation" data-a11y-label="主导航"></nav>
      <main data-a11y-region="content" data-a11y-label="正文"></main>
    `;
    const launcher = document.getElementById("launcher") as HTMLButtonElement;
    accessibilityTool.configure({
      debug: true,
      storageKey: "test:tool-state",
      speech: { adapter: speech },
      regions: { observe: false },
    });

    expect(document.querySelector("[data-a11y-tool-host]")).toBeNull();
    await accessibilityTool.open({ trigger: launcher });

    const host = document.querySelector<HTMLElement>("[data-a11y-tool-host]");
    const shadow = host?.shadowRoot;
    expect(host).not.toBeNull();
    expect(shadow).not.toBeNull();
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(launcher.getAttribute("aria-controls")).toBe(host?.id);

    const labels = Array.from(
      shadow?.querySelectorAll<HTMLElement>(
        '[data-mode="main"] [data-toolbar-item] .a11y-control__label',
      ) ?? [],
    ).map((element) => element.textContent);
    expect(labels).toEqual([
      "朗读",
      "语速",
      "配色",
      "放大",
      "缩小",
      "大鼠标",
      "十字线",
      "大界面",
      "固定",
      "重置",
      "帮助",
      "读屏专用",
      "退出",
    ]);

    const colorButton = shadow?.querySelector<HTMLElement>(
      '[data-action="colorScheme"]',
    );
    colorButton?.click();
    expect(accessibilityTool.getState().colorScheme).toBe("white-black");
    expect(document.documentElement.dataset.a11yColorScheme).toBe("white-black");

    await accessibilityTool.close();
    expect(accessibilityTool.getState().isOpen).toBe(false);
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(launcher);
    expect(document.documentElement.hasAttribute("data-a11y-color-scheme")).toBe(
      false,
    );

    await accessibilityTool.open({ trigger: launcher });
    expect(accessibilityTool.getState().colorScheme).toBe("white-black");
    await accessibilityTool.destroy();
    expect(document.querySelector("[data-a11y-tool-host]")).toBeNull();
    expect(launcher.getAttribute("aria-expanded")).toBe("mixed");
    expect(launcher.hasAttribute("aria-controls")).toBe(false);
  });
});
