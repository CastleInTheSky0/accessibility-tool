import { getDeepActiveElement, isVisible } from "../core/dom";
import type {
  AccessibilityToolState,
  CaptionFontSize,
  CaptionScript,
} from "../types";
import type { CaptionOutputModel } from "../features/output";
import {
  captionLanguageRuntime,
  type CaptionLanguageRuntime,
} from "./caption-language";

interface LargeCaptionCallbacks {
  onClose: () => void;
  onFontSizeChange: (size: CaptionFontSize) => void;
  onScriptChange: (script: CaptionScript) => void;
  onPinyinChange: (enabled: boolean) => void;
  resolveRestoreControl: () => HTMLElement | null;
}

export interface CaptionPresentationSegment {
  readonly text: string;
  readonly pinyin: string;
  readonly isChinese: boolean;
}

interface CaptionPresentation {
  readonly text: string;
  readonly segments: readonly CaptionPresentationSegment[] | null;
}

export class LargeCaptionUI {
  readonly element: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly status: HTMLSpanElement;
  private readonly scriptButtons = new Map<CaptionScript, HTMLButtonElement>();
  private readonly sizeButtons = new Map<CaptionFontSize, HTMLButtonElement>();
  private readonly pinyinButton: HTMLButtonElement;
  private model: CaptionOutputModel | null = null;
  private presentationGeneration = 0;
  private scrollInteractionRevision = 0;
  private preferences: Pick<
    AccessibilityToolState,
    "captionFontSize" | "captionScript" | "captionPinyinEnabled"
  > = {
    captionFontSize: 36,
    captionScript: "simplified",
    captionPinyinEnabled: false,
  };
  private focusBeforeControls: HTMLElement | null = null;

  constructor(
    private readonly documentRef: Document,
    shadowRoot: ShadowRoot,
    private readonly callbacks: LargeCaptionCallbacks,
    private readonly languages: CaptionLanguageRuntime = captionLanguageRuntime,
  ) {
    this.element = documentRef.createElement("div");
    this.element.className = "a11y-large-caption";
    this.element.hidden = true;

    const controls = documentRef.createElement("div");
    controls.className = "a11y-large-caption__controls";

    this.status = documentRef.createElement("span");
    this.status.className = "a11y-large-caption__status";
    this.status.dataset.captionStatus = "";

    const scriptGroup = this.createGroup("字幕文字", [
      this.createScriptButton("simplified", "简体"),
      this.createScriptButton("traditional", "繁体"),
    ]);

    this.pinyinButton = this.createButton("拼音");
    this.pinyinButton.dataset.captionPinyin = "";
    this.pinyinButton.setAttribute("aria-pressed", "false");
    this.pinyinButton.addEventListener("click", () => {
      this.callbacks.onPinyinChange(!this.preferences.captionPinyinEnabled);
    });

    const sizeGroup = this.createGroup("字幕字号", [
      this.createSizeButton(28),
      this.createSizeButton(36),
      this.createSizeButton(48),
    ]);

    const close = this.createButton("关闭");
    close.classList.add("a11y-large-caption__close");
    close.setAttribute("aria-label", "关闭大字幕");
    close.addEventListener("click", () => {
      this.callbacks.onClose();
      this.restoreFocusAfterExplicitClose();
    });

    controls.append(
      this.status,
      scriptGroup,
      this.pinyinButton,
      sizeGroup,
      close,
    );

    this.body = documentRef.createElement("div");
    this.body.className = "a11y-large-caption__body";
    this.body.tabIndex = 0;
    this.body.setAttribute("role", "region");
    this.body.setAttribute("aria-label", "当前大字幕内容");

    this.text = documentRef.createElement("div");
    this.text.className = "a11y-large-caption__text";
    this.body.append(this.text);
    this.element.append(controls, this.body);
    shadowRoot.append(this.element);

    const markScrollInteraction = (): void => {
      this.scrollInteractionRevision += 1;
    };
    this.body.addEventListener("wheel", markScrollInteraction, {
      passive: true,
    });
    this.body.addEventListener("touchmove", markScrollInteraction, {
      passive: true,
    });
    this.body.addEventListener("pointerdown", markScrollInteraction);
    this.body.addEventListener("keydown", (event) => {
      if (isScrollKey(event.key)) {
        markScrollInteraction();
      }
    });

    this.element.addEventListener("pointerdown", () => {
      this.rememberFocusBeforeControls();
    }, true);
  }

