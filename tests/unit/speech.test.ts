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
