import {
  COLOR_SCHEME_LABELS,
  MAIN_FEATURE_ORDER,
  REGION_LABELS,
  REGION_TYPES,
} from "../core/constants";
import type { ResolvedAccessibilityToolConfig } from "../core/config";
import { isHTMLElement } from "../core/dom";
import {
  VoiceSettingsUI,
  type VoiceSettingsModel,
} from "./voice-settings";
import {
  ContinuousReadingSettingsUI,
  type ContinuousReadingSettingsModel,
} from "./continuous-reading-settings";
import { LargeCaptionUI } from "./large-caption";
import type { CaptionOutputModel } from "../features/output";
import type {
  AccessibilityToolState,
  CaptionFontSize,
  CaptionScript,
  ColorScheme,
  FeatureId,
  RegionChangeEvent,
  RegionType,
  PersistedVoicePreference,
} from "../types";

export type ToolbarAction = FeatureId | `region:${RegionType}` | "screenSound";

interface ToolbarCallbacks {
  onAction: (action: ToolbarAction, control: HTMLElement) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onFocusInside?: () => void;
  onVoiceLanguageChange?: (language: string | null) => void;
  onVoiceChange?: (voice: PersistedVoicePreference | null) => void;
  onVoicePreview?: () => void;
  onVoiceClear?: () => void;
  onVoiceSettingsClose?: () => void;
  onContinuousReadingStart?: () => void;
  onContinuousReadingPause?: () => void;
  onContinuousReadingResume?: () => void;
  onContinuousReadingStop?: () => void;
  onContinuousReadingSettingsClose?: () => void;
  onCaptionClose?: () => void;
  onCaptionFontSizeChange?: (size: CaptionFontSize) => void;
  onCaptionScriptChange?: (script: CaptionScript) => void;
  onCaptionPinyinChange?: (enabled: boolean) => void;
}

const FEATURE_LABELS: Readonly<Record<FeatureId, string>> = {
  reading: "朗读",
  continuousReading: "连续朗读",
  speechRate: "语速",
  voiceSelection: "音色",
  colorScheme: "配色",
  zoomIn: "放大",
  zoomOut: "缩小",
  largeCursor: "大鼠标",
  crosshair: "十字线",
  fullscreen: "大界面",
  largeCaption: "大字幕",
  pin: "固定",
  reset: "重置",
  help: "帮助",
  readScreen: "读屏专用",
  exit: "退出",
};

