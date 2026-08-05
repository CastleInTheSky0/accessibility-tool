import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/core/config";
import { ToolbarUI } from "../../src/ui/toolbar";
import type {
  AccessibilityToolState,
  ColorScheme,
  RegionChangeEvent,
  RegionType,
} from "../../src/types";

describe("ToolbarUI", () => {
  it("renders the confirmed 14-control main order and an independent voice dialog trigger", () => {
    const { host, shadow, ui } = createToolbar();
    ui.updateState(defaultState);

    const actions = Array.from(
      shadow.querySelectorAll<HTMLElement>(
        '[data-mode="main"] [data-toolbar-item]',
      ),
    ).map((control) => control.dataset.action);
    expect(actions).toEqual([
      "reading",
      "speechRate",
      "voiceSelection",
      "colorScheme",
      "zoomIn",
      "zoomOut",
      "largeCursor",
      "crosshair",
      "fullscreen",
      "pin",
      "reset",
      "help",
      "readScreen",
      "exit",
    ]);

    const voice = getControl(shadow, "voiceSelection");
    expect(voice.getAttribute("aria-haspopup")).toBe("dialog");
    expect(voice.getAttribute("aria-expanded")).toBe("false");
    expect(voice.getAttribute("aria-controls")).toBe(`${host.id}-voice-settings`);
    expect(shadow.querySelector(`#${host.id}-voice-settings`)?.getAttribute("role"))
      .toBe("dialog");
    expect(voice.hasAttribute("aria-pressed")).toBe(false);

    ui.destroy();
    host.remove();
  });

  it("operates the non-modal voice dialog and returns focus on Escape", () => {
    const onLanguageChange = vi.fn();
    const onVoiceChange = vi.fn();
    const onVoicePreview = vi.fn();
    const onVoiceClear = vi.fn();
    const onVoiceSettingsClose = vi.fn();
    const { host, shadow, ui } = createToolbar(
      mergeConfig(DEFAULT_CONFIG),
      vi.fn(),
      {
        onVoiceLanguageChange: onLanguageChange,
        onVoiceChange,
        onVoicePreview,
        onVoiceClear,
        onVoiceSettingsClose,
      },
    );
    ui.updateState(defaultState);
    ui.updateVoiceSettings({
      availability: "browser-local",
      catalogStatus: "ready",
      preferredLanguage: "zh-CN",
      effectiveLanguage: "zh-CN",
      availableLanguages: ["fr-FR", "de-DE", "zh-CN", "fr-FR"],
      voices: [
        {
          id: "uri:local:woman",
          voiceURI: "local:woman",
          name: "本地女声",
          lang: "zh-CN",
          isDefault: false,
        },
      ],
      selectedVoiceId: "uri:local:woman",
      summary: "本地女声",
      statusMessage: "已找到 1 个兼容本地音色。",
      hasPreferences: true,
      previewEnabled: true,
      isPreviewing: false,
    });

    const trigger = getControl(shadow, "voiceSelection");
    ui.toggleVoiceSettings();
    const dialog = shadow.querySelector<HTMLElement>(".a11y-voice-settings");
    const language = dialog?.querySelector<HTMLSelectElement>("select");
    expect(dialog?.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(shadow.activeElement).toBe(language);
    expect(trigger.querySelector("[data-control-meta]")?.textContent).toBe(
      "本地女声",
    );
    expect(
      Array.from(language?.options ?? []).map((option) => option.value),
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

    if (!language) {
      throw new Error("Missing voice language selector");
    }
    language.value = "en-US";
    language.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onLanguageChange).toHaveBeenCalledWith("en-US");

    const selected = dialog?.querySelector<HTMLInputElement>(
      'input[type="radio"][value="uri:local:woman"]',
    );
    selected?.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onVoiceChange).toHaveBeenCalledWith({
      voiceURI: "local:woman",
      name: "本地女声",
      lang: "zh-CN",
    });
    dialog?.querySelector<HTMLButtonElement>(
      ".a11y-voice-settings__button--primary",
    )?.click();
    dialog?.querySelector<HTMLButtonElement>(
      ".a11y-voice-settings__button--secondary",
    )?.click();
    expect(onVoicePreview).toHaveBeenCalledTimes(1);
    expect(onVoiceClear).toHaveBeenCalledTimes(1);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(dialog?.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(shadow.activeElement).toBe(trigger);
    expect(onVoiceSettingsClose).toHaveBeenCalledTimes(1);

    ui.destroy();
    host.remove();
  });

  it("keeps closed-shadow dialog interactions open and dismisses outside it", () => {
    const onVoicePreview = vi.fn();
    const onVoiceSettingsClose = vi.fn();
    const { host, shadow, ui } = createToolbar(
      mergeConfig(DEFAULT_CONFIG),
      vi.fn(),
      { onVoicePreview, onVoiceSettingsClose },
      "closed",
    );
    const outside = document.createElement("button");
    document.body.append(outside);
    ui.updateState(defaultState);
    ui.updateVoiceSettings({
      availability: "browser-local",
      catalogStatus: "ready",
      preferredLanguage: "zh-CN",
      effectiveLanguage: "zh-CN",
      availableLanguages: [],
      voices: [],
      selectedVoiceId: null,
      summary: "自动选择",
      statusMessage: "已找到兼容本地音色。",
      hasPreferences: false,
      previewEnabled: true,
      isPreviewing: false,
    });

    ui.toggleVoiceSettings();
    const dialog = shadow.querySelector<HTMLElement>(".a11y-voice-settings");
    const preview = dialog?.querySelector<HTMLButtonElement>(
      ".a11y-voice-settings__button--primary",
    );
    preview?.dispatchEvent(
      new Event("pointerdown", { bubbles: true, composed: true }),
    );
    expect(dialog?.hidden).toBe(false);
    preview?.click();
    expect(onVoicePreview).toHaveBeenCalledTimes(1);

    getControl(shadow, "reading").dispatchEvent(
      new Event("pointerdown", { bubbles: true, composed: true }),
    );
    expect(dialog?.hidden).toBe(true);

    ui.toggleVoiceSettings();
    outside.dispatchEvent(
      new Event("pointerdown", { bubbles: true, composed: true }),
    );
    expect(dialog?.hidden).toBe(true);
    expect(onVoiceSettingsClose).toHaveBeenCalledTimes(2);

    ui.destroy();
    host.remove();
    outside.remove();
  });

  it("preserves voice-radio focus across selection and catalog refreshes", () => {
    const { host, shadow, ui } = createToolbar();
    const firstVoice = {
      id: "uri:local:first",
      voiceURI: "local:first",
      name: "本地女声",
      lang: "zh-CN",
      isDefault: false,
    } as const;
    const secondVoice = {
      id: "uri:local:second",
      voiceURI: "local:second",
      name: "本地男声",
      lang: "zh-CN",
      isDefault: true,
    } as const;
    const baseModel = {
      availability: "browser-local",
      catalogStatus: "ready",
      preferredLanguage: "zh-CN",
      effectiveLanguage: "zh-CN",
      availableLanguages: ["zh-CN"],
      voices: [firstVoice, secondVoice],
      selectedVoiceId: secondVoice.id,
      summary: secondVoice.name,
      statusMessage: "已找到 2 个兼容本地音色。",
      hasPreferences: true,
      previewEnabled: true,
      isPreviewing: false,
    } as const;
    ui.updateState(defaultState);
    ui.updateVoiceSettings(baseModel);
    ui.toggleVoiceSettings();

    const originalSecond = shadow.querySelector<HTMLInputElement>(
      `input[type="radio"][value="${secondVoice.id}"]`,
    );
    originalSecond?.focus();
    ui.updateVoiceSettings(baseModel);
    const replacementSecond = shadow.querySelector<HTMLInputElement>(
      `input[type="radio"][value="${secondVoice.id}"]`,
    );
    expect(replacementSecond).not.toBe(originalSecond);
    expect(shadow.activeElement).toBe(replacementSecond);

    ui.updateVoiceSettings({
      ...baseModel,
      voices: [firstVoice],
      selectedVoiceId: null,
      summary: "自动选择",
    });
    const automatic = shadow.querySelector<HTMLInputElement>(
      'input[type="radio"][value=""]',
    );
    expect(automatic?.checked).toBe(true);
    expect(shadow.activeElement).toBe(automatic);

    ui.destroy();
    host.remove();
  });

  it("explains when browser-local voice controls are unavailable for a custom adapter", () => {
    const { host, shadow, ui } = createToolbar();
    ui.updateState(defaultState);
    ui.updateVoiceSettings({
      availability: "custom-adapter",
      catalogStatus: "unsupported",
      preferredLanguage: null,
      effectiveLanguage: "zh-CN",
      availableLanguages: [],
      voices: [],
      selectedVoiceId: null,
      summary: "自定义语音",
      statusMessage: "当前站点使用自定义语音适配器，浏览器本地音色设置不可用。",
      hasPreferences: false,
      previewEnabled: false,
      isPreviewing: false,
    });

    ui.toggleVoiceSettings();
    const dialog = shadow.querySelector<HTMLElement>(".a11y-voice-settings");
    expect(dialog?.hasAttribute("data-voice-settings-unavailable")).toBe(true);
    expect(dialog?.querySelector('[role="status"]')?.textContent).toContain(
      "自定义语音适配器",
    );
    expect(
      dialog?.querySelector<HTMLButtonElement>(
        ".a11y-voice-settings__button--primary",
      )?.disabled,
    ).toBe(true);
    expect(
      dialog?.querySelector<HTMLInputElement>('input[type="radio"]')?.disabled,
    ).toBe(true);

    ui.destroy();
    host.remove();
  });

  it("keeps the brand rail non-interactive and preserves screen-mode order", () => {
    const { host, shadow, ui } = createToolbar();
    ui.updateState({ ...defaultState, isReadScreen: true });
    ui.setRegionCounts({
      viewport: 7,
      navigation: 3,
      interaction: 2,
      service: 1,
      list: 0,
      content: 4,
    });

    const brand = shadow.querySelector<HTMLElement>(".a11y-toolbar__brand");
    expect(brand?.getAttribute("aria-hidden")).toBe("true");
    expect(brand?.querySelectorAll("i")).toHaveLength(6);
    expect(brand?.querySelector("[data-toolbar-item]")).toBeNull();

    const actions = Array.from(
      shadow.querySelectorAll<HTMLElement>(
        '[data-mode="screen"] [data-toolbar-item]',
      ),
    ).map((control) => control.dataset.action);
    expect(actions).toEqual([
      "region:viewport",
      "region:navigation",
      "region:interaction",
      "region:service",
      "region:list",
      "region:content",
      "screenSound",
      "help",
      "readScreen",
      "exit",
    ]);

    const viewport = getControl(shadow, "region:viewport");
    expect(viewport.getAttribute("aria-label")).toBe("视窗区，共 7 个");
    expect(viewport.querySelector("[data-region-count]")?.textContent).toBe("7");
    expect(viewport.querySelector("[data-control-meta]")?.textContent).toBe(
      "ALT + 1",
    );
    const list = getControl(shadow, "region:list");
    expect(list.getAttribute("aria-disabled")).toBe("true");
    expect(list.querySelector("[data-control-meta]")?.textContent).toBe(
      "ALT + 5",
    );

    const sound = getControl(shadow, "screenSound");
    expect(sound.getAttribute("aria-label")).toBe("朗读，当前关闭");
    expect(sound.querySelector(".a11y-control__label")?.textContent).toBe(
      "朗读",
    );
    expect(sound.querySelector("[data-control-meta]")?.textContent).toBe(
      "关闭",
    );
    const readScreen = getControls(shadow, "readScreen")[1];
    expect(readScreen?.getAttribute("aria-pressed")).toBe("true");
    expect(readScreen?.querySelector("[data-control-meta]")?.textContent).toBe(
      "当前模式",
    );

    expect(ui.getToolbarHeight()).toBe(146);
    ui.destroy();
    host.remove();
  });

  it("renders one current region, moves it between categories and clears it", () => {
    const { host, shadow, ui } = createToolbar();
    ui.updateState({ ...defaultState, isReadScreen: true });
    ui.setRegionCounts({
      viewport: 7,
      navigation: 3,
      interaction: 2,
      service: 1,
      list: 0,
      content: 4,
    });

    const viewport = getControl(shadow, "region:viewport");
    const navigation = getControl(shadow, "region:navigation");
    ui.setCurrentRegion(regionChange("viewport", 0, 7));

    expect(viewport.getAttribute("aria-current")).toBe("location");
    expect(viewport.hasAttribute("data-region-current")).toBe(true);
    expect(viewport.getAttribute("aria-pressed")).toBeNull();
    expect(viewport.querySelector("[data-region-count]")?.textContent).toBe(
      "1/7",
    );
    expect(viewport.getAttribute("aria-label")).toBe("视窗区，共 7 个");
    expect(shadow.querySelectorAll('[aria-current="location"]')).toHaveLength(1);

    ui.setCurrentRegion(regionChange("viewport", 1, 7));
    expect(viewport.querySelector("[data-region-count]")?.textContent).toBe(
      "2/7",
    );

    ui.setCurrentRegion(regionChange("navigation", 0, 3));
    expect(viewport.hasAttribute("data-region-current")).toBe(false);
    expect(viewport.querySelector("[data-region-count]")?.textContent).toBe(
      "7",
    );
    expect(navigation.getAttribute("aria-current")).toBe("location");
    expect(navigation.querySelector("[data-region-count]")?.textContent).toBe(
      "1/3",
    );
    expect(shadow.querySelectorAll('[aria-current="location"]')).toHaveLength(1);

    ui.setRegionCounts({
      viewport: 7,
      navigation: 2,
      interaction: 2,
      service: 1,
      list: 0,
      content: 4,
    });
    expect(navigation.querySelector("[data-region-count]")?.textContent).toBe(
      "1/2",
    );

    ui.setRegionCounts({
      viewport: 7,
      navigation: 0,
      interaction: 2,
      service: 1,
      list: 0,
      content: 4,
    });
    expect(navigation.hasAttribute("data-region-current")).toBe(false);
    expect(navigation.hasAttribute("aria-current")).toBe(false);
    expect(navigation.querySelector("[data-region-count]")?.textContent).toBe(
      "0",
    );

    ui.setCurrentRegion(regionChange("content", 2, 4));
    ui.hide();
    expect(shadow.querySelector('[aria-current="location"]')).toBeNull();
    expect(
      getControl(shadow, "region:content").querySelector("[data-region-count]")
        ?.textContent,
    ).toBe("4");

    ui.destroy();
    host.remove();
  });

  it("applies hidden feature configuration to read-screen controls", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const config = mergeConfig(DEFAULT_CONFIG, {
      features: {
        reading: false,
        help: false,
        exit: false,
      },
    });
    const ui = new ToolbarUI(host, shadow, config, {
      onAction: vi.fn(),
      onCollapsedChange: vi.fn(),
    });
    ui.updateState({ ...defaultState, isReadScreen: true });

    const actions = Array.from(
      shadow.querySelectorAll<HTMLElement>(
        '[data-mode="screen"] [data-toolbar-item]',
      ),
    ).map((control) => control.dataset.action);
    expect(actions).toEqual([
      "region:viewport",
      "region:navigation",
      "region:interaction",
      "region:service",
      "region:list",
      "region:content",
      "readScreen",
    ]);
    ui.destroy();
    host.remove();
  });

  it("keeps only the reading target as a toolbar-owned overlay", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const ui = new ToolbarUI(host, shadow, mergeConfig(DEFAULT_CONFIG), {
      onAction: vi.fn(),
      onCollapsedChange: vi.fn(),
    });
    const target = document.createElement("button");
    document.body.prepend(target);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(
      new DOMRect(-20, -10, 100, 50),
    );

    ui.positionHighlight(target);
    const readingOverlay = shadow.querySelector<HTMLElement>(".a11y-highlight");
    expect(readingOverlay?.hidden).toBe(false);
    expect(readingOverlay?.style.getPropertyValue("--a11y-highlight-x")).toBe(
      "-20px",
    );
    expect(readingOverlay?.style.getPropertyValue("--a11y-highlight-y")).toBe(
      "-10px",
    );
    expect(shadow.querySelector(".a11y-region-highlight")).toBeNull();
    expect(shadow.querySelector(".a11y-focus-highlight")).toBeNull();

    ui.hideHighlight();
    expect(readingOverlay?.hidden).toBe(true);

    ui.destroy();
    target.remove();
    host.remove();
  });

  it("keeps every switch icon synchronized with its final pressed state", () => {
    const { host, shadow, ui } = createToolbar();
    ui.updateState(defaultState);

    const offStates = {
      reading: "sound-off",
      largeCursor: "cursor-off",
      crosshair: "crosshair-off",
      fullscreen: "fullscreen-enter",
      pin: "pin-off",
      readScreen: "read-screen-off",
      screenSound: "sound-off",
    } as const;
    const offMarkup = new Map<string, string>();
    for (const [action, iconState] of Object.entries(offStates)) {
      for (const control of getControls(shadow, action)) {
        expect(control.getAttribute("aria-pressed")).toBe("false");
        expectIconState(control, iconState);
        offMarkup.set(action, getIcon(control).innerHTML);
      }
    }
    expect(getControl(shadow, "speechRate").hasAttribute("aria-pressed")).toBe(
      false,
    );
    expect(getControl(shadow, "exit").hasAttribute("aria-pressed")).toBe(false);

    ui.updateState({
      ...defaultState,
      readingEnabled: true,
      largeCursor: true,
      crosshair: true,
      isFullscreen: true,
      isPinned: true,
      isReadScreen: true,
    });

    const onStates = {
      reading: "sound-on",
      largeCursor: "cursor-on",
      crosshair: "crosshair-on",
      fullscreen: "fullscreen-exit",
      pin: "pin-on",
      readScreen: "read-screen-on",
      screenSound: "sound-on",
    } as const;
    for (const [action, iconState] of Object.entries(onStates)) {
      for (const control of getControls(shadow, action)) {
        expect(control.getAttribute("aria-pressed")).toBe("true");
        expectIconState(control, iconState);
        expect(getIcon(control).innerHTML).not.toBe(offMarkup.get(action));
      }
    }
    expect(getIcon(getControl(shadow, "reading")).innerHTML).toBe(
      getIcon(getControl(shadow, "screenSound")).innerHTML,
    );
    expect(getControl(shadow, "reading").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(getControl(shadow, "pin").getAttribute("aria-pressed")).toBe(
      "true",
    );

    ui.destroy();
    host.remove();
  });

  it("renders the current palette and rate while keeping zoom icons fixed", () => {
    const { host, shadow, ui } = createToolbar();
    const rate = getControl(shadow, "speechRate");
    const color = getControl(shadow, "colorScheme");
    const zoomIn = getControl(shadow, "zoomIn");
    const zoomOut = getControl(shadow, "zoomOut");

    expect(shadow.querySelector(".a11y-rate-panel")).toBeNull();
    expect(rate.hasAttribute("aria-haspopup")).toBe(false);
    expect(rate.hasAttribute("aria-expanded")).toBe(false);
    expect(rate.hasAttribute("aria-controls")).toBe(false);

    ui.updateState({ ...defaultState, speechRate: 0.5, zoom: 0.75 });
    expectIconState(rate, "rate-0.5");
    const slowPointer = getIndicator(rate, "rate");
    const zoomInMarkup = getIcon(zoomIn).innerHTML;
    const zoomOutMarkup = getIcon(zoomOut).innerHTML;

    ui.updateState({ ...defaultState, speechRate: 2, zoom: 2 });
    expectIconState(rate, "rate-2");
    expect(getIndicator(rate, "rate")).not.toBe(slowPointer);
    expect(getIcon(zoomIn).innerHTML).toBe(zoomInMarkup);
    expect(getIcon(zoomOut).innerHTML).toBe(zoomOutMarkup);
    expect(zoomInMarkup).not.toBe(zoomOutMarkup);
    expect(zoomIn.querySelector("[data-control-meta]")?.textContent).toBe(
      "200%",
    );
    expect(zoomOut.getAttribute("aria-label")).toBe("缩小，当前 200%");

    const schemes: readonly ColorScheme[] = [
      "original",
      "white-black",
      "black-yellow",
      "yellow-black",
      "blue-white",
    ];
    const paletteMarkup = new Set<string>();
    for (const scheme of schemes) {
      ui.updateState({ ...defaultState, colorScheme: scheme });
      expectIconState(color, `scheme-${scheme}`);
      const svg = getIcon(color).querySelector("svg");
      expect(svg?.getAttribute("data-color-scheme")).toBe(scheme);
      paletteMarkup.add(getIcon(color).innerHTML);
    }
    expect(paletteMarkup.size).toBe(schemes.length);

    ui.destroy();
    host.remove();
  });

  it("renders descriptive metadata for every main toolbar action", () => {
    const { host, shadow, ui } = createToolbar();
    ui.updateState({
      ...defaultState,
      readingEnabled: true,
      speechRate: 1.25,
      colorScheme: "black-yellow",
      zoom: 1.25,
      largeCursor: true,
      isFullscreen: true,
      isPinned: true,
    });

    const expectedMeta = {
      reading: "开启",
      speechRate: "1.25×",
      voiceSelection: "自动选择",
      colorScheme: "黑底黄字",
      zoomIn: "125%",
      zoomOut: "125%",
      largeCursor: "开启",
      crosshair: "关闭",
      fullscreen: "全屏",
      pin: "已开启",
      reset: "恢复默认",
      help: "操作说明",
      readScreen: "标准模式",
      exit: "关闭工具",
    } as const;
    for (const [action, meta] of Object.entries(expectedMeta)) {
      const control = getControls(shadow, action)[0];
      expect(control?.querySelector("[data-control-meta]")?.textContent).toBe(
        meta,
      );
    }
    expect(getControl(shadow, "reading").getAttribute("aria-label")).toBe(
      "朗读，当前开启",
    );
    expect(getControl(shadow, "pin").getAttribute("aria-label")).toBe(
      "固定，当前已固定",
    );

    ui.destroy();
    host.remove();
  });

  it("collapses a pinned toolbar immediately on pointer leave and moves hidden focus to reveal", () => {
    vi.useFakeTimers();
    const onCollapsedChange = vi.fn();
    const { host, shadow, ui } = createToolbar(
      mergeConfig(DEFAULT_CONFIG, {
        toolbar: { pinHideDelayMs: 5000 },
      }),
      onCollapsedChange,
    );

    try {
      ui.updateState({ ...defaultState, isPinned: true });
      const root = shadow.querySelector<HTMLElement>("[data-a11y-tool-root]");
      const pin = getControl(shadow, "pin");
      const reveal = shadow.querySelector<HTMLButtonElement>(".a11y-reveal");
      expect(root).not.toBeNull();
      expect(reveal).not.toBeNull();
      const revealFocus = vi.spyOn(reveal!, "focus");

      pin.focus();
      expect(shadow.activeElement).toBe(pin);
      root?.dispatchEvent(new Event("pointerleave"));

      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(true);
      expect(reveal?.tabIndex).toBe(0);
      expect(shadow.activeElement).toBe(reveal);
      expect(revealFocus).toHaveBeenCalledWith({ preventScroll: true });
      expect(onCollapsedChange).toHaveBeenLastCalledWith(true);

      reveal?.click();
      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(false);
      expect(shadow.activeElement).toBe(getControl(shadow, "reading"));
      expect(onCollapsedChange).toHaveBeenLastCalledWith(false);

      const rate = getControl(shadow, "speechRate");
      rate.focus();
      root?.dispatchEvent(new Event("pointerleave"));
      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(true);
      expect(shadow.activeElement).toBe(reveal);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      ui.destroy();
      host.remove();
    }
  });

  it("uses the same pointer collapse model in pinned read-screen mode", () => {
    vi.useFakeTimers();
    const onCollapsedChange = vi.fn();
    const { host, shadow, ui } = createToolbar(
      mergeConfig(DEFAULT_CONFIG, {
        toolbar: { pinHideDelayMs: 5000 },
      }),
      onCollapsedChange,
    );

    try {
      const root = shadow.querySelector<HTMLElement>("[data-a11y-tool-root]");
      const reveal = shadow.querySelector<HTMLButtonElement>(".a11y-reveal");
      expect(root).not.toBeNull();
      expect(reveal).not.toBeNull();

      ui.updateState({
        ...defaultState,
        isPinned: false,
        isReadScreen: true,
      });
      root?.dispatchEvent(new Event("pointerleave"));
      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(false);

      ui.updateState({
        ...defaultState,
        isPinned: true,
        isReadScreen: true,
      });
      const screenReadScreen = getControls(shadow, "readScreen")[1];
      screenReadScreen?.focus();
      root?.dispatchEvent(new Event("pointerleave"));

      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(true);
      expect(reveal?.tabIndex).toBe(0);
      expect(shadow.activeElement).toBe(reveal);
      expect(onCollapsedChange).toHaveBeenLastCalledWith(true);

      reveal?.click();
      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(false);
      expect(
        shadow.querySelector<HTMLElement>('[data-mode="screen"]')?.hidden,
      ).toBe(false);
      expect(shadow.activeElement).toBe(
        getControl(shadow, "region:viewport"),
      );
      expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      ui.destroy();
      host.remove();
    }
  });

  it("keeps keyboard focusout on the configured collapse delay", () => {
    vi.useFakeTimers();
    const { host, shadow, ui } = createToolbar(
      mergeConfig(DEFAULT_CONFIG, {
        toolbar: { pinHideDelayMs: 5000 },
      }),
    );
    const pageControl = document.createElement("button");
    document.body.append(pageControl);

    try {
      ui.updateState({ ...defaultState, isPinned: true });
      getControl(shadow, "pin").focus();
      pageControl.focus();
      vi.advanceTimersByTime(0);

      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(false);
      vi.advanceTimersByTime(4999);
      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(false);
      vi.advanceTimersByTime(1);
      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(true);
      expect(document.activeElement).toBe(pageControl);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      ui.destroy();
      host.remove();
      pageControl.remove();
    }
  });

  it("keeps a pinned read-screen mode switch expanded before scheduled collapse", () => {
    vi.useFakeTimers();
    const { host, ui } = createToolbar(
      mergeConfig(DEFAULT_CONFIG, {
        toolbar: { pinHideDelayMs: 800 },
      }),
    );

    try {
      ui.updateState({
        ...defaultState,
        isCollapsed: false,
        isPinned: true,
        isReadScreen: true,
      });
      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(false);

      ui.scheduleCollapse();
      vi.advanceTimersByTime(799);
      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(false);
      vi.advanceTimersByTime(1);
      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(true);

      ui.updateState({
        ...defaultState,
        isCollapsed: false,
        isPinned: true,
        isReadScreen: true,
      });
      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(false);

      ui.updateState({
        ...defaultState,
        isPinned: false,
        isReadScreen: true,
      });
      ui.scheduleCollapse();
      vi.advanceTimersByTime(800);
      expect(host.hasAttribute("data-a11y-tool-collapsed")).toBe(false);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      ui.destroy();
      host.remove();
    }
  });
});

