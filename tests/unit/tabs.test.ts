import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/core/config";
import { TabsController } from "../../src/features/tabs";

describe("TabsController", () => {
  it("uses roving tabindex, triggers original events and enters panels", async () => {
    document.body.innerHTML = `
      <div role="tablist" aria-label="示例">
        <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true">A</button>
        <button id="tab-b" role="tab" aria-controls="panel-b" aria-selected="false">B</button>
      </div>
      <section id="panel-a" role="tabpanel">A panel</section>
      <section id="panel-b" role="tabpanel" hidden>B panel</section>
    `;
    const list = document.querySelector<HTMLElement>('[role="tablist"]');
    const tabA = get("tab-a");
    const tabB = get("tab-b");
    const panelA = get("panel-a");
    const panelB = get("panel-b");
    const clickListener = vi.fn((event: Event) => {
      const tab = event.target as HTMLElement;
      panelA.hidden = tab !== tabA;
      panelB.hidden = tab !== tabB;
    });
    list?.addEventListener("click", clickListener);

    const announce = vi.fn();
    const controller = new TabsController(
      mergeConfig(DEFAULT_CONFIG, { tabs: { panelReadyTimeoutMs: 100 } }),
      { onAnnounce: announce, onError: vi.fn() },
    );
    controller.start([document]);

    expect(tabA.tabIndex).toBe(0);
    expect(tabB.tabIndex).toBe(-1);

    tabA.focus();
    tabA.dispatchEvent(key("ArrowRight"));
    await frame();
    expect(document.activeElement).toBe(tabB);
    expect(clickListener).toHaveBeenCalledTimes(1);
    expect(tabB.getAttribute("aria-selected")).toBe("true");
    expect(panelB.hidden).toBe(false);

    tabB.dispatchEvent(key("ArrowDown", { altKey: true }));
    await frame();
    expect(document.activeElement).toBe(panelB);
    panelB.dispatchEvent(key("Escape"));
    await frame();
    expect(document.activeElement).toBe(tabB);

    controller.stop();
    expect(tabA.hasAttribute("tabindex")).toBe(false);
  });

  it("supports manual activation and multiple configured events", async () => {
    document.body.innerHTML = `
      <div role="tablist" data-a11y-activation="manual" data-a11y-trigger-event="mouseover click">
        <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true">A</button>
        <button id="tab-b" role="tab" aria-controls="panel-b">B</button>
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
    tabA.focus();
    tabA.dispatchEvent(key("ArrowRight"));
    expect(document.activeElement).toBe(tabB);
    expect(mouseover).not.toHaveBeenCalled();

    tabB.dispatchEvent(key("Enter"));
    await frame();
    expect(mouseover).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(tabB.getAttribute("aria-selected")).toBe("true");
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
