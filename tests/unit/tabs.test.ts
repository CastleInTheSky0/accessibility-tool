import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/core/config";
import { TabsController } from "../../src/features/tabs";

describe("TabsController", () => {
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
      { onAnnounce: announce, onError: vi.fn() },
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
      { onAnnounce: vi.fn(), onError: vi.fn() },
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
      { onAnnounce: vi.fn(), onError: vi.fn() },
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
      { onAnnounce: vi.fn(), onError: vi.fn() },
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
});

function get(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
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