  updatePreferences(state: AccessibilityToolState): void {
    const presentationChanged =
      this.preferences.captionScript !== state.captionScript ||
      this.preferences.captionPinyinEnabled !== state.captionPinyinEnabled;
    this.preferences = {
      captionFontSize: state.captionFontSize,
      captionScript: state.captionScript,
      captionPinyinEnabled: state.captionPinyinEnabled,
    };
    this.element.style.setProperty(
      "--a11y-caption-font-size",
      `${state.captionFontSize}px`,
    );
    for (const [script, button] of this.scriptButtons) {
      const active = script === state.captionScript;
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", `${button.textContent}${active ? "，当前选中" : ""}`);
    }
    for (const [size, button] of this.sizeButtons) {
      const active = size === state.captionFontSize;
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", `字幕字号 ${size}px${active ? "，当前选中" : ""}`);
    }
    this.pinyinButton.setAttribute(
      "aria-pressed",
      String(state.captionPinyinEnabled),
    );
    this.pinyinButton.setAttribute(
      "aria-label",
      `字幕拼音，当前${state.captionPinyinEnabled ? "开启" : "关闭"}`,
    );
    if (presentationChanged) {
      if (this.model) {
        this.scheduleTextPresentation(true);
      } else {
        this.presentationGeneration += 1;
      }
    }
  }

  show(model: CaptionOutputModel, resetScroll: boolean): void {
    if (this.element.hidden) {
      this.rememberFocusBeforeControls();
    }
    const textChanged = this.model?.text !== model.text;
    this.model = model;
    this.status.textContent = model.status;
    this.element.dataset.captionState = toCaptionState(model.status);
    this.element.hidden = false;
    if (textChanged || resetScroll) {
      this.scheduleTextPresentation(!resetScroll);
    }
    if (resetScroll) {
      this.body.scrollTop = 0;
    }
  }

  hide(): void {
    this.presentationGeneration += 1;
    this.element.hidden = true;
    this.model = null;
    this.text.replaceChildren();
    delete this.element.dataset.captionState;
  }

  destroy(): void {
    this.presentationGeneration += 1;
    this.element.remove();
    this.model = null;
    this.focusBeforeControls = null;
  }

  private scheduleTextPresentation(preserveScroll: boolean): void {
    const model = this.model;
    if (!model) {
      this.presentationGeneration += 1;
      this.text.replaceChildren();
      return;
    }
    const generation = ++this.presentationGeneration;
    const original = model.text;
    const script = this.preferences.captionScript;
    const includePinyin = this.preferences.captionPinyinEnabled;
    const retainedScrollTop = preserveScroll ? this.body.scrollTop : null;
    const scrollInteractionRevision = this.scrollInteractionRevision;
    this.text.textContent = original;
    if (retainedScrollTop !== null) {
      this.restoreScrollTop(retainedScrollTop);
    }
    const fallbackScrollTop = this.body.scrollTop;
    void deriveCaptionPresentation(
      original,
      script,
      includePinyin,
      this.languages,
    ).then((presentation) => {
      if (
        generation !== this.presentationGeneration ||
        this.element.hidden ||
        this.model?.text !== original ||
        this.preferences.captionScript !== script ||
        this.preferences.captionPinyinEnabled !== includePinyin
      ) {
        return;
      }
      const scrollTopBeforeCommit = this.body.scrollTop;
      this.applyTextPresentation(presentation);
      if (retainedScrollTop !== null) {
        this.restoreScrollTop(
          this.scrollInteractionRevision === scrollInteractionRevision &&
            scrollTopBeforeCommit === fallbackScrollTop
            ? retainedScrollTop
            : scrollTopBeforeCommit,
        );
      }
    }).catch(() => {
      // The original text is already visible; language failures are non-fatal.
    });
  }

  private restoreScrollTop(scrollTop: number): void {
    const maximum = Math.max(0, this.body.scrollHeight - this.body.clientHeight);
    this.body.scrollTop = Math.min(Math.max(0, scrollTop), maximum);
  }

  private applyTextPresentation(presentation: CaptionPresentation): void {
    if (!presentation.segments) {
      this.text.textContent = presentation.text;
      return;
    }
    const fragment = this.documentRef.createDocumentFragment();
    for (const segment of presentation.segments) {
      const unit = this.documentRef.createElement("span");
      unit.className = "a11y-large-caption__unit";
      unit.toggleAttribute("data-chinese", segment.isChinese);
      const phonetic = this.documentRef.createElement("span");
      phonetic.className = "a11y-large-caption__pinyin";
      phonetic.setAttribute("aria-hidden", "true");
      phonetic.textContent = segment.pinyin;
      const written = this.documentRef.createElement("span");
      written.className = "a11y-large-caption__written";
      written.textContent = segment.text;
      unit.append(phonetic, written);
      fragment.append(unit);
    }
    this.text.replaceChildren(fragment);
  }

  private createGroup(
    label: string,
    buttons: readonly HTMLButtonElement[],
  ): HTMLDivElement {
    const group = this.documentRef.createElement("div");
    group.className = "a11y-large-caption__group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    group.append(...buttons);
    return group;
  }

