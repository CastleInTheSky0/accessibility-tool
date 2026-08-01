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
    toolbar.hideFocusHighlight.mockClear();

    first.focus();
    expect(toolbar.positionFocusHighlight).toHaveBeenLastCalledWith(first);
    expect(first.hasAttribute("tabindex")).toBe(false);
    expect(first.getAttribute("data-a11y-page-focus-owned")).toBe("");
    expect(first.style.getPropertyValue("outline-style")).toBe("none");
    expect(first.style.getPropertyPriority("outline-style")).toBe("important");
    expect(first.style.getPropertyValue("outline-color")).toBe("purple");
    expect(first.style.getPropertyValue("outline-width")).toBe("7px");
    expect(first.style.getPropertyValue("outline-offset")).toBe("5px");

    second.focus();
    expect(toolbar.positionFocusHighlight).toHaveBeenLastCalledWith(second);
    expect(first.hasAttribute("data-a11y-page-focus-owned")).toBe(false);
    expect(snapshotOutline(first)).toEqual(originalOutline);

    toolbarControl.focus();
    expect(toolbar.hideFocusHighlight).toHaveBeenCalledTimes(1);
    expect(second.hasAttribute("data-a11y-page-focus-owned")).toBe(false);

    toolbar.positionFocusHighlight.mockClear();
    effects.deactivate();
    first.focus();
    expect(toolbar.positionFocusHighlight).not.toHaveBeenCalled();
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
    toolbar.positionFocusHighlight.mockClear();
    effects.setRoots([document, toolRoot]);
    expect(toolbar.positionFocusHighlight).not.toHaveBeenCalled();
    expect(toolbar.hideFocusHighlight).toHaveBeenCalled();

    effects.deactivate();
    const pageTarget = getElement("page-target");
    pageTarget.focus();
    toolbar.positionFocusHighlight.mockClear();
    document.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(toolbar.positionFocusHighlight).not.toHaveBeenCalled();

    effects.start();
    expect(toolbar.positionFocusHighlight).toHaveBeenLastCalledWith(pageTarget);
    toolbar.positionFocusHighlight.mockClear();
    getElement("page-target-2").focus();
    expect(toolbar.positionFocusHighlight).toHaveBeenCalledTimes(1);
    effects.destroy();
  });

  it("keeps reading, active-region and descendant focus overlays independent", () => {
    document.body.innerHTML = `
      <section id="region" tabindex="-1">
        <button id="inside">区域内部</button>
      </section>
    `;
    const toolbar = createToolbarMock();
    const effects = createEffects(toolbar.ui);
    const region = getElement("region");
    const inside = getElement("inside");

    effects.start();
    region.focus();
    effects.setRegionHighlight(region);
    expect(toolbar.positionRegionHighlight).toHaveBeenLastCalledWith(region);
    expect(toolbar.hideFocusHighlight).toHaveBeenCalled();

    toolbar.positionFocusHighlight.mockClear();
    toolbar.hideRegionHighlight.mockClear();
    inside.focus();
    expect(toolbar.positionFocusHighlight).toHaveBeenLastCalledWith(inside);
    expect(toolbar.hideRegionHighlight).not.toHaveBeenCalled();

    effects.setHighlight(inside);
    expect(toolbar.positionHighlight).toHaveBeenLastCalledWith(inside);
    effects.clearHighlight(inside);
    expect(toolbar.hideHighlight).toHaveBeenCalled();
    expect(toolbar.hideRegionHighlight).not.toHaveBeenCalled();

    effects.clearRegionHighlight(region);
    expect(toolbar.hideRegionHighlight).toHaveBeenCalledTimes(1);
    effects.destroy();
  });

  it("repositions visible focus and hides targets that stop rendering", () => {
    document.body.innerHTML = '<button id="moving">移动目标</button>';
    const toolbar = createToolbarMock();
    const effects = createEffects(toolbar.ui);
    const moving = getElement("moving");

    effects.start();
    moving.focus();
    toolbar.positionFocusHighlight.mockClear();

    document.dispatchEvent(new Event("scroll"));
    expect(toolbar.positionFocusHighlight).toHaveBeenCalledWith(moving);

    moving.hidden = true;
    effects.setRoots([document]);
    expect(toolbar.hideFocusHighlight).toHaveBeenCalled();
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
    hideFocusHighlight: vi.fn(),
    hideHighlight: vi.fn(),
    hideRegionHighlight: vi.fn(),
    positionCrosshair: vi.fn(),
    positionFocusHighlight: vi.fn(),
    positionHighlight: vi.fn(),
    positionRegionHighlight: vi.fn(),
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
