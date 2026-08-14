import { describe, expect, it, vi } from "vitest";
import { convertCaptionText } from "../../src/language/opencc";
import {
  createCaptionLanguageRuntime,
  type CaptionLanguageRuntime,
} from "../../src/ui/caption-language";
import {
  deriveCaptionPresentation,
  LargeCaptionUI,
} from "../../src/ui/large-caption";
import type { AccessibilityToolState } from "../../src/types";

describe("large-caption language presentation", () => {
  it("converts both directions with the standard simplified/traditional presets", () => {
    expect(convertCaptionText("汉语龙马", "traditional")).toBe("漢語龍馬");
    expect(convertCaptionText("漢語龍馬", "simplified")).toBe("汉语龙马");
  });

  it("keeps non-Chinese content and builds tone-marked pinyin DOM segments", async () => {
    const presentation = await deriveCaptionPresentation(
      "重庆 A11Y，2026。",
      "traditional",
      true,
    );

    expect(presentation.text).toBe("重慶 A11Y，2026。");
    expect(presentation.segments?.map(({ text }) => text).join("")).toBe(
      presentation.text,
    );
    expect(
      presentation.segments
        ?.filter(({ isChinese }) => isChinese)
        .map(({ pinyin }) => pinyin),
    ).toEqual(expect.arrayContaining(["chóng", "qìng"]));
    expect(
      presentation.segments
        ?.filter(({ isChinese }) => !isChinese)
        .map(({ text }) => text)
        .join(""),
    ).toContain("A11Y，2026。");
  });

  it("derives every visual mode from the same original snapshot", async () => {
    const original = "后台发展";
    const traditional = await deriveCaptionPresentation(
      original,
      "traditional",
      false,
    );
    const simplified = await deriveCaptionPresentation(
      original,
      "simplified",
      false,
    );

    expect(traditional.text).toBe(convertCaptionText(original, "traditional"));
    expect(simplified.text).toBe(convertCaptionText(original, "simplified"));
    expect(original).toBe("后台发展");
  });

  it("loads each language module once and retries a failed import with the next attempt", async () => {
    const firstOpenCC = deferred<{ convertCaptionText: typeof convertCaptionText }>();
    const openCCImporter = vi.fn((attempt: number) =>
      attempt === 0
        ? firstOpenCC.promise
        : Promise.resolve({ convertCaptionText }),
    );
    const runtime = createCaptionLanguageRuntime({
      openCC: openCCImporter,
    });

    const first = runtime.loadOpenCC();
    expect(runtime.loadOpenCC()).toBe(first);
    expect(openCCImporter).toHaveBeenCalledTimes(1);

    firstOpenCC.reject(new Error("language chunk unavailable"));
    await expect(first).rejects.toThrow("language chunk unavailable");

    const retry = runtime.loadOpenCC();
    expect(runtime.loadOpenCC()).toBe(retry);
    await expect(retry).resolves.toEqual({ convertCaptionText });
    expect(openCCImporter.mock.calls.map(([attempt]) => attempt)).toEqual([
      0,
      1,
    ]);
  });

  it("single-flights and retries the pinyin module independently", async () => {
    const pinyinModule = {
      annotateCaptionPinyin: () => [],
    };
    const firstPinyin = deferred<typeof pinyinModule>();
    const pinyinImporter = vi.fn((attempt: number) =>
      attempt === 0
        ? firstPinyin.promise
        : Promise.resolve(pinyinModule),
    );
    const runtime = createCaptionLanguageRuntime({
      pinyin: pinyinImporter,
    });

    const first = runtime.loadPinyin();
    expect(runtime.loadPinyin()).toBe(first);
    expect(pinyinImporter).toHaveBeenCalledTimes(1);

    firstPinyin.reject(new Error("pinyin chunk unavailable"));
    await expect(first).rejects.toThrow("pinyin chunk unavailable");

    const retry = runtime.loadPinyin();
    expect(runtime.loadPinyin()).toBe(retry);
    await expect(retry).resolves.toBe(pinyinModule);
    expect(pinyinImporter.mock.calls.map(([attempt]) => attempt)).toEqual([
      0,
      1,
    ]);
  });

  it("does not request the pinyin module until pinyin is enabled", async () => {
    const loadOpenCC = vi.fn(() => Promise.resolve({ convertCaptionText }));
    const loadPinyin = vi.fn(() => Promise.resolve({
      annotateCaptionPinyin: () => [],
    }));
    const runtime: CaptionLanguageRuntime = { loadOpenCC, loadPinyin };

    await deriveCaptionPresentation("汉字", "simplified", false, runtime);
    expect(loadOpenCC).toHaveBeenCalledOnce();
    expect(loadPinyin).not.toHaveBeenCalled();

    await deriveCaptionPresentation("汉字", "simplified", true, runtime);
    expect(loadPinyin).toHaveBeenCalledOnce();
  });

  it("shows original text immediately and ignores an older text result", async () => {
    const openCC = deferred<{ convertCaptionText: typeof convertCaptionText }>();
    const runtime = languageRuntime(openCC.promise);
    const fixture = createCaptionFixture(runtime);

    try {
      fixture.ui.updatePreferences({
        ...defaultState,
        captionScript: "traditional",
      });
      fixture.ui.show({ text: "第一条", status: "显示中" }, true);
      expect(fixture.text.textContent).toBe("第一条");

      fixture.ui.show({ text: "第二条", status: "显示中" }, true);
      openCC.resolve({ convertCaptionText });

      await vi.waitFor(() => {
        expect(fixture.text.textContent).toBe("第二條");
      });
    } finally {
      fixture.destroy();
    }
  });

  it("retries a failed language load for a new request with the same text", async () => {
    const firstOpenCC = deferred<{
      convertCaptionText: typeof convertCaptionText;
    }>();
    const openCCImporter = vi.fn((attempt: number) =>
      attempt === 0
        ? firstOpenCC.promise
        : Promise.resolve({
            convertCaptionText: () => "重试成功",
          }),
    );
    const fixture = createCaptionFixture(createCaptionLanguageRuntime({
      openCC: openCCImporter,
    }));

    try {
      fixture.ui.updatePreferences({
        ...defaultState,
        captionScript: "traditional",
      });
      fixture.ui.show({ text: "相同正文", status: "显示中" }, true);
      expect(fixture.text.textContent).toBe("相同正文");

      firstOpenCC.reject(new Error("language chunk unavailable"));
      await firstOpenCC.promise.catch(() => undefined);
      await Promise.resolve();

      fixture.ui.show({ text: "相同正文", status: "显示中" }, true);
      await vi.waitFor(() => {
        expect(fixture.text.textContent).toBe("重试成功");
      });
      expect(openCCImporter.mock.calls.map(([attempt]) => attempt)).toEqual([
        0,
        1,
      ]);
    } finally {
      fixture.destroy();
    }
  });

  it("does not commit an older result into a new request with the same text", async () => {
    const firstOpenCC = deferred<{
      convertCaptionText: typeof convertCaptionText;
    }>();
    const secondOpenCC = deferred<{
      convertCaptionText: typeof convertCaptionText;
    }>();
    const loadOpenCC = vi.fn()
      .mockReturnValueOnce(firstOpenCC.promise)
      .mockReturnValueOnce(secondOpenCC.promise);
    const fixture = createCaptionFixture({
      loadOpenCC,
      loadPinyin: vi.fn(() => Promise.resolve({
        annotateCaptionPinyin: () => [],
      })),
    });

    try {
      fixture.ui.updatePreferences({
        ...defaultState,
        captionScript: "traditional",
      });
      fixture.ui.show({ text: "相同正文", status: "显示中" }, true);
      fixture.ui.show({ text: "相同正文", status: "显示中" }, true);
      expect(loadOpenCC).toHaveBeenCalledTimes(2);

      firstOpenCC.resolve({
        convertCaptionText: () => "过期结果",
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(fixture.text.textContent).toBe("相同正文");

      secondOpenCC.resolve({
        convertCaptionText: () => "当前结果",
      });
      await vi.waitFor(() => {
        expect(fixture.text.textContent).toBe("当前结果");
      });
    } finally {
      fixture.destroy();
    }
  });

  it("keeps a same-text status update pending but invalidates an older preference result", async () => {
    const openCC = deferred<{ convertCaptionText: typeof convertCaptionText }>();
    const runtime = languageRuntime(openCC.promise);
    const fixture = createCaptionFixture(runtime);

    try {
      fixture.ui.updatePreferences(defaultState);
      fixture.ui.show({ text: "后台", status: "显示中" }, true);
      fixture.ui.show({ text: "后台", status: "已结束" }, false);
      fixture.ui.updatePreferences({
        ...defaultState,
        captionScript: "traditional",
      });
      openCC.resolve({ convertCaptionText });

      await vi.waitFor(() => {
        expect(fixture.text.textContent).toBe("後臺");
      });
      expect(runtime.getOpenCCLoadCount()).toBe(2);
    } finally {
      fixture.destroy();
    }
  });

  it("preserves scroll across preference rendering but resets it for new text", async () => {
    const delayedOpenCC = deferred<{
      convertCaptionText: typeof convertCaptionText;
    }>();
    const loadOpenCC = vi.fn()
      .mockResolvedValueOnce({ convertCaptionText })
      .mockReturnValue(delayedOpenCC.promise);
    const fixture = createCaptionFixture({
      loadOpenCC,
      loadPinyin: () => Promise.resolve({
        annotateCaptionPinyin: () => [],
      }),
    });
    const body = fixture.element.querySelector<HTMLDivElement>(
      ".a11y-large-caption__body",
    );
    if (!body) {
      throw new Error("Missing caption scroll body");
    }
    Object.defineProperties(body, {
      scrollHeight: { configurable: true, get: () => 1_000 },
      clientHeight: { configurable: true, get: () => 200 },
    });

    try {
      fixture.ui.updatePreferences(defaultState);
      fixture.ui.show({ text: "后台", status: "显示中" }, true);
      await vi.waitFor(() => {
        expect(loadOpenCC).toHaveBeenCalledOnce();
      });
      body.scrollTop = 420;

      fixture.ui.updatePreferences({
        ...defaultState,
        captionScript: "traditional",
      });
      expect(body.scrollTop).toBe(420);
      delayedOpenCC.resolve({ convertCaptionText });
      await vi.waitFor(() => {
        expect(fixture.text.textContent).toBe("後臺");
      });
      expect(body.scrollTop).toBe(420);

      fixture.ui.show({ text: "新正文", status: "显示中" }, true);
      expect(body.scrollTop).toBe(0);
      await vi.waitFor(() => {
        expect(fixture.text.textContent).toBe("新正文");
      });
      expect(body.scrollTop).toBe(0);
    } finally {
      fixture.destroy();
    }
  });

  it("keeps a scroll change made while a language presentation is loading", async () => {
    const delayedOpenCC = deferred<{
      convertCaptionText: typeof convertCaptionText;
    }>();
    const fixture = createCaptionFixture({
      loadOpenCC: vi.fn(() => delayedOpenCC.promise),
      loadPinyin: vi.fn(() => Promise.resolve({
        annotateCaptionPinyin: () => [],
      })),
    });
    const body = fixture.element.querySelector<HTMLDivElement>(
      ".a11y-large-caption__body",
    );
    if (!body) {
      throw new Error("Missing caption scroll body");
    }
    Object.defineProperties(body, {
      scrollHeight: { configurable: true, get: () => 1_000 },
      clientHeight: { configurable: true, get: () => 200 },
    });

    try {
      fixture.ui.updatePreferences(defaultState);
      fixture.ui.show({ text: "后台", status: "显示中" }, true);
      body.scrollTop = 420;

      fixture.ui.updatePreferences({
        ...defaultState,
        captionScript: "traditional",
      });
      body.scrollTop = 610;
      delayedOpenCC.resolve({ convertCaptionText });

      await vi.waitFor(() => {
        expect(fixture.text.textContent).toBe("後臺");
      });
      expect(body.scrollTop).toBe(610);
    } finally {
      fixture.destroy();
    }
  });

  it("keeps scroll intent when fallback rendering temporarily clamps the position", async () => {
    const delayedOpenCC = deferred<{
      convertCaptionText: typeof convertCaptionText;
    }>();
    const fixture = createCaptionFixture({
      loadOpenCC: vi.fn(() => delayedOpenCC.promise),
      loadPinyin: vi.fn(() => Promise.resolve({
        annotateCaptionPinyin: () => [],
      })),
    });
    const body = fixture.element.querySelector<HTMLDivElement>(
      ".a11y-large-caption__body",
    );
    if (!body) {
      throw new Error("Missing caption scroll body");
    }
    let scrollHeight = 1_000;
    Object.defineProperties(body, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => 200 },
    });

    try {
      fixture.ui.updatePreferences(defaultState);
      fixture.ui.show({ text: "后台", status: "显示中" }, true);
      body.scrollTop = 420;

      scrollHeight = 300;
      fixture.ui.updatePreferences({
        ...defaultState,
        captionScript: "traditional",
      });
      expect(body.scrollTop).toBe(100);
      body.dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }));

      scrollHeight = 1_000;
      delayedOpenCC.resolve({ convertCaptionText });
      await vi.waitFor(() => {
        expect(fixture.text.textContent).toBe("後臺");
      });
      expect(body.scrollTop).toBe(100);
    } finally {
      fixture.destroy();
    }
  });

  it("does not commit a delayed language result after hide or destroy", async () => {
    const hiddenOpenCC = deferred<{
      convertCaptionText: typeof convertCaptionText;
    }>();
    const hidden = createCaptionFixture(languageRuntime(hiddenOpenCC.promise));
    hidden.ui.show({ text: "隐藏前", status: "显示中" }, true);
    hidden.ui.hide();
    hiddenOpenCC.resolve({ convertCaptionText });
    await Promise.resolve();
    await Promise.resolve();
    expect(hidden.element.hidden).toBe(true);
    expect(hidden.text.textContent).toBe("");
    hidden.destroy();

    const destroyedOpenCC = deferred<{
      convertCaptionText: typeof convertCaptionText;
    }>();
    const destroyed = createCaptionFixture(
      languageRuntime(destroyedOpenCC.promise),
    );
    destroyed.ui.show({ text: "销毁前", status: "显示中" }, true);
    destroyed.ui.destroy();
    destroyedOpenCC.resolve({ convertCaptionText });
    await Promise.resolve();
    await Promise.resolve();
    expect(destroyed.element.isConnected).toBe(false);
    destroyed.host.remove();
  });
});

