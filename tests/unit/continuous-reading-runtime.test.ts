import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessibilityToolRuntime } from "../../src/tool";
import type {
  SpeechAdapter,
  SpeechRequestOptions,
} from "../../src/types";

describe("AccessibilityTool continuous-reading runtime", () => {
  const runtimes: AccessibilityToolRuntime[] = [];

  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.destroy()));
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("orders auto-enable, session, segment and speech events", async () => {
    document.body.innerHTML = `
      <button id="launcher" data-a11y-ignore>打开工具</button>
      <p>第一段</p>
      <p>第二段</p>
    `;
    const adapter = new RuntimeSpeechAdapter(true);
    const runtime = createRuntime(adapter, "runtime-order");
    runtimes.push(runtime);
    const events: string[] = [];
    runtime
      .on("statechange", (state) =>
        events.push(
          `state:${String(state.readingEnabled)}:${state.continuousReadingState}`,
        ),
      )
      .on("continuousreadingstart", ({ count }) =>
        events.push(`start:${count}`),
      )
      .on("continuousreadingsegmentchange", ({ index }) =>
        events.push(`segment:${index}`),
      )
      .on("continuousreadingpause", ({ index }) =>
        events.push(`pause:${index}`),
      )
      .on("continuousreadingresume", ({ index }) =>
        events.push(`resume:${index}`),
      )
      .on("continuousreadingstop", ({ reason }) =>
        events.push(`stop:${reason}`),
      )
      .on("speechstart", () => events.push("speechstart"))
      .on("speechend", () => events.push("speechend"));

    await runtime.open({ trigger: get("launcher") });
    events.length = 0;
    const shadow = getShadowRoot();
    shadow
      .querySelector<HTMLElement>('[data-action="continuousReading"]')
      ?.click();
    shadow
      .querySelector<HTMLButtonElement>('[data-intent="start"]')
      ?.click();

    expect(events).toEqual([
      "state:true:idle",
      "state:true:playing",
      "start:2",
      "segment:1",
      "speechstart",
    ]);
    expect(runtime.getState()).toMatchObject({
      readingEnabled: true,
      continuousReadingState: "playing",
    });

    adapter.end(0);
    expect(events.slice(-3)).toEqual([
      "speechend",
      "segment:2",
      "speechstart",
    ]);
    shadow
      .querySelector<HTMLButtonElement>('[data-intent="pause"]')
      ?.click();
    expect(events.slice(-2)).toEqual(["state:true:paused", "pause:2"]);

    const interrupted = adapter.requests[1];
    interrupted?.options.onEnd?.();
    expect(adapter.requests).toHaveLength(2);
    shadow
      .querySelector<HTMLButtonElement>('[data-intent="resume"]')
      ?.click();
    expect(events.slice(-3)).toEqual([
      "state:true:playing",
      "resume:2",
      "speechstart",
    ]);
    shadow
      .querySelector<HTMLButtonElement>('[data-intent="stop"]')
      ?.click();
    expect(events.slice(-2)).toEqual(["state:true:idle", "stop:stopped"]);
    expect(runtime.getState()).toMatchObject({
      readingEnabled: true,
      continuousReadingState: "idle",
    });
  });

  it("keeps unsupported and empty starts idle with live-only feedback", async () => {
    document.body.innerHTML = `
      <button id="launcher" data-a11y-ignore>打开工具</button>
    `;
    const unsupportedRuntime = createRuntime(
      new RuntimeSpeechAdapter(false),
      "runtime-unsupported",
    );
    runtimes.push(unsupportedRuntime);
    const unsupportedStarts = vi.fn();
    const unsupportedStops = vi.fn();
    unsupportedRuntime
      .on("continuousreadingstart", unsupportedStarts)
      .on("continuousreadingstop", unsupportedStops);
    await unsupportedRuntime.open({ trigger: get("launcher") });
    let shadow = getShadowRoot();
    shadow
      .querySelector<HTMLElement>('[data-action="continuousReading"]')
      ?.click();
    const unsupportedStart = shadow.querySelector<HTMLButtonElement>(
      '[data-intent="start"]',
    );
    expect(unsupportedStart?.getAttribute("aria-disabled")).toBe("true");
    unsupportedStart?.click();
    await liveRegionTick();
    expect(unsupportedRuntime.getState()).toMatchObject({
      readingEnabled: false,
      continuousReadingState: "idle",
    });
    expect(unsupportedStarts).not.toHaveBeenCalled();
    expect(unsupportedStops).not.toHaveBeenCalled();
    expect(shadow.querySelector('[role="status"]')?.textContent).toContain(
      "当前浏览器不支持语音合成",
    );

    await unsupportedRuntime.destroy();
    runtimes.splice(runtimes.indexOf(unsupportedRuntime), 1);
    document.body.innerHTML = `
      <button id="launcher-empty" data-a11y-ignore>打开工具</button>
    `;
    const emptyRuntime = createRuntime(
      new RuntimeSpeechAdapter(true),
      "runtime-empty",
    );
    runtimes.push(emptyRuntime);
    const emptyStarts = vi.fn();
    const emptyStops = vi.fn();
    emptyRuntime
      .on("continuousreadingstart", emptyStarts)
      .on("continuousreadingstop", emptyStops);
    await emptyRuntime.open({ trigger: get("launcher-empty") });
    shadow = getShadowRoot();
    shadow
      .querySelector<HTMLElement>('[data-action="continuousReading"]')
      ?.click();
    shadow
      .querySelector<HTMLButtonElement>('[data-intent="start"]')
      ?.click();
    await liveRegionTick();
    expect(emptyRuntime.getState()).toMatchObject({
      readingEnabled: true,
      continuousReadingState: "idle",
    });
    expect(emptyStarts).not.toHaveBeenCalled();
    expect(emptyStops).not.toHaveBeenCalled();
    expect(shadow.querySelector('[role="status"]')?.textContent).toContain(
      "当前范围没有可朗读内容",
    );
  });
});

class RuntimeSpeechAdapter implements SpeechAdapter {
  readonly requests: Array<{
    text: string;
    options: SpeechRequestOptions;
  }> = [];
  readonly cancel = vi.fn();

  constructor(private readonly supported: boolean) {}

  speak(text: string, options: SpeechRequestOptions): void {
    this.requests.push({ text, options });
    options.onStart?.();
  }

  end(index: number): void {
    this.requests[index]?.options.onEnd?.();
  }

  isSupported(): boolean {
    return this.supported;
  }
}

function createRuntime(
  adapter: SpeechAdapter,
  storageSuffix: string,
): AccessibilityToolRuntime {
  const runtime = new AccessibilityToolRuntime();
  runtime.configure({
    debug: true,
    storageKey: `test:${storageSuffix}`,
    speech: { adapter },
    regions: { observe: false },
  });
  return runtime;
}

function get(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}

function getShadowRoot(): ShadowRoot {
  const shadow = document.querySelector<HTMLElement>("[data-a11y-tool-host]")
    ?.shadowRoot;
  if (!shadow) {
    throw new Error("Missing accessibility toolbar shadow root");
  }
  return shadow;
}

async function liveRegionTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}
