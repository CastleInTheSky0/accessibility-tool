import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessibilityToolRuntime } from "../../src/tool";
import type { SpeechAdapter, SpeechRequestOptions } from "../../src/types";

describe("AccessibilityTool large-caption runtime", () => {
  const runtimes: AccessibilityToolRuntime[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.destroy()));
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("shows a single text output while reading remains off", async () => {
    document.body.innerHTML = `
      <button id="launcher" data-a11y-ignore>打开工具</button>
      <p id="target" tabindex="0">单次字幕内容</p>
    `;
    const adapter = new UnsupportedSpeechAdapter();
    const runtime = createRuntime(adapter, "single-text");
    runtimes.push(runtime);

    await runtime.open({ trigger: get("launcher") });
    const shadow = getShadowRoot();
    enableCaption(shadow);

    get("target").focus();

    expect(runtime.getState()).toMatchObject({
      readingEnabled: false,
      captionEnabled: true,
    });
    expect(adapter.speak).not.toHaveBeenCalled();
    expect(getCaption(shadow).hidden).toBe(false);
    expect(
      shadow.querySelector(".a11y-large-caption__text")?.textContent,
    ).toBe("文本：单次字幕内容");
    expect(
      shadow.querySelector("[data-caption-status]")?.textContent,
    ).toBe("显示中");
  });

  it("advances continuous reading as timed text when speech is unsupported", async () => {
    document.body.innerHTML = `
      <button id="launcher" data-a11y-ignore>打开工具</button>
      <p>第一段</p>
      <p>第二段</p>
    `;
    const adapter = new UnsupportedSpeechAdapter();
    const runtime = createRuntime(adapter, "continuous-text");
    runtimes.push(runtime);
    const segments: number[] = [];
    const stops: string[] = [];
    runtime
      .on("continuousreadingsegmentchange", ({ index }) =>
        segments.push(index),
      )
      .on("continuousreadingstop", ({ reason }) => stops.push(reason));

    await runtime.open({ trigger: get("launcher") });
    const shadow = getShadowRoot();
    enableCaption(shadow);
    vi.useFakeTimers();

    startContinuousReading(shadow);

    expect(runtime.getState()).toMatchObject({
      readingEnabled: false,
      captionEnabled: true,
      continuousReadingState: "playing",
    });
    expect(adapter.speak).not.toHaveBeenCalled();
    expect(segments).toEqual([1]);
    expect(captionText(shadow)).toBe("文本：第一段");

    vi.advanceTimersByTime(3_000);

    expect(runtime.getState().continuousReadingState).toBe("playing");
    expect(segments).toEqual([1, 2]);
    expect(captionText(shadow)).toBe("文本：第二段");

    vi.advanceTimersByTime(3_000);

    expect(runtime.getState().continuousReadingState).toBe("idle");
    expect(stops).toEqual(["completed"]);
    expect(
      shadow.querySelector("[data-caption-status]")?.textContent,
    ).toBe("已结束");

    vi.advanceTimersByTime(3_000);
    expect(getCaption(shadow).hidden).toBe(true);
  });

  it("keeps a text-only continuous segment alive when audio is re-enabled", async () => {
    document.body.innerHTML = `
      <button id="launcher" data-a11y-ignore>打开工具</button>
      <p>第一段</p>
      <p>第二段</p>
    `;
    const adapter = new ControlledSpeechAdapter();
    const runtime = createRuntime(adapter, "resume-audio-next-segment");
    runtimes.push(runtime);

    await runtime.open({ trigger: get("launcher") });
    const shadow = getShadowRoot();
    enableCaption(shadow);
    vi.useFakeTimers();
    startContinuousReading(shadow);

    expect(runtime.getState()).toMatchObject({
      readingEnabled: false,
      captionEnabled: true,
      continuousReadingState: "playing",
    });
    expect(captionText(shadow)).toBe("文本：第一段");
    expect(adapter.requests).toHaveLength(0);

    getMainControl(shadow, "reading").click();

    expect(runtime.getState()).toMatchObject({
      readingEnabled: true,
      continuousReadingState: "playing",
    });
    expect(captionText(shadow)).toBe("文本：第一段");
    expect(adapter.requests).toHaveLength(0);

    vi.advanceTimersByTime(3_000);

    expect(runtime.getState().continuousReadingState).toBe("playing");
    expect(adapter.requests.map(({ text }) => text)).toEqual(["文本：第二段"]);
    adapter.requests[0]?.options.onStart?.();
    expect(captionText(shadow)).toBe("文本：第二段");
    expect(
      shadow.querySelector("[data-caption-status]")?.textContent,
    ).toBe("朗读中");
  });

  it("starts, pauses, resumes and closes text-only continuous reading", async () => {
    document.body.innerHTML = `
      <button id="launcher" data-a11y-ignore>打开工具</button>
      <p>第一段</p>
      <p>第二段</p>
    `;
    const adapter = new UnsupportedSpeechAdapter();
    const runtime = createRuntime(adapter, "pause-text-remaining");
    runtimes.push(runtime);
    const segments: number[] = [];
    const stops: string[] = [];
    runtime
      .on("continuousreadingsegmentchange", ({ index }) =>
        segments.push(index),
      )
      .on("continuousreadingstop", ({ reason }) => stops.push(reason));

    await runtime.open({ trigger: get("launcher") });
    const shadow = getShadowRoot();
    enableCaption(shadow);
    vi.useFakeTimers();
    startContinuousReading(shadow);

    vi.advanceTimersByTime(1_000);
    clickContinuousIntent(shadow, "pause");
    expect(runtime.getState().continuousReadingState).toBe("paused");
    expect(
      shadow.querySelector("[data-caption-status]")?.textContent,
    ).toBe("已暂停");

    vi.advanceTimersByTime(30_000);
    expect(segments).toEqual([1]);

    clickContinuousIntent(shadow, "resume");
    expect(runtime.getState().continuousReadingState).toBe("playing");
    vi.advanceTimersByTime(1_999);
    expect(segments).toEqual([1]);
    vi.advanceTimersByTime(1);
    expect(segments).toEqual([1, 2]);
    expect(captionText(shadow)).toBe("文本：第二段");

    const close = shadow.querySelector<HTMLButtonElement>(
      ".a11y-large-caption__close",
    );
    if (!close) {
      throw new Error("Missing large-caption close button");
    }
    close.click();
    expect(runtime.getState()).toMatchObject({
      readingEnabled: false,
      captionEnabled: false,
      continuousReadingState: "idle",
    });
    expect(stops).toEqual(["stopped"]);
    expect(getCaption(shadow).hidden).toBe(true);
    expect(adapter.speak).not.toHaveBeenCalled();
    expect(shadow.activeElement).toBe(getMainControl(shadow, "largeCaption"));

    vi.advanceTimersByTime(30_000);
    expect(segments).toEqual([1, 2]);
  });

  it("emits one error when an audio request fails synchronously", async () => {
    document.body.innerHTML = `
      <button id="launcher" data-a11y-ignore>打开工具</button>
      <p>同步失败段落</p>
    `;
    const adapter = new ThrowingSpeechAdapter();
    const runtime = createRuntime(adapter, "single-sync-error");
    runtimes.push(runtime);
    const errors: string[] = [];
    const stops: string[] = [];
    runtime
      .on("error", ({ message }) => errors.push(message))
      .on("continuousreadingstop", ({ reason }) => stops.push(reason));

    await runtime.open({ trigger: get("launcher") });
    startContinuousReading(getShadowRoot());

    expect(adapter.speak).toHaveBeenCalledOnce();
    expect(errors).toEqual(["语音朗读失败。"]);
    expect(stops).toEqual(["error"]);
    expect(runtime.getState().continuousReadingState).toBe("idle");
  });

  it("stops text-only continuous reading when the caption is turned off", async () => {
    document.body.innerHTML = `
      <button id="launcher" data-a11y-ignore>打开工具</button>
      <p>停止前段落</p>
      <p>不应继续的段落</p>
    `;
    const adapter = new UnsupportedSpeechAdapter();
    const runtime = createRuntime(adapter, "caption-off");
    runtimes.push(runtime);
    const segments: number[] = [];
    const stops: string[] = [];
    runtime
      .on("continuousreadingsegmentchange", ({ index }) =>
        segments.push(index),
      )
      .on("continuousreadingstop", ({ reason }) => stops.push(reason));

    await runtime.open({ trigger: get("launcher") });
    const shadow = getShadowRoot();
    enableCaption(shadow);
    vi.useFakeTimers();
    startContinuousReading(shadow);
    expect(segments).toEqual([1]);

    getMainControl(shadow, "largeCaption").click();

    expect(runtime.getState()).toMatchObject({
      readingEnabled: false,
      captionEnabled: false,
      continuousReadingState: "idle",
    });
    expect(stops).toEqual(["stopped"]);
    expect(getCaption(shadow).hidden).toBe(true);

    vi.advanceTimersByTime(30_000);
    expect(segments).toEqual([1]);
    expect(adapter.speak).not.toHaveBeenCalled();
  });
});

