import {
  COLOR_SCHEMES,
  OPEN_STATE_STORAGE_VERSION,
  REGION_TYPES,
  STORAGE_VERSION,
} from "./core/constants";
import {
  DEFAULT_CONFIG,
  mergeConfig,
  type ResolvedAccessibilityToolConfig,
} from "./core/config";
import { DomLedger } from "./core/dom-ledger";
import { isEditableTarget, isHTMLElement } from "./core/dom";
import { TypedEmitter } from "./core/emitter";
import {
  deriveOpenStateStorageKey,
  OpenStateStore,
  PreferenceStore,
} from "./core/storage";
import { PageEffectsController } from "./features/page-effects";
import { ReadingController } from "./features/reading";
import { RegionNavigationController } from "./features/region-navigation";
import { RegionScanner } from "./features/regions";
import { SpeechController } from "./features/speech";
import { TabsController } from "./features/tabs";
import { StyleManager } from "./ui/style-manager";
import { ToolbarUI, type ToolbarAction } from "./ui/toolbar";
import type {
  AccessibilityToolApi,
  AccessibilityToolConfig,
  AccessibilityToolEventMap,
  AccessibilityToolOpenOptions,
  AccessibilityToolState,
  PersistedPreferences,
  RegionType,
} from "./types";

type OpenMode = "explicit" | "restore";

interface OpenBehavior {
  silent: boolean;
  announceIfAlreadyOpen: boolean;
}

export class AccessibilityToolRuntime implements AccessibilityToolApi {
  private baseConfig = mergeConfig(DEFAULT_CONFIG);
  private activeConfig = this.baseConfig;
  private sessionConfig: AccessibilityToolConfig | undefined;
  private state: AccessibilityToolState = createDefaultState(this.baseConfig);
  private readonly emitter = new TypedEmitter<AccessibilityToolEventMap>();
  private readonly triggerLedger = new DomLedger();
  private readonly triggers = new Set<HTMLElement>();
  private readonly stores = new Map<string, PreferenceStore>();
  private readonly openStateStores = new Map<string, OpenStateStore>();
  private readonly shortcutDocuments = new Set<Document>();

  private lastTrigger: HTMLElement | null = null;
  private host: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private styles: StyleManager | null = null;
  private ui: ToolbarUI | null = null;
  private speech: SpeechController | null = null;
  private effects: PageEffectsController | null = null;
  private reading: ReadingController | null = null;
  private scanner: RegionScanner | null = null;
  private regionNavigation: RegionNavigationController | null = null;
  private tabs: TabsController | null = null;
  private tabsStarted = false;
  private suppressFullscreenAnnouncement = false;
  private openOperation: Promise<AccessibilityToolApi> | null = null;
  private openOperationMode: OpenMode | null = null;
  private autoRestoreSettled = false;
  private silentlyRestored = false;

  constructor() {
    if (typeof document !== "undefined") {
      void this.restoreOpenStateWhenReady();
    }
  }

  configure(config: AccessibilityToolConfig): AccessibilityToolApi {
    const previousStorageKey = this.state.isOpen
      ? this.activeConfig.storageKey
      : this.baseConfig.storageKey;
    this.baseConfig = mergeConfig(this.baseConfig, config);
    if (this.state.isOpen) {
      this.activeConfig = mergeConfig(this.baseConfig, this.sessionConfig);
    }
    const nextConfig = this.state.isOpen ? this.activeConfig : this.baseConfig;
    this.reconcileOpenIntentAfterConfig(previousStorageKey, nextConfig);
    if (this.state.isOpen) {
      this.propagateConfig();
      this.applyState(false);
    }
    return this;
  }

  async open(
    options: AccessibilityToolOpenOptions = {},
  ): Promise<AccessibilityToolApi> {
    return this.openExplicitly(options, false);
  }

  private async openExplicitly(
    options: AccessibilityToolOpenOptions,
    announceAfterRestore: boolean,
  ): Promise<AccessibilityToolApi> {
    const pending = this.openOperation;
    const pendingWasRestore = this.openOperationMode === "restore";
    if (pending) {
      try {
        await pending;
      } catch {
        // An explicit request retries after a failed pending restoration/open.
      }
      return this.openExplicitly(
        options,
        announceAfterRestore || pendingWasRestore,
      );
    }
    return this.beginOpen(
      options,
      "explicit",
      announceAfterRestore || this.silentlyRestored,
    );
  }

