import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/core/config";
import { RegionNavigationController } from "../../src/features/region-navigation";
import type { ScannedRegion } from "../../src/features/regions";
import {
  formatPanelEntryAnnouncement,
  formatPanelReturnAnnouncement,
  formatTabFocusAnnouncement,
  TabsController,
} from "../../src/features/tabs";

describe("TabsController", () => {
  it("formats the confirmed tab, panel and return announcements exactly", () => {
    expect(formatTabFocusAnnouncement("概览", "content", false)).toBe(
      "Tab，概览，正文区，当前有浮动窗口，按 ALT+下键进入窗口",
    );
    expect(formatTabFocusAnnouncement("帮助", "navigation", true)).toBe(
      "链接：帮助，Tab，导航区，当前有浮动窗口，按 ALT+下键进入窗口",
    );
    expect(formatTabFocusAnnouncement("概览", null, false)).toBe(
      "Tab，概览，当前有浮动窗口，按 ALT+下键进入窗口",
    );
    expect(formatTabFocusAnnouncement("帮助", null, true)).toBe(
      "链接：帮助，Tab，当前有浮动窗口，按 ALT+下键进入窗口",
    );
    expect(formatPanelEntryAnnouncement("概览", "content", true)).toBe(
      "您已进入概览正文区标签面板，按 Tab 键遍历信息，按 Esc 键退出面板并返回概览选项",
    );
    expect(formatPanelEntryAnnouncement("概览", null, false)).toBe(
      "您已进入概览标签面板，当前面板暂无可通过 Tab 遍历的信息，按 Esc 键退出面板并返回概览选项",
    );
    expect(formatPanelReturnAnnouncement("概览")).toBe("已返回概览选项");
  });

  it("announces every valid focused option once without selection state", () => {
    document.body.innerHTML = `
      <div role="tablist">
        <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true" data-a11y-label="概览" aria-label="其它名称">可见名称</button>
        <a id="tab-b" role="tab" href="#help" aria-controls="panel-b" aria-selected="false">帮助</a>
      </div>
      <section id="panel-a" role="tabpanel">A</section>
      <section id="panel-b" role="tabpanel">B</section>
    `;
    const announce = vi.fn();
    const controller = new TabsController(mergeConfig(DEFAULT_CONFIG), {
      onAnnounce: announce,
      onError: vi.fn(),
      getRegionType: (element) =>
        element.id === "tab-a" ? "content" : "navigation",
    });
    controller.start([document]);

    get("tab-a").focus();
    get("tab-b").focus();
    get("tab-a").focus();

    expect(announce.mock.calls).toEqual([
      ["Tab，概览，正文区，当前有浮动窗口，按 ALT+下键进入窗口"],
      ["链接：帮助，Tab，导航区，当前有浮动窗口，按 ALT+下键进入窗口"],
      ["Tab，概览，正文区，当前有浮动窗口，按 ALT+下键进入窗口"],
    ]);
    controller.stop();
  });

  it("announces panel entry and Escape return once while preserving descendants", async () => {
    document.body.innerHTML = `
      <div role="tablist">
        <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true">概览</button>
      </div>
      <section id="panel-a" role="tabpanel"><a id="panel-link" href="#details">详情</a></section>
    `;
    const announce = vi.fn();
    const controller = new TabsController(mergeConfig(DEFAULT_CONFIG), {
      onAnnounce: announce,
      onError: vi.fn(),
      getRegionType: () => "content",
    });
    controller.start([document]);
    const tab = get("tab-a");
    const panel = get("panel-a");

    tab.focus();
    announce.mockClear();
    tab.dispatchEvent(key("ArrowDown", { altKey: true }));
    await frame();

    expect(document.activeElement).toBe(panel);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith(
      "您已进入概览正文区标签面板，按 Tab 键遍历信息，按 Esc 键退出面板并返回概览选项",
    );
    expect(get("panel-link").hasAttribute("tabindex")).toBe(false);

    announce.mockClear();
    panel.dispatchEvent(key("Escape"));
    await frame();

    expect(document.activeElement).toBe(tab);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("已返回概览选项");
    controller.stop();
  });

  it("uses the empty-panel message without making static content tabbable", async () => {
    document.body.innerHTML = `
      <div role="tablist">
        <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true">说明</button>
      </div>
      <section id="panel-a" role="tabpanel"><p id="static-copy">静态说明</p></section>
    `;
    const announce = vi.fn();
    const controller = new TabsController(mergeConfig(DEFAULT_CONFIG), {
      onAnnounce: announce,
      onError: vi.fn(),
      getRegionType: () => "service",
    });
    controller.start([document]);
    const tab = get("tab-a");
    tab.focus();
    announce.mockClear();

    tab.dispatchEvent(key("ArrowDown", { altKey: true }));
    await frame();

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(
      "您已进入说明服务区标签面板，当前面板暂无可通过 Tab 遍历的信息，按 Esc 键退出面板并返回说明选项",
    );
    expect(get("static-copy").hasAttribute("tabindex")).toBe(false);
    controller.stop();
  });

  it("uses real scanned region types across DOM, open Shadow Root and iframe roots", () => {
    document.body.innerHTML = `
      <section id="dom-region">
        <section id="dom-inner-region">
          <div role="tablist"><button id="dom-tab" role="tab" aria-controls="dom-panel">普通选项</button></div>
          <section id="dom-panel" role="tabpanel">普通面板</section>
        </section>
      </section>
      <section id="shadow-region"><div id="shadow-host"></div></section>
      <section id="frame-region"><iframe id="frame"></iframe></section>
    `;
    const shadowHost = get("shadow-host");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `
      <section id="shadow-inner-region">
        <div role="tablist"><button id="shadow-tab" role="tab" aria-controls="shadow-panel">影子选项</button></div>
        <section id="shadow-panel" role="tabpanel">影子面板</section>
      </section>
    `;
    const frame = get("frame") as HTMLIFrameElement;
    const frameDocument = frame.contentDocument;
    if (!frameDocument) {
      throw new Error("Missing iframe document");
    }
    frameDocument.body.innerHTML = `
      <section id="frame-inner-region">
        <div role="tablist"><button id="frame-tab" role="tab" aria-controls="frame-panel">框架选项</button></div>
        <section id="frame-panel" role="tabpanel">框架面板</section>
      </section>
    `;

    const effects = {
      setRegionHighlight: vi.fn(),
      clearRegionHighlight: vi.fn(),
    };
    const regionNavigation = new RegionNavigationController(effects, {
      getToolbarOffset: () => 102,
      onCountsChange: vi.fn(),
      onAnnounce: vi.fn(),
      onRegionChange: vi.fn(),
      onReturnToCategory: vi.fn(),
      onDynamicUpdate: vi.fn(),
    });
    const regions: ScannedRegion[] = [
      {
        type: "navigation",
        element: get("dom-inner-region"),
        label: "普通内层区域",
        source: "data",
      },
      {
        type: "content",
        element: get("dom-region"),
        label: "普通外层区域",
        source: "data",
      },
      {
        type: "content",
        element: get("shadow-region"),
        label: "影子外层区域",
        source: "data",
      },
      {
        type: "service",
        element: getFromRoot(shadowRoot, "shadow-inner-region"),
        label: "影子内层区域",
        source: "data",
      },
      {
        type: "content",
        element: get("frame-region"),
        label: "框架外层区域",
        source: "data",
      },
      {
        type: "list",
        element: getFromRoot(frameDocument, "frame-inner-region"),
        label: "框架内层区域",
        source: "data",
      },
    ];
    const roots = [document, shadowRoot, frameDocument] as const;
    regionNavigation.start();
    regionNavigation.update(regions, roots, "initial");

    const announce = vi.fn();
    const tabs = new TabsController(mergeConfig(DEFAULT_CONFIG), {
      onAnnounce: announce,
      onError: vi.fn(),
      getRegionType: (element) =>
        regionNavigation.getContainingRegionType(element),
    });
    tabs.start(roots);

    get("dom-tab").focus();
    getFromRoot(shadowRoot, "shadow-tab").focus();
    getFromRoot(frameDocument, "frame-tab").focus();

    expect(announce.mock.calls).toEqual([
      ["Tab，普通选项，导航区，当前有浮动窗口，按 ALT+下键进入窗口"],
      ["Tab，影子选项，服务区，当前有浮动窗口，按 ALT+下键进入窗口"],
      ["Tab，框架选项，列表区，当前有浮动窗口，按 ALT+下键进入窗口"],
    ]);
    tabs.stop();
    regionNavigation.stop();
  });

  it("keeps options tabbable, triggers original events and enters panels", async () => {
    document.body.innerHTML = `
      <style>[role="tabpanel"][data-a11y-hidden] { display: none; }</style>
      <div role="tablist" aria-label="示例">
        <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true">A</button>
        <button id="tab-b" role="tab" aria-controls="panel-b" aria-selected="false">B</button>
      </div>
      <section id="panel-a" role="tabpanel">A panel</section>
      <section id="panel-b" role="tabpanel" data-a11y-hidden>B panel</section>
    `;
    const list = document.querySelector<HTMLElement>('[role="tablist"]');
    const tabA = get("tab-a");
    const tabB = get("tab-b");
    const panelA = get("panel-a");
    const panelB = get("panel-b");
    const clickListener = vi.fn((event: Event) => {
      const tab = event.target as HTMLElement;
      panelA.toggleAttribute("data-a11y-hidden", tab !== tabA);
      panelB.toggleAttribute("data-a11y-hidden", tab !== tabB);
    });
    list?.addEventListener("click", clickListener);

    const announce = vi.fn();
    const controller = new TabsController(
      mergeConfig(DEFAULT_CONFIG, { tabs: { panelReadyTimeoutMs: 100 } }),
      { onAnnounce: announce, onError: vi.fn(), getRegionType: () => null },
    );
    controller.start([document]);

    expect(tabA.tabIndex).toBe(0);
    expect(tabB.tabIndex).toBe(0);

    tabA.focus();
    tabA.dispatchEvent(key("ArrowRight"));
    await frame();
    expect(document.activeElement).toBe(tabB);
    expect(clickListener).toHaveBeenCalledTimes(1);
    expect(tabB.getAttribute("aria-selected")).toBe("true");
    expect(panelB.hasAttribute("data-a11y-hidden")).toBe(false);
    expect(panelB.hasAttribute("hidden")).toBe(false);
    expect(panelB.getAttribute("aria-hidden")).toBe("false");
    expect(panelA.getAttribute("aria-hidden")).toBe("true");
    expect(
      document.querySelectorAll('[role="tabpanel"][hidden]'),
    ).toHaveLength(0);

    tabB.dispatchEvent(key("ArrowDown", { altKey: true }));
    await frame();
    expect(document.activeElement).toBe(panelB);
    panelB.dispatchEvent(key("Escape"));
    await frame();
    expect(document.activeElement).toBe(tabB);

    controller.stop();
    expect(tabA.hasAttribute("tabindex")).toBe(false);
    expect(tabB.hasAttribute("tabindex")).toBe(false);
  });

  it("keeps every option in Tab order and auto-activates keyboard Tab focus", async () => {
    document.body.innerHTML = `
      <style>[role="tabpanel"][data-a11y-hidden] { display: none; }</style>
      <div role="tablist" aria-label="顺序切换">
        <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true">A</button>
        <button id="tab-b" role="tab" aria-controls="panel-b" aria-selected="false">B</button>
      </div>
      <section id="panel-a" role="tabpanel">A panel</section>
      <section id="panel-b" role="tabpanel" data-a11y-hidden>B panel</section>
    `;
    const tabA = get("tab-a");
    const tabB = get("tab-b");
    const panelA = get("panel-a");
    const panelB = get("panel-b");
    const clickListener = vi.fn((event: Event) => {
      panelA.toggleAttribute("data-a11y-hidden", event.target !== tabA);
      panelB.toggleAttribute("data-a11y-hidden", event.target !== tabB);
    });
    tabB.addEventListener("click", clickListener);
    const controller = new TabsController(mergeConfig(DEFAULT_CONFIG), {
      onAnnounce: vi.fn(),
      onError: vi.fn(),
      getRegionType: () => null,
    });
    controller.start([document]);

    expect(tabA.getAttribute("tabindex")).toBe("0");
    expect(tabB.getAttribute("tabindex")).toBe("0");
    tabA.focus();
    tabA.dispatchEvent(key("Tab"));
    tabB.focus();
    await frame();

    expect(document.activeElement).toBe(tabB);
    expect(tabB.getAttribute("aria-selected")).toBe("true");
    expect(panelB.hasAttribute("data-a11y-hidden")).toBe(false);
    expect(panelB.hasAttribute("hidden")).toBe(false);
    expect(panelB.getAttribute("aria-hidden")).toBe("false");
    expect(panelA.getAttribute("aria-hidden")).toBe("true");
    expect(
      document.querySelectorAll('[role="tabpanel"][hidden]'),
    ).toHaveLength(0);
    expect(clickListener).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it("synchronizes ARIA state without taking ownership of host panel visibility", async () => {
    document.body.innerHTML = `
      <style>[role="tabpanel"][data-a11y-hidden] { display: none; }</style>
      <div role="tablist" aria-label="宿主显隐职责">
        <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true">A</button>
        <button id="tab-b" role="tab" aria-controls="panel-b" aria-selected="false">B</button>
      </div>
      <section id="panel-a" role="tabpanel">A panel</section>
      <section id="panel-b" role="tabpanel" data-a11y-hidden>B panel</section>
    `;
    const tabA = get("tab-a");
    const tabB = get("tab-b");
    const panelA = get("panel-a");
    const panelB = get("panel-b");
    const hostEvent = vi.fn();
    tabB.addEventListener("host-activate", hostEvent);

    const controller = new TabsController(
      mergeConfig(DEFAULT_CONFIG, {
        tabs: { triggerEvents: ["host-activate"] },
      }),
      { onAnnounce: vi.fn(), onError: vi.fn(), getRegionType: () => null },
    );
    controller.start([document]);

    tabA.focus();
    tabA.dispatchEvent(key("ArrowRight"));
    await frame();

    expect(hostEvent).toHaveBeenCalledTimes(1);
    expect(tabB.getAttribute("aria-selected")).toBe("true");
    expect(panelA.getAttribute("aria-hidden")).toBe("true");
    expect(panelB.getAttribute("aria-hidden")).toBe("false");
    expect(panelA.hasAttribute("data-a11y-hidden")).toBe(false);
    expect(panelB.hasAttribute("data-a11y-hidden")).toBe(true);
    expect(
      document.querySelectorAll('[role="tabpanel"][hidden]'),
    ).toHaveLength(0);
    controller.stop();
  });

  it("uses each option's manual mode and deduplicated trigger events", async () => {
    document.body.innerHTML = `
      <div role="tablist" data-a11y-activation="automatic" data-a11y-trigger-event="parent-event">
        <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true">A</button>
        <button id="tab-b" role="tab" aria-controls="panel-b" data-a11y-activation="manual" data-a11y-trigger-event="mouseover click mouseover">B</button>
      </div>
      <section id="panel-a" role="tabpanel">A</section>
      <section id="panel-b" role="tabpanel">B</section>
    `;
    const tabA = get("tab-a");
    const tabB = get("tab-b");
    const mouseover = vi.fn();
    const click = vi.fn();
    tabB.addEventListener("mouseover", mouseover);
    tabB.addEventListener("click", click);

    const controller = new TabsController(mergeConfig(DEFAULT_CONFIG), {
      onAnnounce: vi.fn(),
      onError: vi.fn(),
      getRegionType: () => null,
    });
    controller.start([document]);
    expect(tabA.getAttribute("tabindex")).toBe("0");
    expect(tabB.getAttribute("tabindex")).toBe("0");
    tabA.focus();
    tabA.dispatchEvent(key("ArrowRight"));
    expect(document.activeElement).toBe(tabB);
    expect(mouseover).not.toHaveBeenCalled();

    tabA.focus();
    tabA.dispatchEvent(key("Tab"));
    tabB.focus();
    await frame();
    expect(mouseover).not.toHaveBeenCalled();

    tabB.dispatchEvent(key("Enter"));
    await frame();
    expect(mouseover).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(tabB.getAttribute("aria-selected")).toBe("true");
    controller.stop();
  });

  it("uses the target option for focus activation and the current option for Enter", async () => {
    document.body.innerHTML = `
      <div role="tablist" data-a11y-activation="manual" data-a11y-trigger-event="parent-event">
        <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true" data-a11y-activation="manual" data-a11y-trigger-event="event-a">A</button>
        <button id="tab-b" role="tab" aria-controls="panel-b" data-a11y-activation="automatic" data-a11y-trigger-event="event-b">B</button>
        <button id="tab-c" role="tab" aria-controls="panel-c" data-a11y-activation="manual" data-a11y-trigger-event="event-c">C</button>
      </div>
      <section id="panel-a" role="tabpanel">A</section>
      <section id="panel-b" role="tabpanel">B</section>
      <section id="panel-c" role="tabpanel">C</section>
    `;
    const tabA = get("tab-a");
    const tabB = get("tab-b");
    const tabC = get("tab-c");
    const eventB = vi.fn();
    const eventC = vi.fn();
    const parentEvent = vi.fn();
    tabB.addEventListener("event-b", eventB);
    tabB.addEventListener("parent-event", parentEvent);
    tabC.addEventListener("event-c", eventC);

    const controller = new TabsController(mergeConfig(DEFAULT_CONFIG), {
      onAnnounce: vi.fn(),
      onError: vi.fn(),
      getRegionType: () => null,
    });
    controller.start([document]);

    tabA.focus();
    tabA.dispatchEvent(key("ArrowRight"));
    await frame();
    expect(document.activeElement).toBe(tabB);
    expect(eventB).toHaveBeenCalledTimes(1);
    expect(parentEvent).not.toHaveBeenCalled();

    tabB.dispatchEvent(key("Enter"));
    await frame();
    expect(eventB).toHaveBeenCalledTimes(1);

    tabB.dispatchEvent(key("ArrowRight"));
    expect(document.activeElement).toBe(tabC);
    expect(eventC).not.toHaveBeenCalled();
    tabC.dispatchEvent(key("Enter"));
    await frame();
    expect(eventC).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it("ignores tablist behavior attributes and falls back to tab config", async () => {
    document.body.innerHTML = `
      <div role="tablist" data-a11y-activation="manual" data-a11y-trigger-event="parent-event">
        <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true">A</button>
        <button id="tab-b" role="tab" aria-controls="panel-b" data-a11y-activation="invalid" data-a11y-trigger-event="   ">B</button>
      </div>
      <section id="panel-a" role="tabpanel">A</section>
      <section id="panel-b" role="tabpanel">B</section>
    `;
    const tabA = get("tab-a");
    const tabB = get("tab-b");
    const mouseover = vi.fn();
    const click = vi.fn();
    const parentEvent = vi.fn();
    tabB.addEventListener("mouseover", mouseover);
    tabB.addEventListener("click", click);
    tabB.addEventListener("parent-event", parentEvent);

    const controller = new TabsController(
      mergeConfig(DEFAULT_CONFIG, {
        tabs: {
          defaultActivation: "automatic",
          triggerEvents: ["mouseover click", "click"],
        },
      }),
      { onAnnounce: vi.fn(), onError: vi.fn(), getRegionType: () => null },
    );
    controller.start([document]);

    tabA.focus();
    tabA.dispatchEvent(key("ArrowRight"));
    await frame();

    expect(document.activeElement).toBe(tabB);
    expect(mouseover).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(parentEvent).not.toHaveBeenCalled();
    expect(tabB.getAttribute("aria-selected")).toBe("true");
    controller.stop();
  });

  it("falls back to click when the option and config declare no events", async () => {
    document.body.innerHTML = `
      <div role="tablist" data-a11y-trigger-event="mouseover">
        <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true">A</button>
        <button id="tab-b" role="tab" aria-controls="panel-b" data-a11y-activation="manual">B</button>
      </div>
      <section id="panel-a" role="tabpanel">A</section>
      <section id="panel-b" role="tabpanel">B</section>
    `;
    const tabA = get("tab-a");
    const tabB = get("tab-b");
    const click = vi.fn();
    const mouseover = vi.fn();
    tabB.addEventListener("click", click);
    tabB.addEventListener("mouseover", mouseover);

    const controller = new TabsController(
      mergeConfig(DEFAULT_CONFIG, { tabs: { triggerEvents: [] } }),
      { onAnnounce: vi.fn(), onError: vi.fn(), getRegionType: () => null },
    );
    controller.start([document]);

    tabA.focus();
    tabA.dispatchEvent(key("ArrowRight"));
    expect(document.activeElement).toBe(tabB);
    expect(click).not.toHaveBeenCalled();

    tabB.dispatchEvent(key(" "));
    await frame();
    expect(click).toHaveBeenCalledTimes(1);
    expect(mouseover).not.toHaveBeenCalled();
    controller.stop();
  });

  it("does not trap focus in a non-modal native dialog", async () => {
    document.body.innerHTML = `
      <div role="tablist">
        <button id="dialog-tab" role="tab" aria-controls="dialog-panel" aria-selected="true">设置</button>
      </div>
      <dialog id="dialog-panel" open>
        <button id="first-dialog-control">第一项</button>
        <button id="last-dialog-control">最后一项</button>
      </dialog>
    `;
    const controller = new TabsController(mergeConfig(DEFAULT_CONFIG), {
      onAnnounce: vi.fn(),
      onError: vi.fn(),
      getRegionType: () => null,
    });
    controller.start([document]);

    const tab = get("dialog-tab");
    tab.dispatchEvent(key("ArrowDown", { altKey: true }));
    await frame();
    const last = get("last-dialog-control");
    last.focus();
    const tabEvent = key("Tab");
    last.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(false);
    controller.stop();
  });

  it("keeps host-driven focus restoration to one short return message", async () => {
    document.body.innerHTML = `
      <style>[role="dialog"][data-a11y-hidden] { display: none; }</style>
      <div role="tablist">
        <button id="host-return-tab" role="tab" aria-controls="host-return-panel">设置</button>
      </div>
      <section id="host-return-panel" role="dialog">
        <button id="host-return-close" data-a11y-dialog-close>关闭</button>
      </section>
    `;
    const announce = vi.fn();
    const tab = get("host-return-tab");
    const panel = get("host-return-panel");
    get("host-return-close").addEventListener("click", () => {
      panel.setAttribute("data-a11y-hidden", "");
      tab.focus();
    });
    const controller = new TabsController(mergeConfig(DEFAULT_CONFIG), {
      onAnnounce: announce,
      onError: vi.fn(),
      getRegionType: () => "interaction",
    });
    controller.start([document]);

    tab.focus();
    tab.dispatchEvent(key("ArrowDown", { altKey: true }));
    await frame();
    expect(document.activeElement).toBe(panel);
    announce.mockClear();

    panel.dispatchEvent(key("Escape"));
    await frame();

    expect(document.activeElement).toBe(tab);
    expect(announce.mock.calls).toEqual([["已返回设置选项"]]);
    controller.stop();
  });

  it("does not announce a successful return when origin focus fails", async () => {
    document.body.innerHTML = `
      <div role="tablist">
        <button id="focus-failure-tab" role="tab" aria-controls="focus-failure-panel">设置</button>
      </div>
      <section id="focus-failure-panel" role="tabpanel">面板内容</section>
    `;
    const announce = vi.fn();
    const tab = get("focus-failure-tab");
    const panel = get("focus-failure-panel");
    const controller = new TabsController(mergeConfig(DEFAULT_CONFIG), {
      onAnnounce: announce,
      onError: vi.fn(),
      getRegionType: () => null,
    });
    controller.start([document]);

    tab.focus();
    tab.dispatchEvent(key("ArrowDown", { altKey: true }));
    await frame();
    expect(document.activeElement).toBe(panel);
    announce.mockClear();
    vi.spyOn(tab, "focus").mockImplementation(() => undefined);

    panel.dispatchEvent(key("Escape"));
    await frame();

    expect(document.activeElement).toBe(panel);
    expect(announce).not.toHaveBeenCalled();
    controller.stop();
  });

  it("does not announce a successful return when a dialog stays open", async () => {
    document.body.innerHTML = `
      <div role="tablist">
        <button id="dialog-tab" role="tab" aria-controls="dialog-panel">设置</button>
      </div>
      <section id="dialog-panel" role="dialog">
        <button data-a11y-dialog-close>无效关闭按钮</button>
      </section>
    `;
    const announce = vi.fn();
    const controller = new TabsController(
      mergeConfig(DEFAULT_CONFIG, { tabs: { panelReadyTimeoutMs: 10 } }),
      {
        onAnnounce: announce,
        onError: vi.fn(),
        getRegionType: () => null,
      },
    );
    controller.start([document]);
    const tab = get("dialog-tab");
    const panel = get("dialog-panel");
    tab.focus();
    tab.dispatchEvent(key("ArrowDown", { altKey: true }));
    await frame();
    announce.mockClear();

    panel.dispatchEvent(key("Escape"));
    await delay(60);

    expect(document.activeElement).toBe(panel);
    expect(announce).not.toHaveBeenCalled();
    controller.stop();
  });

  it("keeps invalid tab groups outside the specialized speech path", () => {
    document.body.innerHTML = `
      <div role="tablist">
        <button id="invalid-tab" role="tab" aria-controls="missing-panel">无效选项</button>
      </div>
    `;
    const announce = vi.fn();
    const error = vi.fn();
    const controller = new TabsController(mergeConfig(DEFAULT_CONFIG), {
      onAnnounce: announce,
      onError: error,
      getRegionType: () => "content",
    });
    controller.start([document]);
    const tab = get("invalid-tab");
    tab.focus();

    expect(error).toHaveBeenCalledTimes(1);
    expect(controller.isTabSpeechTarget(tab)).toBe(false);
    expect(announce).not.toHaveBeenCalled();
    controller.stop();
  });
});

function get(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}

function getFromRoot(root: ParentNode, id: string): HTMLElement {
  const element = root.querySelector(`#${id}`);
  if (!element || !("focus" in element)) {
    throw new Error(`Missing #${id}`);
  }
  return element as HTMLElement;
}

function key(
  value: string,
  options: KeyboardEventInit = {},
): KeyboardEvent {
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

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
