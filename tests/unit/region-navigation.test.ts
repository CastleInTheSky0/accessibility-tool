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
    const controller = createController();
    controller.start();
    controller.update(regions, [document], "initial");
    controller.navigate("service");
    controller.navigate("service");
    expect(document.activeElement).toBe(last);

    last.remove();
    controller.update([regions[0] as ScannedRegion], [document], "mutation");

    expect(document.activeElement).toBe(first);
    controller.stop();
  });

  it("recovers when the current element is reclassified", () => {
    document.body.innerHTML = `
      <section id="service-a"></section>
      <section id="service-b"></section>
    `;
    const first = get("service-a");
    const second = get("service-b");
    const controller = createController();
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
    controller.stop();
  });
});

function createController(): RegionNavigationController {
  return new RegionNavigationController(
    {
      setHighlight: vi.fn(),
      clearHighlight: vi.fn(),
    },
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
