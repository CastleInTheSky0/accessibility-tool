import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/core/config";
import { isHTMLElement } from "../../src/core/dom";
import { PageEffectsController } from "../../src/features/page-effects";
import type { ToolbarUI } from "../../src/ui/toolbar";

describe("PageEffectsController focus highlighting", () => {
  it("owns and restores the host focus outline without changing tab order", () => {
    document.body.innerHTML = `
      <button id="first">第一个</button>
      <button id="second">第二个</button>
      <div data-a11y-tool-host><button id="toolbar-control">工具按钮</button></div>
    `;
    const toolbar = createToolbarMock();
    const effects = createEffects(toolbar.ui);
    const first = getElement("first");
    const second = getElement("second");
    const toolbarControl = getElement("toolbar-control");
    first.style.setProperty("outline-color", "purple", "important");
    first.style.setProperty("outline-style", "dotted", "important");
    first.style.setProperty("outline-width", "7px", "important");
    first.style.setProperty("outline-offset", "5px", "important");
    const originalOutline = snapshotOutline(first);

    effects.start();
    first.focus();

    expect(first.hasAttribute("tabindex")).toBe(false);
    expect(first.getAttribute("data-a11y-page-focus-owned")).toBe("");
    expectOwnedOutline(first, "#ffb800");
    expect(first.style.getPropertyValue("outline-offset")).toBe("5px");
    expect(first.style.getPropertyPriority("outline-offset")).toBe("important");

    second.focus();
    expect(first.hasAttribute("data-a11y-page-focus-owned")).toBe(false);
    expect(snapshotOutline(first)).toEqual(originalOutline);
    expectOwnedOutline(second, "#ffb800");

    toolbarControl.focus();
    expect(second.hasAttribute("data-a11y-page-focus-owned")).toBe(false);
    expect(snapshotOutline(second)).toEqual(emptyOutline());

    effects.deactivate();
    first.focus();
    expect(snapshotOutline(first)).toEqual(originalOutline);
  });

  it("keeps open Shadow DOM toolbar controls excluded across resync and restart", () => {
    document.body.innerHTML = `
      <button id="page-target">页面目标</button>
      <button id="page-target-2">页面目标二</button>
    `;
    const toolHost = document.createElement("div");
    toolHost.setAttribute("data-a11y-tool-host", "");
    document.body.append(toolHost);
    const toolRoot = toolHost.attachShadow({ mode: "open" });
    const toolControl = document.createElement("button");
    toolControl.textContent = "工具按钮";
    toolRoot.append(toolControl);

    const toolbar = createToolbarMock();
    const effects = createEffects(toolbar.ui);
    effects.start();
    effects.setRoots([document, toolRoot]);

    toolControl.focus();
    effects.setRoots([document, toolRoot]);
    expect(toolControl.hasAttribute("data-a11y-page-focus-owned")).toBe(false);

    effects.deactivate();
    const pageTarget = getElement("page-target");
    pageTarget.focus();
    expect(snapshotOutline(pageTarget)).toEqual(emptyOutline());

    effects.start();
    expectOwnedOutline(pageTarget, "#ffb800");
    const pageTargetTwo = getElement("page-target-2");
    pageTargetTwo.focus();
    expect(snapshotOutline(pageTarget)).toEqual(emptyOutline());
    expectOwnedOutline(pageTargetTwo, "#ffb800");

    effects.destroy();
    expect(snapshotOutline(pageTargetTwo)).toEqual(emptyOutline());
  });

  it("coordinates region, current focus and reading ownership", () => {
    document.body.innerHTML = `
      <section id="region" tabindex="-1" aria-regionactive="legacy">
        <button id="inside">区域内部</button>
      </section>
    `;
    const toolbar = createToolbarMock();
    const effects = createEffects(toolbar.ui);
    const region = getElement("region");
    const inside = getElement("inside");
    region.style.setProperty("outline-color", "purple", "important");
    region.style.setProperty("outline-style", "dotted", "important");
    region.style.setProperty("outline-width", "7px", "important");
    const originalRegionOutline = snapshotOutline(region);

    effects.start();
    effects.setRegionHighlight(region);
    expect(region.getAttribute("tabindex")).toBe("-1");
    expect(region.getAttribute("aria-regionactive")).toBe("true");
    expectOwnedOutline(region, "#ff6c00");

    region.focus();
    expectOwnedOutline(region, "#ffb800");

    inside.focus();
    expectOwnedOutline(region, "#ff6c00");
    expectOwnedOutline(inside, "#ffb800");

    effects.setHighlight(inside);
    expect(toolbar.positionHighlight).toHaveBeenLastCalledWith(inside);
    effects.clearHighlight(inside);
    expect(toolbar.hideHighlight).toHaveBeenCalled();
    expectOwnedOutline(region, "#ff6c00");
    expectOwnedOutline(inside, "#ffb800");

    region.focus();
    expect(snapshotOutline(inside)).toEqual(emptyOutline());
    expectOwnedOutline(region, "#ffb800");

    effects.clearRegionHighlight(region);
    expect(region.getAttribute("tabindex")).toBe("-1");
    expect(region.getAttribute("aria-regionactive")).toBe("legacy");
    expectOwnedOutline(region, "#ffb800");

    inside.focus();
    expect(snapshotOutline(region)).toEqual(originalRegionOutline);
    expectOwnedOutline(inside, "#ffb800");
    effects.destroy();
    expect(snapshotOutline(inside)).toEqual(emptyOutline());
  });

  it("moves region ownership without leaving styles or attributes behind", () => {
    document.body.innerHTML = `
      <section id="region-a" tabindex="-1" aria-regionactive="legacy"></section>
      <section id="region-b"></section>
    `;
    const toolbar = createToolbarMock();
    const effects = createEffects(toolbar.ui);
    const first = getElement("region-a");
    const second = getElement("region-b");
    first.style.setProperty("outline-color", "navy", "important");
    first.style.setProperty("outline-style", "double", "important");
    first.style.setProperty("outline-width", "4px", "important");
    const originalFirstOutline = snapshotOutline(first);

    effects.start();
    effects.setRegionHighlight(first);
    first.focus();
    expectOwnedOutline(first, "#ffb800");

    effects.setRegionHighlight(second);
    expect(first.getAttribute("tabindex")).toBe("-1");
    expect(first.getAttribute("aria-regionactive")).toBe("legacy");
    expectOwnedOutline(first, "#ffb800");
    expect(second.hasAttribute("tabindex")).toBe(false);
    expect(second.getAttribute("aria-regionactive")).toBe("true");
    expectOwnedOutline(second, "#ff6c00");

    second.focus();
    expect(snapshotOutline(first)).toEqual(originalFirstOutline);
    expectOwnedOutline(second, "#ffb800");
    effects.destroy();
    expect(second.hasAttribute("tabindex")).toBe(false);
    expect(second.hasAttribute("aria-regionactive")).toBe(false);
    expect(snapshotOutline(second)).toEqual(emptyOutline());
  });

  it("releases a focus outline when the target stops rendering", () => {
    document.body.innerHTML = '<button id="moving">移动目标</button>';
    const toolbar = createToolbarMock();
    const effects = createEffects(toolbar.ui);
    const moving = getElement("moving");

    effects.start();
    moving.focus();
    expectOwnedOutline(moving, "#ffb800");

    moving.hidden = true;
    effects.setRoots([document]);
    expect(moving.hasAttribute("data-a11y-page-focus-owned")).toBe(false);
    expect(snapshotOutline(moving)).toEqual(emptyOutline());
    effects.destroy();
  });
});

