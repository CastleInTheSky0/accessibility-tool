import { describe, expect, it, vi } from "vitest";
import { RegionNavigationController } from "../../src/features/region-navigation";
import type { ScannedRegion } from "../../src/features/regions";

describe("RegionNavigationController", () => {
  it("wraps to the first region when the active last region is removed", () => {
    document.body.innerHTML = `
      <section id="service-a"></section>
      <section id="service-b"></section>
    `;
    const first = get("service-a");
    const last = get("service-b");
    const regions = [region(first), region(last)];
    const effects = createEffects();
    const announce = vi.fn();
    const controller = createController(effects, announce);
    controller.start();
    controller.update(regions, [document], "initial");
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(last.getAttribute("tabindex")).toBe("0");
    void controller.navigate("service");
    void controller.navigate("service");
    expect(document.activeElement).toBe(last);
    announce.mockClear();

    last.remove();
    controller.update([regions[0] as ScannedRegion], [document], "mutation");

    expect(document.activeElement).toBe(first);
    expect(effects.setRegionHighlight).toHaveBeenLastCalledWith(first);
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(last.hasAttribute("tabindex")).toBe(false);
    expect(announce).not.toHaveBeenCalled();
    controller.stop();
    expect(first.hasAttribute("tabindex")).toBe(false);
  });

  it("recovers when the current element is reclassified", () => {
    document.body.innerHTML = `
      <section id="service-a"></section>
      <section id="service-b"></section>
    `;
    const first = get("service-a");
    const second = get("service-b");
    const effects = createEffects();
    const announce = vi.fn();
    const controller = createController(effects, announce);
    controller.start();
    controller.update([region(first), region(second)], [document], "initial");
    void controller.navigate("service");
    announce.mockClear();

    controller.update(
      [
        { ...region(first), type: "content" },
        region(second),
      ],
      [document],
      "mutation",
    );

    expect(document.activeElement).toBe(second);
    expect(effects.setRegionHighlight).toHaveBeenLastCalledWith(second);
    expect(announce).not.toHaveBeenCalled();
    controller.stop();
  });

  it("keeps the active region while focus traverses descendants", () => {
    document.body.innerHTML = `
      <nav id="service-a">
        <a id="inside-a" href="#a">内部一</a>
        <button id="inside-b">内部二</button>
      </nav>
      <button id="outside">外部</button>
    `;
    const activeRegion = get("service-a");
    const effects = createEffects();
    const controller = createController(effects);
    controller.start();
    controller.update([region(activeRegion)], [document], "initial");
    void controller.navigate("service");
    effects.clearRegionHighlight.mockClear();

    get("inside-a").focus();
    get("inside-b").focus();
    expect(effects.clearRegionHighlight).not.toHaveBeenCalled();

    get("outside").focus();
    expect(effects.clearRegionHighlight).toHaveBeenCalledTimes(1);
    expect(activeRegion.getAttribute("tabindex")).toBe("0");
    controller.stop();
    expect(activeRegion.hasAttribute("tabindex")).toBe(false);
  });

  it("keeps every region anchor while restoring navigation scroll margin", () => {
    document.body.innerHTML = `
      <section id="service-a" tabindex="-1"></section>
      <section id="service-b"></section>
    `;
    const first = get("service-a");
    const second = get("service-b");
    first.style.setProperty("scroll-margin-top", "24px", "important");
    const effects = createEffects();
    const controller = createController(effects);
    controller.start();
    controller.update([region(first), region(second)], [document], "initial");

    void controller.navigate("service");
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(first.style.getPropertyValue("scroll-margin-top")).toBe("118px");

    void controller.navigate("service");
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(first.style.getPropertyValue("scroll-margin-top")).toBe("24px");
    expect(first.style.getPropertyPriority("scroll-margin-top")).toBe(
      "important",
    );
    expect(second.getAttribute("tabindex")).toBe("0");

    void controller.navigate("service");
    expect(second.getAttribute("tabindex")).toBe("0");
    expect(first.getAttribute("tabindex")).toBe("0");

    controller.stop();
    expect(first.getAttribute("tabindex")).toBe("-1");
    expect(second.hasAttribute("tabindex")).toBe(false);
    expect(first.style.getPropertyValue("scroll-margin-top")).toBe("24px");
  });

  it("announces a region container reached through ordinary or reverse focus", () => {
    document.body.innerHTML = `
      <nav id="service-a">
        <a id="inside" href="#inside">内部链接</a>
      </nav>
      <button id="outside">外部</button>
    `;
    const activeRegion = get("service-a");
    const effects = createEffects();
    const announce = vi.fn();
    const controller = createController(effects, announce);
    controller.start();
    controller.update([region(activeRegion)], [document], "initial");
    effects.setRegionHighlight.mockClear();

    activeRegion.focus();
    expect(effects.setRegionHighlight).toHaveBeenLastCalledWith(activeRegion);
    expect(announce).toHaveBeenCalledWith(
      "提示：您已进入service-a服务区，按下 Tab 键浏览信息；第 1 个，共 1 个",
    );

    effects.clearRegionHighlight.mockClear();
    get("inside").focus();
    expect(effects.clearRegionHighlight).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledTimes(1);

    activeRegion.focus();
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith(
      "提示：您已进入service-a服务区，按下 Tab 键浏览信息；第 1 个，共 1 个",
    );

    get("outside").focus();
    expect(effects.clearRegionHighlight).toHaveBeenCalledTimes(1);
    expect(activeRegion.getAttribute("tabindex")).toBe("0");

    controller.stop();
    expect(activeRegion.hasAttribute("tabindex")).toBe(false);
  });

  it("announces the short name, supplemented category, instruction and ordinal", () => {
    document.body.innerHTML = `
      <section id="headline-a"></section>
      <section id="headline-b"></section>
    `;
    const announce = vi.fn();
    const onRegionChange = vi.fn();
    const controller = createController(
      createEffects(),
      announce,
      onRegionChange,
    );
    controller.start();
    controller.update(
      [
        region(get("headline-a"), "viewport", "要闻"),
        region(get("headline-b"), "viewport", "专题"),
      ],
      [document],
      "initial",
    );

    void controller.navigate("viewport");

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(
      "提示：您已进入要闻视窗区，按下 Tab 键浏览信息；第 1 个，共 2 个",
    );
    expect(onRegionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: "要闻" }),
    );

    void controller.navigate("viewport");
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenNthCalledWith(
      2,
      "提示：您已进入专题视窗区，按下 Tab 键浏览信息；第 2 个，共 2 个",
    );
    expect(onRegionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: "专题" }),
    );
    controller.stop();
  });

  it("literally concatenates the resolved label and category label", () => {
    document.body.innerHTML = `
      <nav id="main-navigation"></nav>
      <main id="main-content"></main>
      <section id="spaced-headline"></section>
    `;
    const announce = vi.fn();
    const controller = createController(createEffects(), announce);
    controller.start();
    controller.update(
      [
        region(get("main-navigation"), "navigation", "主导航"),
        region(get("main-content"), "content", "正文区"),
        region(get("spaced-headline"), "viewport", " 要闻 "),
      ],
      [document],
      "initial",
    );

    void controller.navigate("navigation");
    void controller.navigate("content");
    void controller.navigate("viewport");

    expect(announce).toHaveBeenNthCalledWith(
      1,
      "提示：您已进入主导航导航区，按下 Tab 键浏览信息；第 1 个，共 1 个",
    );
    expect(announce).toHaveBeenNthCalledWith(
      2,
      "提示：您已进入正文区正文区，按下 Tab 键浏览信息；第 1 个，共 1 个",
    );
    expect(announce).toHaveBeenNthCalledWith(
      3,
      "提示：您已进入 要闻 视窗区，按下 Tab 键浏览信息；第 1 个，共 1 个",
    );
    expect(announce).toHaveBeenCalledTimes(3);
    controller.stop();
  });

  it("restores exact tabindex values when regions become hidden or removed", () => {
    document.body.innerHTML = `
      <section id="service-a"></section>
      <section id="service-b" tabindex="-1"></section>
    `;
    const first = get("service-a");
    const second = get("service-b");
    const controller = createController();
    controller.start();
    controller.update([region(first), region(second)], [document], "initial");
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(second.getAttribute("tabindex")).toBe("0");

    first.hidden = true;
    second.remove();
    controller.update([], [document], "mutation");

    expect(first.hasAttribute("tabindex")).toBe(false);
    expect(second.getAttribute("tabindex")).toBe("-1");
    controller.stop();
  });

  it("adds temporary tab stops only to standalone ARIA controls", () => {
    document.body.innerHTML = `
      <p id="paragraph">正文</p>
      <span id="plain-span">普通文字</span>
      <img id="plain-image" alt="普通图片">
      <span id="aria-button" role="button">自定义按钮</span>
      <a id="aria-link" role="link">自定义链接</a>
      <img id="aria-image-button" role="button" alt="图片按钮">
      <div id="aria-checkbox" role="checkbox" aria-checked="false">自定义复选框</div>
      <div id="explicit-negative" role="button" tabindex="-1">显式跳过</div>
      <div id="disabled-control" role="button" aria-disabled="true">不可用</div>
      <div id="ignored-control" role="button" data-a11y-ignore>忽略</div>
      <div id="composite-tab" role="tab">复合组件选项</div>
      <button id="native-button" type="button">原生按钮</button>
    `;
    const controller = createController();
    controller.start();
    controller.update([], [document], "initial");

    for (const id of [
      "aria-button",
      "aria-link",
      "aria-image-button",
      "aria-checkbox",
    ]) {
      expect(get(id).getAttribute("tabindex")).toBe("0");
    }
    for (const id of [
      "paragraph",
      "plain-span",
      "plain-image",
      "disabled-control",
      "ignored-control",
      "composite-tab",
      "native-button",
    ]) {
      expect(get(id).hasAttribute("tabindex")).toBe(false);
    }
    expect(get("explicit-negative").getAttribute("tabindex")).toBe("-1");

    get("aria-checkbox").setAttribute("tabindex", "-1");
    controller.update([], [document], "mutation");
    expect(get("aria-checkbox").getAttribute("tabindex")).toBe("-1");

    get("aria-button").hidden = true;
    get("aria-link").removeAttribute("role");
    controller.update([], [document], "mutation");
    expect(get("aria-button").hasAttribute("tabindex")).toBe(false);
    expect(get("aria-link").hasAttribute("tabindex")).toBe(false);

    controller.stop();
    expect(get("aria-image-button").hasAttribute("tabindex")).toBe(false);
    expect(get("aria-checkbox").getAttribute("tabindex")).toBe("-1");
  });

  it("returns only an exact explicit scanned type, including hidden linked panels", () => {
    document.body.innerHTML = `
      <style>[data-a11y-hidden] { display: none; }</style>
      <section id="outer"><button id="child">内部节点</button></section>
      <button id="tab" role="tab">面板选项</button>
      <section id="hidden-panel" data-a11y-hidden></section>
      <section id="semantic-panel"></section>
    `;
    const hidden: ScannedRegion = {
      ...region(get("hidden-panel"), "viewport", "隐藏面板"),
      linkedTab: get("tab"),
    };
    const semantic: ScannedRegion = {
      ...region(get("semantic-panel"), "service", "语义区域"),
      source: "semantic",
    };
    const controller = createController();
    controller.start();
    controller.update(
      [region(get("outer"), "content", "外层"), hidden, semantic],
      [document],
      "initial",
    );

    expect(controller.getExplicitRegionType(get("outer"))).toBe("content");
    expect(controller.getExplicitRegionType(hidden.element)).toBe("viewport");
    expect(controller.getExplicitRegionType(get("child"))).toBeNull();
    expect(controller.getExplicitRegionType(semantic.element)).toBeNull();
    controller.stop();
  });

  it("activates hidden linked panels before committing navigation", async () => {
    document.body.innerHTML = `
      <style>[data-a11y-hidden] { display: none; }</style>
      <button id="tab-hidden" role="tab">隐藏面板选项</button>
      <section id="panel-visible"></section>
      <section id="panel-hidden" data-a11y-hidden aria-hidden="true"><button id="panel-control">面板按钮</button></section>
    `;
    const visible = region(get("panel-visible"), "viewport", "可见");
    const hidden: ScannedRegion = {
      ...region(get("panel-hidden"), "viewport", "隐藏"),
      linkedTab: get("tab-hidden"),
    };
    const announce = vi.fn();
    const activate = vi.fn(() => {
      hidden.element.removeAttribute("data-a11y-hidden");
      hidden.element.setAttribute("aria-hidden", "false");
      return Promise.resolve(true);
    });
    const controller = createController(
      createEffects(),
      announce,
      vi.fn(),
      activate,
    );
    controller.start();
    controller.update([visible, hidden], [document], "initial");

    expect(hidden.element.hasAttribute("tabindex")).toBe(false);
    await controller.navigate("viewport");
    await controller.navigate("viewport");

    expect(activate).toHaveBeenCalledWith(hidden);
    expect(document.activeElement).toBe(hidden.element);
    expect(hidden.element.getAttribute("tabindex")).toBe("0");
    expect(announce).toHaveBeenLastCalledWith(
      "提示：您已进入隐藏视窗区，按下 Tab 键浏览信息；第 2 个，共 2 个",
    );
    controller.stop();
  });

  it("does not commit failed or stale hidden-panel navigation", async () => {
    document.body.innerHTML = `
      <style>[data-a11y-hidden] { display: none; }</style>
      <button id="tab-hidden" role="tab">隐藏面板选项</button>
      <section id="panel-visible"></section>
      <section id="panel-hidden" data-a11y-hidden aria-hidden="true"><button id="panel-control">面板按钮</button></section>
    `;
    const visible = region(get("panel-visible"), "viewport", "可见");
    const hidden: ScannedRegion = {
      ...region(get("panel-hidden"), "viewport", "隐藏"),
      linkedTab: get("tab-hidden"),
    };
    const announce = vi.fn();
    let resolveActivation: ((ready: boolean) => void) | undefined;
    const activation = new Promise<boolean>((resolve) => {
      resolveActivation = resolve;
    });
    const onRegionChange = vi.fn();
    const controller = createController(
      createEffects(),
      announce,
      onRegionChange,
      () => activation,
    );
    controller.start();
    controller.update([visible, hidden], [document], "initial");
    await controller.navigate("viewport");
    announce.mockClear();
    onRegionChange.mockClear();

    const stale = controller.navigate("viewport");
    const latest = controller.navigate("viewport");
    hidden.element.removeAttribute("data-a11y-hidden");
    hidden.element.setAttribute("aria-hidden", "false");
    get("panel-control").focus();
    expect(onRegionChange).not.toHaveBeenCalled();
    resolveActivation?.(true);

    await expect(stale).resolves.toBe(false);
    await expect(latest).resolves.toBe(true);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(onRegionChange).toHaveBeenCalledTimes(1);
    expect(announce).not.toHaveBeenCalledWith("关联内容面板未能打开");

    hidden.element.setAttribute("data-a11y-hidden", "");
    hidden.element.setAttribute("aria-hidden", "true");
    const failedController = createController(
      createEffects(),
      announce,
      vi.fn(),
      () => Promise.resolve(false),
    );
    failedController.start();
    failedController.update([visible, hidden], [document], "initial");
    announce.mockClear();
    await expect(failedController.navigate("viewport")).resolves.toBe(true);
    await expect(failedController.navigate("viewport")).resolves.toBe(false);
    expect(document.activeElement).toBe(visible.element);
    expect(announce).toHaveBeenCalledWith("关联内容面板未能打开");
    failedController.stop();
    controller.stop();
  });

  it("defers recovery while a delayed hidden-panel activation is pending", async () => {
    document.body.innerHTML = `
      <style>[data-a11y-hidden] { display: none; }</style>
      <button id="tab-current" role="tab">当前面板选项</button>
      <button id="tab-target" role="tab">目标面板选项</button>
      <section id="panel-current"></section>
      <section id="panel-target" data-a11y-hidden aria-hidden="true"></section>
      <section id="panel-fallback"></section>
    `;
    const current: ScannedRegion = {
      ...region(get("panel-current"), "viewport", "当前"),
      linkedTab: get("tab-current"),
    };
    const target: ScannedRegion = {
      ...region(get("panel-target"), "viewport", "目标"),
      linkedTab: get("tab-target"),
    };
    const fallback = region(get("panel-fallback"), "viewport", "回退");
    let resolveActivation: ((ready: boolean) => void) | undefined;
    const activation = new Promise<boolean>((resolve) => {
      resolveActivation = resolve;
    });
    const announce = vi.fn();
    const onRegionChange = vi.fn();
    const effects = createEffects();
    const controller = createController(
      effects,
      announce,
      onRegionChange,
      () => activation,
    );
    controller.start();
    controller.update([current, target, fallback], [document], "initial");
    await controller.navigate("viewport");
    announce.mockClear();
    onRegionChange.mockClear();
    effects.clearRegionHighlight.mockClear();

    const pending = controller.navigate("viewport");
    current.element.setAttribute("data-a11y-hidden", "");
    current.element.setAttribute("aria-hidden", "true");

    await new Promise((resolve) => setTimeout(resolve, 150));
    controller.update([current, target, fallback], [document], "mutation");

    expect(document.activeElement).not.toBe(fallback.element);
    expect(onRegionChange).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    expect(effects.clearRegionHighlight).toHaveBeenCalledWith(current.element);

    target.element.removeAttribute("data-a11y-hidden");
    target.element.setAttribute("aria-hidden", "false");
    controller.update([current, target, fallback], [document], "mutation");
    resolveActivation?.(true);

    await expect(pending).resolves.toBe(true);
    expect(document.activeElement).toBe(target.element);
    expect(onRegionChange).toHaveBeenCalledTimes(1);
    expect(onRegionChange).toHaveBeenCalledWith(
      expect.objectContaining({ element: target.element, index: 1, count: 3 }),
    );
    expect(announce.mock.calls).toEqual([
      ["提示：您已进入目标视窗区，按下 Tab 键浏览信息；第 2 个，共 3 个"],
    ]);
    controller.stop();
  });

  it("can focus a panel region without the generic region announcement", () => {
    document.body.innerHTML = `
      <section id="panel"></section>
      <button id="outside">外部</button>
    `;
    const panel = get("panel");
    const announce = vi.fn();
    const controller = createController(createEffects(), announce);
    controller.start();
    controller.update(
      [region(panel, "viewport", "概览")],
      [document],
      "initial",
    );

    controller.focusWithoutRegionAnnouncement(panel);
    expect(document.activeElement).toBe(panel);
    expect(announce).not.toHaveBeenCalled();

    get("outside").focus();
    panel.focus();
    expect(announce).toHaveBeenCalledWith(
      "提示：您已进入概览视窗区，按下 Tab 键浏览信息；第 1 个，共 1 个",
    );
    controller.stop();
  });

  it("notifies toolbar state once when the active region is cleared", async () => {
    document.body.innerHTML = `
      <section id="service-a"></section>
      <button id="outside">外部</button>
    `;
    const onRegionChange = vi.fn();
    const onCurrentRegionChange = vi.fn();
    const controller = createController(
      createEffects(),
      vi.fn(),
      onRegionChange,
      undefined,
      onCurrentRegionChange,
    );
    controller.start();
    controller.update([region(get("service-a"))], [document], "initial");

    await controller.navigate("service");
    expect(onRegionChange).toHaveBeenCalledTimes(1);
    expect(onCurrentRegionChange).not.toHaveBeenCalled();

    get("outside").focus();
    expect(onCurrentRegionChange).toHaveBeenCalledTimes(1);
    expect(onCurrentRegionChange).toHaveBeenLastCalledWith(null);

    controller.clearActiveRegion();
    controller.stop();
    expect(onCurrentRegionChange).toHaveBeenCalledTimes(1);
  });

  it("syncs a changed current index and count without a public region event", async () => {
    document.body.innerHTML = `
      <section id="viewport-a"></section>
      <section id="viewport-b"></section>
    `;
    const first = get("viewport-a");
    const second = get("viewport-b");
    const onRegionChange = vi.fn();
    const onCurrentRegionChange = vi.fn();
    const controller = createController(
      createEffects(),
      vi.fn(),
      onRegionChange,
      undefined,
      onCurrentRegionChange,
    );
    controller.start();
    controller.update(
      [region(first, "viewport"), region(second, "viewport")],
      [document],
      "initial",
    );
    await controller.navigate("viewport");
    onRegionChange.mockClear();
    onCurrentRegionChange.mockClear();

    const inserted = document.createElement("section");
    inserted.id = "viewport-new";
    first.before(inserted);
    controller.update(
      [
        region(inserted, "viewport"),
        region(first, "viewport"),
        region(second, "viewport"),
      ],
      [document],
      "mutation",
    );

    expect(onRegionChange).not.toHaveBeenCalled();
    expect(onCurrentRegionChange).toHaveBeenCalledTimes(1);
    expect(onCurrentRegionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "viewport",
        index: 1,
        count: 3,
        element: first,
      }),
    );
    controller.stop();
  });

  it("does not create or clear current state after failed navigation", async () => {
    document.body.innerHTML = "<button id=outside>外部</button>";
    const onRegionChange = vi.fn();
    const onCurrentRegionChange = vi.fn();
    const controller = createController(
      createEffects(),
      vi.fn(),
      onRegionChange,
      undefined,
      onCurrentRegionChange,
    );
    controller.start();
    controller.update([], [document], "initial");

    await expect(controller.navigate("service")).resolves.toBe(false);
    controller.clearActiveRegion();
    controller.stop();

    expect(onRegionChange).not.toHaveBeenCalled();
    expect(onCurrentRegionChange).not.toHaveBeenCalled();
  });
});

function createController(
  effects = createEffects(),
  onAnnounce = vi.fn(),
  onRegionChange = vi.fn(),
  requestRegionVisibility?: (region: ScannedRegion) => Promise<boolean>,
  onCurrentRegionChange = vi.fn(),
): RegionNavigationController {
  return new RegionNavigationController(
    effects,
    {
      getToolbarOffset: () => 102,
      ...(requestRegionVisibility ? { requestRegionVisibility } : {}),
      onCountsChange: vi.fn(),
      onAnnounce,
      onCurrentRegionChange,
      onRegionChange,
      onReturnToCategory: vi.fn(),
      onDynamicUpdate: vi.fn(),
    },
  );
}

function createEffects() {
  return {
    setRegionHighlight: vi.fn<(element: HTMLElement | null) => void>(),
    clearRegionHighlight: vi.fn<(element?: HTMLElement) => void>(),
  };
}

function region(
  element: HTMLElement,
  type: ScannedRegion["type"] = "service",
  label = element.id,
): ScannedRegion {
  return {
    type,
    element,
    label,
    source: "data",
  };
}

function get(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}
