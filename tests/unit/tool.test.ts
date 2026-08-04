import { afterAll, describe, expect, it, vi } from "vitest";
import { AccessibilityToolRuntime, accessibilityTool } from "../../src/tool";
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

  it("cycles speech rate presets directly from a non-preset value", async () => {
    const storageKey = "test:direct-rate-cycle";
    localStorage.removeItem(storageKey);
    document.body.innerHTML = '<button id="rate-launcher">打开工具</button>';
    const launcher = document.getElementById(
      "rate-launcher",
    ) as HTMLButtonElement;
    const speak = vi.fn(
      (_text: string, options: SpeechRequestOptions) => {
        options.onStart?.();
        options.onEnd?.();
      },
    );
    const runtime = new AccessibilityToolRuntime();

    try {
      runtime.configure({
        debug: true,
        storageKey,
        speech: {
          adapter: {
            speak,
            cancel: vi.fn(),
            isSupported: () => true,
          },
          defaultRate: 1.1,
        },
        regions: { observe: false },
      });
      await runtime.open({ trigger: launcher });

      const host = document.querySelector<HTMLElement>(
        "[data-a11y-tool-host]",
      );
      const shadow = host?.shadowRoot;
      const rate = shadow?.querySelector<HTMLButtonElement>(
        '[data-action="speechRate"]',
      );
      const reading = shadow?.querySelector<HTMLButtonElement>(
        '[data-action="reading"]',
      );
      const liveRegion = shadow?.querySelector<HTMLElement>('[role="status"]');
      expect(rate).not.toBeNull();
      expect(reading).not.toBeNull();
      expect(shadow?.querySelector('[role="dialog"]')).toBeNull();
      expect(rate?.hasAttribute("aria-haspopup")).toBe(false);
      expect(rate?.hasAttribute("aria-expanded")).toBe(false);
      expect(rate?.hasAttribute("aria-controls")).toBe(false);
      expect(runtime.getState().speechRate).toBe(1.1);

      reading?.click();
      expect(runtime.getState().readingEnabled).toBe(true);
      speak.mockClear();

      rate?.click();
      expect(runtime.getState().speechRate).toBe(1.25);
      expect(rate?.getAttribute("data-icon-state")).toBe("rate-1.25");
      expect(rate?.getAttribute("aria-label")).toBe(
        "语速，当前 1.25 倍",
      );
      expect(rate?.querySelector("[data-control-meta]")?.textContent).toBe(
        "1.25×",
      );
      await new Promise((resolve) => window.setTimeout(resolve, 30));
      expect(liveRegion?.textContent).toBe("当前语速 1.25 倍");
      expect(speak).toHaveBeenLastCalledWith(
        "当前语速 1.25 倍",
        expect.objectContaining({ rate: 1.25 }),
      );

      rate?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
      expect(runtime.getState().speechRate).toBe(1.5);
      rate?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: " " }),
      );
      expect(runtime.getState().speechRate).toBe(0.75);
      rate?.click();
      expect(runtime.getState().speechRate).toBe(1);
      rate?.click();
      expect(runtime.getState().speechRate).toBe(1.25);

      const persisted = JSON.parse(
        localStorage.getItem(storageKey) ?? "null",
      ) as { preferences?: { speechRate?: number } } | null;
      expect(persisted?.preferences?.speechRate).toBe(1.25);

      reading?.click();
      expect(runtime.getState()).toMatchObject({
        readingEnabled: false,
        speechRate: 1.25,
      });
    } finally {
      await runtime.destroy();
      localStorage.removeItem(storageKey);
    }
  });

  it("wraps a non-preset speech rate above the highest preset", async () => {
    const storageKey = "test:direct-rate-wrap";
    localStorage.removeItem(storageKey);
    document.body.innerHTML = '<button id="rate-wrap-launcher">打开工具</button>';
    const launcher = document.getElementById(
      "rate-wrap-launcher",
    ) as HTMLButtonElement;
    const runtime = new AccessibilityToolRuntime();

    try {
      runtime.configure({
        debug: true,
        storageKey,
        speech: {
          adapter: {
            speak: vi.fn(),
            cancel: vi.fn(),
            isSupported: () => true,
          },
          defaultRate: 1.8,
        },
        regions: { observe: false },
      });
      await runtime.open({ trigger: launcher });

      const rate = document
        .querySelector<HTMLElement>("[data-a11y-tool-host]")
        ?.shadowRoot?.querySelector<HTMLButtonElement>(
          '[data-action="speechRate"]',
        );
      expect(runtime.getState().speechRate).toBe(1.8);

      rate?.click();

      expect(runtime.getState().speechRate).toBe(0.75);
      expect(rate?.getAttribute("aria-label")).toBe("语速，当前 0.75 倍");
    } finally {
      await runtime.destroy();
      localStorage.removeItem(storageKey);
    }
  });
});
