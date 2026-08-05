import type {
  AccessibilityToolEventMap,
  SpeechAdapter,
  SpeechRequestOptions,
} from "../types";
import type { TypedEmitter } from "../core/emitter";

export class BrowserSpeechAdapter implements SpeechAdapter {
  speak(text: string, options: SpeechRequestOptions): void {
    if (!this.isSupported()) {
      options.onError?.(new Error("当前浏览器不支持语音合成。"));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang;
    utterance.rate = options.rate;
    utterance.addEventListener("start", () => options.onStart?.(), {
      once: true,
    });
    utterance.addEventListener("end", () => options.onEnd?.(), { once: true });
    utterance.addEventListener(
      "error",
      (event) => options.onError?.(event.error),
      { once: true },
    );
    globalThis.speechSynthesis.speak(utterance);
  }

  cancel(): void {
    globalThis.speechSynthesis?.cancel();
  }

  isSupported(): boolean {
    return (
      typeof globalThis.SpeechSynthesisUtterance === "function" &&
      typeof globalThis.speechSynthesis !== "undefined"
    );
  }
}

export class SpeechController {
  private readonly adapter: SpeechAdapter;
  private requestId = 0;

  constructor(
    adapter: SpeechAdapter | undefined,
    private readonly emitter: TypedEmitter<AccessibilityToolEventMap>,
  ) {
    this.adapter = adapter ?? new BrowserSpeechAdapter();
  }

  isSupported(): boolean {
    return this.adapter.isSupported();
  }

  speak(
    text: string,
    lang: string,
    rate: number,
    callbacks: { onEnd?: () => void; onError?: () => void } = {},
  ): void {
    if (!text || !this.adapter.isSupported()) {
      return;
    }
    const requestId = ++this.requestId;
    this.adapter.cancel();
    this.adapter.speak(text, {
      lang,
      rate,
      onStart: () => {
        if (requestId === this.requestId) {
          this.emitter.emit("speechstart", { textLength: text.length });
        }
      },
      onEnd: () => {
        if (requestId !== this.requestId) {
          return;
        }
        this.emitter.emit("speechend", undefined);
        callbacks.onEnd?.();
      },
      onError: (error) => {
        if (requestId !== this.requestId) {
          return;
        }
        this.emitter.emit("error", {
          error,
          message: "语音朗读失败。",
        });
        callbacks.onError?.();
      },
    });
  }

  cancel(): void {
    this.requestId += 1;
    this.adapter.cancel();
  }
}
