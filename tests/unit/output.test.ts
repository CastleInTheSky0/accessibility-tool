import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypedEmitter } from "../../src/core/emitter";
import {
  estimateDisplayDuration,
  OutputCoordinator,
  type CaptionOutputModel,
} from "../../src/features/output";
import { SpeechController } from "../../src/features/speech";
import type {
  AccessibilityToolEventMap,
  SpeechAdapter,
  SpeechRequestOptions,
} from "../../src/types";

class ControlledAdapter implements SpeechAdapter {
  supported = true;
  readonly requests: SpeechRequestOptions[] = [];
  cancel = vi.fn();

  speak(_text: string, options: SpeechRequestOptions): void {
    this.requests.push(options);
  }

  isSupported(): boolean {
    return this.supported;
  }

  start(index = this.requests.length - 1): void {
    this.requests[index]?.onStart?.();
  }

  end(index = this.requests.length - 1): void {
    this.requests[index]?.onEnd?.();
  }

  error(index = this.requests.length - 1): void {
    this.requests[index]?.onError?.(new Error("adapter failed"));
  }
}

describe("OutputCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows only an effective audio request and ignores stale callbacks", () => {
    const runtime = createRuntime();
    runtime.output.speak("第一条", "zh-CN", 1, { kind: "single" });
    expect(runtime.show).not.toHaveBeenCalled();

    runtime.adapter.start(0);
    expect(lastCaption(runtime.show)).toMatchObject({
      text: "第一条",
      status: "朗读中",
    });

    runtime.output.speak("第二条", "zh-CN", 1, { kind: "single" });
    runtime.adapter.end(0);
    runtime.adapter.error(0);
    expect(lastCaption(runtime.show)?.text).toBe("第一条");

    runtime.adapter.start(1);
    expect(lastCaption(runtime.show)).toMatchObject({
      text: "第二条",
      status: "朗读中",
    });
  });

  it("does not display an audio request that ends before a valid start", () => {
    const runtime = createRuntime();
    const events: string[] = [];
    runtime.emitter.on("speechstart", () => events.push("speechstart"));
    runtime.emitter.on("speechend", () => events.push("speechend"));
    const ended = vi.fn();
    runtime.output.speak("未开始的语音", "zh-CN", 1, {
      kind: "single",
      onEnd: ended,
    });
    runtime.hide.mockClear();

    runtime.adapter.end();
    runtime.adapter.start();

    expect(ended).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
    expect(runtime.show).not.toHaveBeenCalled();
    expect(runtime.hide).toHaveBeenCalledOnce();
  });

  it("retains a normal end for three seconds without clearing a newer token", () => {
    const runtime = createRuntime();
    const ended = vi.fn();
    const canceled = vi.fn();
    runtime.output.speak("第一段", "zh-CN", 1, {
      kind: "continuous",
      onEnd: ended,
      onCancel: canceled,
    });
    runtime.adapter.start(0);
    runtime.adapter.end(0);
    expect(ended).toHaveBeenCalledOnce();
    expect(lastCaption(runtime.show)?.status).toBe("已结束");

    vi.advanceTimersByTime(1_000);
    runtime.output.speak("第二段", "zh-CN", 1, { kind: "continuous" });
    expect(canceled).not.toHaveBeenCalled();
    runtime.adapter.start(1);
    runtime.hide.mockClear();
    vi.advanceTimersByTime(5_000);

    expect(runtime.hide).not.toHaveBeenCalled();
    expect(lastCaption(runtime.show)?.text).toBe("第二段");
  });

  it("discards retained text and its timer when captions are disabled", () => {
    const runtime = createRuntime();
    runtime.output.speak("不应再次出现", "zh-CN", 1, { kind: "single" });
    runtime.adapter.start();
    runtime.adapter.end();
    expect(lastCaption(runtime.show)?.status).toBe("已结束");
    expect(vi.getTimerCount()).toBe(1);

    runtime.captionEnabled.value = false;
    runtime.output.setCaptionEnabled(false);
    expect(vi.getTimerCount()).toBe(0);

    runtime.show.mockClear();
    runtime.captionEnabled.value = true;
    runtime.output.setCaptionEnabled(true);
    expect(runtime.show).not.toHaveBeenCalled();
  });

  it("freezes and resumes the remaining text-only continuous duration", () => {
    const runtime = createRuntime({ audioEnabled: false });
    const ended = vi.fn();
    runtime.output.speak("短文本", "zh-CN", 1, {
      kind: "continuous",
      onEnd: ended,
    });
    expect(lastCaption(runtime.show)?.status).toBe("显示中");

    vi.advanceTimersByTime(1_000);
    expect(runtime.output.pauseContinuous()).toBe("text");
    expect(lastCaption(runtime.show)?.status).toBe("已暂停");
    vi.advanceTimersByTime(20_000);
    expect(ended).not.toHaveBeenCalled();

    expect(runtime.output.resumePausedText()).toBe(true);
    vi.advanceTimersByTime(1_999);
    expect(ended).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ended).toHaveBeenCalledOnce();
    expect(lastCaption(runtime.show)?.status).toBe("已结束");
  });

  it("falls back after a mid-stream error without forging speechend", () => {
    const runtime = createRuntime();
    const events: string[] = [];
    runtime.emitter.on("speechstart", () => events.push("speechstart"));
    runtime.emitter.on("speechend", () => events.push("speechend"));
    runtime.emitter.on("error", () => events.push("error"));
    const ended = vi.fn();
    const failed = vi.fn();
    runtime.output.speak("需要回退的字幕文本", "zh-CN", 1, {
      kind: "continuous",
      onEnd: ended,
      onError: failed,
    });
    runtime.adapter.start();
    vi.advanceTimersByTime(1_000);
    runtime.adapter.error();
    runtime.adapter.error();
    runtime.adapter.end();

    expect(events).toEqual(["speechstart", "error"]);
    expect(failed).not.toHaveBeenCalled();
    expect(lastCaption(runtime.show)?.status).toBe("显示中");
    vi.advanceTimersByTime(15_000);
    expect(ended).toHaveBeenCalledOnce();
    expect(events).toEqual(["speechstart", "error"]);
  });

  it("falls back to timed text when audio fails before start", () => {
    const runtime = createRuntime();
    const events: string[] = [];
    runtime.emitter.on("speechstart", () => events.push("speechstart"));
    runtime.emitter.on("speechend", () => events.push("speechend"));
    runtime.emitter.on("error", () => events.push("error"));
    const ended = vi.fn();
    const failed = vi.fn();
    runtime.output.speak("启动失败", "zh-CN", 1, {
      kind: "continuous",
      onEnd: ended,
      onError: failed,
    });

    runtime.adapter.error();
    runtime.adapter.error();
    runtime.adapter.start();
    runtime.adapter.end();

    expect(events).toEqual(["error"]);
    expect(failed).not.toHaveBeenCalled();
    expect(lastCaption(runtime.show)).toMatchObject({
      text: "启动失败",
      status: "显示中",
    });

    vi.advanceTimersByTime(3_000);
    expect(ended).toHaveBeenCalledOnce();
    expect(events).toEqual(["error"]);
  });

  it("stops an all-text continuous session when captions are disabled", () => {
    const runtime = createRuntime({ audioEnabled: false });
    runtime.output.speak("纯文字段落", "zh-CN", 1, { kind: "continuous" });
    runtime.captionEnabled.value = false;

    expect(runtime.output.setCaptionEnabled(false)).toEqual({
      stopTextOnlyContinuous: true,
    });
    expect(runtime.hide).toHaveBeenCalled();
  });

  it("clamps estimated display time to the shared three-to-fifteen second range", () => {
    expect(estimateDisplayDuration("短", 2)).toBe(3_000);
    expect(estimateDisplayDuration("很长".repeat(200), 0.75)).toBe(15_000);
  });
});

function createRuntime(
  options: { audioEnabled?: boolean; captionEnabled?: boolean } = {},
) {
  const adapter = new ControlledAdapter();
  const emitter = new TypedEmitter<AccessibilityToolEventMap>();
  const speech = new SpeechController(adapter, emitter);
  const show = vi.fn<(model: CaptionOutputModel, reset: boolean) => void>();
  const hide = vi.fn();
  const audioEnabled = { value: options.audioEnabled ?? true };
  const captionEnabled = { value: options.captionEnabled ?? true };
  const output = new OutputCoordinator(
    speech,
    { showCaption: show, hideCaption: hide },
    {
      isAudioEnabled: () => audioEnabled.value,
      isCaptionEnabled: () => captionEnabled.value,
    },
  );
  return {
    adapter,
    audioEnabled,
    captionEnabled,
    emitter,
    hide,
    output,
    show,
  };
}

function lastCaption(
  show: ReturnType<typeof vi.fn<(model: CaptionOutputModel, reset: boolean) => void>>,
): CaptionOutputModel | undefined {
  return show.mock.calls.at(-1)?.[0];
}
