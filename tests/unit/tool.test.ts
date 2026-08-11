import { afterAll, describe, expect, it, vi } from "vitest";
import { AccessibilityToolRuntime, accessibilityTool } from "../../src/tool";
import type {
  BrowserNativeVoiceResolver,
  VoiceCatalogProvider,
  VoiceCatalogSnapshot,
} from "../../src/features/voice-selection";
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
      "连续朗读",
      "语速",
      "音色",
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
      expect(shadow?.querySelector(".a11y-rate-panel")).toBeNull();
      expect(
        shadow?.querySelector<HTMLElement>(".a11y-voice-settings")?.hidden,
      ).toBe(true);
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

  it("selects, previews and restores only current browser-local voices", async () => {
    const storageKey = "test:browser-local-voice";
    const firstLocalVoice = createNativeVoice(
      "本地女声",
      "zh-CN",
      "local:woman",
    );
    const remoteVoice = createNativeVoice(
      "远程音色",
      "zh-CN",
      "remote:voice",
      { localService: false },
    );
    const frenchVoice = createNativeVoice(
      "Voix française",
      "fr_fr",
      "local:french",
    );
    const germanVoice = createNativeVoice(
      "Deutsche Stimme",
      "de-DE",
      "local:german",
    );
    const synthesis = new RuntimeSpeechSynthesis([
      firstLocalVoice,
      remoteVoice,
      frenchVoice,
      germanVoice,
    ]);
    vi.stubGlobal("SpeechSynthesisUtterance", RuntimeUtterance);
    vi.stubGlobal("speechSynthesis", synthesis.asNative());
    document.body.innerHTML = '<button id="voice-launcher">打开工具</button>';
    const launcher = document.getElementById(
      "voice-launcher",
    ) as HTMLButtonElement;
    const runtime = new AccessibilityToolRuntime();

    try {
      runtime.configure({
        debug: true,
        storageKey,
        persistOpenState: false,
        regions: { observe: false },
      });
      await runtime.open({ trigger: launcher });

      const shadow = document
        .querySelector<HTMLElement>("[data-a11y-tool-host]")
        ?.shadowRoot;
      const voiceControl = shadow?.querySelector<HTMLButtonElement>(
        '[data-action="voiceSelection"]',
      );
      voiceControl?.click();
      const dialog = shadow?.querySelector<HTMLElement>(
        ".a11y-voice-settings",
      );
      expect(dialog?.hidden).toBe(false);
      expect(synthesis.listenerCount).toBe(1);

      const radios = Array.from(
        dialog?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ??
          [],
      );
      expect(radios).toHaveLength(2);
      expect(dialog?.textContent).toContain("本地女声");
      expect(dialog?.textContent).not.toContain("远程音色");
      expect(
        Array.from(
          dialog?.querySelectorAll<HTMLOptionElement>("select option") ?? [],
        ).map((option) => option.value),
      ).toEqual([
        "",
        "zh-CN",
        "zh-TW",
        "en-US",
        "ja-JP",
        "ko-KR",
        "de-DE",
        "fr-FR",
      ]);

      const localRadio = radios[1];
      localRadio?.dispatchEvent(new Event("change", { bubbles: true }));
      expect(
        voiceControl?.querySelector("[data-control-meta]")?.textContent,
      ).toBe("本地女声");
      const persisted = JSON.parse(
        localStorage.getItem(storageKey) ?? "null",
      ) as { preferences?: { voice?: unknown } } | null;
      expect(persisted?.preferences?.voice).toEqual({
        voiceURI: "local:woman",
        name: "本地女声",
        lang: "zh-CN",
      });

      const preview = dialog?.querySelector<HTMLButtonElement>(
        ".a11y-voice-settings__button--primary",
      );
      expect(preview?.disabled).toBe(false);
      preview?.click();
      expect(synthesis.spoken).toHaveLength(1);
      expect(synthesis.spoken[0]?.voice).toBe(firstLocalVoice);
      expect(synthesis.spoken[0]?.rate).toBe(1);

      const replacementVoice = createNativeVoice(
        "本地女声",
        "zh-CN",
        "local:woman",
      );
      synthesis.voices = [replacementVoice, remoteVoice];
      synthesis.emitVoicesChanged();
      preview?.click();
      expect(synthesis.spoken).toHaveLength(2);
      expect(synthesis.spoken[1]?.voice).toBe(replacementVoice);
      expect(synthesis.spoken[1]?.voice).not.toBe(firstLocalVoice);

      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(dialog?.hidden).toBe(true);
      expect(shadow?.activeElement).toBe(voiceControl);
      expect(synthesis.cancel).toHaveBeenCalled();

      await runtime.close();
      expect(synthesis.listenerCount).toBe(0);
    } finally {
      await runtime.destroy();
      localStorage.removeItem(storageKey);
    }
  });

  it("keeps the catalog provider replaceable and native resolution separate", async () => {
    const storageKey = "test:replaceable-voice-provider";
    const descriptor = {
      id: "fixture:voice",
      voiceURI: "fixture:voice",
      name: "替代目录音色",
      lang: "zh-CN",
      isDefault: true,
    } as const;
    const snapshot: VoiceCatalogSnapshot = {
      capability: {
        providerId: "fixture-catalog",
        localOnly: true,
        supportsPreview: true,
      },
      status: "ready",
      voices: [descriptor],
    };
    const start = vi.fn();
    const stop = vi.fn();
    const resolvePreference = vi.fn(
      (preference: Parameters<VoiceCatalogProvider["resolvePreference"]>[0]) =>
        preference ? descriptor : null,
    );
    const catalog: VoiceCatalogProvider = {
      capability: snapshot.capability,
      start,
      stop,
      subscribe: (listener) => {
        listener(snapshot);
        return vi.fn();
      },
      getSnapshot: () => snapshot,
      getCompatibleVoices: vi.fn(() => [descriptor]),
      resolvePreference,
    };
    const nativeVoice = createNativeVoice(
      descriptor.name,
      descriptor.lang,
      descriptor.voiceURI,
    );
    const resolveNativeVoice = vi.fn(() => nativeVoice);
    const nativeVoiceResolver: BrowserNativeVoiceResolver = {
      resolveNativeVoice,
    };
    const synthesis = new RuntimeSpeechSynthesis([]);
    vi.stubGlobal("SpeechSynthesisUtterance", RuntimeUtterance);
    vi.stubGlobal("speechSynthesis", synthesis.asNative());
    document.body.innerHTML =
      '<button id="provider-launcher">打开工具</button>';
    const launcher = document.getElementById(
      "provider-launcher",
    ) as HTMLButtonElement;
    const runtime = new AccessibilityToolRuntime(() => ({
      catalog,
      nativeVoiceResolver,
    }));

    try {
      runtime.configure({
        debug: true,
        storageKey,
        persistOpenState: false,
        regions: { observe: false },
      });
      await runtime.open({ trigger: launcher });

      const shadow = document
        .querySelector<HTMLElement>("[data-a11y-tool-host]")
        ?.shadowRoot;
      shadow
        ?.querySelector<HTMLButtonElement>('[data-action="voiceSelection"]')
        ?.click();
      const dialog = shadow?.querySelector<HTMLElement>(
        ".a11y-voice-settings",
      );
      expect(start).toHaveBeenCalledTimes(1);
      expect(dialog?.textContent).toContain(descriptor.name);

      dialog
        ?.querySelector<HTMLInputElement>(
          `input[type="radio"][value="${descriptor.id}"]`,
        )
        ?.dispatchEvent(new Event("change", { bubbles: true }));
      expect(resolvePreference).toHaveBeenCalledWith(
        {
          voiceURI: descriptor.voiceURI,
          name: descriptor.name,
          lang: descriptor.lang,
        },
        "zh-CN",
      );

      dialog
        ?.querySelector<HTMLButtonElement>(
          ".a11y-voice-settings__button--primary",
        )
        ?.click();
      expect(resolveNativeVoice).toHaveBeenCalled();
      expect(synthesis.spoken.at(-1)?.voice).toBe(nativeVoice);

      await runtime.close();
      expect(stop).toHaveBeenCalled();
    } finally {
      await runtime.destroy();
      localStorage.removeItem(storageKey);
    }
  });
});

class RuntimeUtterance extends EventTarget {
  lang = "";
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;

  constructor(readonly text: string) {
    super();
  }
}

class RuntimeSpeechSynthesis extends EventTarget {
  readonly cancel = vi.fn();
  readonly spoken: RuntimeUtterance[] = [];
  listenerCount = 0;

  constructor(public voices: SpeechSynthesisVoice[]) {
    super();
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  speak = (utterance: RuntimeUtterance): void => {
    this.spoken.push(utterance);
  };

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

function createNativeVoice(
  name: string,
  lang: string,
  voiceURI: string,
  overrides: Partial<SpeechSynthesisVoice> = {},
): SpeechSynthesisVoice {
  return {
    default: true,
    lang,
    localService: true,
    name,
    voiceURI,
    ...overrides,
  };
}
