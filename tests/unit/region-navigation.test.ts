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
    const controller = createController(effects);
    controller.start();
    controller.update(regions, [document], "initial");
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(last.getAttribute("tabindex")).toBe("0");
    controller.navigate("service");
    controller.navigate("service");
    expect(document.activeElement).toBe(last);

    last.remove();
    controller.update([regions[0] as ScannedRegion], [document], "mutation");

    expect(document.activeElement).toBe(first);
    expect(effects.setRegionHighlight).toHaveBeenLastCalledWith(first);
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(last.hasAttribute("tabindex")).toBe(false);
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
    const controller = createController(effects);
    controller.start();
    controller.update([region(first), region(second)], [document], "initial");
    controller.navigate("service");

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
    controller.navigate("service");
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

    controller.navigate("service");
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(first.style.getPropertyValue("scroll-margin-top")).toBe("118px");

    controller.navigate("service");
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(first.style.getPropertyValue("scroll-margin-top")).toBe("24px");
    expect(first.style.getPropertyPriority("scroll-margin-top")).toBe(
      "important",
    );
    expect(second.getAttribute("tabindex")).toBe("0");

    controller.navigate("service");
    expect(second.getAttribute("tabindex")).toBe("0");
    expect(first.getAttribute("tabindex")).toBe("0");

    controller.stop();
    expect(first.getAttribute("tabindex")).toBe("-1");
    expect(second.hasAttribute("tabindex")).toBe(false);
    expect(first.style.getPropertyValue("scroll-margin-top")).toBe("24px");
  });

  it("activates a recognized region reached through ordinary focus", () => {
    document.body.innerHTML = `
      <nav id="service-a">
        <a id="inside" href="#inside">内部链接</a>
      </nav>
      <button id="outside">外部</button>
    `;
    const activeRegion = get("service-a");
    const effects = createEffects();
    const controller = createController(effects);
    controller.start();
    controller.update([region(activeRegion)], [document], "initial");
    effects.setRegionHighlight.mockClear();

    activeRegion.focus();
    expect(effects.setRegionHighlight).toHaveBeenLastCalledWith(activeRegion);

    effects.clearRegionHighlight.mockClear();
    get("inside").focus();
    expect(effects.clearRegionHighlight).not.toHaveBeenCalled();

    get("outside").focus();
    expect(effects.clearRegionHighlight).toHaveBeenCalledTimes(1);
    expect(activeRegion.getAttribute("tabindex")).toBe("0");

    controller.stop();
    expect(activeRegion.hasAttribute("tabindex")).toBe(false);
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
});

function createController(
  effects = createEffects(),
): RegionNavigationController {
  return new RegionNavigationController(
    effects,
    {
      getToolbarOffset: () => 102,
      onCountsChange: vi.fn(),
      onAnnounce: vi.fn(),
      onRegionChange: vi.fn(),
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

function region(element: HTMLElement): ScannedRegion {
  return {
    type: "service",
    element,
    label: element.id,
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
