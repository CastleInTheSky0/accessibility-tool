import type { ResolvedAccessibilityToolConfig } from "../core/config";
import { DomLedger } from "../core/dom-ledger";
import {
  createUniqueId,
  getAccessibleName,
  isElement,
  isHTMLElement,
  querySelectorAllSafe,
} from "../core/dom";
import type {
  DomTarget,
  RegionCode,
  RegionRegistrationConfig,
  RegistrationHandle,
  TabRegistrationItem,
} from "../types";
import {
  resolveTabActivation,
  resolveTabTriggerEvents,
} from "./tabs";

interface DomRegistrationCallbacks {
  getConfig: () => ResolvedAccessibilityToolConfig;
  beforeTabChange: (elements: readonly HTMLElement[]) => void;
  onChange: () => void;
}

interface AttributeMutation {
  element: Element;
  name: string;
  value: string | null;
}

interface RegistrationRecord {
  id: number;
  kind: "regions" | "tabs";
  mutations: readonly AttributeMutation[];
  tabElements: readonly HTMLElement[];
  registeredTabs: readonly HTMLElement[];
  registeredPanels: readonly HTMLElement[];
  registeredLists: readonly HTMLElement[];
}

interface AttributeOwner {
  registrationId: number;
  value: string | null;
}

interface ResolvedTabItem {
  source: TabRegistrationItem;
  tab: HTMLElement;
  panel: HTMLElement;
  root: Document | ShadowRoot;
  list: HTMLElement;
}

interface PreparedTabItem extends ResolvedTabItem {
  tabId: string;
  panelId: string;
}

class MutationCollector {
  private readonly mutations = new Map<Element, Map<string, string | null>>();

  set(element: Element, name: string, value: string): void {
    this.getElementMutations(element).set(name, value);
  }

  remove(element: Element, name: string): void {
    this.getElementMutations(element).set(name, null);
  }

  toArray(): AttributeMutation[] {
    const result: AttributeMutation[] = [];
    for (const [element, attributes] of this.mutations) {
      for (const [name, value] of attributes) {
        result.push({ element, name, value });
      }
    }
    return result;
  }

  private getElementMutations(element: Element): Map<string, string | null> {
    let attributes = this.mutations.get(element);
    if (!attributes) {
      attributes = new Map<string, string | null>();
      this.mutations.set(element, attributes);
    }
    return attributes;
  }
}

export class DomRegistrationController {
  private readonly ledger = new DomLedger();
  private readonly records = new Map<number, RegistrationRecord>();
  private readonly owners = new Map<
    Element,
    Map<string, AttributeOwner[]>
  >();
  private readonly registeredTabCounts = new Map<HTMLElement, number>();
  private readonly registeredPanelCounts = new Map<HTMLElement, number>();
  private readonly registeredListCounts = new Map<HTMLElement, number>();
  private nextRegistrationId = 1;

  constructor(private readonly callbacks: DomRegistrationCallbacks) {}

  registerRegions(
    configs: RegionRegistrationConfig[],
  ): RegistrationHandle {
    if (!Array.isArray(configs)) {
      this.warn("registerRegions() 需要接收配置数组。");
      return createNoopHandle();
    }

    const mutations = new MutationCollector();
    for (const [index, config] of configs.entries()) {
      try {
        if (!config || typeof config !== "object") {
          this.warn(`registerRegions() 第 ${index + 1} 项不是有效配置。`);
          continue;
        }
        if (!isRegionCode(config.region)) {
          this.warn(
            `registerRegions() 第 ${index + 1} 项的 region 无效：${String(config.region)}。`,
          );
          continue;
        }
        const targets = this.resolveTargets(
          config.target,
          `registerRegions() 第 ${index + 1} 项`,
        );
        for (const target of targets) {
          mutations.set(target, "data-a11y-region", String(config.region));
          if (typeof config.label === "string") {
            mutations.set(target, "data-a11y-label", config.label);
          } else if (config.label !== undefined) {
            this.warn(
              `registerRegions() 第 ${index + 1} 项的 label 必须是字符串，已忽略。`,
            );
          }
        }
      } catch (error) {
        this.warn(`registerRegions() 第 ${index + 1} 项注册失败，已跳过。`, error);
      }
    }

    return this.addRecord("regions", mutations.toArray(), [], [], [], []);
  }

