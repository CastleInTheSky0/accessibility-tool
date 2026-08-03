import type { ResolvedAccessibilityToolConfig } from "../core/config";
import { REGION_LABELS } from "../core/constants";
import { DomLedger } from "../core/dom-ledger";
import {
  createUniqueId,
  getAccessibleName,
  getFocusableElements,
  isHTMLElement,
  isTabbable,
  isVisible,
  querySelectorAllSafe,
} from "../core/dom";
import type { RegionType, TabActivationMode } from "../types";

interface TabGroup {
  root: Document | ShadowRoot;
  list: HTMLElement;
  tabs: HTMLElement[];
  panels: Map<HTMLElement, HTMLElement>;
}

interface TabsCallbacks {
  onAnnounce: (message: string) => void;
  onError: (error: unknown, message: string) => void;
  getRegionType: (element: HTMLElement) => RegionType | null;
}

export class TabsController {
  private readonly ledger = new DomLedger();
  private readonly modalLedger = new DomLedger();
  private readonly groups = new Map<HTMLElement, TabGroup>();
  private readonly handledFocusEvents = new WeakSet<Event>();
  private readonly handledKeydownEvents = new WeakSet<Event>();
  private readonly pendingPanelEntries = new Set<HTMLElement>();
  private readonly pendingPanelLeaves = new Set<HTMLElement>();
  private readonly suppressedTabFocusAnnouncements = new Set<HTMLElement>();
  private roots: readonly (Document | ShadowRoot)[] = [];
  private running = false;
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
    this.pendingPanelEntries.clear();
    this.pendingPanelLeaves.clear();
    this.suppressedTabFocusAnnouncements.clear();
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
    this.groups.clear();
    for (const root of this.roots) {
      for (const list of querySelectorAllSafe<HTMLElement>(
        root,
        '[role="tablist"]',
      )) {
        const group = this.buildGroup(root, list);
        if (group) {
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

    return {
      root,
      list,
      tabs,
      panels,
    };
  }

  isTabSpeechTarget(element: HTMLElement): boolean {
    const tab = element.closest<HTMLElement>('[role="tab"]');
    const group = tab ? this.findGroup(tab) : null;
    if (tab && group?.tabs.includes(tab)) {
      return true;
    }
    for (const candidate of this.groups.values()) {
      if (Array.from(candidate.panels.values()).includes(element)) {
        return true;
      }
    }
    for (const panel of [
      ...this.pendingPanelEntries,
      ...this.pendingPanelLeaves,
    ]) {
      if (isComposedDescendant(panel, element)) {
        return true;
      }
    }
    return false;
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
    if (this.handledFocusEvents.has(event)) {
      return;
    }
    this.handledFocusEvents.add(event);
    const focusedElement = getPathElement(event, "*");
    const tab = focusedElement?.closest<HTMLElement>('[role="tab"]') ?? null;
    const reachedByTab = this.tabNavigationPending;
    this.setTabNavigationPending(false);
    if (!tab || focusedElement !== tab) {
      return;
    }
    const group = this.findGroup(tab);
    if (group && !this.suppressedTabFocusAnnouncements.has(tab)) {
      this.callbacks.onAnnounce(
        formatTabFocusAnnouncement(
          getTabName(tab),
          this.callbacks.getRegionType(tab),
          isLinkTab(tab),
        ),
      );
    }
    if (
      group &&
      reachedByTab &&
      this.resolveActivation(tab) === "automatic" &&
      tab.getAttribute("aria-selected") !== "true"
    ) {
      this.activateTab(group, tab);
    }
  };

  private readonly handleKeydown = (event: Event): void => {
    if (this.handledKeydownEvents.has(event)) {
      return;
    }
    this.handledKeydownEvents.add(event);
    const keyboardEvent = event as KeyboardEvent;
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
      this.resolveActivation(tab) === "manual" &&
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
    if (this.resolveActivation(nextTab) === "automatic") {
      this.activateTab(group, nextTab);
    }
  }

  private activateTab(group: TabGroup, tab: HTMLElement): void {
    const events = this.resolveTriggerEvents(tab);
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

  private resolveActivation(tab: HTMLElement): TabActivationMode {
    const value = tab.getAttribute("data-a11y-activation")?.trim();
    return value === "manual" || value === "automatic"
      ? value
      : this.config.tabs.defaultActivation;
  }

  private resolveTriggerEvents(tab: HTMLElement): string[] {
    const tabEvents = tab.getAttribute("data-a11y-trigger-event")?.trim();
    const configured = this.config.tabs.triggerEvents;
    const raw: readonly string[] = tabEvents
      ? [tabEvents]
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
    if (!panel || this.pendingPanelEntries.has(panel)) {
      return;
    }
    this.pendingPanelEntries.add(panel);
    try {
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
      const hasTabbableContent = getFocusableElements(panel).length > 0;
      panel.focus();
      if (!isElementFocused(panel)) {
        return;
      }
      if (this.isDialog(panel)) {
        this.activeDialog = panel;
        this.dialogOrigin = tab;
        this.manageModalBackground(panel, true);
      }
      this.callbacks.onAnnounce(
        formatPanelEntryAnnouncement(
          getTabName(tab),
          this.callbacks.getRegionType(tab),
          hasTabbableContent,
        ),
      );
    } finally {
      this.pendingPanelEntries.delete(panel);
    }
  }

  private async leavePanel(panel: HTMLElement, tab: HTMLElement): Promise<void> {
    if (this.pendingPanelLeaves.has(panel)) {
      return;
    }
    this.pendingPanelLeaves.add(panel);
    this.suppressedTabFocusAnnouncements.add(tab);
    try {
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
      if (isElementFocused(tab)) {
        this.callbacks.onAnnounce(
          formatPanelReturnAnnouncement(getTabName(tab)),
        );
      }
    } finally {
      this.suppressedTabFocusAnnouncements.delete(tab);
      this.pendingPanelLeaves.delete(panel);
    }
  }

  private async closeDialog(dialog: HTMLElement): Promise<boolean> {
    if (dialog.tagName === "DIALOG" && "close" in dialog) {
      const nativeDialog = dialog as HTMLDialogElement;
      if (nativeDialog.open) {
        nativeDialog.close();
      }
      return !nativeDialog.open;
    }
    const closeButton = dialog.querySelector<HTMLElement>(
      "[data-a11y-dialog-close]",
    );
    if (closeButton) {
      closeButton.click();
      return waitUntilHidden(dialog, this.config.tabs.panelReadyTimeoutMs);
    }
    if (this.config.tabs.closeDialog) {
      await this.config.tabs.closeDialog(dialog);
      return waitUntilHidden(dialog, this.config.tabs.panelReadyTimeoutMs);
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

export function formatTabFocusAnnouncement(
  name: string,
  regionType: RegionType | null,
  link: boolean,
): string {
  const prefix = link ? `链接：${name}，Tab` : `Tab，${name}`;
  const region = regionType ? `，${REGION_LABELS[regionType]}` : "";
  return `${prefix}${region}，当前有浮动窗口，按 ALT+下键进入窗口`;
}

export function formatPanelEntryAnnouncement(
  tabName: string,
  regionType: RegionType | null,
  hasTabbableContent: boolean,
): string {
  const region = regionType ? REGION_LABELS[regionType] : "";
  const traversal = hasTabbableContent
    ? "按 Tab 键遍历信息"
    : "当前面板暂无可通过 Tab 遍历的信息";
  return `您已进入${tabName}${region}标签面板，${traversal}，按 Esc 键退出面板并返回${tabName}选项`;
}

export function formatPanelReturnAnnouncement(tabName: string): string {
  return `已返回${tabName}选项`;
}

function getTabName(tab: HTMLElement): string {
  return getAccessibleName(tab, { readingFallbacks: false });
}

function isLinkTab(tab: HTMLElement): boolean {
  return tab.tagName === "A" && tab.hasAttribute("href");
}

function isElementFocused(element: HTMLElement): boolean {
  const root = element.getRootNode();
  return "activeElement" in root && root.activeElement === element;
}

function isComposedDescendant(
  container: HTMLElement,
  target: HTMLElement,
): boolean {
  let current: HTMLElement | null = target;
  while (current) {
    if (current === container || container.contains(current)) {
      return true;
    }
    const root = current.getRootNode();
    if ("host" in root && isHTMLElement(root.host)) {
      current = root.host;
      continue;
    }
    if (root.nodeType === 9) {
      try {
        const frame = (root as Document).defaultView?.frameElement;
        current = isHTMLElement(frame) ? frame : null;
        continue;
      } catch {
        return false;
      }
    }
    return false;
  }
  return false;
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

async function waitUntilHidden(
  element: HTMLElement,
  timeoutMs: number,
): Promise<boolean> {
  if (!isVisible(element)) {
    return true;
  }
  const started = performance.now();
  return new Promise((resolve) => {
    const poll = (): void => {
      if (!isVisible(element)) {
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