  private beginOpen(
    options: AccessibilityToolOpenOptions,
    mode: OpenMode,
    announceIfAlreadyOpen: boolean,
  ): Promise<AccessibilityToolApi> {
    const operation = this.performTrackedOpen(options, {
      silent: mode === "restore",
      announceIfAlreadyOpen,
    });
    this.openOperation = operation;
    this.openOperationMode = mode;
    const clearOperation = (): void => {
      if (this.openOperation === operation) {
        this.openOperation = null;
        this.openOperationMode = null;
      }
    };
    operation.then(clearOperation, clearOperation);
    return operation;
  }

  private async performTrackedOpen(
    options: AccessibilityToolOpenOptions,
    behavior: OpenBehavior,
  ): Promise<AccessibilityToolApi> {
    const previousStorageKey = this.state.isOpen
      ? this.activeConfig.storageKey
      : this.baseConfig.storageKey;
    const attemptedStorageKey = mergeConfig(
      this.baseConfig,
      options.config,
    ).storageKey;
    try {
      const result = await this.openInternal(options, behavior);
      this.syncOpenIntentAfterSuccessfulOpen(previousStorageKey);
      this.silentlyRestored = behavior.silent;
      return result;
    } catch (error) {
      this.clearOpenIntent(previousStorageKey);
      this.clearOpenIntent(attemptedStorageKey);
      this.clearOpenIntent(this.activeConfig.storageKey);
      if (!this.state.isOpen) {
        this.teardownRuntimeNodes();
      }
      throw error;
    }
  }

  private async openInternal(
    options: AccessibilityToolOpenOptions,
    behavior: OpenBehavior,
  ): Promise<AccessibilityToolApi> {
    await ensureDocumentReady();
    const trigger = behavior.silent
      ? null
      : this.resolveTrigger(options.trigger);

    if (this.state.isOpen) {
      if (options.config) {
        this.sessionConfig = mergeUserConfig(this.sessionConfig, options.config);
        this.activeConfig = mergeConfig(this.baseConfig, this.sessionConfig);
        this.propagateConfig();
        this.applyState(false);
      }
      if (trigger) {
        this.registerTrigger(trigger);
      }
      this.setTriggerExpanded(true);
      this.ui?.expandAndFocus();
      if (behavior.announceIfAlreadyOpen) {
        this.announce(
          "无障碍工具栏已打开，使用左右方向键选择功能",
          false,
        );
      }
      return this;
    }

    this.sessionConfig = options.config;
    this.activeConfig = mergeConfig(this.baseConfig, this.sessionConfig);
    this.teardownRuntimeNodes();
    this.createRuntimeNodes();
    await this.styles?.whenReady();

    if (trigger) {
      this.registerTrigger(trigger);
    }

    const stored = this.getStore().load();
    this.state = constrainStateToFeatures(
      this.activeConfig,
      hydrateState(this.activeConfig, stored),
    );
    if (!this.speech?.isSupported()) {
      this.state = { ...this.state, readingEnabled: false };
    }
    this.state = { ...this.state, isOpen: true, isCollapsed: false };

    this.ui?.show();
    this.ui?.updateState(this.state);
    this.updateAvailability();
    this.effects?.start();
    this.effects?.apply(this.state);
    this.regionNavigation?.start();
    this.bindShortcutDocuments([document]);

    try {
      this.scanner?.start();
    } catch (error) {
      await this.closeInternal(false);
      throw error;
    }

    if (this.state.readingEnabled) {
      this.reading?.start();
    }

    this.setTriggerExpanded(true);
    this.emitState("open");
    await nextFrame();
    if (!behavior.silent) {
      this.ui?.focusFirst();
      this.announce(
        "无障碍工具栏已打开，使用左右方向键选择功能",
        false,
      );
    }
    if (this.state.isPinned && !this.state.isReadScreen) {
      this.ui?.scheduleCollapse();
    }
    return this;
  }

