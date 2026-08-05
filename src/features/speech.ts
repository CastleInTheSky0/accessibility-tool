import type {
  AccessibilityToolEventMap,
  SpeechAdapter,
  SpeechRequestOptions,
} from "../types";
import type { TypedEmitter } from "../core/emitter";

export class BrowserSpeechAdapter implements SpeechAdapter {
  constructor(
    private readonly resolveVoice?: (
      language: string,
    ) => SpeechSynthesisVoice | null,
  ) {}

  speak(text: string, options: SpeechRequestOptions): void {
    if (!this.isSupported()) {
      options.onError?.(new Error("当前浏览器不支持语音合成。"));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang;
    utterance.rate = options.rate;
    const voice = this.resolveVoice?.(options.lang) ?? null;
    if (voice?.localService === true) {
      utterance.voice = voice;
    }
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
  private activeOnCancel: (() => void) | null = null;

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
    callbacks: {
      onEnd?: () => void;
      onError?: () => void;
      onCancel?: () => void;
    } = {},
  ): (() => void) | null {
    if (!text || !this.adapter.isSupported()) {
      return null;
    }
    this.cancel();
    const requestId = ++this.requestId;
    this.activeOnCancel = callbacks.onCancel ?? null;
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
        this.activeOnCancel = null;
        this.emitter.emit("speechend", undefined);
        callbacks.onEnd?.();
      },
      onError: (error) => {
        if (requestId !== this.requestId) {
          return;
        }
        this.activeOnCancel = null;
        this.emitter.emit("error", {
          error,
          message: "语音朗读失败。",
        });
        callbacks.onError?.();
      },
    });
    return () => {
      if (requestId === this.requestId) {
        this.cancel();
      }
    };
  }

  cancel(): void {
    this.requestId += 1;
    const onCancel = this.activeOnCancel;
    this.activeOnCancel = null;
    this.adapter.cancel();
    onCancel?.();
  }
}