const TOGGLE_ICONS = {
  sound: {
    off: createSvgIcon(
      '<path d="M4 9v6h4l5 4V5L8 9H4"/><path d="m16 9 5 6M21 9l-5 6"/>',
    ),
    on: createSvgIcon(
      '<path d="M4 9v6h4l5 4V5L8 9H4"/><path d="M16.2 8.2a5.5 5.5 0 0 1 0 7.6M18.8 5.6a9 9 0 0 1 0 12.8"/>',
    ),
  },
  cursor: {
    off: createSvgIcon(
      '<path d="m5 3 13 10-7 1-3 6L5 3Z"/><path d="m13 15 4 5M16 4l5 5M21 4l-5 5"/>',
    ),
    on: createSvgIcon(
      '<path d="m5 3 13 10-7 1-3 6L5 3Z"/><path d="m13 15 4 5M18 3v3M21 6h-3"/>',
    ),
  },
  crosshair: {
    off: createSvgIcon(
      '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M4 4l16 16"/>',
    ),
    on: createSvgIcon(
      '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1"/>',
    ),
  },
  fullscreen: {
    off: createSvgIcon(
      '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    ),
    on: createSvgIcon(
      '<path d="M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5"/>',
    ),
  },
  pin: {
    off: createSvgIcon(
      '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6ZM12 14v7M4 4l16 16"/>',
    ),
    on: createSvgIcon(
      '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6ZM12 14v7"/>',
    ),
  },
  readScreen: {
    off: createSvgIcon(
      '<path d="M3 5h18v12H3zM8 21h8M12 17v4M7 9h10M7 13h6M5 4l14 14"/>',
    ),
    on: createSvgIcon(
      '<path d="M3 5h18v12H3zM8 21h8M12 17v4M6 10v3h2l2 2V8l-2 2H6M13 10a3 3 0 0 1 0 3M15 8a6 6 0 0 1 0 7"/>',
    ),
  },
} as const;

const ICONS: Readonly<Record<string, string>> = {
  reading: TOGGLE_ICONS.sound.off,
  continuousReading: createSvgIcon(
    '<path d="M5 4v16l14-8L5 4Z"/><path class="a11y-icon__muted" d="M19 5v14"/>',
  ),
  speechRate: renderSpeechRateIcon(1),
  voiceSelection: createSvgIcon(
    '<path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 11v2"/><path class="a11y-icon__muted" d="M4 5h16"/>',
  ),
  colorScheme: renderColorSchemeIcon("original"),
  zoomIn: createSvgIcon(
    '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M10.5 7.5v6M7.5 10.5h6"/>',
  ),
  zoomOut: createSvgIcon(
    '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7.5 10.5h6"/>',
  ),
  largeCursor: TOGGLE_ICONS.cursor.off,
  crosshair: TOGGLE_ICONS.crosshair.off,
  fullscreen: TOGGLE_ICONS.fullscreen.off,
  largeCaption: createSvgIcon(
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6 9h12M6 13h8M6 17h5"/>',
  ),
  pin: TOGGLE_ICONS.pin.off,
  reset: createSvgIcon(
    '<path d="M5 8V3m0 0h5M5 3l3.5 3.5A8 8 0 1 1 4 13"/>',
  ),
  help: createSvgIcon(
    '<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.1.9-1.1 1.8M12 17h.01"/>',
  ),
  readScreen: TOGGLE_ICONS.readScreen.off,
  exit: createSvgIcon(
    '<path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/>',
  ),
  viewport: createSvgIcon(
    '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18"/>',
  ),
  navigation: createSvgIcon(
    '<path d="M4 5h16M4 12h10M4 19h16"/><circle cx="18" cy="12" r="2"/>',
  ),
  interaction: createSvgIcon(
    '<path d="M4 5h16v14H4zM7 9h6M7 13h10M7 16h4"/>',
  ),
  service: createSvgIcon(
    '<path d="M5 10a7 7 0 0 1 14 0v6M5 13H3v4h4v-7H5M19 13h2v4h-4v-7h2M17 19c-1 1-2.5 2-5 2"/>',
  ),
  list: createSvgIcon(
    '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  ),
  content: createSvgIcon(
    '<path d="M5 3h10l4 4v14H5zM15 3v5h5M8 12h8M8 16h8"/>',
  ),
  screenSound: TOGGLE_ICONS.sound.off,
};

const SWITCH_FEATURES = new Set<FeatureId>([
  "reading",
  "largeCursor",
  "crosshair",
  "fullscreen",
  "largeCaption",
  "pin",
  "readScreen",
]);

export class ToolbarUI {
  private readonly root: HTMLDivElement;
  private readonly toolbar: HTMLDivElement;
  private readonly toolbarFrame: HTMLDivElement;
  private readonly brandRail: HTMLDivElement;
  private readonly mainGroup: HTMLDivElement;
  private readonly screenGroup: HTMLDivElement;
  private readonly liveRegion: HTMLDivElement;
  private readonly revealButton: HTMLButtonElement;
  private readonly horizontalLine: HTMLDivElement;
  private readonly verticalLine: HTMLDivElement;
  private readonly highlight: HTMLDivElement;
  private readonly voiceSettings: VoiceSettingsUI;
  private readonly continuousReadingSettings: ContinuousReadingSettingsUI;
  private readonly largeCaption: LargeCaptionUI;
  private readonly controls = new Map<ToolbarAction, HTMLElement>();
  private regionCounts: Record<RegionType, number> = {
    viewport: 0,
    navigation: 0,
    interaction: 0,
    service: 0,
    list: 0,
    content: 0,
  };
  private currentRegion: Pick<
    RegionChangeEvent,
    "type" | "index" | "count"
  > | null = null;
  private state: AccessibilityToolState | null = null;
  private voiceSettingsModel: VoiceSettingsModel | null = null;
  private continuousReadingSettingsModel: ContinuousReadingSettingsModel = {
    state: "idle",
    supported: true,
    position: null,
  };
  private config: ResolvedAccessibilityToolConfig;
  private collapseTimer: number | null = null;

  constructor(
    private readonly host: HTMLElement,
    shadowRoot: ShadowRoot,
    config: ResolvedAccessibilityToolConfig,
    private readonly callbacks: ToolbarCallbacks,
  ) {
    this.config = config;
    this.root = document.createElement("div");
    this.root.setAttribute("data-a11y-tool-root", "");

    this.toolbar = document.createElement("div");
    this.toolbar.className = "a11y-toolbar";
    this.toolbar.id = `${host.id}-toolbar`;
    this.toolbar.role = "toolbar";
    this.toolbar.setAttribute("aria-label", "无障碍工具栏");
    this.toolbar.setAttribute("aria-orientation", "horizontal");

    this.toolbarFrame = document.createElement("div");
    this.toolbarFrame.className = "a11y-toolbar__frame";

    this.brandRail = this.buildBrandRail();

    this.mainGroup = document.createElement("div");
    this.mainGroup.className = "a11y-toolbar__items";
    this.mainGroup.dataset.mode = "main";
    this.mainGroup.role = "group";
    this.mainGroup.setAttribute("aria-label", "主要功能");

    this.screenGroup = document.createElement("div");
    this.screenGroup.className = "a11y-toolbar__items";
    this.screenGroup.dataset.mode = "screen";
    this.screenGroup.role = "group";
    this.screenGroup.setAttribute("aria-label", "读屏专用功能");
    this.screenGroup.hidden = true;

    this.buildMainControls();
    this.buildScreenControls();
    this.toolbarFrame.append(this.brandRail, this.mainGroup, this.screenGroup);
    this.toolbar.append(this.toolbarFrame);

    this.revealButton = document.createElement("button");
    this.revealButton.type = "button";
    this.revealButton.className = "a11y-reveal";
    this.revealButton.setAttribute("aria-label", "展开无障碍工具栏");
    this.revealButton.innerHTML =
      '<span aria-hidden="true">⌄</span><span>无障碍工具</span>';

    this.liveRegion = document.createElement("div");
    this.liveRegion.className = "a11y-visually-hidden";
    this.liveRegion.setAttribute("role", "status");
    this.liveRegion.setAttribute("aria-live", "polite");
    this.liveRegion.setAttribute("aria-atomic", "true");

    this.horizontalLine = this.createOverlay("a11y-crosshair a11y-crosshair--x");
    this.verticalLine = this.createOverlay("a11y-crosshair a11y-crosshair--y");
    this.highlight = this.createOverlay("a11y-highlight");

    this.root.append(
      this.toolbar,
      this.revealButton,
      this.liveRegion,
      this.horizontalLine,
      this.verticalLine,
      this.highlight,
    );
    this.voiceSettings = new VoiceSettingsUI(
      this.root,
      `${host.id}-voice-settings`,
      {
        onLanguageChange: (language) =>
          this.callbacks.onVoiceLanguageChange?.(language),
        onVoiceChange: (voice) => this.callbacks.onVoiceChange?.(voice),
        onPreview: () => this.callbacks.onVoicePreview?.(),
        onClear: () => this.callbacks.onVoiceClear?.(),
        onClose: () => this.callbacks.onVoiceSettingsClose?.(),
      },
    );
    this.continuousReadingSettings = new ContinuousReadingSettingsUI(
      this.root,
      `${host.id}-continuous-reading-settings`,
      {
        onStart: () => this.callbacks.onContinuousReadingStart?.(),
        onPause: () => this.callbacks.onContinuousReadingPause?.(),
        onResume: () => this.callbacks.onContinuousReadingResume?.(),
        onStop: () => this.callbacks.onContinuousReadingStop?.(),
        onClose: () => this.callbacks.onContinuousReadingSettingsClose?.(),
        resolveAnchor: () => this.findVisibleControl("continuousReading"),
      },
    );
    shadowRoot.append(this.root);
    this.largeCaption = new LargeCaptionUI(document, shadowRoot, {
      onClose: () => this.callbacks.onCaptionClose?.(),
      onFontSizeChange: (size) =>
        this.callbacks.onCaptionFontSizeChange?.(size),
      onScriptChange: (script) =>
        this.callbacks.onCaptionScriptChange?.(script),
      onPinyinChange: (enabled) =>
        this.callbacks.onCaptionPinyinChange?.(enabled),
      resolveRestoreControl: () =>
        this.host.hasAttribute("data-a11y-tool-collapsed")
          ? null
          : this.findVisibleControl("largeCaption"),
    });

    this.bindEvents();
    this.updateHelpLinks();
  }

  updateConfig(config: ResolvedAccessibilityToolConfig): void {
    this.config = config;
    this.updateHelpLinks();
    if (this.state) {
      for (const feature of MAIN_FEATURE_ORDER) {
        for (const control of this.findControls(feature)) {
          this.updateControlIcon(feature, control, this.state, true);
        }
      }
      const sound = this.controls.get("screenSound");
      if (sound) {
        this.updateControlIcon("screenSound", sound, this.state, true);
      }
      this.updateAvailability();
    }
  }

  show(): void {
    this.host.hidden = false;
    this.root.hidden = false;
  }

  hide(): void {
    this.cancelCollapse();
    this.voiceSettings.close({ notify: true });
    this.continuousReadingSettings.close({ notify: true });
    this.setCurrentRegion(null);
    this.hideCrosshair();
    this.hideHighlight();
    this.largeCaption.hide();
    this.root.hidden = true;
    this.host.hidden = true;
  }

  destroy(): void {
    this.cancelCollapse();
    this.voiceSettings.destroy();
    this.continuousReadingSettings.destroy();
    this.largeCaption.destroy();
    this.root.remove();
  }

  updateState(state: AccessibilityToolState): void {
    const modeChanged = this.state?.isReadScreen !== state.isReadScreen;
    this.state = state;
    this.host.toggleAttribute("data-a11y-tool-pinned", state.isPinned);
    this.host.toggleAttribute("data-a11y-tool-collapsed", state.isCollapsed);
    this.host.toggleAttribute(
      "data-a11y-tool-large-cursor",
      state.largeCursor,
    );
    this.host.dataset.a11yColorScheme = state.colorScheme;
    this.root.toggleAttribute("data-read-screen", state.isReadScreen);
    this.mainGroup.hidden = state.isReadScreen;
    this.screenGroup.hidden = !state.isReadScreen;
    if (state.isReadScreen) {
      this.voiceSettings.close({ notify: true });
    }
    if (modeChanged) {
      this.continuousReadingSettings.close({ notify: true });
    }
    this.continuousReadingSettings.update(
      this.continuousReadingSettingsModel,
    );
    this.largeCaption.updatePreferences(state);

    for (const feature of MAIN_FEATURE_ORDER) {
      for (const control of this.findControls(feature)) {
        if (SWITCH_FEATURES.has(feature)) {
          control.setAttribute(
            "aria-pressed",
            String(this.getPressedState(feature, state)),
          );
        }
        this.updateFeatureMeta(feature, control, state);
        this.updateControlIcon(feature, control, state);
      }
    }

    const sound = this.controls.get("screenSound");
    sound?.setAttribute("aria-pressed", String(state.readingEnabled));
    if (sound) {
      const soundState = state.readingEnabled ? "开启" : "关闭";
      sound.setAttribute(
        "aria-label",
        `朗读，当前${soundState}`,
      );
      const meta = sound.querySelector<HTMLElement>("[data-control-meta]");
      if (meta) {
        meta.textContent = soundState;
      }
      this.updateControlIcon("screenSound", sound, state);
    }

    this.updateAvailability();

    if (!state.isPinned) {
      this.setCollapsed(false);
    }
  }

  updateVoiceSettings(model: VoiceSettingsModel): void {
    this.voiceSettingsModel = model;
    this.voiceSettings.update(model);
    for (const control of this.findControls("voiceSelection")) {
      this.updateVoiceFeatureMeta(control);
    }
  }

  updateContinuousReadingSettings(
    model: ContinuousReadingSettingsModel,
  ): void {
    this.continuousReadingSettingsModel = model;
    this.continuousReadingSettings.update(model);
  }

  showCaption(model: CaptionOutputModel, resetScroll: boolean): void {
    this.largeCaption.show(model, resetScroll);
  }

  hideCaption(): void {
    this.largeCaption.hide();
  }

  toggleVoiceSettings(): void {
    const control = this.findVisibleControl("voiceSelection");
    if (control) {
      this.continuousReadingSettings.close({ notify: true });
      this.voiceSettings.toggle(control);
    }
  }

  closeVoiceSettings(returnFocus = false): void {
    this.voiceSettings.close({ returnFocus, notify: true });
  }

  toggleContinuousReadingSettings(): void {
    const control = this.findVisibleControl("continuousReading");
    if (control) {
      this.voiceSettings.close({ notify: true });
      this.continuousReadingSettings.toggle(control);
    }
  }

  closeContinuousReadingSettings(returnFocus = false): void {
    this.continuousReadingSettings.close({ returnFocus, notify: true });
  }

  setRegionCounts(counts: Readonly<Record<RegionType, number>>): void {
    this.regionCounts = { ...counts };
    if (this.currentRegion) {
      const count = counts[this.currentRegion.type];
      this.currentRegion =
        count > this.currentRegion.index
          ? { ...this.currentRegion, count }
          : null;
    }
    for (const type of REGION_TYPES) {
      this.updateRegionControl(type);
    }
  }

  setCurrentRegion(event: RegionChangeEvent | null): void {
    this.currentRegion =
      event && event.index >= 0 && event.index < event.count
        ? {
            type: event.type,
            index: event.index,
            count: event.count,
          }
        : null;
    for (const type of REGION_TYPES) {
      this.updateRegionControl(type);
    }
  }

  setFeatureAvailability(feature: FeatureId, available: boolean, reason = ""): void {
    for (const control of this.findControls(feature)) {
      control.setAttribute("aria-disabled", String(!available));
      if (reason) {
        control.dataset.unavailableReason = reason;
      } else {
        delete control.dataset.unavailableReason;
      }
    }
  }

  getUnavailableReason(action: ToolbarAction): string | null {
    const control = this.findVisibleControl(action);
    return control?.getAttribute("aria-disabled") === "true"
      ? control.dataset.unavailableReason || "当前功能不可用"
      : null;
  }

  focusFirst(): void {
    const items = this.getNavigableItems();
    const first = items[0];
    if (first) {
      this.setRovingItem(first);
      first.focus({ preventScroll: true });
      first.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  focusAction(action: ToolbarAction): void {
    const control = this.findVisibleControl(action);
    if (control) {
      this.setRovingItem(control);
      control.focus({ preventScroll: true });
      control.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  getControl(action: ToolbarAction): HTMLElement | null {
    return this.findVisibleControl(action);
  }

  announce(message: string, assertive = false): void {
    this.liveRegion.setAttribute("aria-live", assertive ? "assertive" : "polite");
    this.liveRegion.textContent = "";
    window.setTimeout(() => {
      this.liveRegion.textContent = message;
    }, 20);
  }

  expandAndFocus(): void {
    this.setCollapsed(false);
    this.focusFirst();
  }

  setCollapsed(collapsed: boolean): void {
    if (!this.state?.isPinned) {
      collapsed = false;
    }
    const current = this.host.hasAttribute("data-a11y-tool-collapsed");
    if (current === collapsed) {
      return;
    }
    if (collapsed) {
      this.voiceSettings.close({ notify: true });
      this.continuousReadingSettings.close({ notify: true });
    }
    this.host.toggleAttribute("data-a11y-tool-collapsed", collapsed);
    this.revealButton.tabIndex = collapsed ? 0 : -1;
    this.callbacks.onCollapsedChange(collapsed);
  }

  scheduleCollapse(): void {
    this.cancelCollapse();
    if (
      !this.state?.isPinned ||
      this.root.matches(":hover") ||
      this.root.contains(
        (this.root.getRootNode() as Document | ShadowRoot).activeElement,
      )
    ) {
      return;
    }
    this.collapseTimer = window.setTimeout(() => {
      this.setCollapsed(true);
    }, this.config.toolbar.pinHideDelayMs);
  }

  private collapseFromPointerLeave(): void {
    if (!this.state?.isPinned) {
      return;
    }
    this.cancelCollapse();
    const activeElement = (
      this.root.getRootNode() as Document | ShadowRoot
    ).activeElement;
    const moveFocusToReveal =
      activeElement !== this.revealButton && this.root.contains(activeElement);
    this.setCollapsed(true);
    if (
      moveFocusToReveal &&
      this.host.hasAttribute("data-a11y-tool-collapsed")
    ) {
      this.revealButton.focus({ preventScroll: true });
    }
  }

  cancelCollapse(): void {
    if (this.collapseTimer !== null) {
      window.clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
  }

  positionHighlight(element: HTMLElement): void {
    this.positionElementOverlay(this.highlight, "highlight", element);
  }

  hideHighlight(): void {
    this.highlight.hidden = true;
  }

  positionCrosshair(x: number, y: number): void {
    this.horizontalLine.style.setProperty("--a11y-crosshair-y", `${y}px`);
    this.verticalLine.style.setProperty("--a11y-crosshair-x", `${x}px`);
    this.horizontalLine.hidden = false;
    this.verticalLine.hidden = false;
  }

  hideCrosshair(): void {
    this.horizontalLine.hidden = true;
    this.verticalLine.hidden = true;
  }

  containsEvent(event: Event): boolean {
    const path = event.composedPath();
    return path.includes(this.root) || path.includes(this.host);
  }

  getToolbarHeight(): number {
    const parsed = Number.parseFloat(
      getComputedStyle(this.host).getPropertyValue("--a11y-toolbar-height"),
    );
    return Number.isFinite(parsed) ? parsed : 146;
  }

  private buildBrandRail(): HTMLDivElement {
    const brand = document.createElement("div");
    brand.className = "a11y-toolbar__brand";
    brand.setAttribute("aria-hidden", "true");
    brand.innerHTML = [
      '<span class="a11y-brand__dots">',
      "<i></i><i></i><i></i><i></i><i></i><i></i>",
      "</span>",
      '<span class="a11y-brand__mode" data-brand-mode="main">',
      "<strong>A11Y</strong><small>辅助工具</small>",
      "</span>",
      '<span class="a11y-brand__mode" data-brand-mode="screen">',
      "<small>盲道导航</small>",
      "</span>",
    ].join("");
    return brand;
  }

  private buildMainControls(): void {
    for (const feature of MAIN_FEATURE_ORDER) {
      if (
        !this.config.features[feature] ||
        (feature === "continuousReading" &&
          !this.config.features.reading &&
          !this.config.features.largeCaption)
      ) {
        continue;
      }
      this.mainGroup.append(this.createControl(feature, FEATURE_LABELS[feature]));
    }
  }

  private buildScreenControls(): void {
    for (const type of REGION_TYPES) {
      this.screenGroup.append(
        this.createControl(`region:${type}`, REGION_LABELS[type], type),
      );
    }
    if (this.config.features.reading) {
      this.screenGroup.append(this.createControl("screenSound", "朗读"));
    }
    if (
      (this.config.features.reading || this.config.features.largeCaption) &&
      this.config.features.continuousReading
    ) {
      this.screenGroup.append(
        this.createControl("continuousReading", "连续朗读"),
      );
    }
    if (this.config.features.largeCaption) {
      this.screenGroup.append(this.createControl("largeCaption", "大字幕"));
    }
    if (this.config.features.help) {
      this.screenGroup.append(this.createControl("help", "帮助"));
    }
    if (this.config.features.readScreen) {
      this.screenGroup.append(this.createControl("readScreen", "读屏专用"));
    }
    if (this.config.features.exit) {
      this.screenGroup.append(this.createControl("exit", "退出"));
    }
  }

  private createControl(
    action: ToolbarAction,
    label: string,
    icon: string = action,
  ): HTMLElement {
    const isHelp = action === "help";
    const control = isHelp
      ? document.createElement("a")
      : document.createElement("button");
    if (control instanceof HTMLButtonElement) {
      control.type = "button";
    } else {
      control.target = "_blank";
      control.rel = "noopener";
    }
    control.className = "a11y-control";
    control.tabIndex = -1;
    control.dataset.toolbarItem = "";
    control.dataset.action = action;
    control.setAttribute("aria-label", label);
    const regionType = action.startsWith("region:")
      ? (action.slice("region:".length) as RegionType)
      : null;
    if (regionType) {
      control.dataset.regionControl = regionType;
    }
    if (SWITCH_FEATURES.has(action as FeatureId) || action === "screenSound") {
      control.setAttribute("aria-pressed", "false");
    }
    if (action === "voiceSelection") {
      control.setAttribute("aria-haspopup", "dialog");
      control.setAttribute("aria-expanded", "false");
      control.setAttribute(
        "aria-controls",
        `${this.host.id}-voice-settings`,
      );
    }
    if (action === "continuousReading") {
      control.setAttribute("aria-haspopup", "dialog");
      control.setAttribute("aria-expanded", "false");
      control.setAttribute(
        "aria-controls",
        `${this.host.id}-continuous-reading-settings`,
      );
    }
    const labelMarkup = regionType
      ? [
          '<span class="a11y-control__label">',
          `<span>${label}</span>`,
          '<span class="a11y-control__count" data-region-count>0</span>',
          "</span>",
        ].join("")
      : `<span class="a11y-control__label">${label}</span>`;
    const regionShortcut = regionType
      ? `ALT + ${REGION_TYPES.indexOf(regionType) + 1}`
      : "";
    control.innerHTML = [
      `<span class="a11y-control__icon">${ICONS[icon] ?? ICONS.help}</span>`,
      labelMarkup,
      `<span class="a11y-control__meta" data-control-meta>${regionShortcut}</span>`,
    ].join("");
    this.controls.set(action, control);
    return control;
  }

  private bindEvents(): void {
    this.toolbar.addEventListener("click", (event) => {
      const control = (event.target as Element).closest<HTMLElement>(
        "[data-toolbar-item]",
      );
      if (!control || !this.toolbar.contains(control)) {
        return;
      }
      const action = control.dataset.action as ToolbarAction;
      this.callbacks.onAction(action, control);
    });

    this.toolbar.addEventListener("keydown", (event) => {
      this.handleToolbarKeydown(event);
    });

    this.revealButton.addEventListener("click", () => this.expandAndFocus());
    this.root.addEventListener("pointerenter", () => {
      this.cancelCollapse();
      this.setCollapsed(false);
    });
    this.root.addEventListener("pointerleave", () =>
      this.collapseFromPointerLeave(),
    );
    this.root.addEventListener("focusin", (event) => {
      this.callbacks.onFocusInside?.();
      this.cancelCollapse();
      if (
        event.target === this.revealButton &&
        this.host.hasAttribute("data-a11y-tool-collapsed")
      ) {
        return;
      }
      this.setCollapsed(false);
    });
    this.root.addEventListener("focusout", () => {
      window.setTimeout(() => this.scheduleCollapse(), 0);
    });
  }

  private handleToolbarKeydown(event: KeyboardEvent): void {
    const control = (event.target as Element).closest<HTMLElement>(
      "[data-toolbar-item]",
    );
    if (!control) {
      return;
    }
    const items = this.getNavigableItems();
    const index = items.indexOf(control);
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (index + 1) % items.length;
        break;
      case "ArrowLeft":
        nextIndex = (index - 1 + items.length) % items.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        control.click();
        return;
      default:
        return;
    }
    if (items.length === 0) {
      return;
    }
    event.preventDefault();
    const next = items[nextIndex];
    if (next) {
      this.setRovingItem(next);
      next.focus();
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  private getNavigableItems(): HTMLElement[] {
    const group = this.state?.isReadScreen ? this.screenGroup : this.mainGroup;
    return Array.from(
      group.querySelectorAll<HTMLElement>(
        "[data-toolbar-item]:not([data-skip-toolbar-nav])",
      ),
    );
  }

  private setRovingItem(active: HTMLElement): void {
    for (const item of this.getNavigableItems()) {
      item.tabIndex = item === active ? 0 : -1;
    }
  }

  private updateAvailability(): void {
    const zoom = this.state?.zoom ?? 1;
    const zoomIn = this.controls.get("zoomIn");
    const zoomOut = this.controls.get("zoomOut");
    if (zoomIn) {
      const unavailable = zoom >= this.config.zoom.max;
      zoomIn.setAttribute("aria-disabled", String(unavailable));
      zoomIn.dataset.unavailableReason = `已达到最大缩放 ${Math.round(this.config.zoom.max * 100)}%`;
    }
    if (zoomOut) {
      const unavailable = zoom <= this.config.zoom.min;
      zoomOut.setAttribute("aria-disabled", String(unavailable));
      zoomOut.dataset.unavailableReason = `已达到最小缩放 ${Math.round(this.config.zoom.min * 100)}%`;
    }
  }

  private updateRegionControl(type: RegionType): void {
    const control = this.controls.get(`region:${type}`);
    if (!control) {
      return;
    }
    const count = this.regionCounts[type];
    const current =
      this.currentRegion?.type === type ? this.currentRegion : null;
    const countLabel = control.querySelector<HTMLElement>(
      "[data-region-count]",
    );
    if (countLabel) {
      countLabel.textContent = current
        ? `${current.index + 1}/${current.count}`
        : String(count);
    }
    control.setAttribute("aria-label", `${REGION_LABELS[type]}，共 ${count} 个`);
    control.setAttribute("aria-disabled", String(count === 0));
    control.toggleAttribute("data-skip-toolbar-nav", count === 0);
    control.toggleAttribute("data-region-current", Boolean(current));
    if (current) {
      control.setAttribute("aria-current", "location");
    } else {
      control.removeAttribute("aria-current");
    }
  }

  private getPressedState(
    feature: FeatureId,
    state: AccessibilityToolState,
  ): boolean {
    switch (feature) {
      case "reading":
        return state.readingEnabled;
      case "largeCursor":
        return state.largeCursor;
      case "crosshair":
        return state.crosshair;
      case "fullscreen":
        return state.isFullscreen;
      case "largeCaption":
        return state.captionEnabled;
      case "pin":
        return state.isPinned;
      case "readScreen":
        return state.isReadScreen;
      default:
        return false;
    }
  }

  private updateFeatureMeta(
    feature: FeatureId,
    control: HTMLElement,
    state: AccessibilityToolState,
  ): void {
    const meta = control.querySelector<HTMLElement>("[data-control-meta]");
    if (!meta) {
      return;
    }
    switch (feature) {
      case "reading": {
        const readingState = state.readingEnabled ? "开启" : "关闭";
        meta.textContent = readingState;
        control.setAttribute("aria-label", `朗读，当前${readingState}`);
        break;
      }
      case "continuousReading": {
        const labels = {
          idle: "未开始",
          playing: "朗读中",
          paused: "已暂停",
        } as const;
        const current = labels[state.continuousReadingState];
        meta.textContent = current;
        control.setAttribute(
          "aria-label",
          `连续朗读，当前${current}，打开连续朗读控制`,
        );
        break;
      }
      case "speechRate":
        meta.textContent = `${formatRate(state.speechRate)}×`;
        control.setAttribute("aria-label", `语速，当前 ${formatRate(state.speechRate)} 倍`);
        break;
      case "voiceSelection":
        this.updateVoiceFeatureMeta(control);
        break;
      case "colorScheme":
        meta.textContent = COLOR_SCHEME_LABELS[state.colorScheme].replace("配色", "");
        control.setAttribute(
          "aria-label",
          `配色，当前${COLOR_SCHEME_LABELS[state.colorScheme]}`,
        );
        break;
      case "zoomIn":
      case "zoomOut":
        meta.textContent = `${Math.round(state.zoom * 100)}%`;
        control.setAttribute(
          "aria-label",
          `${FEATURE_LABELS[feature]}，当前 ${Math.round(state.zoom * 100)}%`,
        );
        break;
      case "largeCursor": {
        const cursorState = state.largeCursor ? "开启" : "关闭";
        meta.textContent = cursorState;
        control.setAttribute("aria-label", `大鼠标，当前${cursorState}`);
        break;
      }
      case "crosshair": {
        const crosshairState = state.crosshair ? "开启" : "关闭";
        meta.textContent = crosshairState;
        control.setAttribute("aria-label", `十字线，当前${crosshairState}`);
        break;
      }
      case "fullscreen":
        meta.textContent = state.isFullscreen ? "全屏" : "标准";
        control.setAttribute(
          "aria-label",
          `大界面，当前${state.isFullscreen ? "全屏" : "标准"}`,
        );
        break;
      case "largeCaption": {
        const captionState = state.captionEnabled ? "开启" : "关闭";
        meta.textContent = captionState;
        control.setAttribute("aria-label", `大字幕，当前${captionState}`);
        break;
      }
      case "pin":
        meta.textContent = state.isPinned ? "已开启" : "自动收起";
        control.setAttribute(
          "aria-label",
          `固定，当前${state.isPinned ? "已固定" : "未固定"}`,
        );
        break;
      case "reset":
        meta.textContent = "恢复默认";
        break;
      case "help":
        meta.textContent = "操作说明";
        break;
      case "readScreen":
        meta.textContent = state.isReadScreen ? "当前模式" : "标准模式";
        control.setAttribute(
          "aria-label",
          state.isReadScreen ? "读屏专用，当前模式" : "读屏专用，标准模式",
        );
        break;
      case "exit":
        meta.textContent = "关闭工具";
        break;
      default:
        meta.textContent = "";
    }
  }

  private updateControlIcon(
    action: ToolbarAction,
    control: HTMLElement,
    state: AccessibilityToolState,
    force = false,
  ): void {
    const icon = control.querySelector<HTMLElement>(".a11y-control__icon");
    if (!icon) {
      return;
    }
    const presentation = getIconPresentation(action, state);
    if (force || control.dataset.iconState !== presentation.state) {
      icon.innerHTML = presentation.markup;
    }
    control.dataset.iconState = presentation.state;
    icon.dataset.iconState = presentation.state;
  }

  private updateHelpLinks(): void {
    for (const control of [this.mainGroup, this.screenGroup]) {
      const link = control.querySelector<HTMLAnchorElement>(
        '[data-action="help"]',
      );
      if (link) {
        link.href = this.config.toolbar.helpUrl;
      }
    }
  }

  private updateVoiceFeatureMeta(control: HTMLElement): void {
    const summary = this.voiceSettingsModel?.summary ?? "自动选择";
    const meta = control.querySelector<HTMLElement>("[data-control-meta]");
    if (meta) {
      meta.textContent = summary;
    }
    control.setAttribute("aria-label", `音色，当前${summary}，打开语音设置`);
  }

  private createOverlay(className: string): HTMLDivElement {
    const element = document.createElement("div");
    element.className = className;
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  private positionElementOverlay(
    overlay: HTMLDivElement,
    variableName: "highlight",
    element: HTMLElement,
  ): void {
    const rect = getGlobalRect(element);
    const hasNoArea = rect && rect.width <= 0 && rect.height <= 0;
    if (!rect || hasNoArea) {
      overlay.hidden = true;
      return;
    }
    overlay.style.setProperty(`--a11y-${variableName}-x`, `${rect.left}px`);
    overlay.style.setProperty(`--a11y-${variableName}-y`, `${rect.top}px`);
    overlay.style.setProperty(
      `--a11y-${variableName}-width`,
      `${rect.width}px`,
    );
    overlay.style.setProperty(
      `--a11y-${variableName}-height`,
      `${rect.height}px`,
    );
    overlay.hidden = false;
  }

  private findControls(action: ToolbarAction): HTMLElement[] {
    return Array.from(
      this.root.querySelectorAll<HTMLElement>(
        `[data-toolbar-item][data-action="${action}"]`,
      ),
    );
  }

  private findVisibleControl(action: ToolbarAction): HTMLElement | null {
    return (
      this.findControls(action).find(
        (control) => !control.closest<HTMLElement>("[hidden]"),
      ) ?? null
    );
  }
}

interface IconPresentation {
  markup: string;
  state: string;
}

function getIconPresentation(
  action: ToolbarAction,
  state: AccessibilityToolState,
): IconPresentation {
  switch (action) {
    case "reading":
    case "screenSound":
      return {
        markup: state.readingEnabled
          ? TOGGLE_ICONS.sound.on
          : TOGGLE_ICONS.sound.off,
        state: `sound-${state.readingEnabled ? "on" : "off"}`,
      };
    case "continuousReading":
      return {
        markup: renderContinuousReadingIcon(state.continuousReadingState),
        state: `continuous-${state.continuousReadingState}`,
      };
    case "largeCursor":
      return {
        markup: state.largeCursor
          ? TOGGLE_ICONS.cursor.on
          : TOGGLE_ICONS.cursor.off,
        state: `cursor-${state.largeCursor ? "on" : "off"}`,
      };
    case "crosshair":
      return {
        markup: state.crosshair
          ? TOGGLE_ICONS.crosshair.on
          : TOGGLE_ICONS.crosshair.off,
        state: `crosshair-${state.crosshair ? "on" : "off"}`,
      };
    case "fullscreen":
      return {
        markup: state.isFullscreen
          ? TOGGLE_ICONS.fullscreen.on
          : TOGGLE_ICONS.fullscreen.off,
        state: state.isFullscreen ? "fullscreen-exit" : "fullscreen-enter",
      };
    case "largeCaption":
      return {
        markup: ICONS.largeCaption ?? "",
        state: `large-caption-${state.captionEnabled ? "on" : "off"}`,
      };
    case "pin":
      return {
        markup: state.isPinned ? TOGGLE_ICONS.pin.on : TOGGLE_ICONS.pin.off,
        state: `pin-${state.isPinned ? "on" : "off"}`,
      };
    case "readScreen":
      return {
        markup: state.isReadScreen
          ? TOGGLE_ICONS.readScreen.on
          : TOGGLE_ICONS.readScreen.off,
        state: `read-screen-${state.isReadScreen ? "on" : "off"}`,
      };
    case "speechRate":
      return {
        markup: renderSpeechRateIcon(state.speechRate),
        state: `rate-${formatRate(state.speechRate)}`,
      };
    case "colorScheme":
      return {
        markup: renderColorSchemeIcon(state.colorScheme),
        state: `scheme-${state.colorScheme}`,
      };
    default: {
      const iconKey = action.startsWith("region:")
        ? action.slice("region:".length)
        : action;
      return {
        markup: ICONS[iconKey] ?? ICONS.help ?? "",
        state: `static-${iconKey}`,
      };
    }
  }
}

function createSvgIcon(content: string, attributes = ""): string {
  const suffix = attributes ? ` ${attributes}` : "";
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"${suffix}>${content}</svg>`;
}

function renderContinuousReadingIcon(
  state: AccessibilityToolState["continuousReadingState"],
): string {
  if (state === "playing") {
    return createSvgIcon(
      '<path d="M7 5h4v14H7zM14 5h4v14h-4z"/><path class="a11y-icon__muted" d="M4 3h16v18H4z"/>',
    );
  }
  if (state === "paused") {
    return createSvgIcon(
      '<path d="M6 4v16l13-8L6 4Z"/><circle class="a11y-icon__muted" cx="19" cy="5" r="2"/>',
    );
  }
  return createSvgIcon(
    '<path d="M6 4v16l13-8L6 4Z"/><path class="a11y-icon__muted" d="M19 5v14"/>',
  );
}

function renderSpeechRateIcon(rate: number): string {
  const progress = normalizeRange(rate, 0.5, 2);
  const angle = ((200 + progress * 140) * Math.PI) / 180;
  const pointerX = formatIconNumber(12 + Math.cos(angle) * 5.5);
  const pointerY = formatIconNumber(17 + Math.sin(angle) * 5.5);
  return createSvgIcon(
    '<path d="M4 17a8 8 0 0 1 16 0M7 17h10"/>' +
      '<path class="a11y-icon__muted" d="m6 13-1.5-1.2M12 9V7M18 13l1.5-1.2"/>' +
      `<path data-icon-indicator="rate" d="M12 17L${pointerX} ${pointerY}"/><circle cx="12" cy="17" r="1"/>`,
  );
}

function renderColorSchemeIcon(scheme: ColorScheme): string {
  if (scheme === "original") {
    return createSvgIcon(
      '<rect x="3" y="5" width="18" height="14" rx="2.5"/>' +
        '<path d="M12 5v14M3 12h18"/>' +
        '<circle cx="7.5" cy="8.5" r="1"/><circle cx="16.5" cy="8.5" r="1"/>' +
        '<circle cx="7.5" cy="15.5" r="1"/><circle cx="16.5" cy="15.5" r="1"/>',
      'data-color-scheme="original"',
    );
  }
  return createSvgIcon(
    '<rect x="3" y="5" width="18" height="14" rx="2.5"/>' +
      '<path d="M12 5v14"/>' +
      '<path class="a11y-icon__palette-background" d="M5 7h6v10H5z"/>' +
      '<path class="a11y-icon__palette-foreground" d="M13 7h6v10h-6z"/>',
    `data-color-scheme="${scheme}"`,
  );
}

function normalizeRange(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || maximum <= minimum) {
    return 0;
  }
  return Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)));
}

function formatIconNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatRate(rate: number): string {
  return Number(rate.toFixed(2)).toString();
}

function getGlobalRect(element: HTMLElement): DOMRect | null {
  let rect: DOMRect | null = element.getBoundingClientRect();
  let view = element.ownerDocument.defaultView;
  try {
    while (isHTMLElement(view?.frameElement)) {
      const frame = view.frameElement;
      const frameRect = frame.getBoundingClientRect();
      const scaleX = frame.offsetWidth > 0
        ? frameRect.width / frame.offsetWidth
        : 1;
      const scaleY = frame.offsetHeight > 0
        ? frameRect.height / frame.offsetHeight
        : 1;
      const contentLeft = frameRect.left + frame.clientLeft * scaleX;
      const contentTop = frameRect.top + frame.clientTop * scaleY;
      rect = intersectRects(
        new DOMRect(
          contentLeft + rect.left * scaleX,
          contentTop + rect.top * scaleY,
          rect.width * scaleX,
          rect.height * scaleY,
        ),
        new DOMRect(
          contentLeft,
          contentTop,
          frame.clientWidth * scaleX,
          frame.clientHeight * scaleY,
        ),
      );
      if (!rect) {
        return null;
      }
      view = frame.ownerDocument.defaultView;
    }
  } catch {
    // The element remains highlightable inside the last same-origin boundary.
  }
  return rect;
}

function intersectRects(first: DOMRect, second: DOMRect): DOMRect | null {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.right, second.right);
  const bottom = Math.min(first.bottom, second.bottom);
  if (right <= left || bottom <= top) {
    return null;
  }
  return new DOMRect(left, top, right - left, bottom - top);
}