  async close(): Promise<AccessibilityToolApi> {
    await this.settlePendingOpen();
    this.clearKnownOpenIntents();
    await this.closeInternal(true);
    return this;
  }

  async toggle(
    options: AccessibilityToolOpenOptions = {},
  ): Promise<AccessibilityToolApi> {
    return this.state.isOpen ? this.close() : this.open(options);
  }

  async reset(): Promise<AccessibilityToolApi> {
    this.getStore().clear();
    if (!this.state.isOpen) {
      this.state = createDefaultState(this.activeConfig);
      return this;
    }

    this.speech?.cancel();
    this.reading?.stop();
    this.suppressFullscreenAnnouncement = true;
    await this.effects?.exitFullscreen();
    this.suppressFullscreenAnnouncement = false;

    this.state = {
      ...createDefaultState(this.activeConfig),
      isOpen: true,
      isCollapsed: false,
    };
    this.regionNavigation?.resetPositions();
    this.applyState(false);
    this.emitState();
    this.announce("已恢复默认设置", false);
    await nextFrame();
    this.ui?.focusAction("reset");
    return this;
  }

  refresh(): AccessibilityToolApi {
    if (this.state.isOpen) {
      this.scanner?.refresh();
      this.tabs?.refresh();
    }
    return this;
  }

  async destroy(): Promise<void> {
    await this.settlePendingOpen();
    this.clearKnownOpenIntents();
    if (this.state.isOpen) {
      await this.closeInternal(false);
    }
    this.teardownRuntimeNodes();
    this.triggerLedger.restore();
    this.triggers.clear();
    this.lastTrigger = null;
    this.unbindShortcutDocuments();
    this.emitter.clear();
    this.sessionConfig = undefined;
    this.activeConfig = this.baseConfig;
    this.state = createDefaultState(this.activeConfig);
    this.silentlyRestored = false;
  }

  getState(): Readonly<AccessibilityToolState> {
    return Object.freeze({ ...this.state });
  }

  on<K extends keyof AccessibilityToolEventMap>(
    eventName: K,
    listener: (payload: AccessibilityToolEventMap[K]) => void,
  ): AccessibilityToolApi {
    this.emitter.on(eventName, listener);
    return this;
  }

  off<K extends keyof AccessibilityToolEventMap>(
    eventName: K,
    listener: (payload: AccessibilityToolEventMap[K]) => void,
  ): AccessibilityToolApi {
    this.emitter.off(eventName, listener);
    return this;
  }

  private async restoreOpenStateWhenReady(): Promise<void> {
    try {
      await ensureDomContentLoaded();
      const config = this.baseConfig;
      if (!config.persistOpenState) {
        this.clearOpenIntent(config.storageKey);
        return;
      }
      if (
        this.state.isOpen ||
        (this.openOperation && this.openOperationMode === "explicit")
      ) {
        return;
      }
      if (!this.getOpenStateStore(config.storageKey).load()) {
        return;
      }
      try {
        await this.beginOpen({}, "restore", false);
      } catch (error) {
        this.clearOpenIntent(config.storageKey);
        this.clearOpenIntent(this.activeConfig.storageKey);
        this.reportError(error, "自动恢复无障碍工具栏失败，已清除打开状态。");
      }
    } finally {
      this.autoRestoreSettled = true;
    }
  }

  private async settlePendingOpen(): Promise<void> {
    while (this.openOperation) {
      const pending = this.openOperation;
      try {
        await pending;
      } catch {
        // The initiating open call owns its error; lifecycle cleanup continues.
      }
      if (this.openOperation === pending) {
        this.openOperation = null;
        this.openOperationMode = null;
      }
    }
  }

  private reconcileOpenIntentAfterConfig(
    previousStorageKey: string,
    nextConfig: ResolvedAccessibilityToolConfig,
  ): void {
    if (previousStorageKey !== nextConfig.storageKey) {
      this.clearOpenIntent(previousStorageKey);
    }
    if (!nextConfig.persistOpenState) {
      this.clearOpenIntent(nextConfig.storageKey);
      return;
    }
    if (this.state.isOpen) {
      this.getOpenStateStore(nextConfig.storageKey).markOpen();
      return;
    }
    if (this.autoRestoreSettled) {
      this.clearOpenIntent(nextConfig.storageKey);
    }
  }

