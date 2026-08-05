import { describe, expect, it, vi } from "vitest";
import { OPEN_STATE_STORAGE_VERSION } from "../../src/core/constants";
import {
  deriveOpenStateStorageKey,
  OpenStateStore,
} from "../../src/core/storage";
import { AccessibilityToolRuntime } from "../../src/tool";
import type { SpeechAdapter } from "../../src/types";

const speech: SpeechAdapter = {
  speak: vi.fn(),
  cancel: vi.fn(),
  isSupported: () => true,
};

describe("persisted open intent", () => {
  it("marks only successful opens, survives reset, and clears on close/destroy", async () => {
    const storageKey = "test:open-lifecycle";
    const intentKey = deriveOpenStateStorageKey(storageKey);
    document.body.innerHTML = '<button id="launcher">打开</button>';
    const launcher = document.getElementById("launcher") as HTMLButtonElement;
    const runtime = createRuntime(storageKey);

    await runtime.open({ trigger: launcher });
    expect(readIntent(intentKey)).toEqual({ version: 1, isOpen: true });

    await runtime.reset();
    expect(runtime.getState().isOpen).toBe(true);
    expect(readIntent(intentKey)).toEqual({ version: 1, isOpen: true });

    await runtime.close();
    expect(runtime.getState().isOpen).toBe(false);
    expect(localStorage.getItem(intentKey)).toBeNull();

    await runtime.open({ trigger: launcher });
    expect(readIntent(intentKey)).toEqual({ version: 1, isOpen: true });
    await runtime.destroy();
    expect(localStorage.getItem(intentKey)).toBeNull();
  });

  it("uses the final pre-DOMContentLoaded storageKey and restores silently", async () => {
    const storageKey = "test:auto-final-key";
    const frames = holdAnimationFrames();
    markOpen(storageKey);
    document.body.innerHTML = '<input id="kept-focus" aria-label="保持焦点">';
    const focused = document.getElementById("kept-focus") as HTMLInputElement;
    focused.focus();
    const readyState = vi
      .spyOn(document, "readyState", "get")
      .mockReturnValue("interactive");
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
    const runtime = createRuntime(storageKey);

    readyState.mockReturnValue("complete");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await waitFor(() => runtime.getState().isOpen && frames.pending() > 0);
    frames.flush();
    await delay(0);

    const host = document.querySelector<HTMLElement>("[data-a11y-tool-host]");
    const liveRegion = host?.shadowRoot?.querySelector('[role="status"]');
    expect(host?.hidden).toBe(false);
    expect(document.activeElement).toBe(focused);
    expect(liveRegion?.textContent).toBe("");
    expect(focused.hasAttribute("aria-expanded")).toBe(false);

    await runtime.open({ trigger: focused });
    await delay(30);
    const firstControl = host?.shadowRoot?.querySelector<HTMLElement>(
      '[data-action="reading"]',
    );
    expect(focused.getAttribute("aria-expanded")).toBe("true");
    expect(host?.shadowRoot?.activeElement).toBe(firstControl);
    expect(liveRegion?.textContent).toContain("无障碍工具栏已打开");
    await runtime.destroy();
  });

  it("migrates an open marker when storageKey changes and clears it when disabled", async () => {
    const oldStorageKey = "test:open-old";
    const nextStorageKey = "test:open-next";
    const runtime = createRuntime(oldStorageKey);

    await runtime.open();
    expect(localStorage.getItem(deriveOpenStateStorageKey(oldStorageKey))).not.toBeNull();

    runtime.configure({ storageKey: nextStorageKey });
    expect(localStorage.getItem(deriveOpenStateStorageKey(oldStorageKey))).toBeNull();
    expect(localStorage.getItem(deriveOpenStateStorageKey(nextStorageKey))).not.toBeNull();

    runtime.configure({ persistOpenState: false });
    expect(runtime.getState().isOpen).toBe(true);
    expect(localStorage.getItem(deriveOpenStateStorageKey(nextStorageKey))).toBeNull();
    await runtime.destroy();
  });

  it("lets close finish after a pending silent restore and clears the intent", async () => {
    const storageKey = "test:close-pending-restore";
    const frames = holdAnimationFrames();
    markOpen(storageKey);
    const runtime = createRuntime(storageKey);
    await waitFor(() => runtime.getState().isOpen && frames.pending() > 0);

    const closing = runtime.close();
    frames.flush();
    await closing;

    expect(runtime.getState().isOpen).toBe(false);
    expect(localStorage.getItem(deriveOpenStateStorageKey(storageKey))).toBeNull();
    expect(document.querySelector<HTMLElement>("[data-a11y-tool-host]")?.hidden).toBe(true);
    await runtime.destroy();
  });

  it("preserves explicit focus and announcement semantics during a restore race", async () => {
    const storageKey = "test:explicit-restore-race";
    const frames = holdAnimationFrames();
    markOpen(storageKey);
    document.body.innerHTML = '<button id="launcher">打开</button>';
    const launcher = document.getElementById("launcher") as HTMLButtonElement;
    const runtime = createRuntime(storageKey);
    await waitFor(() => runtime.getState().isOpen && frames.pending() > 0);

    const explicitOpen = runtime.open({ trigger: launcher });
    frames.flush();
    await explicitOpen;
    await delay(30);

    const host = document.querySelector<HTMLElement>("[data-a11y-tool-host]");
    const firstControl = host?.shadowRoot?.querySelector<HTMLElement>(
      '[data-action="reading"]',
    );
    const liveRegion = host?.shadowRoot?.querySelector('[role="status"]');
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(host?.shadowRoot?.activeElement).toBe(firstControl);
    expect(liveRegion?.textContent).toContain("无障碍工具栏已打开");
    expect(localStorage.getItem(deriveOpenStateStorageKey(storageKey))).not.toBeNull();
    await runtime.destroy();
  });

  it("serializes a later close behind an explicit open waiting on restoration", async () => {
    const storageKey = "test:restore-explicit-close-race";
    const frames = holdAnimationFrames();
    markOpen(storageKey);
    document.body.innerHTML = '<button id="launcher">打开</button>';
    const launcher = document.getElementById("launcher") as HTMLButtonElement;
    const runtime = createRuntime(storageKey);
    await waitFor(() => runtime.getState().isOpen && frames.pending() > 0);

    const explicitOpen = runtime.open({ trigger: launcher });
    const closing = runtime.close();
    frames.flush();
    await explicitOpen;
    await closing;

    expect(runtime.getState().isOpen).toBe(false);
    expect(localStorage.getItem(deriveOpenStateStorageKey(storageKey))).toBeNull();
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector<HTMLElement>("[data-a11y-tool-host]")?.hidden).toBe(true);
    await runtime.destroy();
  });

  it("does not restore when persistence is disabled and clears the current marker", async () => {
    const storageKey = "test:auto-disabled";
    markOpen(storageKey);
    const runtime = new AccessibilityToolRuntime();
    runtime.configure({
      debug: true,
      storageKey,
      persistOpenState: false,
      speech: { adapter: speech },
      regions: { observe: false },
    });

    await delay(40);
    expect(runtime.getState().isOpen).toBe(false);
    expect(document.querySelector("[data-a11y-tool-host]")).toBeNull();
    expect(localStorage.getItem(deriveOpenStateStorageKey(storageKey))).toBeNull();
    await runtime.destroy();
  });

  it("clears the intent when explicit or automatic opening fails", async () => {
    const explicitKey = "test:open-explicit-failure";
    const explicit = createRuntime(explicitKey, {
      strict: true,
      regions: { observe: false, selectors: { navigation: "[" } },
    });

    await expect(explicit.open()).rejects.toThrow();
    expect(localStorage.getItem(deriveOpenStateStorageKey(explicitKey))).toBeNull();
    await explicit.destroy();

    const automaticKey = "test:open-auto-failure";
    markOpen(automaticKey);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const automatic = createRuntime(automaticKey, {
      strict: true,
      regions: { observe: false, selectors: { navigation: "[" } },
    });
    await waitFor(
      () => localStorage.getItem(deriveOpenStateStorageKey(automaticKey)) === null,
    );

    expect(automatic.getState().isOpen).toBe(false);
    expect(document.querySelector("[data-a11y-tool-host]")).toBeNull();
    expect(warn).toHaveBeenCalled();
    await automatic.destroy();
  });

  it("keeps explicit lifecycle calls usable when localStorage is blocked", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    const runtime = createRuntime("test:blocked-storage");

    await expect(runtime.open()).resolves.toBe(runtime);
    await expect(runtime.reset()).resolves.toBe(runtime);
    await expect(runtime.close()).resolves.toBe(runtime);
    await expect(runtime.destroy()).resolves.toBeUndefined();
  });
});

function createRuntime(
  storageKey: string,
  config: Parameters<AccessibilityToolRuntime["configure"]>[0] = {},
): AccessibilityToolRuntime {
  const runtime = new AccessibilityToolRuntime();
  runtime.configure({
    debug: true,
    storageKey,
    speech: { adapter: speech },
    regions: { observe: false },
    ...config,
  });
  return runtime;
}

function markOpen(storageKey: string): void {
  new OpenStateStore(
    deriveOpenStateStorageKey(storageKey),
    OPEN_STATE_STORAGE_VERSION,
  ).markOpen();
}

function readIntent(key: string): unknown {
  return JSON.parse(localStorage.getItem(key) ?? "null");
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await delay(10);
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

function holdAnimationFrames(): {
  pending: () => number;
  flush: () => void;
} {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    }),
  );
  return {
    pending: () => callbacks.length,
    flush: () => {
      while (callbacks.length > 0) {
        callbacks.shift()?.(performance.now());
      }
    },
  };
}
