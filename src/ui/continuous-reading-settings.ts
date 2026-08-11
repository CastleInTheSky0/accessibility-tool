import type {
  ContinuousReadingPosition,
  ContinuousReadingState,
} from "../types";

export interface ContinuousReadingSettingsModel {
  state: ContinuousReadingState;
  supported: boolean;
  position: ContinuousReadingPosition | null;
}

interface ContinuousReadingSettingsCallbacks {
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onClose: () => void;
  resolveAnchor: () => HTMLElement | null;
}

interface CloseOptions {
  returnFocus?: boolean;
  notify?: boolean;
}

export class ContinuousReadingSettingsUI {
  readonly element: HTMLElement;

  private readonly stateLabel: HTMLSpanElement;
  private readonly status: HTMLParagraphElement;
  private readonly startButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private anchor: HTMLElement | null = null;
  private model: ContinuousReadingSettingsModel = {
    state: "idle",
    supported: true,
    position: null,
  };

  constructor(
    private readonly container: HTMLElement,
    id: string,
    private readonly callbacks: ContinuousReadingSettingsCallbacks,
  ) {
    const documentRef = container.ownerDocument;
    this.element = documentRef.createElement("section");
    this.element.id = id;
    this.element.className = "a11y-continuous-reading";
    this.element.hidden = true;
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-labelledby", `${id}-title`);
    this.element.setAttribute("aria-describedby", `${id}-status`);

    const header = documentRef.createElement("div");
    header.className = "a11y-continuous-reading__header";
    const heading = documentRef.createElement("div");
    heading.className = "a11y-continuous-reading__heading";
    const eyebrow = documentRef.createElement("span");
    eyebrow.textContent = "页面语音";
    const title = documentRef.createElement("h2");
    title.id = `${id}-title`;
    title.textContent = "连续朗读控制";
    heading.append(eyebrow, title);
    const closeButton = documentRef.createElement("button");
    closeButton.type = "button";
    closeButton.className = "a11y-continuous-reading__close";
    closeButton.setAttribute("aria-label", "关闭连续朗读控制");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () =>
      this.close({ returnFocus: true, notify: true }),
    );
    header.append(heading, closeButton);

    const summary = documentRef.createElement("div");
    summary.className = "a11y-continuous-reading__summary";
    const pulse = documentRef.createElement("span");
    pulse.className = "a11y-continuous-reading__pulse";
    pulse.setAttribute("aria-hidden", "true");
    this.stateLabel = documentRef.createElement("span");
    this.stateLabel.className = "a11y-continuous-reading__state";
    summary.append(pulse, this.stateLabel);

    this.status = documentRef.createElement("p");
    this.status.id = `${id}-status`;
    this.status.className = "a11y-continuous-reading__status";

    const actions = documentRef.createElement("div");
    actions.className = "a11y-continuous-reading__actions";
    this.startButton = this.createActionButton(
      "开始",
      "start",
      "a11y-continuous-reading__button--primary",
    );
    this.pauseButton = this.createActionButton("暂停", "pause");
    this.stopButton = this.createActionButton(
      "停止",
      "stop",
      "a11y-continuous-reading__button--danger",
    );
    this.startButton.addEventListener("click", () => this.callbacks.onStart());
    this.pauseButton.addEventListener("click", () => {
      if (this.pauseButton.getAttribute("aria-disabled") === "true") {
        return;
      }
      if (this.model.state === "paused") {
        this.callbacks.onResume();
      } else {
        this.callbacks.onPause();
      }
    });
    this.stopButton.addEventListener("click", () => {
      if (this.stopButton.getAttribute("aria-disabled") !== "true") {
        this.callbacks.onStop();
      }
    });
    actions.append(this.startButton, this.pauseButton, this.stopButton);

    const note = documentRef.createElement("p");
    note.className = "a11y-continuous-reading__note";
    note.innerHTML = [
      '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">',
      '<path d="M8 1.5 13 3.5v3.7c0 3.2-2.1 5.8-5 7.3-2.9-1.5-5-4.1-5-7.3V3.5l5-2Z"/>',
      '<path d="m5.8 8 1.4 1.4L10.5 6"/>',
      "</svg>",
      "<span>暂停后从当前段开头继续，朗读内容仅在本地处理</span>",
    ].join("");

