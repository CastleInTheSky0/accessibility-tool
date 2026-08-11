import { describe, expect, it, vi } from "vitest";
import { TypedEmitter } from "../../src/core/emitter";
import {
  BrowserSpeechAdapter,
  SpeechController,
} from "../../src/features/speech";
import type {
  AccessibilityToolEventMap,
  SpeechAdapter,
  SpeechRequestOptions,
} from "../../src/types";

describe("SpeechController", () => {
  it("ignores stale callbacks after speech is interrupted", () => {
    let activeOptions: SpeechRequestOptions | null = null;
    const adapter: SpeechAdapter = {
      speak: (_text, options) => {
        activeOptions = options;
      },
      cancel: () => {
        activeOptions?.onError?.("interrupted");
      },
      isSupported: () => true,
    };
    const emitter = new TypedEmitter<AccessibilityToolEventMap>();
    const errors = vi.fn();
    const ends = vi.fn();
    emitter.on("error", errors);
    emitter.on("speechend", ends);
    const speech = new SpeechController(adapter, emitter);

    speech.speak("第一段", "zh-CN", 1);
    speech.speak("第二段", "zh-CN", 1);

    expect(errors).not.toHaveBeenCalled();
    expect(ends).not.toHaveBeenCalled();
  });

  it("settles each request once and ignores callbacks that arrive after end or error", () => {
    const requests: SpeechRequestOptions[] = [];
    const adapter: SpeechAdapter = {
      speak: (_text, options) => requests.push(options),
      cancel: vi.fn(),
      isSupported: () => true,
    };
    const emitter = new TypedEmitter<AccessibilityToolEventMap>();
    const starts = vi.fn();
    const ends = vi.fn();
    const errors = vi.fn();
    emitter.on("speechstart", starts);
    emitter.on("speechend", ends);
    emitter.on("error", errors);
    const speech = new SpeechController(adapter, emitter);
    const firstEnd = vi.fn();
    const firstError = vi.fn();

    speech.speak("完成请求", "zh-CN", 1, {
      onEnd: firstEnd,
      onError: firstError,
    });
    const first = requests[0];
    first?.onStart?.();
    first?.onStart?.();
    first?.onEnd?.();
    first?.onStart?.();
    first?.onEnd?.();
    first?.onError?.("late-error");

    expect(starts).toHaveBeenCalledTimes(1);
    expect(ends).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
    expect(firstEnd).toHaveBeenCalledTimes(1);
    expect(firstError).not.toHaveBeenCalled();

    const secondEnd = vi.fn();
    const secondError = vi.fn();
    speech.speak("错误请求", "zh-CN", 1, {
      onEnd: secondEnd,
      onError: secondError,
    });
    const second = requests[1];
    second?.onStart?.();
    second?.onError?.("failed");
    second?.onStart?.();
    second?.onEnd?.();
    second?.onError?.("late-error");

    expect(starts).toHaveBeenCalledTimes(2);
    expect(ends).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(secondEnd).not.toHaveBeenCalled();
    expect(secondError).toHaveBeenCalledTimes(1);
  });

  it("converts a synchronous adapter exception into one effective error", () => {
    const requests: SpeechRequestOptions[] = [];
    const failure = new Error("adapter failed synchronously");
    const adapter: SpeechAdapter = {
      speak: (_text, options) => {
        requests.push(options);
        throw failure;
      },
      cancel: vi.fn(),
      isSupported: () => true,
    };
    const emitter = new TypedEmitter<AccessibilityToolEventMap>();
    const starts = vi.fn();
    const ends = vi.fn();
    const errors = vi.fn();
    const callbackError = vi.fn();
    emitter.on("speechstart", starts);
    emitter.on("speechend", ends);
    emitter.on("error", errors);
    const speech = new SpeechController(adapter, emitter);
    let cancelRequest: (() => void) | null = null;

    expect(() => {
      cancelRequest = speech.speak("同步错误", "zh-CN", 1, {
        onError: callbackError,
      });
    }).not.toThrow();

    expect(cancelRequest).toEqual(expect.any(Function));
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith({
      error: failure,
      message: "语音朗读失败。",
    });
    expect(callbackError).toHaveBeenCalledTimes(1);
    expect(starts).not.toHaveBeenCalled();
    expect(ends).not.toHaveBeenCalled();

    requests[0]?.onStart?.();
    requests[0]?.onEnd?.();
    requests[0]?.onError?.("late-error");
    expect(errors).toHaveBeenCalledTimes(1);
    expect(callbackError).toHaveBeenCalledTimes(1);
    expect(starts).not.toHaveBeenCalled();
    expect(ends).not.toHaveBeenCalled();
  });

  it("keeps cancellation cleanup effective when the adapter throws", () => {
    const onCancel = vi.fn();
    const adapter: SpeechAdapter = {
      speak: vi.fn(),
      cancel: () => {
        throw new Error("cancel failed synchronously");
      },
      isSupported: () => true,
    };
    const speech = new SpeechController(
      adapter,
      new TypedEmitter<AccessibilityToolEventMap>(),
    );

    expect(() =>
      speech.speak("可取消请求", "zh-CN", 1, { onCancel }),
    ).not.toThrow();
    expect(() => speech.cancel()).not.toThrow();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("applies only a currently resolved local native voice", () => {
    const spoken: FakeSpeechSynthesisUtterance[] = [];
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance);
    vi.stubGlobal("speechSynthesis", {
      cancel: vi.fn(),
      speak: (utterance: FakeSpeechSynthesisUtterance) => spoken.push(utterance),
    });
    const localVoice = createVoice({ localService: true });
    const adapter = new BrowserSpeechAdapter(() => localVoice);

    adapter.speak("本地试听", {
      lang: "zh-CN",
      rate: 1.25,
    });

    expect(spoken).toHaveLength(1);
    expect(spoken[0]?.lang).toBe("zh-CN");
    expect(spoken[0]?.rate).toBe(1.25);
    expect(spoken[0]?.voice).toBe(localVoice);
  });

  it("never assigns a remote voice returned by an internal resolver", () => {
    const spoken: FakeSpeechSynthesisUtterance[] = [];
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance);
    vi.stubGlobal("speechSynthesis", {
      cancel: vi.fn(),
      speak: (utterance: FakeSpeechSynthesisUtterance) => spoken.push(utterance),
    });
    const adapter = new BrowserSpeechAdapter(() =>
      createVoice({ localService: false }),
    );

    adapter.speak("保持浏览器回退", { lang: "zh-CN", rate: 1 });

    expect(spoken[0]?.voice).toBeNull();
  });
});

class FakeSpeechSynthesisUtterance extends EventTarget {
  lang = "";
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;

  constructor(readonly text: string) {
    super();
  }
}

function createVoice(
  overrides: Partial<SpeechSynthesisVoice> = {},
): SpeechSynthesisVoice {
  return {
    default: true,
    lang: "zh-CN",
    localService: true,
    name: "本地女声",
    voiceURI: "local:zh-female",
    ...overrides,
  };
}