function languageRuntime(
  openCC: Promise<{ convertCaptionText: typeof convertCaptionText }>,
): CaptionLanguageRuntime & { getOpenCCLoadCount: () => number } {
  const loadOpenCC = vi.fn(() => openCC);
  return {
    loadOpenCC,
    loadPinyin: vi.fn(() => Promise.resolve({
      annotateCaptionPinyin: () => [],
    })),
    getOpenCCLoadCount: () => loadOpenCC.mock.calls.length,
  };
}

function createCaptionFixture(languages: CaptionLanguageRuntime): {
  host: HTMLDivElement;
  element: HTMLDivElement;
  text: HTMLDivElement;
  ui: LargeCaptionUI;
  destroy: () => void;
} {
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const ui = new LargeCaptionUI(
    document,
    shadow,
    {
      onClose: vi.fn(),
      onFontSizeChange: vi.fn(),
      onScriptChange: vi.fn(),
      onPinyinChange: vi.fn(),
      resolveRestoreControl: () => null,
    },
    languages,
  );
  const text = shadow.querySelector<HTMLDivElement>(
    ".a11y-large-caption__text",
  );
  if (!text) {
    throw new Error("Missing caption text fixture");
  }
  return {
    host,
    element: ui.element,
    text,
    ui,
    destroy: () => {
      ui.destroy();
      host.remove();
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const defaultState: AccessibilityToolState = {
  isOpen: true,
  isPinned: false,
  isCollapsed: false,
  isReadScreen: false,
  readingEnabled: false,
  continuousReadingState: "idle",
  captionEnabled: true,
  captionFontSize: 36,
  captionScript: "simplified",
  captionPinyinEnabled: false,
  speechRate: 1,
  colorScheme: "original",
  zoom: 1,
  largeCursor: false,
  crosshair: false,
  isFullscreen: false,
};