function createToolbar(
  config = mergeConfig(DEFAULT_CONFIG),
  onCollapsedChange: (collapsed: boolean) => void = vi.fn(),
  callbackOverrides: Partial<ConstructorParameters<typeof ToolbarUI>[3]> = {},
  shadowMode: ShadowRootMode = "open",
): {
  host: HTMLDivElement;
  shadow: ShadowRoot;
  ui: ToolbarUI;
} {
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: shadowMode });
  const ui = new ToolbarUI(host, shadow, config, {
    onAction: vi.fn(),
    onCollapsedChange,
    ...callbackOverrides,
  });
  return { host, shadow, ui };
}

function getControls(shadow: ShadowRoot, action: string): HTMLElement[] {
  return Array.from(
    shadow.querySelectorAll<HTMLElement>(`[data-action="${action}"]`),
  );
}

function getControl(shadow: ShadowRoot, action: string): HTMLElement {
  const control = getControls(shadow, action)[0];
  if (!control) {
    throw new Error(`Missing toolbar control: ${action}`);
  }
  return control;
}

function getIcon(control: HTMLElement): HTMLElement {
  const icon = control.querySelector<HTMLElement>(".a11y-control__icon");
  if (!icon) {
    throw new Error(`Missing icon for ${control.dataset.action ?? "control"}`);
  }
  return icon;
}

function expectIconState(control: HTMLElement, state: string): void {
  expect(control.getAttribute("data-icon-state")).toBe(state);
  const icon = getIcon(control);
  expect(icon.getAttribute("data-icon-state")).toBe(state);
  const svg = icon.querySelector("svg");
  expect(svg?.getAttribute("aria-hidden")).toBe("true");
  expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
  expect(svg?.getAttribute("focusable")).toBe("false");
}

function getIndicator(control: HTMLElement, type: "rate"): string {
  const indicator = getIcon(control).querySelector(
    `[data-icon-indicator="${type}"]`,
  );
  const path = indicator?.getAttribute("d");
  if (!path) {
    throw new Error(`Missing ${type} icon indicator`);
  }
  return path;
}

function regionChange(
  type: RegionType,
  index: number,
  count: number,
): RegionChangeEvent {
  return {
    type,
    index,
    count,
    element: document.createElement("section"),
    label: type,
  };
}

const defaultState: AccessibilityToolState = {
  isOpen: true,
  isPinned: false,
  isCollapsed: false,
  isReadScreen: false,
  readingEnabled: false,
  speechRate: 1,
  colorScheme: "original",
  zoom: 1,
  largeCursor: false,
  crosshair: false,
  isFullscreen: false,
};