  registerTabs(configs: TabRegistrationItem[]): RegistrationHandle {
    if (!Array.isArray(configs)) {
      this.warn("registerTabs() 需要接收配置数组。");
      return createNoopHandle();
    }

    const mutations = new MutationCollector();
    const affectedElements = new Set<HTMLElement>();
    const registeredTabs = new Set<HTMLElement>();
    const registeredPanels = new Set<HTMLElement>();
    const registeredLists = new Set<HTMLElement>();
    const usedTabs = new Set<HTMLElement>();
    const usedPanels = new Set<HTMLElement>();
    const usedLists = new Set<HTMLElement>();
    const resolvedItems: PreparedTabItem[] = [];
    const identifierPlans = new Map<
      Document | ShadowRoot,
      { identifiers: Map<Element, string>; reserved: Set<string> }
    >();

    for (const [configIndex, item] of configs.entries()) {
      try {
        const context = `registerTabs() 第 ${configIndex + 1} 项`;
        for (const [pairIndex, resolved] of this.resolveTabItems(
          item,
          context,
        ).entries()) {
          const pairContext = `${context} 的第 ${pairIndex + 1} 对`;
          if (
            usedTabs.has(resolved.tab) ||
            usedPanels.has(resolved.tab) ||
            usedLists.has(resolved.tab) ||
            this.registeredPanelCounts.has(resolved.tab) ||
            this.registeredListCounts.has(resolved.tab)
          ) {
            this.warn(`${pairContext} 的 tab 存在重复或跨角色使用，已跳过冲突配对。`);
            continue;
          }
          if (
            usedPanels.has(resolved.panel) ||
            usedTabs.has(resolved.panel) ||
            usedLists.has(resolved.panel) ||
            this.registeredTabCounts.has(resolved.panel) ||
            this.registeredListCounts.has(resolved.panel)
          ) {
            this.warn(`${pairContext} 的 panel 存在重复或跨角色使用，已跳过冲突配对。`);
            continue;
          }
          if (
            resolved.list === resolved.panel ||
            usedTabs.has(resolved.list) ||
            usedPanels.has(resolved.list) ||
            this.registeredTabCounts.has(resolved.list) ||
            this.registeredPanelCounts.has(resolved.list)
          ) {
            this.warn(
              `${pairContext} 自动推断的 tablist 与 tab/panel 角色冲突，已跳过该配对。`,
            );
            continue;
          }
          let identifierPlan = identifierPlans.get(resolved.root);
          if (!identifierPlan) {
            identifierPlan = {
              identifiers: new Map<Element, string>(),
              reserved: new Set<string>(),
            };
            identifierPlans.set(resolved.root, identifierPlan);
          }
          const tabId = this.resolveElementId(
            resolved.tab,
            resolved.root,
            "accessibility-tool-registered-tab",
            identifierPlan.identifiers,
            identifierPlan.reserved,
            pairContext,
          );
          const panelId = this.resolveElementId(
            resolved.panel,
            resolved.root,
            "accessibility-tool-registered-panel",
            identifierPlan.identifiers,
            identifierPlan.reserved,
            pairContext,
          );
          if (!tabId || !panelId) {
            continue;
          }
          resolvedItems.push({ ...resolved, tabId, panelId });
          usedTabs.add(resolved.tab);
          usedPanels.add(resolved.panel);
          usedLists.add(resolved.list);
        }
      } catch (error) {
        this.warn(`registerTabs() 第 ${configIndex + 1} 项注册失败，已跳过。`, error);
      }
    }

    const itemsByList = new Map<HTMLElement, PreparedTabItem[]>();
    for (const item of resolvedItems) {
      const listItems = itemsByList.get(item.list);
      if (listItems) {
        listItems.push(item);
      } else {
        itemsByList.set(item.list, [item]);
      }
    }

    const config = this.callbacks.getConfig();
    for (const [list, listItems] of itemsByList) {
      const orderedItems = orderByDirectChildPosition(list, listItems);
      if (orderedItems.length === 0) {
        continue;
      }

      mutations.set(list, "role", "tablist");
      affectedElements.add(list);
      registeredLists.add(list);
      const selected =
        orderedItems.find(
          (item) => item.tab.getAttribute("aria-selected") === "true",
        ) ?? orderedItems[0];

      for (const item of orderedItems) {
        const active = item === selected;
        mutations.set(item.tab, "id", item.tabId);
        mutations.set(item.panel, "id", item.panelId);
        mutations.set(item.tab, "role", "tab");
        mutations.set(item.panel, "role", "tabpanel");
        mutations.set(item.tab, "tabindex", "0");
        mutations.set(item.tab, "aria-controls", item.panelId);
        mutations.set(item.panel, "aria-labelledby", item.tabId);
        mutations.set(item.tab, "aria-selected", String(active));
        mutations.set(item.panel, "aria-hidden", String(!active));
        mutations.set(item.tab, "data-a11y-region", String(item.source.region));
        mutations.set(item.panel, "data-a11y-region", String(item.source.region));
        mutations.set(
          item.tab,
          "data-a11y-activation",
          resolveTabActivation(
            item.source.activation,
            config.tabs.defaultActivation,
          ),
        );
        mutations.set(
          item.tab,
          "data-a11y-trigger-event",
          resolveTabTriggerEvents(
            item.source.triggerEvent,
            config.tabs.triggerEvents,
          ).join(" "),
        );
        if (!isNativeDialog(item.panel)) {
          if (active) {
            mutations.remove(item.panel, "data-a11y-hidden");
          } else {
            mutations.set(item.panel, "data-a11y-hidden", "");
          }
        }

        if (typeof item.source.label === "string") {
          mutations.set(item.tab, "data-a11y-label", item.source.label);
          mutations.set(item.panel, "data-a11y-label", item.source.label);
        } else if (item.source.label !== undefined) {
          this.warn("registerTabs() 的 label 必须是字符串，已忽略。");
        } else {
          const tabName = getAccessibleName(item.tab, {
            readingFallbacks: false,
          });
          if (tabName) {
            mutations.set(item.tab, "data-a11y-label", tabName);
            mutations.set(item.panel, "data-a11y-label", tabName);
          }
        }

        affectedElements.add(item.tab);
        affectedElements.add(item.panel);
        registeredTabs.add(item.tab);
        registeredPanels.add(item.panel);
      }
    }

    return this.addRecord(
      "tabs",
      mutations.toArray(),
      Array.from(affectedElements),
      Array.from(registeredTabs),
      Array.from(registeredPanels),
      Array.from(registeredLists),
    );
  }

