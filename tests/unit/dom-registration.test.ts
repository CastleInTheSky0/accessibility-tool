import { describe, expect, it, vi } from "vitest";
import { AccessibilityToolRuntime } from "../../src/tool";
import type {
  RegionRegistrationConfig,
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

describe("DOM registration public API", () => {
  it("registers all region codes, supports both target forms and refreshes while open", async () => {
    document.body.innerHTML = `
      <section id="region-1" data-a11y-region="" data-a11y-label="原始名称"></section>
      <section id="region-2"></section>
      <section id="region-3"></section>
      <section id="region-4"></section>
      <section id="region-5"></section>
      <section id="region-6"></section>
      <section class="multi-region"></section>
      <section class="multi-region"></section>
      <section id="late-region"></section>
    `;
    const runtime = new AccessibilityToolRuntime();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    runtime.configure({
      debug: true,
      persistOpenState: false,
      speech: { adapter: speech },
      regions: { autoDetect: false, observe: false },
    });

    const invalid = {
      target: "#region-2",
      region: 7,
    } as unknown as RegionRegistrationConfig;
    const registration = runtime.registerRegions([
      { target: "#region-1", region: 1, label: "要闻" },
      { target: get("region-2"), region: 2 },
      { target: "#region-3", region: 3 },
      { target: "#region-4", region: 4 },
      { target: "#region-5", region: 5 },
      { target: "#region-6", region: 6 },
      { target: ".multi-region", region: 3 },
      invalid,
      { target: "#missing-region", region: 4 },
    ]);

    for (let code = 1; code <= 6; code += 1) {
      expect(get(`region-${code}`).getAttribute("data-a11y-region")).toBe(
        String(code),
      );
    }
    expect(
      Array.from(document.querySelectorAll(".multi-region")).map((element) =>
        element.getAttribute("data-a11y-region"),
      ),
    ).toEqual(["3", "3"]);
    expect(get("region-1").getAttribute("data-a11y-label")).toBe("要闻");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("region 无效：7"),
    );

    await runtime.open();
    expect(regionControl("viewport").getAttribute("aria-label")).toBe(
      "视窗区，共 1 个",
    );
    expect(regionControl("interaction").getAttribute("aria-label")).toBe(
      "交互区，共 3 个",
    );

    get("region-1").focus();
    await frame();
    expect(liveRegion().textContent).toBe(
      "提示：您已进入要闻视窗区，按下 Tab 键浏览信息；第 1 个，共 1 个",
    );

    const lateRegistration = runtime.registerRegions([
      { target: "#late-region", region: 4, label: "即时服务" },
    ]);
    expect(regionControl("service").getAttribute("aria-label")).toBe(
      "服务区，共 2 个",
    );
    lateRegistration.dispose();
    expect(regionControl("service").getAttribute("aria-label")).toBe(
      "服务区，共 1 个",
    );
    expect(get("late-region").hasAttribute("data-a11y-region")).toBe(false);

    await runtime.close();
    expect(get("region-1").getAttribute("data-a11y-region")).toBe("1");
    await runtime.open();
    expect(regionControl("viewport").getAttribute("aria-label")).toBe(
      "视窗区，共 1 个",
    );

    registration.dispose();
    expect(get("region-1").getAttribute("data-a11y-region")).toBe("");
    expect(get("region-1").getAttribute("data-a11y-label")).toBe("原始名称");
    expect(get("region-2").hasAttribute("data-a11y-region")).toBe(false);
    expect(() => registration.dispose()).not.toThrow();
    await runtime.destroy();
  });

  it("preserves later overlapping registrations and restores all attributes on destroy", async () => {
    document.body.innerHTML = `
      <section id="overlap" data-a11y-region="" data-a11y-label="原名"></section>
      <section id="destroyed"></section>
    `;
    const runtime = new AccessibilityToolRuntime();
    runtime.configure({
      persistOpenState: false,
      regions: { autoDetect: false, observe: false },
    });
    const first = runtime.registerRegions([
      { target: "#overlap", region: 1, label: "第一层" },
    ]);
    const second = runtime.registerRegions([
      { target: get("overlap"), region: 2, label: "第二层" },
    ]);

    first.dispose();
    expect(get("overlap").getAttribute("data-a11y-region")).toBe("2");
    expect(get("overlap").getAttribute("data-a11y-label")).toBe("第二层");
    second.dispose();
    expect(get("overlap").getAttribute("data-a11y-region")).toBe("");
    expect(get("overlap").getAttribute("data-a11y-label")).toBe("原名");

    const outstanding = runtime.registerRegions([
      { target: "#destroyed", region: 6, label: "待销毁" },
    ]);
    const detached = document.createElement("section");
    runtime.registerRegions([{ target: detached, region: 4 }]);
    expect(detached.hasAttribute("data-a11y-region")).toBe(false);
    expect(get("destroyed").getAttribute("data-a11y-region")).toBe("6");

    await runtime.destroy();
    expect(get("destroyed").hasAttribute("data-a11y-region")).toBe(false);
    expect(get("destroyed").hasAttribute("data-a11y-label")).toBe(false);
    expect(() => outstanding.dispose()).not.toThrow();
  });

  it("builds explicit tab semantics with shared names, defaults and reversible IDs", () => {
    document.body.innerHTML = `
      <div id="tab-list">
        <button id="existing-tab" role="" aria-selected="mixed">原始概览</button>
        <button data-test="generated-tab">政策</button>
      </div>
      <section id="existing-panel" aria-hidden=""></section>
      <section data-test="generated-panel" hidden></section>
    `;
    const runtime = new AccessibilityToolRuntime();
    runtime.configure({
      debug: true,
      persistOpenState: false,
      regions: { autoDetect: false, observe: false },
      tabs: {
        defaultActivation: "manual",
        triggerEvents: ["mouseover click", "click"],
      },
    });
    const generatedTab = query('[data-test="generated-tab"]');
    const generatedPanel = query('[data-test="generated-panel"]');

    const registration = runtime.registerTabs([
      {
        tab: "#existing-tab",
        panel: "#existing-panel",
        region: 1,
        label: "概览",
        activation: "automatic",
        triggerEvent: ["mouseover click", "mouseover"],
      },
      {
        tab: generatedTab,
        panel: generatedPanel,
        region: 1,
      },
    ]);

    const list = get("tab-list");
    const firstTab = get("existing-tab");
    const secondTab = generatedTab;
    const firstPanel = get("existing-panel");
    const secondPanel = generatedPanel;
    const generatedTabId = secondTab.id;
    const generatedPanelId = secondPanel.id;

    expect(list.getAttribute("role")).toBe("tablist");
    expect(firstTab.getAttribute("role")).toBe("tab");
    expect(firstPanel.getAttribute("role")).toBe("tabpanel");
    expect(firstTab.id).toBe("existing-tab");
    expect(firstPanel.id).toBe("existing-panel");
    expect(generatedTabId).toMatch(/^accessibility-tool-registered-tab-/);
    expect(generatedPanelId).toMatch(/^accessibility-tool-registered-panel-/);
    expect(generatedTabId).not.toBe(generatedPanelId);
    expect(firstTab.getAttribute("aria-controls")).toBe("existing-panel");
    expect(firstPanel.getAttribute("aria-labelledby")).toBe("existing-tab");
    expect(secondTab.getAttribute("aria-controls")).toBe(generatedPanelId);
    expect(secondPanel.getAttribute("aria-labelledby")).toBe(generatedTabId);
    expect(firstTab.getAttribute("aria-selected")).toBe("true");
    expect(secondTab.getAttribute("aria-selected")).toBe("false");
    expect(firstPanel.getAttribute("aria-hidden")).toBe("false");
    expect(secondPanel.getAttribute("aria-hidden")).toBe("true");
    expect(firstPanel.hasAttribute("data-a11y-hidden")).toBe(false);
    expect(secondPanel.getAttribute("data-a11y-hidden")).toBe("");
    expect(secondPanel.hasAttribute("hidden")).toBe(true);
    expect(firstTab.getAttribute("data-a11y-region")).toBe("1");
    expect(firstPanel.getAttribute("data-a11y-region")).toBe("1");
    expect(firstTab.getAttribute("data-a11y-label")).toBe("概览");
    expect(firstPanel.getAttribute("data-a11y-label")).toBe("概览");
    expect(secondPanel.getAttribute("data-a11y-label")).toBe("政策");
    expect(firstTab.getAttribute("data-a11y-activation")).toBe("automatic");
    expect(firstTab.getAttribute("data-a11y-trigger-event")).toBe(
      "mouseover click",
    );
    expect(secondTab.getAttribute("data-a11y-activation")).toBe("manual");
    expect(secondTab.getAttribute("data-a11y-trigger-event")).toBe(
      "mouseover click",
    );
    expect(list.hasAttribute("data-a11y-activation")).toBe(false);
    expect(list.hasAttribute("data-a11y-trigger-event")).toBe(false);

    registration.dispose();
    expect(list.hasAttribute("role")).toBe(false);
    expect(firstTab.getAttribute("role")).toBe("");
    expect(firstTab.getAttribute("aria-selected")).toBe("mixed");
    expect(firstPanel.getAttribute("aria-hidden")).toBe("");
    expect(secondTab.hasAttribute("id")).toBe(false);
    expect(secondPanel.hasAttribute("id")).toBe(false);
    expect(secondPanel.hasAttribute("hidden")).toBe(true);
    expect(secondPanel.hasAttribute("data-a11y-hidden")).toBe(false);
    expect(() => registration.dispose()).not.toThrow();
  });

  it("pairs selector matches by DOM order, skips count mismatches and splits direct-parent tablists", () => {
    document.body.innerHTML = `
      <div id="valid-parent">
        <button id="valid-tab">有效选项</button>
      </div>
      <section id="valid-panel"></section>
      <button class="duplicate-tab">重复一</button>
      <button class="duplicate-tab">重复二</button>
      <section id="duplicate-panel"></section>
      <div id="split-list-a">
        <button class="split-tab">A1</button>
        <button class="split-tab">A2</button>
      </div>
      <div id="split-list-b">
        <button class="split-tab">B1</button>
        <button class="split-tab">B2</button>
      </div>
      <section class="split-panel">面板 A1</section>
      <section class="split-panel">面板 A2</section>
      <section class="split-panel">面板 B1</section>
      <section class="split-panel">面板 B2</section>
    `;
    const runtime = new AccessibilityToolRuntime();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    runtime.configure({ debug: true, persistOpenState: false });

    const registration = runtime.registerTabs([
      {
        tab: ".duplicate-tab",
        panel: "#duplicate-panel",
        region: 1,
      },
      {
        tab: "#valid-tab",
        panel: "#valid-panel",
        region: 2,
      },
      {
        tab: ".split-tab",
        panel: ".split-panel",
        region: 3,
      },
    ]);

    expect(get("valid-parent").getAttribute("role")).toBe("tablist");
    expect(get("valid-tab").getAttribute("role")).toBe("tab");
    expect(get("valid-panel").getAttribute("role")).toBe("tabpanel");
    expect(get("split-list-a").getAttribute("role")).toBe("tablist");
    expect(get("split-list-b").getAttribute("role")).toBe("tablist");
    const splitTabs = Array.from(
      document.querySelectorAll<HTMLElement>(".split-tab"),
    );
    const splitPanels = Array.from(
      document.querySelectorAll<HTMLElement>(".split-panel"),
    );
    expect(splitTabs.map((tab) => tab.getAttribute("role"))).toEqual([
      "tab",
      "tab",
      "tab",
      "tab",
    ]);
    expect(splitPanels.map((panel) => panel.getAttribute("role"))).toEqual([
      "tabpanel",
      "tabpanel",
      "tabpanel",
      "tabpanel",
    ]);
    expect(
      splitTabs.map((tab) => tab.getAttribute("aria-selected")),
    ).toEqual(["true", "false", "true", "false"]);
    expect(
      splitTabs.map((tab) => tab.getAttribute("aria-controls")),
    ).toEqual(splitPanels.map((panel) => panel.id));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("当前为 2/1，整项已跳过"),
    );

    registration.dispose();
  });

  it("registers repeated class-based components as independent tab groups with one config", async () => {
    document.body.innerHTML = `
      <div class="view" data-view="news">
        <div class="shared-tab-list">
          <button class="shared-tab">要闻动态</button>
          <button class="shared-tab">今日常山</button>
        </div>
        <section class="shared-panel">要闻动态内容</section>
        <section class="shared-panel">今日常山内容</section>
      </div>
      <div class="view" data-view="policy">
        <div class="shared-tab-list">
          <button class="shared-tab">政策文件</button>
          <button class="shared-tab">政策解读</button>
        </div>
        <section class="shared-panel">政策文件内容</section>
        <section class="shared-panel">政策解读内容</section>
      </div>
    `;
    const runtime = new AccessibilityToolRuntime();
    runtime.configure({
      persistOpenState: false,
      regions: { autoDetect: false, observe: false },
    });
    const views = Array.from(
      document.querySelectorAll<HTMLElement>(".view"),
    );
    const hostEventCounts = [0, 0];
    for (const [viewIndex, view] of views.entries()) {
      const tabs = Array.from(
        view.querySelectorAll<HTMLElement>(".shared-tab"),
      );
      const panels = Array.from(
        view.querySelectorAll<HTMLElement>(".shared-panel"),
      );
      tabs.forEach((tab, tabIndex) => {
        tab.addEventListener("click", () => {
          hostEventCounts[viewIndex] = (hostEventCounts[viewIndex] ?? 0) + 1;
          panels.forEach((panel, panelIndex) => {
            panel.toggleAttribute("data-a11y-hidden", panelIndex !== tabIndex);
          });
        });
      });
    }

    const registration = runtime.registerTabs([
      {
        tab: ".shared-tab",
        panel: ".shared-panel",
        region: 1,
      },
    ]);
    await runtime.open();

    const lists = Array.from(
      document.querySelectorAll<HTMLElement>(".shared-tab-list"),
    );
    const tabs = Array.from(
      document.querySelectorAll<HTMLElement>(".shared-tab"),
    );
    const panels = Array.from(
      document.querySelectorAll<HTMLElement>(".shared-panel"),
    );
    expect(lists.map((list) => list.getAttribute("role"))).toEqual([
      "tablist",
      "tablist",
    ]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "true",
      "false",
    ]);
    expect(tabs.map((tab) => tab.getAttribute("aria-controls"))).toEqual(
      panels.map((panel) => panel.id),
    );

    tabs[0]?.focus();
    tabs[0]?.dispatchEvent(key("ArrowRight"));
    await frame();

    expect(document.activeElement).toBe(tabs[1]);
    expect(hostEventCounts).toEqual([1, 0]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "true",
      "false",
    ]);
    expect(panels.map((panel) => panel.getAttribute("aria-hidden"))).toEqual([
      "true",
      "false",
      "false",
      "true",
    ]);

    registration.dispose();
    expect(lists.every((list) => !list.hasAttribute("role"))).toBe(true);
    await runtime.destroy();
  });

  it("uses direct-child DOM order across configs and isolates duplicate-ID and inferred-list conflicts", () => {
    document.body.innerHTML = `
      <div id="ordered-list">
        <button id="ordered-first">第一项</button>
        <button id="ordered-second">第二项</button>
      </div>
      <section id="ordered-first-panel"></section>
      <section id="ordered-second-panel"></section>
      <div id="duplicate-list">
        <button id="duplicate-id">重复 ID 选项</button>
      </div>
      <span id="duplicate-id"></span>
      <section id="duplicate-panel"></section>
      <div id="self-panel">
        <button id="self-tab">父级也是面板</button>
      </div>
      <div id="outer-list">
        <button id="outer-tab">外层选项</button>
      </div>
      <section id="outer-panel">
        <button id="nested-tab">嵌套选项</button>
      </section>
      <section id="nested-panel"></section>
    `;
    const runtime = new AccessibilityToolRuntime();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    runtime.configure({ debug: true, persistOpenState: false });

    const registration = runtime.registerTabs([
      {
        tab: "#ordered-second",
        panel: "#ordered-second-panel",
        region: 1,
      },
      {
        tab: "#ordered-first",
        panel: "#ordered-first-panel",
        region: 1,
      },
      {
        tab: get("duplicate-id"),
        panel: "#duplicate-panel",
        region: 2,
      },
      {
        tab: "#self-tab",
        panel: "#self-panel",
        region: 3,
      },
      {
        tab: "#outer-tab",
        panel: "#outer-panel",
        region: 4,
      },
      {
        tab: "#nested-tab",
        panel: "#nested-panel",
        region: 5,
      },
    ]);

    expect(get("ordered-first").getAttribute("aria-selected")).toBe("true");
    expect(get("ordered-second").getAttribute("aria-selected")).toBe("false");
    expect(get("duplicate-list").hasAttribute("role")).toBe(false);
    expect(get("duplicate-id").hasAttribute("role")).toBe(false);
    expect(get("self-panel").hasAttribute("role")).toBe(false);
    expect(get("self-tab").hasAttribute("role")).toBe(false);
    expect(get("outer-list").getAttribute("role")).toBe("tablist");
    expect(get("outer-panel").getAttribute("role")).toBe("tabpanel");
    expect(get("nested-tab").hasAttribute("role")).toBe(false);
    expect(get("nested-panel").hasAttribute("role")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("现有 ID“duplicate-id”不唯一"),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("自动推断的 tablist 与 tab/panel 角色冲突"),
    );

    registration.dispose();
  });

  it("rejects cross-role reuse from a live registration without disturbing the first handle", () => {
    document.body.innerHTML = `
      <div id="first-list"><button id="first-tab">第一组</button></div>
      <div id="second-list"><section id="shared-panel"></section></div>
      <section id="second-panel"></section>
    `;
    const runtime = new AccessibilityToolRuntime();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    runtime.configure({ debug: true, persistOpenState: false });
    const first = runtime.registerTabs([
      { tab: "#first-tab", panel: "#shared-panel", region: 1 },
    ]);
    const conflicting = runtime.registerTabs([
      { tab: "#shared-panel", panel: "#second-panel", region: 2 },
    ]);

    expect(get("first-list").getAttribute("role")).toBe("tablist");
    expect(get("first-tab").getAttribute("role")).toBe("tab");
    expect(get("shared-panel").getAttribute("role")).toBe("tabpanel");
    expect(get("second-list").hasAttribute("role")).toBe(false);
    expect(get("second-panel").hasAttribute("role")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("tab 存在重复或跨角色使用"),
    );

    conflicting.dispose();
    expect(get("shared-panel").getAttribute("role")).toBe("tabpanel");
    first.dispose();
    expect(get("shared-panel").hasAttribute("role")).toBe(false);
  });

  it("restores controller-owned sibling state when overlapping handles share one inferred list", async () => {
    document.body.innerHTML = `
      <div id="shared-list">
        <button id="shared-tab-b">后注册项</button>
        <button id="shared-tab-a">先注册项</button>
      </div>
      <section id="shared-panel-b"></section>
      <section id="shared-panel-a"></section>
    `;
    const runtime = new AccessibilityToolRuntime();
    runtime.configure({
      persistOpenState: false,
      regions: { autoDetect: false, observe: false },
    });
    const first = runtime.registerTabs([
      { tab: "#shared-tab-a", panel: "#shared-panel-a", region: 1 },
    ]);
    await runtime.open();
    const second = runtime.registerTabs([
      { tab: "#shared-tab-b", panel: "#shared-panel-b", region: 1 },
    ]);

    expect(get("shared-tab-a").getAttribute("aria-selected")).toBe("false");
    expect(get("shared-tab-b").getAttribute("aria-selected")).toBe("true");

    runtime.configure({ tabs: { enabled: false } });
    second.dispose();
    expect(get("shared-list").getAttribute("role")).toBe("tablist");
    expect(get("shared-tab-a").getAttribute("role")).toBe("tab");
    expect(get("shared-tab-a").getAttribute("aria-selected")).toBe("true");
    expect(get("shared-tab-b").hasAttribute("role")).toBe(false);

    first.dispose();
    expect(get("shared-list").hasAttribute("role")).toBe(false);
    await runtime.destroy();
  });

  it("connects registered tabs to existing keyboard, event, panel and region behavior", async () => {
    document.body.innerHTML = `
      <style>[role="tabpanel"][data-a11y-hidden] { display: none; }</style>
      <div id="runtime-list">
        <button id="runtime-tab-a" class="runtime-tab">概览</button>
        <button id="runtime-tab-b" class="runtime-tab">政策</button>
      </div>
      <section id="runtime-panel-a" class="runtime-panel"><a href="#a">详情 A</a></section>
      <section id="runtime-panel-b" class="runtime-panel"><a href="#b">详情 B</a></section>
    `;
    const runtime = new AccessibilityToolRuntime();
    runtime.configure({
      debug: true,
      persistOpenState: false,
      speech: { adapter: speech },
      regions: { autoDetect: false, observe: false },
      tabs: { panelReadyTimeoutMs: 100 },
    });
    const tabA = get("runtime-tab-a");
    const tabB = get("runtime-tab-b");
    const panelA = get("runtime-panel-a");
    const panelB = get("runtime-panel-b");
    const hostEvent = vi.fn((event: Event) => {
      const selected = event.currentTarget;
      panelA.toggleAttribute("data-a11y-hidden", selected !== tabA);
      panelB.toggleAttribute("data-a11y-hidden", selected !== tabB);
    });
    tabA.addEventListener("click", hostEvent);
    tabB.addEventListener("click", hostEvent);
    const registration = runtime.registerTabs([
      {
        tab: ".runtime-tab",
        panel: ".runtime-panel",
        region: 1,
      },
    ]);

    await runtime.open();
    expect(regionControl("viewport").getAttribute("aria-label")).toBe(
      "视窗区，共 2 个",
    );
    tabA.focus();
    await frame();
    expect(liveRegion().textContent).toBe(
      "Tab，概览，视窗区，当前有浮动窗口，按 ALT+下键进入窗口",
    );
    tabA.dispatchEvent(key("Tab"));
    tabB.focus();
    await frame();
    expect(hostEvent).toHaveBeenCalledTimes(1);
    expect(tabB.getAttribute("aria-selected")).toBe("true");
    expect(panelB.hasAttribute("data-a11y-hidden")).toBe(false);

    tabB.dispatchEvent(key("ArrowDown", { altKey: true }));
    await frame();
    expect(document.activeElement).toBe(panelB);
    expect(liveRegion().textContent).toBe(
      "您已进入政策视窗区标签面板，按 Tab 键遍历信息，按 Esc 键退出面板并返回政策选项",
    );
    panelB.dispatchEvent(key("Escape"));
    await frame();
    expect(document.activeElement).toBe(tabB);
    expect(liveRegion().textContent).toBe("已返回政策选项");

    registration.dispose();
    expect(get("runtime-list").hasAttribute("role")).toBe(false);
    expect(tabA.hasAttribute("role")).toBe(false);
    expect(panelA.hasAttribute("role")).toBe(false);
    expect(tabA.hasAttribute("id")).toBe(true);
    expect(panelA.hasAttribute("id")).toBe(true);
    expect(regionControl("viewport").getAttribute("aria-label")).toBe(
      "视窗区，共 0 个",
    );

    await runtime.destroy();
  });

  it("automatically restores outstanding tab registrations during destroy", async () => {
    document.body.innerHTML = `
      <div id="destroy-list"><button id="destroy-tab">销毁选项</button></div>
      <section id="destroy-panel"></section>
    `;
    const runtime = new AccessibilityToolRuntime();
    runtime.configure({
      persistOpenState: false,
      regions: { autoDetect: false, observe: false },
    });
    runtime.registerTabs([
      {
        tab: "#destroy-tab",
        panel: "#destroy-panel",
        region: 6,
      },
    ]);
    await runtime.open();
    expect(get("destroy-tab").getAttribute("role")).toBe("tab");

    await runtime.destroy();
    expect(get("destroy-list").hasAttribute("role")).toBe(false);
    expect(get("destroy-tab").hasAttribute("role")).toBe(false);
    expect(get("destroy-panel").hasAttribute("role")).toBe(false);
    expect(get("destroy-tab").hasAttribute("aria-controls")).toBe(false);
    expect(get("destroy-panel").hasAttribute("aria-labelledby")).toBe(false);
    expect(get("destroy-tab").hasAttribute("data-a11y-region")).toBe(false);
    expect(get("destroy-panel").hasAttribute("data-a11y-region")).toBe(false);
  });

  it("keeps native dialog visibility state and cancels stale tab callbacks after disposal", async () => {
    document.body.innerHTML = `
      <div id="dialog-list">
        <button id="dialog-tab-a">普通内容</button>
        <button id="dialog-tab-b">原生窗口</button>
      </div>
      <section id="dialog-panel-a"></section>
      <dialog id="dialog-panel-b" hidden data-a11y-hidden="host-owned"></dialog>
    `;
    const runtime = new AccessibilityToolRuntime();
    runtime.configure({
      persistOpenState: false,
      regions: { autoDetect: false, observe: false },
    });
    const registration = runtime.registerTabs([
      {
        tab: "#dialog-tab-a, #dialog-tab-b",
        panel: "#dialog-panel-a, #dialog-panel-b",
        region: 1,
      },
    ]);
    const dialog = get("dialog-panel-b");

    expect(dialog.getAttribute("data-a11y-hidden")).toBe("host-owned");
    expect(dialog.hasAttribute("hidden")).toBe(true);
    await runtime.open();
    get("dialog-tab-b").click();
    registration.dispose();
    await frame();

    expect(get("dialog-list").hasAttribute("role")).toBe(false);
    expect(get("dialog-tab-a").hasAttribute("aria-selected")).toBe(false);
    expect(get("dialog-tab-b").hasAttribute("aria-selected")).toBe(false);
    expect(dialog.hasAttribute("aria-hidden")).toBe(false);
    expect(dialog.getAttribute("data-a11y-hidden")).toBe("host-owned");
    expect(dialog.hasAttribute("hidden")).toBe(true);

    await runtime.destroy();
  });
});

function get(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}

function query(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing ${selector}`);
  }
  return element;
}

function regionControl(type: string): HTMLElement {
  const control = document
    .querySelector<HTMLElement>("[data-a11y-tool-host]")
    ?.shadowRoot?.querySelector<HTMLElement>(`[data-action="region:${type}"]`);
  if (!control) {
    throw new Error(`Missing region control: ${type}`);
  }
  return control;
}

function liveRegion(): HTMLElement {
  const element = document
    .querySelector<HTMLElement>("[data-a11y-tool-host]")
    ?.shadowRoot?.querySelector<HTMLElement>('[role="status"]');
  if (!element) {
    throw new Error("Missing live region");
  }
  return element;
}

function key(value: string, options: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: value,
    bubbles: true,
    cancelable: true,
    ...options,
  });
}

async function frame(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25));
}