class UnsupportedSpeechAdapter implements SpeechAdapter {
  readonly speak = vi.fn<SpeechAdapter["speak"]>();
  readonly cancel = vi.fn();

  isSupported(): boolean {
    return false;
  }
}

class ControlledSpeechAdapter implements SpeechAdapter {
  readonly requests: Array<{
    text: string;
    options: SpeechRequestOptions;
  }> = [];
  readonly speak = vi.fn((text: string, options: SpeechRequestOptions) => {
    this.requests.push({ text, options });
  });
  readonly cancel = vi.fn();

  isSupported(): boolean {
    return true;
  }
}

class ThrowingSpeechAdapter implements SpeechAdapter {
  readonly speak = vi.fn(() => {
    throw new Error("synchronous adapter failure");
  });
  readonly cancel = vi.fn();

  isSupported(): boolean {
    return true;
  }
}

function createRuntime(
  adapter: SpeechAdapter,
  storageSuffix: string,
): AccessibilityToolRuntime {
  const runtime = new AccessibilityToolRuntime();
  runtime.configure({
    debug: true,
    persistOpenState: false,
    storageKey: `test:large-caption-runtime:${storageSuffix}`,
    speech: { adapter },
    regions: { observe: false },
  });
  return runtime;
}

function enableCaption(shadow: ShadowRoot): void {
  const control = getMainControl(shadow, "largeCaption");
  expect(control.getAttribute("aria-pressed")).toBe("false");
  control.click();
  expect(control.getAttribute("aria-pressed")).toBe("true");
}