  isRegisteredTab(element: HTMLElement): boolean {
    return (this.registeredTabCounts.get(element) ?? 0) > 0;
  }

  disposeAll(notify = true): void {
    if (this.records.size === 0) {
      return;
    }
    const tabElements = new Set<HTMLElement>();
    for (const record of this.records.values()) {
      for (const element of record.tabElements) {
        tabElements.add(element);
      }
    }
    if (notify && tabElements.size > 0) {
      this.callbacks.beforeTabChange(Array.from(tabElements));
    }
    this.records.clear();
    this.owners.clear();
    this.registeredTabCounts.clear();
    this.registeredPanelCounts.clear();
    this.registeredListCounts.clear();
    this.ledger.restore();
    if (notify) {
      this.callbacks.onChange();
    }
  }

  private resolveTabItems(
    item: TabRegistrationItem,
    context: string,
  ): ResolvedTabItem[] {
    if (!item || typeof item !== "object") {
      this.warn(`${context} 不是有效配置。`);
      return [];
    }
    if (!isRegionCode(item.region)) {
      this.warn(`${context} 的 region 无效：${String(item.region)}。`);
      return [];
    }
    const tabs = this.resolveHTMLElementTargets(item.tab, `${context} 的 tab`);
    const panels = this.resolveHTMLElementTargets(
      item.panel,
      `${context} 的 panel`,
    );
    if (tabs.length === 0 || tabs.length !== panels.length) {
      this.warn(
        `${context} 的 tab/panel 有效匹配数量必须相等且大于 0，当前为 ${tabs.length}/${panels.length}，整项已跳过。`,
      );
      return [];
    }

    const resolved: ResolvedTabItem[] = [];
    for (let index = 0; index < tabs.length; index += 1) {
      const tab = tabs[index];
      const panel = panels[index];
      if (!tab || !panel) {
        continue;
      }
      const pairContext = `${context} 的第 ${index + 1} 对`;
      if (tab === panel) {
        this.warn(`${pairContext} 的 tab 与 panel 不能是同一节点，已跳过该配对。`);
        continue;
      }
      const tabRoot = getRegistrationRoot(tab);
      const panelRoot = getRegistrationRoot(panel);
      if (!tabRoot || tabRoot !== panelRoot) {
        this.warn(
          `${pairContext} 的 tab 与 panel 必须位于同一 Document 或 ShadowRoot，已跳过该配对。`,
        );
        continue;
      }
      const list = tab.parentElement;
      if (!list || !isHTMLElement(list)) {
        this.warn(`${pairContext} 的 tab 没有有效的直接父节点，已跳过该配对。`);
        continue;
      }
      resolved.push({ source: item, tab, panel, root: tabRoot, list });
    }
    return resolved;
  }

