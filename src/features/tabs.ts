import type { ResolvedAccessibilityToolConfig } from "../core/config";
import { DomLedger } from "../core/dom-ledger";
import {
  createUniqueId,
  getFocusableElements,
  isHTMLElement,
  isTabbable,
  isVisible,
  querySelectorAllSafe,
} from "../core/dom";
import type { TabActivationMode } from "../types";

interface TabGroup {
  root: Document | ShadowRoot;
  list: HTMLElement;
  tabs: HTMLElement[];
  panels: Map<HTMLElement, HTMLElement>;
  activation: TabActivationMode;
  announced: boolean;
}

interface TabsCallbacks {
  onAnnounce: (message: string) => void;
  onError: (error: unknown, message: string) => void;
}

export class TabsController {
  private readonly ledger = new DomLedger();
  private readonly modalLedger = new DomLedger();
  private readonly groups = new Map<HTMLElement, TabGroup>();
  private roots: readonly (Document | ShadowRoot)[] = [];
  private running = false;
  private keyboardInput = false;
  private tabNavigationPending = false;
  private tabNavigationTimer: number | null = null;
  private activeDialog: HTMLElement | null = null;
  private dialogOrigin: HTMLElement | null = null;

  constructor(
    private config: ResolvedAccessibilityToolConfig,
    private readonly callbacks: TabsCallbacks,
  ) {}

  updateConfig(config: ResolvedAccessibilityToolConfig): void {
    this.config = config;
    if (this.running) {
      this.refresh();
    }
  }

  start(roots: readonly (Document | ShadowRoot)[]): void {
    if (!this.config.tabs.enabled) {
      return;
    }
    this.running = true;
    this.setRoots(roots);
    this.refresh();
  }

  stop(): void {
    this.running = false;
    this.detachRoots();
    this.groups.clear();
    this.setTabNavigationPending(false);
    this.activeDialog = null;
    this.dialogOrigin = null;
    this.modalLedger.restore();
    this.ledger.restore();
  }

  setRoots(roots: readonly (Document | ShadowRoot)[]): void {
    if (!this.running) {
      this.roots = roots;
      return;
    }
    const changed =
      roots.length !== this.roots.length ||
      roots.some((root, index) => root !== this.roots[index]);
    if (!changed) {
      return;
    }
    this.detachRoots();
    this.roots = roots;
    this.attachRoots();
  }

  refresh(): void {
    if (!this.running || !this.config.tabs.enabled) {
      return;
    }
    const announcedGroups = new Map(
      Array.from(this.groups, ([list, group]) => [list, group.announced]),
    );
    this.groups.clear();
    for (const root of this.roots) {
      for (const list of querySelectorAllSafe<HTMLElement>(
        root,
        '[role="tablist"]',
      )) {
        const group = this.buildGroup(root, list);
        if (group) {
          group.announced = announcedGroups.get(list) ?? false;
          this.groups.set(list, group);
        }
      }
    }
  }

  private buildGroup(
    root: Document | ShadowRoot,
    list: HTMLElement,
  ): TabGroup | null {
    if (list.hasAttribute("data-a11y-tool-tab-error")) {
      this.ledger.removeAttribute(list, "data-a11y-tool-tab-error");
    }
    const tabs = querySelectorAllSafe<HTMLElement>(list, '[role="tab"]').filter(
      (tab) => tab.closest('[role="tablist"]') === list,
    );
    if (tabs.length === 0) {
      return null;
    }

    const panels = new Map<HTMLElement, HTMLElement>();
    for (const tab of tabs) {
      const panelId = tab.getAttribute("aria-controls")?.trim();
      if (!panelId) {
        this.markDiagnostic(list, "缺少 aria-controls");
        this.report(
          new Error("Tab is missing aria-controls"),
          "选项卡缺少 aria-controls，已跳过该选项卡组。",
        );
        return null;
      }
      const matchingPanels = findElementsById(root, panelId);
      if (matchingPanels.length !== 1) {
        this.markDiagnostic(
          list,
          matchingPanels.length === 0 ? "关联面板不存在" : "关联 ID 重复",
        );
        this.report(
          new Error(`Panel id count is ${matchingPanels.length}: ${panelId}`),
          matchingPanels.length === 0
            ? `选项卡关联面板 #${panelId} 不存在，已跳过该选项卡组。`
            : `页面存在重复 ID“${panelId}”，已跳过该选项卡组。`,
        );
        return null;
      }
      const panel = matchingPanels[0];
      if (!panel) {
        return null;
      }
      if (!tab.id) {
        this.setAttribute(
          tab,
          "id",
          createUniqueId("accessibility-tool-tab", tab.ownerDocument),
        );
      } else if (findElementsById(root, tab.id).length !== 1) {
        this.markDiagnostic(list, "选项 ID 重复");
        this.report(
          new Error(`Duplicate tab id: ${tab.id}`),
          `页面存在重复选项 ID“${tab.id}”，已跳过该选项卡组。`,
        );
        return null;
      }
      if (!panel.getAttribute("aria-labelledby")) {
        this.setAttribute(panel, "aria-labelledby", tab.id);
      }
      panels.set(tab, panel);
    }

    const selected =
      tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0];
    if (!selected) {
      return null;
    }
    this.syncSelection({ tabs, panels }, selected);
    const activationValue = list.getAttribute("data-a11y-activation");
    const activation: TabActivationMode =
      activationValue === "manual" || activationValue === "automatic"
        ? activationValue
        : this.config.tabs.defaultActivation;

