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
    const setRegionHighlight = vi.fn();
    const controller = createController({
      setRegionHighlight,
      clearRegionHighlight: vi.fn(),
    });
    controller.start();
    controller.update(regions, [document], "initial");
    controller.navigate("service");
    controller.navigate("service");
    expect(document.activeElement).toBe(last);

    last.remove();
    controller.update([regions[0] as ScannedRegion], [document], "mutation");

    expect(document.activeElement).toBe(first);
    expect(setRegionHighlight).toHaveBeenLastCalledWith(first);
    controller.stop();
  });

  it("recovers when the current element is reclassified", () => {
    document.body.innerHTML = `
      <section id="service-a"></section>
      <section id="service-b"></section>
    `;
    const first = get("service-a");
    const second = get("service-b");
    const setRegionHighlight = vi.fn();
    const controller = createController({
      setRegionHighlight,
      clearRegionHighlight: vi.fn(),
    });
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
    expect(setRegionHighlight).toHaveBeenLastCalledWith(second);
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
    const clearRegionHighlight = vi.fn();
    const controller = createController({
      setRegionHighlight: vi.fn(),
      clearRegionHighlight,
    });
    controller.start();
    controller.update([region(activeRegion)], [document], "initial");
    controller.navigate("service");
    clearRegionHighlight.mockClear();

    get("inside-a").focus();
    get("inside-b").focus();
    expect(clearRegionHighlight).not.toHaveBeenCalled();

    get("outside").focus();
    expect(clearRegionHighlight).toHaveBeenCalledTimes(1);
    controller.stop();
  });
});

function createController(
  effects = {
    setRegionHighlight: vi.fn(),
    clearRegionHighlight: vi.fn(),
  },
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
