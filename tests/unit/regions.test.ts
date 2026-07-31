import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/core/config";
import {
  RegionScanner,
  type ScannedRegion,
} from "../../src/features/regions";

describe("RegionScanner", () => {
  it("applies config, data, legacy and semantic priority", () => {
    document.body.innerHTML = `
      <nav id="configured" class="service" data-a11y-region="navigation" data-a11y-label="配置优先"></nav>
      <section id="numeric" data-a11y-region="2" data-a11y-label="数字导航"></section>
      <article id="legacy" aria-role="6" aria-readlabel="旧正文"></article>
      <form id="semantic" aria-label="自动表单"></form>
      <section hidden><nav id="hidden">隐藏导航</nav></section>
      <ul id="plain"><li>普通列表不推测</li></ul>
      <div id="named-list" role="list" aria-label="命名列表"></div>
    `;

    let regions: readonly ScannedRegion[] = [];
    const scanner = new RegionScanner(
      mergeConfig(DEFAULT_CONFIG, {
        regions: {
          observe: false,
          selectors: { service: ".service" },
        },
      }),
      {
        onUpdate: (next) => {
          regions = next;
        },
        onRouteChange: vi.fn(),
        onError: vi.fn(),
      },
    );

    scanner.start();
    expect(find(regions, "configured")?.type).toBe("service");
    expect(find(regions, "configured")?.source).toBe("config");
    expect(find(regions, "numeric")?.type).toBe("navigation");
    expect(find(regions, "legacy")?.label).toBe("旧正文");
    expect(find(regions, "semantic")?.type).toBe("interaction");
    expect(find(regions, "hidden")).toBeUndefined();
    expect(find(regions, "plain")).toBeUndefined();
    expect(find(regions, "named-list")?.type).toBe("list");
    scanner.stop();
  });

  it("can disable semantic detection and scans open shadow roots", () => {
    document.body.innerHTML = `<nav id="semantic-nav"></nav><div id="host"></div>`;
    const host = document.getElementById("host");
    const shadow = host?.attachShadow({ mode: "open" });
    shadow?.append(
      Object.assign(document.createElement("section"), {
        id: "shadow-service",
      }),
    );
    shadow
      ?.getElementById("shadow-service")
      ?.setAttribute("data-a11y-region", "service");

    let regions: readonly ScannedRegion[] = [];
    const scanner = new RegionScanner(
      mergeConfig(DEFAULT_CONFIG, {
        regions: { autoDetect: false, observe: false },
      }),
      {
        onUpdate: (next) => {
          regions = next;
        },
        onRouteChange: vi.fn(),
        onError: vi.fn(),
      },
    );
    scanner.start();

    expect(find(regions, "semantic-nav")).toBeUndefined();
    expect(find(regions, "shadow-service")?.type).toBe("service");
    scanner.stop();
  });

  it("does not overwrite a newer history integration when stopped", () => {
    const originalPushState: History["pushState"] = Reflect.get(
      history,
      "pushState",
    );
    const scanner = new RegionScanner(
      mergeConfig(DEFAULT_CONFIG, { regions: { observe: false } }),
      {
        onUpdate: vi.fn(),
        onRouteChange: vi.fn(),
        onError: vi.fn(),
      },
    );
    scanner.start();

    const externalPushState: History["pushState"] = function (
      this: History,
      ...args
    ): void {
      Reflect.apply(originalPushState, this, args);
    };
    history.pushState = externalPushState;
    scanner.stop();

    expect(Reflect.get(history, "pushState")).toBe(externalPushState);
    history.pushState = originalPushState;
  });
});

function find(
  regions: readonly ScannedRegion[],
  id: string,
): ScannedRegion | undefined {
  return regions.find((region) => region.element.id === id);
}