    return {
      root,
      list,
      tabs,
      panels,
      activation,
      announced: false,
    };
  }

  private attachRoots(): void {
    for (const root of this.roots) {
      root.addEventListener("keydown", this.handleKeydown);
      root.addEventListener("focusin", this.handleFocusIn);
      root.addEventListener("pointerdown", this.handlePointerDown, true);
      root.addEventListener("click", this.handleClick);
    }
  }

  private detachRoots(): void {
    for (const root of this.roots) {
      root.removeEventListener("keydown", this.handleKeydown);
      root.removeEventListener("focusin", this.handleFocusIn);
      root.removeEventListener("pointerdown", this.handlePointerDown, true);
      root.removeEventListener("click", this.handleClick);
    }
  }

  private readonly handlePointerDown = (): void => {
    this.keyboardInput = false;
    this.setTabNavigationPending(false);
  };

  private readonly handleClick = (event: Event): void => {
    const tab = getPathElement(event, '[role="tab"]');
    if (!tab) {
      return;
    }
    const group = this.findGroup(tab);
    if (!group) {
      return;
    }
    requestAnimationFrame(() => {
      if (tab.isConnected) {
        this.syncSelection(group, tab);
      }
    });
  };

  private readonly handleFocusIn = (event: Event): void => {
    const tab = getPathElement(event, '[role="tab"]');
    const reachedByTab = this.tabNavigationPending;
    this.setTabNavigationPending(false);
    if (!tab) {
      return;
    }
    const group = this.findGroup(tab);
    if (group && this.keyboardInput && !group.announced) {
      group.announced = true;
      this.callbacks.onAnnounce("有关联内容面板，按 Alt+下方向键进入");
    }
    if (
      group &&
      reachedByTab &&
      group.activation === "automatic" &&
      tab.getAttribute("aria-selected") !== "true"
    ) {
      this.activateTab(group, tab);
    }
  };

  private readonly handleKeydown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    this.keyboardInput = true;
    this.setTabNavigationPending(
      keyboardEvent.key === "Tab" &&
        !keyboardEvent.altKey &&
        !keyboardEvent.ctrlKey &&
        !keyboardEvent.metaKey,
    );

    if (this.handleDialogFocusTrap(keyboardEvent)) {
      return;
    }

    const tab = getPathElement(keyboardEvent, '[role="tab"]');
    if (tab) {
      const group = this.findGroup(tab);
      if (group) {
        this.handleTabKeydown(keyboardEvent, group, tab);
        return;
      }
    }

    if (keyboardEvent.key === "Escape" && !keyboardEvent.defaultPrevented) {
      const panelEntry = this.findPanelForEvent(keyboardEvent);
      if (panelEntry) {
        if (panelEntry.panel.ownerDocument.fullscreenElement) {
          return;
        }
        keyboardEvent.preventDefault();
        void this.leavePanel(panelEntry.panel, panelEntry.tab);
      }
    }
  };

  private handleTabKeydown(
    event: KeyboardEvent,
    group: TabGroup,
    tab: HTMLElement,
  ): void {
    if (event.altKey && event.key === "ArrowDown") {
      event.preventDefault();
      void this.enterPanel(group, tab);
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const orientation = group.list.getAttribute("aria-orientation") ?? "horizontal";
    const isVertical = orientation === "vertical";
    const previousKey = isVertical ? "ArrowUp" : "ArrowLeft";
    const nextKey = isVertical ? "ArrowDown" : "ArrowRight";
    const currentIndex = group.tabs.indexOf(tab);
    let nextIndex: number;

    if (event.key === previousKey) {
      nextIndex = (currentIndex - 1 + group.tabs.length) % group.tabs.length;
    } else if (event.key === nextKey) {
      nextIndex = (currentIndex + 1) % group.tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = group.tabs.length - 1;
    } else if (
      group.activation === "manual" &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      this.activateTab(group, tab);
      return;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = group.tabs[nextIndex];
    if (!nextTab) {
      return;
    }
    nextTab.focus();
    if (group.activation === "automatic") {
      this.activateTab(group, nextTab);
    }
  }

  private activateTab(group: TabGroup, tab: HTMLElement): void {
    const events = this.resolveTriggerEvents(group, tab);
    for (const eventName of events) {
      this.dispatchOriginalEvent(tab, eventName);
    }

    requestAnimationFrame(() => {
      this.syncSelection(group, tab);
      const panel = group.panels.get(tab);
      if (panel && !isVisible(panel)) {
        this.markDiagnostic(group.list, "原页面事件未显示关联面板");
        this.report(
          new Error("Linked panel did not become visible"),
          `触发原页面事件后，关联面板 #${panel.id} 仍未显示。`,
        );
      }
    });
  }

  private resolveTriggerEvents(group: TabGroup, tab: HTMLElement): string[] {
    const tabEvents = tab.getAttribute("data-a11y-trigger-event");
    const listEvents = group.list.getAttribute("data-a11y-trigger-event");
    const configured = this.config.tabs.triggerEvents;
    const raw: readonly string[] = tabEvents
      ? [tabEvents]
      : listEvents
        ? [listEvents]
        : typeof configured === "string"
          ? [configured]
          : configured;
    const result = new Set<string>();
    for (const value of raw) {
      for (const eventName of value.split(/\s+/)) {
        if (eventName) {
          result.add(eventName);
        }
      }
    }
    if (result.size === 0) {
      result.add("click");
    }
    return Array.from(result);
  }

  private dispatchOriginalEvent(tab: HTMLElement, eventName: string): void {
    const view = tab.ownerDocument.defaultView ?? window;
    const isMouseEvent = /^(click|dblclick|mouse|pointer|contextmenu)/.test(
      eventName,
    );
    const event = isMouseEvent
      ? new view.MouseEvent(eventName, {
          bubbles: eventName !== "mouseenter" && eventName !== "mouseleave",
          cancelable: true,
          composed: true,
          view,
        })
      : new view.Event(eventName, {
          bubbles: true,
          cancelable: true,
          composed: true,
        });
    if (
      eventName === "click" &&
      tab.tagName === "A" &&
      this.config.tabs.preventDefaultNavigation
    ) {
      event.preventDefault();
    }
    tab.dispatchEvent(event);
  }

  private syncSelection(
    group: Pick<TabGroup, "tabs" | "panels">,
    selected: HTMLElement,
  ): void {
    for (const tab of group.tabs) {
      const active = tab === selected;
      this.setAttribute(tab, "aria-selected", String(active));
      this.setAttribute(tab, "tabindex", "0");
      const panel = group.panels.get(tab);
      if (panel) {
        this.setAttribute(panel, "aria-hidden", String(!active));
      }
    }
  }

  private async enterPanel(group: TabGroup, tab: HTMLElement): Promise<void> {
    const panel = group.panels.get(tab);
    if (!panel) {
      return;
    }
    if (!isVisible(panel)) {
      this.activateTab(group, tab);
    }
    const ready = await waitUntilVisible(
      panel,
      this.config.tabs.panelReadyTimeoutMs,
    );
    if (!ready) {
      this.callbacks.onAnnounce("关联内容面板未能打开");
      this.report(
        new Error("Panel readiness timeout"),
        `等待关联面板 #${panel.id} 显示超时。`,
      );
      return;
    }
    if (!isTabbable(panel) && !panel.hasAttribute("tabindex")) {
      this.setAttribute(panel, "tabindex", "-1");
    }
    panel.focus();
    if (this.isDialog(panel)) {
      this.activeDialog = panel;
      this.dialogOrigin = tab;
      this.manageModalBackground(panel, true);
    }
  }

  private async leavePanel(panel: HTMLElement, tab: HTMLElement): Promise<void> {
    if (this.isDialog(panel)) {
      const closed = await this.closeDialog(panel);
      if (!closed) {
        return;
      }
    }
    this.manageModalBackground(panel, false);
    this.activeDialog = null;
    this.dialogOrigin = null;
    tab.focus();
  }

  private async closeDialog(dialog: HTMLElement): Promise<boolean> {
    if (dialog.tagName === "DIALOG" && "close" in dialog) {
      const nativeDialog = dialog as HTMLDialogElement;
      if (nativeDialog.open) {
        nativeDialog.close();
      }
      return true;
    }
    const closeButton = dialog.querySelector<HTMLElement>(
      "[data-a11y-dialog-close]",
    );
    if (closeButton) {
      closeButton.click();
      return true;
    }
    if (this.config.tabs.closeDialog) {
      await this.config.tabs.closeDialog(dialog);
      return true;
    }
    this.callbacks.onAnnounce("当前浮动窗口没有可用的关闭方式");
    this.report(
      new Error("Dialog has no close mechanism"),
      "浮动窗口没有标准关闭方式，工具未擅自隐藏页面内容。",
    );
    return false;
  }

  private handleDialogFocusTrap(event: KeyboardEvent): boolean {
    const dialog = this.activeDialog;
    if (
      !dialog ||
      event.key !== "Tab" ||
      !this.isModal(dialog) ||
      !event.composedPath().includes(dialog)
    ) {
      return false;
    }
    const focusable = getFocusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return true;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    const active = dialog.ownerDocument.activeElement;
    if (event.shiftKey && active === first && last) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && active === last && first) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  }

  private manageModalBackground(dialog: HTMLElement, active: boolean): void {
    this.modalLedger.restore();
    if (!active || !this.config.tabs.manageModalBackground || !this.isModal(dialog)) {
      return;
    }
    const body = dialog.ownerDocument.body;
    for (const child of Array.from(body.children)) {
      if (!(child instanceof HTMLElement) || child === dialog || child.contains(dialog)) {
        continue;
      }
      this.modalLedger.setAttribute(child, "inert", "");
      this.modalLedger.setAttribute(child, "aria-hidden", "true");
    }
  }

  private isDialog(panel: HTMLElement): boolean {
    if (
      panel.tagName === "DIALOG" ||
      panel.getAttribute("role") === "dialog" ||
      panel.getAttribute("aria-modal") === "true"
    ) {
      return true;
    }
    return this.config.tabs.dialogSelectors.some((selector) => {
      try {
        return panel.matches(selector);
      } catch (error) {
        this.report(error, `浮动窗口选择器无效：${selector}`);
        return false;
      }
    });
  }

  private isModal(dialog: HTMLElement): boolean {
    if (dialog.getAttribute("aria-modal") === "true") {
      return true;
    }
    if (dialog.tagName !== "DIALOG") {
      return false;
    }
    try {
      return dialog.matches(":modal");
    } catch {
      return false;
    }
  }

  private findGroup(tab: HTMLElement): TabGroup | null {
    const list = tab.closest<HTMLElement>('[role="tablist"]');
    return list ? this.groups.get(list) ?? null : null;
  }

  private findPanelForEvent(
    event: Event,
  ): { panel: HTMLElement; tab: HTMLElement } | null {
    const path = event.composedPath();
    for (const group of this.groups.values()) {
      for (const [tab, panel] of group.panels) {
        if (path.includes(panel)) {
          return { panel, tab };
        }
        const target = path.find((item): item is HTMLElement => isHTMLElement(item));
        if (target && panel.contains(target)) {
          return { panel, tab };
        }
      }
    }
    return null;
  }

  private setAttribute(element: Element, name: string, value: string): void {
    if (element.getAttribute(name) !== value) {
      this.ledger.setAttribute(element, name, value);
    }
  }

  private setTabNavigationPending(pending: boolean): void {
    if (this.tabNavigationTimer !== null) {
      window.clearTimeout(this.tabNavigationTimer);
      this.tabNavigationTimer = null;
    }
    this.tabNavigationPending = pending;
    if (pending) {
      this.tabNavigationTimer = window.setTimeout(() => {
        this.tabNavigationPending = false;
        this.tabNavigationTimer = null;
      }, 0);
    }
  }

  private markDiagnostic(list: HTMLElement, message: string): void {
    if (this.config.debug) {
      this.ledger.setAttribute(list, "data-a11y-tool-tab-error", message);
    }
  }

  private report(error: unknown, message: string): void {
    this.callbacks.onError(error, message);
    if (this.config.strict) {
      throw error instanceof Error ? error : new Error(message);
    }
  }
}

function findElementsById(
  root: Document | ShadowRoot,
  id: string,
): HTMLElement[] {
  return querySelectorAllSafe<HTMLElement>(root, "[id]").filter(
    (element) => element.id === id,
  );
}

function getPathElement(event: Event, selector: string): HTMLElement | null {
  const element = event
    .composedPath()
    .find((item): item is HTMLElement => isHTMLElement(item));
  return element?.closest<HTMLElement>(selector) ?? null;
}


async function waitUntilVisible(
  element: HTMLElement,
  timeoutMs: number,
): Promise<boolean> {
  if (isVisible(element)) {
    return true;
  }
  const started = performance.now();
  return new Promise((resolve) => {
    const poll = (): void => {
      if (isVisible(element)) {
        resolve(true);
        return;
      }
      if (!element.isConnected || performance.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(poll, 40);
    };
    poll();
  });
}