  private syncOpenIntentAfterSuccessfulOpen(
    previousStorageKey: string,
  ): void {
    const currentStorageKey = this.activeConfig.storageKey;
    if (previousStorageKey !== currentStorageKey) {
      this.clearOpenIntent(previousStorageKey);
    }
    if (this.activeConfig.persistOpenState) {
      this.getOpenStateStore(currentStorageKey).markOpen();
    } else {
      this.clearOpenIntent(currentStorageKey);
    }
  }

  private clearKnownOpenIntents(): void {
    for (const storageKey of new Set([
      this.baseConfig.storageKey,
      this.activeConfig.storageKey,
    ])) {
      this.clearOpenIntent(storageKey);
    }
  }

  private clearOpenIntent(storageKey: string): void {
    this.getOpenStateStore(storageKey).clear();
  }

  private createRuntimeNodes(): void {
    const host = document.createElement("div");
    host.id = createHostId();
    host.setAttribute("data-a11y-tool-host", "");
    host.hidden = true;
    document.body.append(host);
    const shadowRoot = host.attachShadow({
      mode: this.activeConfig.debug ? "open" : "closed",
    });

    this.host = host;
    this.shadowRoot = shadowRoot;
    this.styles = new StyleManager(host, shadowRoot);
    this.styles.mount(this.activeConfig);
    this.ui = new ToolbarUI(host, shadowRoot, this.activeConfig, {
      onAction: (action, control) => {
        void this.handleAction(action, control);
      },
      onRateChange: (rate) => this.setSpeechRate(rate),
      onCollapsedChange: (collapsed) => this.handleCollapsedChange(collapsed),
      onFocusInside: () => {
        this.effects?.clearFocusHighlight();
        this.regionNavigation?.clearActiveRegion();
      },
    });
    this.speech = new SpeechController(
      this.activeConfig.speech.adapter,
      this.emitter,
    );
    this.effects = new PageEffectsController(this.activeConfig, this.ui, {
      onFullscreenChange: (fullscreen) => this.handleFullscreenChange(fullscreen),
      onError: (error, message) => this.reportError(error, message),
    });
    this.reading = new ReadingController(
      this.activeConfig,
      this.speech,
      this.effects,
      {
        isEnabled: () => this.state.isOpen && this.state.readingEnabled,
        getRate: () => this.state.speechRate,
      },
      {
        isRegionContainer: (element) =>
          this.regionNavigation?.isRegionContainer(element) ?? false,
      },
    );
    this.regionNavigation = new RegionNavigationController(this.effects, {
      getToolbarOffset: () =>
        this.state.isPinned && this.state.isCollapsed
          ? 12
          : this.ui?.getToolbarHeight() ?? 102,
      onCountsChange: (counts) => this.ui?.setRegionCounts(counts),
      onAnnounce: (message) => {
        this.reading?.cancel();
        this.announce(message);
      },
      onRegionChange: (event) => this.emitter.emit("regionchange", event),
      onReturnToCategory: (type) => this.ui?.focusAction(`region:${type}`),
      onDynamicUpdate: () => {
        if (this.state.isReadScreen) {
          this.announce("页面区域已更新");
        }
      },
    });
    this.tabs = new TabsController(this.activeConfig, {
      onAnnounce: (message) => this.announce(message),
      onError: (error, message) => this.reportError(error, message),
    });
    this.scanner = new RegionScanner(this.activeConfig, {
      onUpdate: (regions, roots, reason) => {
        this.effects?.setRoots(roots);
        this.reading?.setRoots(roots);
        this.regionNavigation?.update(regions, roots, reason);
        this.bindShortcutDocuments(
          roots
            .map((root) =>
              root.nodeType === 9 ? (root as Document) : root.ownerDocument,
            )
            .filter((documentRef): documentRef is Document => Boolean(documentRef)),
        );
        if (!this.tabsStarted) {
          this.tabs?.start(roots);
          this.tabsStarted = true;
        } else {
          this.tabs?.setRoots(roots);
          this.tabs?.refresh();
        }
      },
      onRouteChange: () => {
        this.speech?.cancel();
        this.reading?.cancel();
        this.regionNavigation?.resetPositions();
      },
      onError: (error, message) => this.reportError(error, message),
    });
  }

