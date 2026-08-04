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

  it("retains explicitly marked hidden tab panels and resolves their tab names", () => {
    document.body.innerHTML = `
      <style>[role="tabpanel"][data-a11y-hidden] { display: none; }</style>
      <div role="tablist">
        <button id="tab-overview" role="tab" aria-controls="panel-overview">概览</button>
        <button id="tab-protocol" role="tab" aria-controls="panel-protocol" data-a11y-label="属性协议短名">属性协议</button>
        <button id="tab-unmarked" role="tab" aria-controls="panel-unmarked">未标记</button>
      </div>
      <section id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" data-a11y-region="viewport" data-a11y-hidden></section>
      <section id="panel-protocol" role="tabpanel" data-a11y-region="viewport" data-a11y-hidden></section>
      <section id="panel-unmarked" role="tabpanel" data-a11y-hidden></section>
      <section id="ordinary-hidden" data-a11y-region="viewport" hidden></section>
    `;

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

    expect(find(regions, "panel-overview")).toMatchObject({
      type: "viewport",
      label: "概览",
      linkedTab: document.getElementById("tab-overview"),
    });
    expect(find(regions, "panel-protocol")).toMatchObject({
      type: "viewport",
      label: "属性协议短名",
      linkedTab: document.getElementById("tab-protocol"),
    });
    expect(find(regions, "panel-unmarked")).toBeUndefined();
    expect(find(regions, "ordinary-hidden")).toBeUndefined();
    scanner.stop();
  });

  it("retains hidden panel regions in open shadow roots and same-origin iframes", () => {
    document.body.innerHTML = `<div id="host"></div><iframe id="frame"></iframe>`;
    const host = document.getElementById("host");
    const shadowRoot = host?.attachShadow({ mode: "open" });
    if (!shadowRoot) {
      throw new Error("Missing shadow root");
    }
    shadowRoot.innerHTML = `
      <style>[data-a11y-hidden] { display: none; }</style>
      <div role="tablist"><button id="shadow-tab" role="tab" aria-controls="shadow-panel">影子选项</button></div>
      <section id="shadow-panel" role="tabpanel" data-a11y-region="viewport" data-a11y-hidden></section>
    `;
    const frame = document.getElementById("frame") as HTMLIFrameElement | null;
    const frameDocument = frame?.contentDocument;
    if (!frameDocument) {
      throw new Error("Missing iframe document");
    }
    frameDocument.body.innerHTML = `
      <style>[data-a11y-hidden] { display: none; }</style>
      <div role="tablist"><button id="frame-tab" role="tab" aria-controls="frame-panel">框架选项</button></div>
      <section id="frame-panel" role="tabpanel" data-a11y-region="viewport" data-a11y-hidden></section>
    `;

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

    expect(find(regions, "shadow-panel")?.label).toBe("影子选项");
    expect(find(regions, "frame-panel")?.label).toBe("框架选项");
    expect(find(regions, "shadow-panel")?.linkedTab?.id).toBe("shadow-tab");
    expect(find(regions, "frame-panel")?.linkedTab?.id).toBe("frame-tab");
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
