import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config";
import {
  getAccessibleText,
  getContinuousAccessibleText,
  shouldIgnoreReadingTarget,
} from "../../src/core/dom";
import { TypedEmitter } from "../../src/core/emitter";
import {
  buildContinuousReadingSequence,
  findActiveModalDialog,
  findContinuousStartIndex,
  resolveContinuousReadingCandidate,
} from "../../src/features/continuous-reading";
import type { PageEffectsController } from "../../src/features/page-effects";
import { ReadingController } from "../../src/features/reading";
import { SpeechController } from "../../src/features/speech";
import type {
  AccessibilityToolEventMap,
  SpeechAdapter,
  SpeechRequestOptions,
} from "../../src/types";

describe("continuous reading sequence", () => {
  it("captures a pre-existing deep page focus before toolbar takeover", () => {
    document.body.innerHTML = `
      <p>页面第一段</p>
      <div id="focus-shadow-host"></div>
    `;
    const host = get("focus-shadow-host");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<button id="deep-focus">深层起点</button>`;
    const deepFocus = shadow.getElementById("deep-focus") as HTMLButtonElement;
    deepFocus.focus();

    const adapter = new ControlledSpeechAdapter();
    const reading = createReadingController(
      adapter,
      new TypedEmitter<AccessibilityToolEventMap>(),
      {},
    );
    reading.setRoots([document, shadow]);
    reading.rememberActivePageTarget();

    expect(reading.startContinuous()).toBe("started");
    expect(adapter.requests[0]?.text).toBe("按钮，深层起点");
    reading.stopContinuous();
  });

  it("falls back to the retained current region when the page target expires", () => {
    document.body.innerHTML = `
      <p>页面第一段</p>
      <section id="retained-region">
        <p>区域起点</p>
        <button id="expired-target">临时焦点</button>
      </section>
    `;
    const adapter = new ControlledSpeechAdapter();
    const reading = createReadingController(
      adapter,
      new TypedEmitter<AccessibilityToolEventMap>(),
      {},
    );
    reading.setRoots([document]);
    reading.rememberPageTarget(get("expired-target"));
    reading.rememberRegionTarget(get("retained-region"));
    get("expired-target").hidden = true;

    expect(reading.startContinuous()).toBe("started");
    expect(adapter.requests[0]?.text).toBe("文本：区域起点");
    reading.stopContinuous();
  });

  it("keeps composed order and hides editable values across iframe realms", () => {
    document.body.innerHTML = `
      <p id="before">正文之前</p>
      <iframe id="same-origin-frame"></iframe>
      <p id="after">正文之后</p>
      <p data-a11y-sensitive>页面敏感内容</p>
    `;
    const frame = get("same-origin-frame") as HTMLIFrameElement;
    const frameDocument = frame.contentDocument;
    if (!frameDocument?.body) {
      throw new Error("Missing same-origin frame document");
    }
    frameDocument.body.innerHTML = `
      <label for="account">账户</label>
      <input id="account" value="private-value" placeholder="请输入账户" aria-describedby="account-help">
      <span id="account-help">仅用于登录</span>
      <input type="password" value="password-secret">
      <label for="card-expiry">有效期</label>
      <input id="card-expiry" autocomplete="SECTION-checkout billing CC-EXP-Year" value="payment-secret">
      <input id="otp" autocomplete="SECTION-login ONE-TIME-CODE" value="otp-secret">
    `;
    const input = frameDocument.getElementById("account") as HTMLInputElement;

    expect(getAccessibleText(input)).toContain("private-value");
    expect(getAccessibleText(input)).not.toContain("仅用于登录");
    expect(getContinuousAccessibleText(input)).toBe(
      "输入框：账户 请输入账户 仅用于登录",
    );
    expect(getContinuousAccessibleText(input)).not.toContain("private-value");

    const sequence = buildContinuousReadingSequence({
      roots: [document],
      scope: null,
      config: DEFAULT_CONFIG,
      isTabControl: () => false,
    });
    const texts = sequence
      .map((candidate) =>
        resolveContinuousReadingCandidate(candidate, DEFAULT_CONFIG),
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map(({ text }) => text);

    expect(texts).toEqual([
      "文本：正文之前",
      "输入框：账户 请输入账户 仅用于登录",
      "文本：正文之后",
    ]);
    expect(texts.join(" ")).not.toContain("private-value");
    expect(texts.join(" ")).not.toContain("password-secret");
    expect(texts.join(" ")).not.toContain("payment-secret");
    expect(texts.join(" ")).not.toContain("otp-secret");
    expect(texts.join(" ")).not.toContain("页面敏感内容");
    expect(
      shouldIgnoreReadingTarget(
        frameDocument.getElementById("card-expiry") as HTMLInputElement,
        [],
      ),
    ).toBe(true);
    expect(
      shouldIgnoreReadingTarget(
        frameDocument.getElementById("otp") as HTMLInputElement,
        [],
      ),
    ).toBe(true);
  });

  it("revalidates privacy boundaries on shadow hosts and iframe elements", () => {
    document.body.innerHTML = `
      <div id="shadow-host"></div>
      <iframe id="privacy-frame"></iframe>
    `;
    const host = get("shadow-host");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<p>Shadow text</p>";
    const frame = get("privacy-frame") as HTMLIFrameElement;
    const frameDocument = frame.contentDocument;
    if (!frameDocument?.body) {
      throw new Error("Missing privacy frame document");
    }
    frameDocument.body.innerHTML = "<p>Frame text</p>";
    const sequence = buildContinuousReadingSequence({
      roots: [document, shadow, frameDocument],
      scope: null,
      config: DEFAULT_CONFIG,
      isTabControl: () => false,
    });
    const shadowCandidate = sequence.find(({ element }) =>
      shadow.contains(element),
    );
    const frameCandidate = sequence.find(
      ({ element }) => element.ownerDocument === frameDocument,
    );
    expect(shadowCandidate).toBeTruthy();
    expect(frameCandidate).toBeTruthy();

    host.setAttribute("data-a11y-sensitive", "");
    frame.hidden = true;
    expect(
      shadowCandidate &&
        resolveContinuousReadingCandidate(shadowCandidate, DEFAULT_CONFIG),
    ).toBeNull();
    expect(
      frameCandidate &&
        resolveContinuousReadingCandidate(frameCandidate, DEFAULT_CONFIG),
    ).toBeNull();
  });

  it("includes generic, body and bare slotted text without duplicating blocks", () => {
    document.body.innerHTML = `
      页面裸文本
      <div id="generic">通用正文 <span>内联正文</span><p>段落正文</p></div>
      <div id="slot-host">插槽正文</div>
    `;
    const host = get("slot-host");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<slot></slot><slot name="missing">回退正文</slot>`;

    const sequence = buildContinuousReadingSequence({
      roots: [document, shadow],
      scope: null,
      config: DEFAULT_CONFIG,
      isTabControl: () => false,
    });
    const texts = sequence
      .map((candidate) =>
        resolveContinuousReadingCandidate(candidate, DEFAULT_CONFIG),
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map(({ text }) => text);

    expect(texts).toEqual([
      "文本：页面裸文本",
      "文本：通用正文",
      "文本：内联正文",
      "文本：段落正文",
      "文本：插槽正文",
      "文本：回退正文",
    ]);
  });

  it("reads the visible tab panel by segment without activating hidden panels", () => {
    document.body.innerHTML = `
      <div role="tablist">
        <button id="overview-tab" role="tab" aria-controls="overview-panel" aria-selected="true">概览</button>
        <button id="details-tab" role="tab" aria-controls="details-panel" aria-selected="false">详情</button>
      </div>
      <section id="overview-panel" role="tabpanel" aria-labelledby="overview-tab">
        <p>面板第一段</p>
        <p>面板第二段</p>
      </section>
      <section id="details-panel" role="tabpanel" aria-labelledby="details-tab" aria-hidden="true" data-a11y-hidden>
        <p>隐藏面板正文</p>
      </section>
    `;
    const hiddenPanel = get("details-panel");
    const sequence = buildContinuousReadingSequence({
      roots: [document],
      scope: null,
      config: DEFAULT_CONFIG,
      isTabControl: (element) => element.getAttribute("role") === "tab",
    });
    const texts = sequence
      .map((candidate) =>
        resolveContinuousReadingCandidate(candidate, DEFAULT_CONFIG),
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map(({ text }) => text);

    expect(texts).toContain("文本：面板第一段");
    expect(texts).toContain("文本：面板第二段");
    expect(texts.join(" ")).not.toContain("隐藏面板正文");
    expect(
      texts.filter((text) => text.includes("面板第一段 面板第二段")),
    ).toHaveLength(0);
    expect(hiddenPanel.hasAttribute("data-a11y-hidden")).toBe(true);
    expect(hiddenPanel.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps named ARIA select controls atomic while including the current option", () => {
    document.body.innerHTML = `
      <div id="combo" role="combobox" aria-label="区域" aria-activedescendant="beijing"></div>
      <div id="beijing" role="option">北京</div>
      <div id="listbox" role="listbox" aria-label="候选城市">
        <div role="option" aria-selected="true">上海</div>
      </div>
    `;
    const combo = get("combo");
    const listbox = get("listbox");
    expect(getAccessibleText(combo)).toBe("下拉框，区域");
    expect(getContinuousAccessibleText(combo)).toBe("下拉框，区域 北京");
    expect(getContinuousAccessibleText(listbox)).toBe(
      "下拉框，候选城市 上海",
    );

    const sequence = buildContinuousReadingSequence({
      roots: [document],
      scope: null,
      config: DEFAULT_CONFIG,
      isTabControl: () => false,
    });
    const texts = sequence
      .map((candidate) =>
        resolveContinuousReadingCandidate(candidate, DEFAULT_CONFIG),
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map(({ text }) => text);
    expect(texts).toEqual([
      "下拉框，区域 北京",
      "下拉框，候选城市 上海",
    ]);
  });

  it("filters ignored descendants and indirect accessible-text sources", () => {
    document.body.innerHTML = `
      <p>公开开头<span data-a11y-sensitive>段落秘密</span><span>公开结尾</span></p>
      <label for="native-field" data-private="yes">原生标签秘密</label>
      <input id="native-field" placeholder="请输入内容">
      <span id="public-name">公开字段</span>
      <span id="secret-name" data-a11y-sensitive>引用名称秘密</span>
      <span id="safe-help">公开说明</span>
      <span id="secret-help" data-private="yes">引用说明秘密</span>
      <input
        id="described-field"
        aria-labelledby="secret-name public-name"
        aria-describedby="secret-help safe-help"
        value="editable-secret"
        placeholder="请输入账户"
      >
      <div id="safe-combo" role="combobox" aria-label="区域" aria-activedescendant="secret-option">
        <div id="secret-option" role="option" data-a11y-sensitive>当前选项秘密</div>
        <div role="option" aria-selected="true">公开选项</div>
      </div>
      <button id="safe-button">继续<span data-a11y-sensitive>按钮秘密</span></button>
    `;
    const config = {
      ...DEFAULT_CONFIG,
      speech: {
        ...DEFAULT_CONFIG.speech,
        ignoreSelectors: [
          ...DEFAULT_CONFIG.speech.ignoreSelectors,
          "[data-private='yes']",
        ],
      },
    };
    const sequence = buildContinuousReadingSequence({
      roots: [document],
      scope: null,
      config,
      isTabControl: () => false,
    });
    const texts = sequence
      .map((candidate) => resolveContinuousReadingCandidate(candidate, config))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map(({ text }) => text);
    const spoken = texts.join(" ");

    expect(texts).toContain("文本：公开开头");
    expect(texts).toContain("文本：公开结尾");
    expect(texts).toContain("输入框：请输入内容");
    expect(texts).toContain("输入框：公开字段 请输入账户 公开说明");
    expect(texts).toContain("下拉框，区域 公开选项");
    expect(texts).toContain("按钮，继续");
    expect(spoken).not.toContain("秘密");
    expect(spoken).not.toContain("editable-secret");
  });

  it("revalidates the slot that exposes an assigned candidate", () => {
    document.body.innerHTML = `
      <div id="slot-host"><p id="slotted-copy">Slotted text</p></div>
    `;
    const host = get("slot-host");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <slot id="content-slot"></slot>
      <slot id="other-slot" name="other"></slot>
      <slot id="fallback-slot" name="missing">Fallback text</slot>
    `;
    const slot = shadow.getElementById("content-slot") as HTMLSlotElement;
    const otherSlot = shadow.getElementById("other-slot") as HTMLSlotElement;
    const fallbackSlot = shadow.getElementById(
      "fallback-slot",
    ) as HTMLSlotElement;
    const sequence = buildContinuousReadingSequence({
      roots: [document, shadow],
      scope: null,
      config: DEFAULT_CONFIG,
      isTabControl: () => false,
    });
    const candidate = sequence.find(
      ({ element }) => element.id === "slotted-copy",
    );
    const fallbackCandidate = sequence.find(
      ({ element }) => element.id === "fallback-slot",
    );
    expect(candidate).toBeTruthy();
    expect(fallbackCandidate).toBeTruthy();

    get("slotted-copy").setAttribute("slot", "other");
    slot.hidden = true;
    expect(
      candidate && resolveContinuousReadingCandidate(candidate, DEFAULT_CONFIG),
    ).not.toBeNull();
    const assignedFallback = document.createElement("span");
    assignedFallback.slot = "missing";
    assignedFallback.textContent = "Assigned fallback replacement";
    host.append(assignedFallback);
    expect(
      fallbackCandidate &&
        resolveContinuousReadingCandidate(fallbackCandidate, DEFAULT_CONFIG),
    ).toBeNull();
    assignedFallback.remove();
    expect(
      fallbackCandidate &&
        resolveContinuousReadingCandidate(fallbackCandidate, DEFAULT_CONFIG),
    ).not.toBeNull();
    otherSlot.hidden = true;
    fallbackSlot.hidden = true;
    expect(
      candidate && resolveContinuousReadingCandidate(candidate, DEFAULT_CONFIG),
    ).toBeNull();
    expect(
      fallbackCandidate &&
        resolveContinuousReadingCandidate(fallbackCandidate, DEFAULT_CONFIG),
    ).toBeNull();
  });

  it("uses a text candidate's current parent and privacy context", () => {
    document.body.innerHTML = `
      <div id="old-parent">移动正文</div>
      <div id="new-parent" lang="en-US"></div>
    `;
    const sequence = buildContinuousReadingSequence({
      roots: [document],
      scope: null,
      config: DEFAULT_CONFIG,
      isTabControl: () => false,
    });
    const candidate = sequence.find(
      (item) => item.kind === "text" && item.source.data.includes("移动正文"),
    );
    expect(candidate).toBeTruthy();
    if (!candidate || candidate.kind !== "text") {
      throw new Error("Missing moving text candidate");
    }

    get("new-parent").append(candidate.source);
    expect(resolveContinuousReadingCandidate(candidate, DEFAULT_CONFIG)).toEqual({
      element: get("new-parent"),
      text: "文本：移动正文",
    });

    get("new-parent").setAttribute("data-a11y-sensitive", "");
    expect(
      resolveContinuousReadingCandidate(candidate, DEFAULT_CONFIG),
    ).toBeNull();
  });

  it("uses shadow-including containment for nested modals and start targets", () => {
    document.body.innerHTML = `
      <div id="outer-dialog" role="dialog" aria-modal="true">
        <div id="dialog-shadow-host"></div>
      </div>
    `;
    const outer = get("outer-dialog");
    const host = get("dialog-shadow-host");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <section id="inner-dialog" role="dialog" aria-modal="true">
        <p id="shadow-dialog-copy">Shadow dialog copy</p>
      </section>
    `;
    const inner = shadow.getElementById("inner-dialog") as HTMLElement;
    const roots = [document, shadow] as const;
    expect(findActiveModalDialog(roots)).toBe(inner);

    const sequence = buildContinuousReadingSequence({
      roots,
      scope: outer,
      config: DEFAULT_CONFIG,
      isTabControl: () => false,
    });
    expect(sequence).toHaveLength(1);
    expect(findContinuousStartIndex(sequence, outer)).toBe(0);
    expect(findContinuousStartIndex(sequence, host)).toBe(0);
  });
});

describe("ReadingController continuous session", () => {
  it("keeps event order, skips invalid members and resumes the interrupted segment", () => {
    document.body.innerHTML = `
      <h1 id="first">第一段</h1>
      <p id="second">第二段</p>
      <p id="third">第三段</p>
    `;
    document.body.tabIndex = -1;
    document.body.focus();
    const adapter = new ControlledSpeechAdapter();
    const emitter = new TypedEmitter<AccessibilityToolEventMap>();
    const speech = new SpeechController(adapter, emitter);
    const order: string[] = [];
    emitter.on("speechstart", () => order.push("speechstart"));
    emitter.on("speechend", () => order.push("speechend"));
    let rate = 1;
    const effects = {
      setHighlight: vi.fn(),
      clearHighlight: vi.fn(),
    };
    const reading = new ReadingController(
      DEFAULT_CONFIG,
      speech,
      effects as unknown as PageEffectsController,
      {
        isEnabled: () => true,
        getRate: () => rate,
        getPreferredLanguage: () => null,
      },
      {
        isRegionContainer: () => false,
        isTabSpeechTarget: () => false,
      },
      {
        onStateChange: (state) => order.push(`state:${state}`),
        onStart: ({ count }) => order.push(`start:${count}`),
        onSegmentChange: ({ index }) => order.push(`segment:${index}`),
        onPause: ({ index }) => order.push(`pause:${index}`),
        onResume: ({ index }) => order.push(`resume:${index}`),
        onStop: ({ reason }) => order.push(`stop:${reason}`),
      },
    );
    reading.setRoots([document]);
    reading.start();

    expect(reading.startContinuous()).toBe("started");
    expect(document.activeElement).toBe(document.body);
    expect(adapter.requests[0]?.text).toBe("文本：第一段");
    expect(order).toEqual([
      "state:playing",
      "start:3",
      "segment:1",
      "speechstart",
    ]);

    get("second").hidden = true;
    get("third").textContent = "更新后的第三段";
    rate = 1.5;
    adapter.end(0);
    expect(adapter.requests[1]).toMatchObject({
      text: "文本：更新后的第三段",
      rate: 1.5,
    });
    expect(order.slice(4)).toEqual([
      "speechend",
      "segment:3",
      "speechstart",
    ]);

    const interruptedRequest = adapter.requests[1];
    reading.pauseContinuous();
    expect(reading.getContinuousState()).toBe("paused");
    expect(reading.getCurrentSegment()?.index).toBe(3);
    expect(order.slice(-2)).toEqual(["state:paused", "pause:3"]);
    interruptedRequest?.options.onEnd?.();
    expect(adapter.requests).toHaveLength(2);

    reading.resumeContinuous();
    expect(adapter.requests).toHaveLength(3);
    expect(adapter.requests[2]).toMatchObject({
      text: "文本：更新后的第三段",
      rate: 1.5,
    });
    expect(order.slice(-3)).toEqual([
      "state:playing",
      "resume:3",
      "speechstart",
    ]);

    reading.stopContinuous("stopped");
    expect(order.slice(-2)).toEqual(["state:idle", "stop:stopped"]);
    expect(reading.getCurrentSegment()).toBeNull();
    reading.stop();
  });

  it("uses a modal scope and stops a background session when a modal appears", async () => {
    document.body.innerHTML = `
      <p id="background">背景正文</p>
      <dialog id="dialog" aria-modal="true" open><p>弹窗正文</p></dialog>
    `;
    const dialog = get("dialog") as HTMLDialogElement;
    const adapter = new ControlledSpeechAdapter();
    const emitter = new TypedEmitter<AccessibilityToolEventMap>();
    const scopes: string[] = [];
    const stops: string[] = [];
    const reading = createReadingController(adapter, emitter, {
      onStart: ({ scope }) => scopes.push(scope),
      onStop: ({ reason }) => stops.push(reason),
    });
    reading.setRoots([document]);
    reading.start();

    expect(reading.startContinuous()).toBe("started");
    expect(scopes).toEqual(["dialog"]);
    expect(adapter.requests[0]?.text).toBe("文本：弹窗正文");
    expect(adapter.requests[0]?.text).not.toContain("背景正文");
    reading.stopContinuous();

    dialog.remove();
    expect(reading.startContinuous()).toBe("started");
    const replacement = document.createElement("div");
    replacement.setAttribute("role", "dialog");
    replacement.setAttribute("aria-modal", "true");
    replacement.innerHTML = "<p>新的弹窗</p>";
    document.body.append(replacement);
    await mutationTick();
    expect(stops.at(-1)).toBe("dialog");
    expect(reading.getContinuousState()).toBe("idle");
    reading.stop();
  });

  it("immediately skips current content after privacy, ignore or name attributes change", async () => {
    document.body.innerHTML = `
      <input id="password-later" aria-label="账户" value="account-secret">
      <input id="payment-later" aria-label="卡号" value="card-secret">
      <p id="attribute-later">属性忽略候选</p>
      <p id="id-later">ID 忽略候选</p>
      <p id="name-later" aria-label="临时名称"></p>
      <p id="safe">安全正文</p>
    `;
    const config = {
      ...DEFAULT_CONFIG,
      speech: {
        ...DEFAULT_CONFIG.speech,
        ignoreSelectors: [
          ...DEFAULT_CONFIG.speech.ignoreSelectors,
          "[data-private='yes']",
          "#ignored-now",
        ],
      },
    };
    const adapter = new ControlledSpeechAdapter();
    const emitter = new TypedEmitter<AccessibilityToolEventMap>();
    const reading = new ReadingController(
      config,
      new SpeechController(adapter, emitter),
      {
        setHighlight: vi.fn(),
        clearHighlight: vi.fn(),
      } as unknown as PageEffectsController,
      {
        isEnabled: () => true,
        getRate: () => 1,
        getPreferredLanguage: () => null,
      },
      {
        isRegionContainer: () => false,
        isTabSpeechTarget: () => false,
      },
    );
    reading.setRoots([document]);

    expect(reading.startContinuous()).toBe("started");
    expect(adapter.requests[0]?.text).toBe("输入框：账户");

    get("password-later").setAttribute("type", "password");
    await mutationTick();
    expect(adapter.requests[1]?.text).toBe("输入框：卡号");

    get("payment-later").setAttribute(
      "autocomplete",
      "section-checkout billing CC-EXP-Year",
    );
    await mutationTick();
    expect(adapter.requests[2]?.text).toBe("文本：属性忽略候选");

    get("attribute-later").setAttribute("data-private", "yes");
    await mutationTick();
    expect(adapter.requests[3]?.text).toBe("文本：ID 忽略候选");

    get("id-later").id = "ignored-now";
    await mutationTick();
    expect(adapter.requests[4]?.text).toBe("文本：临时名称");

    get("name-later").removeAttribute("aria-label");
    await mutationTick();
    expect(adapter.requests[5]?.text).toBe("文本：安全正文");
    expect(adapter.requests.map(({ text }) => text).join(" ")).not.toContain(
      "account-secret",
    );
    expect(adapter.requests.map(({ text }) => text).join(" ")).not.toContain(
      "card-secret",
    );
    reading.stopContinuous();
  });

  it("cancels an aggregate block when a descendant becomes sensitive", async () => {
    document.body.innerHTML = `
      <p id="mixed-current">公开正文<span id="sensitive-later">稍后敏感</span></p>
      <p>下一段安全正文</p>
    `;
    const adapter = new ControlledSpeechAdapter();
    const reading = createReadingController(
      adapter,
      new TypedEmitter<AccessibilityToolEventMap>(),
      {},
    );
    reading.setRoots([document]);

    expect(reading.startContinuous()).toBe("started");
    expect(adapter.requests[0]?.text).toBe("文本：公开正文 稍后敏感");
    get("sensitive-later").setAttribute("data-a11y-sensitive", "");
    await mutationTick();
    expect(adapter.requests[1]?.text).toBe("文本：下一段安全正文");
    reading.stopContinuous();
  });

  it("replays a current atomic control when a text source becomes sensitive", async () => {
    document.body.innerHTML = `
      <button id="atomic-current">继续<span id="atomic-secret">稍后敏感</span></button>
      <p>下一段正文</p>
    `;
    const adapter = new ControlledSpeechAdapter();
    const reading = createReadingController(
      adapter,
      new TypedEmitter<AccessibilityToolEventMap>(),
      {},
    );
    reading.setRoots([document]);

    expect(reading.startContinuous()).toBe("started");
    expect(adapter.requests[0]?.text).toBe("按钮，继续 稍后敏感");
    get("atomic-secret").setAttribute("data-a11y-sensitive", "");
    await mutationTick();
    expect(adapter.requests[1]?.text).toBe("按钮，继续");
    expect(reading.getCurrentSegment()?.index).toBe(1);

    get("atomic-current").firstChild!.textContent = "继续更新";
    await mutationTick();
    expect(adapter.requests).toHaveLength(2);
    reading.stopContinuous();
  });

  it("returns a synchronous adapter failure to idle in the fixed error order", () => {
    document.body.innerHTML = `<p>同步错误段落</p>`;
    const lateOptions: SpeechRequestOptions[] = [];
    const adapter: SpeechAdapter = {
      speak: (_text, options) => {
        lateOptions.push(options);
        throw new Error("synchronous adapter failure");
      },
      cancel: vi.fn(),
      isSupported: () => true,
    };
    const emitter = new TypedEmitter<AccessibilityToolEventMap>();
    const order: string[] = [];
    emitter.on("error", () => order.push("error"));
    emitter.on("speechstart", () => order.push("speechstart"));
    emitter.on("speechend", () => order.push("speechend"));
    const reading = createReadingController(adapter, emitter, {
      onStateChange: (state) => order.push(`state:${state}`),
      onStart: () => order.push("start"),
      onSegmentChange: () => order.push("segment"),
      onStop: ({ reason }) => order.push(`stop:${reason}`),
    });
    reading.setRoots([document]);

    expect(() => reading.startContinuous()).not.toThrow();
    expect(reading.getContinuousState()).toBe("idle");
    expect(reading.getCurrentSegment()).toBeNull();
    expect(order).toEqual([
      "state:playing",
      "start",
      "segment",
      "error",
      "state:idle",
      "stop:error",
    ]);

    lateOptions[0]?.onStart?.();
    lateOptions[0]?.onEnd?.();
    lateOptions[0]?.onError?.("late-error");
    expect(order).toEqual([
      "state:playing",
      "start",
      "segment",
      "error",
      "state:idle",
      "stop:error",
    ]);
  });

  it("keeps pause and stop stable when adapter cancellation throws", () => {
    document.body.innerHTML = `<p>取消异常段落</p>`;
    const stops: string[] = [];
    const adapter: SpeechAdapter = {
      speak: (_text, options) => options.onStart?.(),
      cancel: () => {
        throw new Error("cancel failed synchronously");
      },
      isSupported: () => true,
    };
    const reading = createReadingController(
      adapter,
      new TypedEmitter<AccessibilityToolEventMap>(),
      { onStop: ({ reason }) => stops.push(reason) },
    );
    reading.setRoots([document]);

    expect(() => reading.startContinuous()).not.toThrow();
    expect(reading.getContinuousState()).toBe("playing");
    expect(() => reading.pauseContinuous()).not.toThrow();
    expect(reading.getContinuousState()).toBe("paused");
    expect(() => reading.stopContinuous("stopped")).not.toThrow();
    expect(reading.getContinuousState()).toBe("idle");
    expect(reading.getCurrentSegment()).toBeNull();
    expect(stops).toEqual(["stopped"]);
  });
});

class ControlledSpeechAdapter implements SpeechAdapter {
  readonly requests: Array<{
    text: string;
    lang: string;
    rate: number;
    options: SpeechRequestOptions;
  }> = [];
  readonly cancel = vi.fn();

  speak(text: string, options: SpeechRequestOptions): void {
    this.requests.push({ text, lang: options.lang, rate: options.rate, options });
    options.onStart?.();
  }

  end(index: number): void {
    this.requests[index]?.options.onEnd?.();
  }

  isSupported(): boolean {
    return true;
  }
}

function createReadingController(
  adapter: SpeechAdapter,
  emitter: TypedEmitter<AccessibilityToolEventMap>,
  callbacks: ConstructorParameters<typeof ReadingController>[5],
): ReadingController {
  return new ReadingController(
    DEFAULT_CONFIG,
    new SpeechController(adapter, emitter),
    {
      setHighlight: vi.fn(),
      clearHighlight: vi.fn(),
    } as unknown as PageEffectsController,
    {
      isEnabled: () => true,
      getRate: () => 1,
      getPreferredLanguage: () => null,
    },
    {
      isRegionContainer: () => false,
      isTabSpeechTarget: () => false,
    },
    callbacks,
  );
}

function get(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}

async function mutationTick(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