  private teardownRuntimeNodes(): void {
    this.scanner?.stop();
    this.tabs?.stop();
    this.regionNavigation?.stop();
    this.reading?.stop();
    this.effects?.destroy();
    this.ui?.destroy();
    this.styles?.destroy();
    this.host?.remove();
    this.unbindShortcutDocuments();

    this.host = null;
    this.shadowRoot = null;
    this.styles = null;
    this.ui = null;
    this.speech = null;
    this.effects = null;
    this.reading = null;
    this.scanner = null;
    this.regionNavigation = null;
    this.tabs = null;
    this.tabsStarted = false;
  }

  private propagateConfig(): void {
    this.styles?.mount(this.activeConfig);
    this.ui?.updateConfig(this.activeConfig);
    this.effects?.updateConfig(this.activeConfig);
    this.reading?.updateConfig(this.activeConfig);
    this.scanner?.updateConfig(this.activeConfig);
    this.tabs?.updateConfig(this.activeConfig);
    this.updateAvailability();
  }

  private async closeInternal(returnFocus: boolean): Promise<void> {
    if (!this.state.isOpen) {
      return;
    }
    this.savePreferences();
    this.reading?.stop();
    this.speech?.cancel();
    this.scanner?.stop();
    this.tabs?.stop();
    this.tabsStarted = false;
    this.regionNavigation?.stop();
    this.suppressFullscreenAnnouncement = true;
    await this.effects?.exitFullscreen();
    this.suppressFullscreenAnnouncement = false;
    this.effects?.deactivate();
    this.ui?.hide();
    this.unbindShortcutDocuments();
    this.state = {
      ...this.state,
      isOpen: false,
      isCollapsed: false,
      isFullscreen: false,
    };
    this.setTriggerExpanded(false);
    this.emitState("close");
    this.sessionConfig = undefined;
    this.activeConfig = this.baseConfig;
    this.silentlyRestored = false;
    if (returnFocus) {
      this.restoreTriggerFocus();
    }
  }

  private async handleAction(
    action: ToolbarAction,
    control: HTMLElement,
  ): Promise<void> {
    if (action.startsWith("region:")) {
      const type = action.slice("region:".length) as RegionType;
      this.regionNavigation?.navigate(type);
      return;
    }

    if (control.getAttribute("aria-disabled") === "true") {
      this.announce(control.dataset.unavailableReason || "当前功能不可用");
      return;
    }

    switch (action) {
      case "reading":
      case "screenSound":
        this.setReadingEnabled(!this.state.readingEnabled);
        break;
      case "speechRate":
        this.ui?.toggleRatePanel();
        break;
      case "colorScheme":
        this.cycleColorScheme();
        break;
      case "zoomIn":
        this.changeZoom(this.activeConfig.zoom.step);
        break;
      case "zoomOut":
        this.changeZoom(-this.activeConfig.zoom.step);
        break;
      case "largeCursor":
        this.commitState({ largeCursor: !this.state.largeCursor });
        this.announce(`大鼠标已${this.state.largeCursor ? "开启" : "关闭"}`);
        break;
      case "crosshair":
        this.commitState({ crosshair: !this.state.crosshair });
        this.announce(`十字线已${this.state.crosshair ? "开启" : "关闭"}`);
        break;
      case "fullscreen":
        try {
          await this.effects?.toggleFullscreen();
        } catch (error) {
          this.reportError(error, "无法进入全屏，请检查浏览器权限。");
          this.announce("无法进入全屏，请检查浏览器权限", false);
        }
        break;
      case "pin":
        this.commitState({
          isPinned: !this.state.isPinned,
          isCollapsed: false,
        });
        this.announce(`工具栏已${this.state.isPinned ? "固定" : "取消固定"}`);
        if (this.state.isPinned && !this.state.isReadScreen) {
          this.ui?.scheduleCollapse();
        }
        break;
      case "reset":
        await this.reset();
        break;
      case "help":
        this.announce("将在新窗口打开", false);
        break;
      case "readScreen":
        this.toggleReadScreen();
        break;
      case "exit":
        await this.close();
        break;
    }
  }