  private resolveElementId(
    element: HTMLElement,
    root: Document | ShadowRoot,
    prefix: string,
    identifiers: Map<Element, string>,
    reserved: Set<string>,
    context: string,
  ): string | null {
    const planned = identifiers.get(element);
    if (planned) {
      return planned;
    }
    const current = element.getAttribute("id")?.trim();
    if (current) {
      if (findElementsById(root, current).length !== 1 || reserved.has(current)) {
        this.warn(`${context} 的现有 ID“${current}”不唯一，已跳过该项。`);
        return null;
      }
      identifiers.set(element, current);
      reserved.add(current);
      return current;
    }

    let generated = createUniqueId(prefix, root);
    while (reserved.has(generated)) {
      generated = createUniqueId(prefix, root);
    }
    identifiers.set(element, generated);
    reserved.add(generated);
    return generated;
  }

  private resolveHTMLElementTargets(
    target: DomTarget,
    context: string,
  ): HTMLElement[] {
    const matches = this.resolveTargets(target, context);
    const elements = matches.filter(isHTMLElement);
    if (elements.length !== matches.length) {
      this.warn(
        `${context} 匹配到 ${matches.length - elements.length} 个非 HTML 元素，已忽略。`,
      );
    }
    return elements;
  }

  private resolveTargets(target: DomTarget, context: string): Element[] {
    if (typeof target === "string") {
      let matches: Element[];
      try {
        matches = Array.from(document.querySelectorAll(target));
      } catch (error) {
        this.warn(`${context} 的 CSS 选择器无效：${target}`, error);
        return [];
      }
      if (matches.length === 0) {
        this.warn(`${context} 未匹配到节点：${target}`);
      }
      return matches.filter((element) => this.isValidTarget(element, context));
    }
    if (!isElement(target)) {
      this.warn(`${context} 的 target 必须是 CSS 选择器或 Element。`);
      return [];
    }
    return this.isValidTarget(target, context) ? [target] : [];
  }

  private isValidTarget(element: Element, context: string): boolean {
    if (!element.isConnected || !element.ownerDocument.defaultView) {
      this.warn(`${context} 指向的 Element 已断开或不属于有效文档，已跳过。`);
      return false;
    }
    return true;
  }