    this.element.append(header, summary, this.status, actions, note);
    container.append(this.element);
    this.update(this.model);
  }

  update(model: ContinuousReadingSettingsModel): void {
    this.model = model;
    this.element.dataset.state = model.state;
    const labels = {
      idle: "未开始",
      playing: "朗读中",
      paused: "已暂停",
    } as const;
    this.stateLabel.textContent = labels[model.state];
    this.status.textContent = this.getStatusMessage(model);

    const startUnavailable = !model.supported || model.state !== "idle";
    this.setAriaDisabled(this.startButton, startUnavailable);
    this.startButton.setAttribute(
      "aria-label",
      model.supported ? "开始连续朗读" : "开始连续朗读，当前浏览器不支持语音合成",
    );

    const pauseUnavailable = model.state === "idle";
    this.setAriaDisabled(this.pauseButton, pauseUnavailable);
    const resume = model.state === "paused";
    this.pauseButton.textContent = resume ? "继续" : "暂停";
    this.pauseButton.dataset.intent = resume ? "resume" : "pause";
    this.pauseButton.setAttribute(
      "aria-label",
      resume ? "继续连续朗读" : "暂停连续朗读",
    );
    this.setAriaDisabled(this.stopButton, model.state === "idle");
    this.stopButton.setAttribute("aria-label", "停止连续朗读");
  }

  toggle(anchor: HTMLElement): void {
    if (this.isOpen()) {
      this.close({ returnFocus: true, notify: true });
    } else {
      this.open(anchor);
    }
  }

  open(anchor: HTMLElement): void {
    this.anchor = anchor;
    this.element.hidden = false;
    anchor.setAttribute("aria-expanded", "true");
    this.bindOpenEvents();
    this.position();
    this.getInitialFocusTarget().focus({ preventScroll: true });
  }

  close(options: CloseOptions = {}): void {
    if (!this.isOpen()) {
      return;
    }
    const originalAnchor = this.anchor;
    this.unbindOpenEvents();
    this.element.hidden = true;
    originalAnchor?.setAttribute("aria-expanded", "false");
    this.anchor = null;
    if (options.notify) {
      this.callbacks.onClose();
    }
    if (options.returnFocus) {
      const target =
        originalAnchor?.isConnected && !originalAnchor.closest("[hidden]")
          ? originalAnchor
          : this.callbacks.resolveAnchor();
      target?.focus({ preventScroll: true });
    }
  }

  isOpen(): boolean {
    return !this.element.hidden;
  }

  destroy(): void {
    this.close();
    this.element.remove();
  }

  private createActionButton(
    label: string,
    intent: string,
    modifier = "",
  ): HTMLButtonElement {
    const button = this.container.ownerDocument.createElement("button");
    button.type = "button";
    button.className = ["a11y-continuous-reading__button", modifier]
      .filter(Boolean)
      .join(" ");
    button.dataset.intent = intent;
    button.textContent = label;
    return button;
  }

  private getStatusMessage(model: ContinuousReadingSettingsModel): string {
    if (!model.supported) {
      return "当前浏览器不支持语音合成";
    }
    if (model.state === "idle") {
      return "从当前页面位置开始，按页面顺序逐段朗读。";
    }
    if (!model.position) {
      return model.state === "paused" ? "连续朗读已暂停。" : "正在准备下一段。";
    }
    return model.state === "paused"
      ? `已暂停在第 ${model.position.index} / ${model.position.count} 段`
      : `正在朗读第 ${model.position.index} / ${model.position.count} 段`;
  }

  private setAriaDisabled(button: HTMLButtonElement, disabled: boolean): void {
    button.setAttribute("aria-disabled", String(disabled));
  }

  private getInitialFocusTarget(): HTMLButtonElement {
    if (this.model.state === "playing" || this.model.state === "paused") {
      return this.pauseButton;
    }
    return this.startButton;
  }

  private bindOpenEvents(): void {
    const documentRef = this.container.ownerDocument;
    documentRef.addEventListener("pointerdown", this.handleDocumentPointer, true);
    this.getOwnerShadowRoot()?.addEventListener(
      "pointerdown",
      this.handleShadowPointer,
      true,
    );
    documentRef.addEventListener("keydown", this.handleDocumentKeydown, true);
    documentRef.defaultView?.addEventListener("resize", this.handleResize);
  }

  private unbindOpenEvents(): void {
    const documentRef = this.container.ownerDocument;
    documentRef.removeEventListener(
      "pointerdown",
      this.handleDocumentPointer,
      true,
    );
    this.getOwnerShadowRoot()?.removeEventListener(
      "pointerdown",
      this.handleShadowPointer,
      true,
    );
    documentRef.removeEventListener("keydown", this.handleDocumentKeydown, true);
    documentRef.defaultView?.removeEventListener("resize", this.handleResize);
  }

  private readonly handleDocumentPointer = (event: Event): void => {
    const path = event.composedPath();
    const ownerShadowRoot = this.getOwnerShadowRoot();
    if (ownerShadowRoot && path.includes(ownerShadowRoot.host)) {
      return;
    }
    this.closeForOutsidePath(path);
  };

  private readonly handleShadowPointer = (event: Event): void => {
    this.closeForOutsidePath(event.composedPath());
  };

  private closeForOutsidePath(path: readonly EventTarget[]): void {
    if (
      path.includes(this.element) ||
      (this.anchor && path.includes(this.anchor))
    ) {
      return;
    }
    this.close({ notify: true });
  }

  private getOwnerShadowRoot(): ShadowRoot | null {
    const rootNode = this.container.getRootNode();
    return rootNode instanceof ShadowRoot ? rootNode : null;
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this.isOpen()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.close({ returnFocus: true, notify: true });
  };

  private readonly handleResize = (): void => this.position();

  private position(): void {
    if (!this.anchor || !this.isOpen()) {
      return;
    }
    const view = this.container.ownerDocument.defaultView;
    if (!view) {
      return;
    }
    const anchorRect = this.anchor.getBoundingClientRect();
    const root = this.anchor.getRootNode();
    const hostRect =
      root instanceof ShadowRoot
        ? root.host.getBoundingClientRect()
        : anchorRect;
    const panelWidth = this.element.getBoundingClientRect().width || 390;
    const left = clamp(
      anchorRect.left + anchorRect.width / 2 - panelWidth / 2,
      12,
      Math.max(12, view.innerWidth - panelWidth - 12),
    );
    const arrowLeft = clamp(
      anchorRect.left + anchorRect.width / 2 - left,
      28,
      panelWidth - 28,
    );
    this.element.style.left = `${left}px`;
    this.element.style.top = `${Math.max(hostRect.bottom, 146) + 12}px`;
    this.element.style.setProperty(
      "--a11y-continuous-reading-arrow-left",
      `${arrowLeft}px`,
    );
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