  private setReadingEnabled(enabled: boolean): void {
    if (enabled && !this.speech?.isSupported()) {
      this.announce("当前浏览器不支持语音合成", false);
      return;
    }
    this.commitState({ readingEnabled: enabled });
    this.announce(`朗读已${enabled ? "开启" : "关闭"}`, enabled);
  }

  private setSpeechRate(rate: number): void {
    const normalized = clamp(Number(rate.toFixed(2)), 0.5, 2);
    this.commitState({ speechRate: normalized });
    this.announce(`当前语速 ${formatNumber(normalized)} 倍`, false);
  }

  private cycleColorScheme(): void {
    const index = COLOR_SCHEMES.indexOf(this.state.colorScheme);
    const next = COLOR_SCHEMES[(index + 1) % COLOR_SCHEMES.length] ?? "original";
    this.commitState({ colorScheme: next });
    const labels = {
      original: "原始配色",
      "white-black": "白底黑字",
      "black-yellow": "黑底黄字",
      "yellow-black": "黄底黑字",
      "blue-white": "蓝底白字",
    } as const;
    this.announce(`已切换为${labels[next]}`);
  }

  private changeZoom(delta: number): void {
    const zoom = clamp(
      Number((this.state.zoom + delta).toFixed(2)),
      this.activeConfig.zoom.min,
      this.activeConfig.zoom.max,
    );
    if (zoom === this.state.zoom) {
      this.announce(
        delta > 0
          ? `已达到最大缩放 ${Math.round(zoom * 100)}%`
          : `已达到最小缩放 ${Math.round(zoom * 100)}%`,
      );
      return;
    }
    this.commitState({ zoom });
    this.announce(`页面缩放 ${Math.round(zoom * 100)}%`);
  }

  private toggleReadScreen(): void {
    const enabled = !this.state.isReadScreen;
    this.commitState({ isReadScreen: enabled, isCollapsed: false });
    this.ui?.focusAction("readScreen");
    this.announce(enabled ? "已进入读屏专用模式" : "已返回主工具栏");
  }

  private commitState(patch: Partial<AccessibilityToolState>): void {
    this.state = { ...this.state, ...patch };
    this.applyState(true);
    this.emitState();
  }

  private applyState(persist: boolean): void {
    this.ui?.updateState(this.state);
    this.effects?.apply(this.state);
    if (this.state.readingEnabled) {
      this.reading?.start();
    } else {
      this.reading?.stop();
    }
    if (persist) {
      this.savePreferences();
    }
  }

  private handleCollapsedChange(collapsed: boolean): void {
    if (this.state.isCollapsed === collapsed) {
      return;
    }
    this.state = { ...this.state, isCollapsed: collapsed };
    this.emitter.emit("statechange", this.getState());
  }

  private handleFullscreenChange(fullscreen: boolean): void {
    if (this.state.isFullscreen === fullscreen) {
      return;
    }
    this.state = { ...this.state, isFullscreen: fullscreen };
    this.ui?.updateState(this.state);
    this.emitter.emit("statechange", this.getState());
    if (!this.suppressFullscreenAnnouncement && this.state.isOpen) {
      this.announce(
        fullscreen ? "已进入全屏，按 Esc 退出" : "已退出全屏",
      );
    }
  }

  private updateAvailability(): void {
    const speechSupported = this.speech?.isSupported() ?? false;
    this.ui?.setFeatureAvailability(
      "reading",
      speechSupported,
      "当前浏览器不支持语音合成",
    );
    this.ui?.setFeatureAvailability(
      "speechRate",
      speechSupported,
      "当前浏览器不支持语音合成，无法设置语速",
    );
    const screenSound = this.ui?.getControl("screenSound");
    if (screenSound) {
      screenSound.setAttribute("aria-disabled", String(!speechSupported));
      screenSound.dataset.unavailableReason = "当前浏览器不支持语音合成";
    }
    this.ui?.setFeatureAvailability(
      "fullscreen",
      this.effects?.isFullscreenSupported() ?? false,
      "当前浏览器不支持全屏功能",
    );
  }

  private announce(message: string, synthesize = true): void {
    this.ui?.announce(message);
    if (synthesize && this.state.readingEnabled && this.speech?.isSupported()) {
      this.speech.speak(
        message,
        this.activeConfig.locale,
        this.state.speechRate,
      );
    }
  }