function startContinuousReading(shadow: ShadowRoot): void {
  getMainControl(shadow, "continuousReading").click();
  const start = shadow.querySelector<HTMLButtonElement>(
    '[data-intent="start"]',
  );
  if (!start) {
    throw new Error("Missing continuous-reading start button");
  }
  expect(start.getAttribute("aria-disabled")).not.toBe("true");
  start.click();
}

function clickContinuousIntent(
  shadow: ShadowRoot,
  intent: "pause" | "resume",
): void {
  const control = shadow.querySelector<HTMLButtonElement>(
    `[data-intent="${intent}"]`,
  );
  if (!control) {
    throw new Error(`Missing continuous-reading ${intent} button`);
  }
  control.click();
}

function getMainControl(
  shadow: ShadowRoot,
  action: string,
): HTMLButtonElement {
  const control = shadow.querySelector<HTMLButtonElement>(
    `[data-mode="main"] [data-action="${action}"]`,
  );
  if (!control) {
    throw new Error(`Missing main toolbar control: ${action}`);
  }
  return control;
}

function getCaption(shadow: ShadowRoot): HTMLDivElement {
  const caption = shadow.querySelector<HTMLDivElement>(
    ".a11y-large-caption",
  );
  if (!caption) {
    throw new Error("Missing large-caption overlay");
  }
  return caption;
}

function captionText(shadow: ShadowRoot): string | null | undefined {
  return shadow.querySelector(".a11y-large-caption__text")?.textContent;
}

function get(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}

function getShadowRoot(): ShadowRoot {
  const shadow = document.querySelector<HTMLElement>("[data-a11y-tool-host]")
    ?.shadowRoot;
  if (!shadow) {
    throw new Error("Missing accessibility toolbar shadow root");
  }
  return shadow;
}