function createEffects(ui: ToolbarUI): PageEffectsController {
  return new PageEffectsController(mergeConfig(DEFAULT_CONFIG), ui, {
    onFullscreenChange: vi.fn(),
    onError: vi.fn(),
  });
}

function createToolbarMock() {
  const mocks = {
    containsEvent: vi.fn((event: Event) =>
      event.composedPath().some(
        (item) =>
          isHTMLElement(item) && Boolean(item.closest("[data-a11y-tool-host]")),
      )),
    getToolbarHeight: vi.fn(() => 102),
    hideCrosshair: vi.fn(),
    hideHighlight: vi.fn(),
    positionCrosshair: vi.fn(),
    positionHighlight: vi.fn(),
  };
  return { ...mocks, ui: mocks as unknown as ToolbarUI };
}

function getElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing test element: ${id}`);
  }
  return element;
}

function expectOwnedOutline(element: HTMLElement, color: string): void {
  expect(element.style.getPropertyValue("outline-color")).toBe(color);
  expect(element.style.getPropertyValue("outline-style")).toBe("solid");
  expect(element.style.getPropertyValue("outline-width")).toBe("2px");
  for (const property of ["outline-color", "outline-style", "outline-width"]) {
    expect(element.style.getPropertyPriority(property)).toBe("important");
  }
}

function snapshotOutline(element: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    ["outline-color", "outline-style", "outline-width", "outline-offset"].map(
      (property) => [
        property,
        `${element.style.getPropertyValue(property)}|${element.style.getPropertyPriority(property)}`,
      ],
    ),
  );
}

function emptyOutline(): Record<string, string> {
  return {
    "outline-color": "|",
    "outline-style": "|",
    "outline-width": "|",
    "outline-offset": "|",
  };
}