  private reportError(error: unknown, message: string): void {
    this.emitter.emit("error", { error, message });
    console.warn(`[AccessibilityTool] ${message}`, error);
  }

  private registerTrigger(trigger: HTMLElement): void {
    if (trigger.closest("[data-a11y-tool-host]")) {
      return;
    }
    this.triggers.add(trigger);
    this.lastTrigger = trigger;
    if (this.host) {
      this.triggerLedger.setAttribute(trigger, "aria-controls", this.host.id);
    }
    this.triggerLedger.setAttribute(
      trigger,
      "aria-expanded",
      String(this.state.isOpen),
    );
  }

  private resolveTrigger(explicit?: HTMLElement): HTMLElement | null {
    if (explicit?.isConnected) {
      return explicit;
    }
    const active = document.activeElement;
    return isHTMLElement(active) && active !== document.body ? active : null;
  }

  private setTriggerExpanded(expanded: boolean): void {
    for (const trigger of this.triggers) {
      if (!trigger.isConnected) {
        continue;
      }
      if (this.host) {
        this.triggerLedger.setAttribute(trigger, "aria-controls", this.host.id);
      }
      this.triggerLedger.setAttribute(
        trigger,
        "aria-expanded",
        String(expanded),
      );
    }
  }

  private restoreTriggerFocus(): void {
    const target =
      (this.lastTrigger?.isConnected ? this.lastTrigger : null) ??
      Array.from(this.triggers).find((trigger) => trigger.isConnected) ??
      null;
    if (target) {
      target.focus();
      return;
    }
    const body = document.body;
    const originalTabIndex = body.getAttribute("tabindex");
    if (originalTabIndex === null) {
      body.setAttribute("tabindex", "-1");
    }
    body.focus();
    if (originalTabIndex === null) {
      body.removeAttribute("tabindex");
    }
  }

  private getStore(): PreferenceStore {
    const key = this.activeConfig.storageKey;
    let store = this.stores.get(key);
    if (!store) {
      store = new PreferenceStore(key, STORAGE_VERSION);
      this.stores.set(key, store);
    }
    return store;
  }

  private getOpenStateStore(storageKey: string): OpenStateStore {
    let store = this.openStateStores.get(storageKey);
    if (!store) {
      store = new OpenStateStore(
        deriveOpenStateStorageKey(storageKey),
        OPEN_STATE_STORAGE_VERSION,
      );
      this.openStateStores.set(storageKey, store);
    }
    return store;
  }

  private savePreferences(): void {
    const preferences: PersistedPreferences = {
      readingEnabled: this.state.readingEnabled,
      speechRate: this.state.speechRate,
      colorScheme: this.state.colorScheme,
      zoom: this.state.zoom,
      largeCursor: this.state.largeCursor,
      crosshair: this.state.crosshair,
      isPinned: this.state.isPinned,
      isReadScreen: this.state.isReadScreen,
    };
    this.getStore().save(preferences);
  }

  private emitState(event?: "open" | "close"): void {
    const snapshot = this.getState();
    this.emitter.emit("statechange", snapshot);
    if (event) {
      this.emitter.emit(event, snapshot);
    }
  }

  private bindShortcutDocuments(documents: readonly Document[]): void {
    const next = new Set(documents);
    next.add(document);
    for (const documentRef of this.shortcutDocuments) {
      if (!next.has(documentRef)) {
        documentRef.removeEventListener("keydown", this.handleGlobalKeydown, true);
        this.shortcutDocuments.delete(documentRef);
      }
    }
    for (const documentRef of next) {
      if (!this.shortcutDocuments.has(documentRef)) {
        documentRef.addEventListener("keydown", this.handleGlobalKeydown, true);
        this.shortcutDocuments.add(documentRef);
      }
    }
  }

  private unbindShortcutDocuments(): void {
    for (const documentRef of this.shortcutDocuments) {
      documentRef.removeEventListener("keydown", this.handleGlobalKeydown, true);
    }
    this.shortcutDocuments.clear();
  }

