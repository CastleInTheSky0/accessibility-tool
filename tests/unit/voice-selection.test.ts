import { describe, expect, it, vi } from "vitest";
import { BrowserLocalVoiceCatalog } from "../../src/features/voice-selection";

describe("BrowserLocalVoiceCatalog", () => {
  it("waits for asynchronous voices, filters remote entries and sorts compatible local voices", () => {
    const synthesis = new FakeSpeechSynthesis();
    const catalog = new BrowserLocalVoiceCatalog(synthesis.asNative());
    const listener = vi.fn();
    catalog.subscribe(listener);

    catalog.start();
    expect(catalog.getSnapshot()).toMatchObject({
      status: "loading",
      voices: [],
      capability: {
        providerId: "browser-local",
        localOnly: true,
        supportsPreview: true,
      },
    });

    synthesis.voices = [
      voice("远程音色", "zh-CN", "remote:zh", {
        default: true,
        localService: false,
      }),
      voice("本地普通", "zh-CN", "local:normal"),
      voice("本地默认", "zh-CN", "local:default", { default: true }),
      voice("香港音色", "zh-HK", "local:hk", { default: true }),
      voice("重复音色", "zh-CN", "local:normal"),
      voice("English", "en-US", "local:en"),
    ];
    synthesis.emitVoicesChanged();

    expect(catalog.getSnapshot().status).toBe("ready");
    expect(catalog.getSnapshot().voices.map(({ name }) => name)).toEqual([
      "本地普通",
      "本地默认",
      "香港音色",
      "English",
    ]);
    expect(catalog.getCompatibleVoices("zh-CN").map(({ name }) => name)).toEqual([
      "本地默认",
      "本地普通",
      "香港音色",
    ]);
    expect(listener).toHaveBeenCalled();
  });

  it("resolves preferences from the latest native objects without caching them", () => {
    const synthesis = new FakeSpeechSynthesis();
    const first = voice("本地女声", "zh-CN", "local:chosen");
    const fallback = voice("系统默认", "zh-CN", "local:default", {
      default: true,
    });
    synthesis.voices = [first, fallback];
    const catalog = new BrowserLocalVoiceCatalog(synthesis.asNative());
    catalog.start();

    const preference = {
      voiceURI: "local:chosen",
      name: "旧名称也应由 URI 命中",
      lang: "zh-CN",
    };
    expect(catalog.resolvePreference(preference, "zh-CN")).toMatchObject({
      voiceURI: "local:chosen",
      name: "本地女声",
      lang: "zh-CN",
    });
    expect(catalog.resolveNativeVoice(preference, "zh-CN")).toBe(first);

    const replacement = voice("本地女声", "zh-CN", "local:chosen");
    synthesis.voices = [replacement, fallback];
    expect(catalog.resolveNativeVoice(preference, "zh-CN")).toBe(replacement);
    expect(catalog.resolveNativeVoice(null, "zh-CN")).toBe(fallback);
    expect(catalog.resolveNativeVoice(preference, "ja-JP")).toBeNull();
  });

  it("falls back to name and normalized language when a voice URI changes", () => {
    const synthesis = new FakeSpeechSynthesis();
    const renamedUri = voice("Local Voice", "en_US", "local:new-uri");
    synthesis.voices = [renamedUri];
    const catalog = new BrowserLocalVoiceCatalog(synthesis.asNative());
    catalog.start();

    expect(
      catalog.resolveNativeVoice(
        { voiceURI: "local:old-uri", name: "Local Voice", lang: "en-us" },
        "en-US",
      ),
    ).toBe(renamedUri);
  });

  it("removes its voiceschanged listener when stopped", () => {
    const synthesis = new FakeSpeechSynthesis();
    const catalog = new BrowserLocalVoiceCatalog(synthesis.asNative());
    catalog.start();
    expect(synthesis.listenerCount).toBe(1);

    catalog.stop();
    expect(synthesis.listenerCount).toBe(0);
    synthesis.voices = [voice("稍后音色", "zh-CN", "local:later")];
    synthesis.emitVoicesChanged();
    expect(catalog.getSnapshot().voices).toEqual([]);
  });
});

class FakeSpeechSynthesis extends EventTarget {
  voices: SpeechSynthesisVoice[] = [];
  listenerCount = 0;

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (type === "voiceschanged") {
      this.listenerCount += 1;
    }
    super.addEventListener(type, callback, options);
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (type === "voiceschanged") {
      this.listenerCount = Math.max(0, this.listenerCount - 1);
    }
    super.removeEventListener(type, callback, options);
  }

  emitVoicesChanged(): void {
    this.dispatchEvent(new Event("voiceschanged"));
  }

  asNative(): SpeechSynthesis {
    return this as unknown as SpeechSynthesis;
  }
}

function voice(
  name: string,
  lang: string,
  voiceURI: string,
  overrides: Partial<SpeechSynthesisVoice> = {},
): SpeechSynthesisVoice {
  return {
    default: false,
    lang,
    localService: true,
    name,
    voiceURI,
    ...overrides,
  };
}