  private addRecord(
    kind: RegistrationRecord["kind"],
    mutations: readonly AttributeMutation[],
    tabElements: readonly HTMLElement[],
    registeredTabs: readonly HTMLElement[],
    registeredPanels: readonly HTMLElement[],
    registeredLists: readonly HTMLElement[],
  ): RegistrationHandle {
    if (mutations.length === 0) {
      return createNoopHandle();
    }
    const record: RegistrationRecord = {
      id: this.nextRegistrationId,
      kind,
      mutations,
      tabElements,
      registeredTabs,
      registeredPanels,
      registeredLists,
    };
    this.nextRegistrationId += 1;
    if (kind === "tabs") {
      this.callbacks.beforeTabChange(tabElements);
    }
    this.records.set(record.id, record);
    for (const tab of registeredTabs) {
      incrementCount(this.registeredTabCounts, tab);
    }
    for (const panel of registeredPanels) {
      incrementCount(this.registeredPanelCounts, panel);
    }
    for (const list of registeredLists) {
      incrementCount(this.registeredListCounts, list);
    }
    for (const mutation of mutations) {
      this.addOwner(record.id, mutation);
    }
    this.callbacks.onChange();

    let disposed = false;
    return {
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        this.disposeRecord(record.id);
      },
    };
  }

  private disposeRecord(registrationId: number): void {
    const record = this.records.get(registrationId);
    if (!record) {
      return;
    }
    if (record.kind === "tabs") {
      this.callbacks.beforeTabChange(record.tabElements);
    }
    this.records.delete(registrationId);
    for (const tab of record.registeredTabs) {
      decrementCount(this.registeredTabCounts, tab);
    }
    for (const panel of record.registeredPanels) {
      decrementCount(this.registeredPanelCounts, panel);
    }
    for (const list of record.registeredLists) {
      decrementCount(this.registeredListCounts, list);
    }
    for (const mutation of record.mutations) {
      this.removeOwner(registrationId, mutation.element, mutation.name);
    }
    this.callbacks.onChange();
  }

  private addOwner(
    registrationId: number,
    mutation: AttributeMutation,
  ): void {
    let attributes = this.owners.get(mutation.element);
    if (!attributes) {
      attributes = new Map<string, AttributeOwner[]>();
      this.owners.set(mutation.element, attributes);
    }
    let stack = attributes.get(mutation.name);
    if (!stack) {
      stack = [];
      attributes.set(mutation.name, stack);
    }
    stack.push({ registrationId, value: mutation.value });
    this.applyValue(mutation.element, mutation.name, mutation.value);
  }

  private removeOwner(
    registrationId: number,
    element: Element,
    name: string,
  ): void {
    const attributes = this.owners.get(element);
    const stack = attributes?.get(name);
    if (!attributes || !stack) {
      return;
    }
    const ownerIndex = stack.findIndex(
      (owner) => owner.registrationId === registrationId,
    );
    if (ownerIndex < 0) {
      return;
    }
    const wasCurrent = ownerIndex === stack.length - 1;
    stack.splice(ownerIndex, 1);
    if (wasCurrent) {
      const current = stack.at(-1);
      if (current) {
        this.applyValue(element, name, current.value);
      } else {
        this.ledger.restoreAttribute(element, name);
      }
    }
    if (stack.length === 0) {
      attributes.delete(name);
    }
    if (attributes.size === 0) {
      this.owners.delete(element);
    }
  }

  private applyValue(
    element: Element,
    name: string,
    value: string | null,
  ): void {
    if (value === null) {
      this.ledger.removeAttribute(element, name);
    } else {
      this.ledger.setAttribute(element, name, value);
    }
  }

  private warn(message: string, detail?: unknown): void {
    if (!this.callbacks.getConfig().debug) {
      return;
    }
    if (detail === undefined) {
      console.warn(`[AccessibilityTool] ${message}`);
    } else {
      console.warn(`[AccessibilityTool] ${message}`, detail);
    }
  }
}

function createNoopHandle(): RegistrationHandle {
  return { dispose: () => undefined };
}

function isRegionCode(value: unknown): value is RegionCode {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 6
  );
}

function isNativeDialog(element: HTMLElement): boolean {
  return element.tagName === "DIALOG";
}

function incrementCount(
  counts: Map<HTMLElement, number>,
  element: HTMLElement,
): void {
  counts.set(element, (counts.get(element) ?? 0) + 1);
}

function decrementCount(
  counts: Map<HTMLElement, number>,
  element: HTMLElement,
): void {
  const count = (counts.get(element) ?? 1) - 1;
  if (count <= 0) {
    counts.delete(element);
  } else {
    counts.set(element, count);
  }
}

function getRegistrationRoot(
  element: Element,
): Document | ShadowRoot | null {
  const root = element.getRootNode();
  if (root.nodeType === 9) {
    return root as Document;
  }
  return isShadowRoot(root) ? root : null;
}

function isShadowRoot(value: Node): value is ShadowRoot {
  return "host" in value && "mode" in value;
}

function findElementsById(
  root: Document | ShadowRoot,
  id: string,
): HTMLElement[] {
  return querySelectorAllSafe<HTMLElement>(root, "[id]").filter(
    (element) => element.id === id,
  );
}

function orderByDirectChildPosition<T extends ResolvedTabItem>(
  list: HTMLElement,
  items: readonly T[],
): T[] {
  const positions = new Map<Element, number>();
  Array.from(list.children).forEach((element, index) => {
    positions.set(element, index);
  });
  return [...items].sort(
    (left, right) =>
      (positions.get(left.tab) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(right.tab) ?? Number.MAX_SAFE_INTEGER),
  );
}