  private readonly handleGlobalKeydown = (event: KeyboardEvent): void => {
    if (
      event.altKey &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.code === "KeyA" || event.key.toLowerCase() === "a")
    ) {
      event.preventDefault();
      this.ui?.expandAndFocus();
      return;
    }
    if (
      !this.state.isReadScreen ||
      !event.altKey ||
      !event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      isEditableTarget(event.target)
    ) {
      return;
    }
    const digit = Number(event.code.replace("Digit", ""));
    if (!Number.isInteger(digit) || digit < 1 || digit > 6) {
      return;
    }
    const type = REGION_TYPES[digit - 1];
    if (!type) {
      return;
    }
    event.preventDefault();
    this.regionNavigation?.navigate(type);
  };
}

function createDefaultState(
  config: ResolvedAccessibilityToolConfig,
): AccessibilityToolState {
  return {
    isOpen: false,
    isPinned: false,
    isCollapsed: false,
    isReadScreen: false,
    readingEnabled: false,
    speechRate: clamp(config.speech.defaultRate, 0.5, 2),
    colorScheme: "original",
    zoom: 1,
    largeCursor: false,
    crosshair: false,
    isFullscreen: false,
  };
}

function hydrateState(
  config: ResolvedAccessibilityToolConfig,
  stored: PersistedPreferences | null,
): AccessibilityToolState {
  const defaults = createDefaultState(config);
  if (!stored) {
    return defaults;
  }
  return {
    ...defaults,
    readingEnabled: stored.readingEnabled,
    speechRate: clamp(stored.speechRate, 0.5, 2),
    colorScheme: COLOR_SCHEMES.includes(stored.colorScheme)
      ? stored.colorScheme
      : "original",
    zoom: clamp(stored.zoom, config.zoom.min, config.zoom.max),
    largeCursor: stored.largeCursor,
    crosshair: stored.crosshair,
    isPinned: stored.isPinned,
    isReadScreen: stored.isReadScreen,
  };
}

function constrainStateToFeatures(
  config: ResolvedAccessibilityToolConfig,
  state: AccessibilityToolState,
): AccessibilityToolState {
  return {
    ...state,
    readingEnabled: config.features.reading && state.readingEnabled,
    colorScheme: config.features.colorScheme
      ? state.colorScheme
      : "original",
    zoom:
      config.features.zoomIn || config.features.zoomOut ? state.zoom : 1,
    largeCursor: config.features.largeCursor && state.largeCursor,
    crosshair: config.features.crosshair && state.crosshair,
    isPinned: config.features.pin && state.isPinned,
    isReadScreen: config.features.readScreen && state.isReadScreen,
  };
}

function mergeUserConfig(
  base: AccessibilityToolConfig | undefined,
  next: AccessibilityToolConfig,
): AccessibilityToolConfig {
  if (!base) {
    return next;
  }
  return {
    ...base,
    ...next,
    features: { ...base.features, ...next.features },
    toolbar: {
      ...base.toolbar,
      ...next.toolbar,
      theme: { ...base.toolbar?.theme, ...next.toolbar?.theme },
    },
    speech: { ...base.speech, ...next.speech },
    zoom: { ...base.zoom, ...next.zoom },
    regions: {
      ...base.regions,
      ...next.regions,
      selectors: { ...base.regions?.selectors, ...next.regions?.selectors },
    },
    tabs: { ...base.tabs, ...next.tabs },
  };
}

function createHostId(): string {
  return `accessibility-tool-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

async function ensureDocumentReady(): Promise<void> {
  if (document.body) {
    return;
  }
  await new Promise<void>((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

async function ensureDomContentLoaded(): Promise<void> {
  if (
    document.readyState === "complete" ||
    hasDomContentLoadedTiming()
  ) {
    return;
  }
  await new Promise<void>((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), {
      once: true,
    });
  });
}

function hasDomContentLoadedTiming(): boolean {
  const navigation = globalThis.performance
    ?.getEntriesByType?.("navigation")
    .at(0) as PerformanceNavigationTiming | undefined;
  return (navigation?.domContentLoadedEventStart ?? 0) > 0;
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}

export const accessibilityTool: AccessibilityToolApi =
  new AccessibilityToolRuntime();

if (typeof window !== "undefined") {
  window.AccessibilityTool = accessibilityTool;
}