  private createButton(label: string): HTMLButtonElement {
    const button = this.documentRef.createElement("button");
    button.type = "button";
    button.className = "a11y-large-caption__button";
    button.textContent = label;
    return button;
  }

  private createScriptButton(
    script: CaptionScript,
    label: string,
  ): HTMLButtonElement {
    const button = this.createButton(label);
    button.dataset.captionScript = script;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => this.callbacks.onScriptChange(script));
    this.scriptButtons.set(script, button);
    return button;
  }

  private createSizeButton(size: CaptionFontSize): HTMLButtonElement {
    const button = this.createButton(String(size));
    button.dataset.captionFontSize = String(size);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => this.callbacks.onFontSizeChange(size));
    this.sizeButtons.set(size, button);
    return button;
  }

  private rememberFocusBeforeControls(): void {
    const active = getDeepActiveElement(this.documentRef);
    if (
      active &&
      active.isConnected &&
      active !== this.documentRef.body &&
      !this.element.contains(active)
    ) {
      this.focusBeforeControls = active;
    }
  }

  private restoreFocusAfterExplicitClose(): void {
    const toolbarControl = this.callbacks.resolveRestoreControl();
    if (
      toolbarControl?.isConnected &&
      isVisible(toolbarControl) &&
      toolbarControl.getAttribute("aria-disabled") !== "true"
    ) {
      toolbarControl.focus({ preventScroll: true });
      return;
    }
    if (
      this.focusBeforeControls?.isConnected &&
      isVisible(this.focusBeforeControls)
    ) {
      this.focusBeforeControls.focus({ preventScroll: true });
      return;
    }
    const body = this.documentRef.body;
    const originalTabIndex = body.getAttribute("tabindex");
    if (originalTabIndex === null) {
      body.setAttribute("tabindex", "-1");
    }
    body.focus({ preventScroll: true });
    if (originalTabIndex === null) {
      body.removeAttribute("tabindex");
    }
  }
}

export function deriveCaptionPresentation(
  original: string,
  script: CaptionScript,
  includePinyin: boolean,
  languages: CaptionLanguageRuntime = captionLanguageRuntime,
): Promise<CaptionPresentation> {
  return deriveCaptionPresentationAsync(
    original,
    script,
    includePinyin,
    languages,
  );
}

async function deriveCaptionPresentationAsync(
  original: string,
  script: CaptionScript,
  includePinyin: boolean,
  languages: CaptionLanguageRuntime,
): Promise<CaptionPresentation> {
  const openCCRequest = languages.loadOpenCC().catch(() => null);
  const pinyinRequest = includePinyin
    ? languages.loadPinyin().catch(() => null)
    : null;
  const openCC = await openCCRequest;
  const displayText = safeConvertCaptionText(openCC, original, script);
  if (!includePinyin) {
    return { text: displayText, segments: null };
  }
  const pinyinModule = await pinyinRequest;
  if (!pinyinModule) {
    return { text: displayText, segments: null };
  }
  try {
    const phoneticSource = safeConvertCaptionText(
      openCC,
      original,
      "simplified",
    );
    const annotations = pinyinModule.annotateCaptionPinyin(phoneticSource);
    if (annotations.map(({ origin }) => origin).join("") !== phoneticSource) {
      return { text: displayText, segments: null };
    }
    const displayedCharacters = Array.from(displayText);
    const phoneticCharacters = Array.from(phoneticSource);
    if (displayedCharacters.length !== phoneticCharacters.length) {
      return { text: displayText, segments: null };
    }
    let offset = 0;
    const segments = annotations.map((annotation) => {
      const length = Array.from(annotation.origin).length;
      const text = displayedCharacters.slice(offset, offset + length).join("");
      offset += length;
      return {
        text,
        pinyin: annotation.isZh ? annotation.result : "",
        isChinese: annotation.isZh,
      };
    });
    return offset === displayedCharacters.length
      ? { text: displayText, segments }
      : { text: displayText, segments: null };
  } catch {
    return { text: displayText, segments: null };
  }
}

function safeConvertCaptionText(
  openCC: Awaited<ReturnType<CaptionLanguageRuntime["loadOpenCC"]>> | null,
  original: string,
  script: CaptionScript,
): string {
  if (!openCC) {
    return original;
  }
  try {
    return openCC.convertCaptionText(original, script);
  } catch {
    return original;
  }
}

function toCaptionState(status: CaptionOutputModel["status"]): string {
  switch (status) {
    case "朗读中":
      return "playing";
    case "显示中":
      return "displaying";
    case "已暂停":
      return "paused";
    case "已结束":
      return "ended";
  }
}

function isScrollKey(key: string): boolean {
  return [
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "End",
    "Home",
    "PageDown",
    "PageUp",
    " ",
  ].includes(key);
}
