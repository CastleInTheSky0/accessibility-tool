import { describe, expect, it, vi } from "vitest";
import { TypedEmitter } from "../../src/core/emitter";
import { SpeechController } from "../../src/features/speech";
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
});
