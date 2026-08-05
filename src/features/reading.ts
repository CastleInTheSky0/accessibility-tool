import type { ResolvedAccessibilityToolConfig } from "../core/config";
import {
  getAccessibleText,
  getClosestReadableElement,
  isHTMLElement,
  isVisible,
  shouldIgnoreReadingTarget,
} from "../core/dom";
import { resolveSpeechLanguage } from "./language";
import type { PageEffectsController } from "./page-effects";
import type { SpeechController } from "./speech";

type ReadingRoot = Document | ShadowRoot;

interface ReadingStateProvider {
  isEnabled: () => boolean;
  getRate: () => number;
  getPreferredLanguage: () => string | null;
}

interface ReadingTargetProvider {
  isRegionContainer: (element: HTMLElement) => boolean;
  isTabSpeechTarget: (element: HTMLElement) => boolean;
}

export class ReadingController {
  private readonly roots = new Set<ReadingRoot>();
  private readonly documents = new Set<Document>();
  private hoverTimer: number | null = null;
  private hoverTarget: HTMLElement | null = null;
  private lastTarget: HTMLElement | null = null;
  private lastText = "";
  private lastLanguage = "";
  private activeTarget: HTMLElement | null = null;
  private running = false;

  constructor(
    private config: ResolvedAccessibilityToolConfig,
    private readonly speech: SpeechController,
    private readonly effects: PageEffectsController,
    private readonly state: ReadingStateProvider,
    private readonly targets: ReadingTargetProvider,
  ) {}

  updateConfig(config: ResolvedAccessibilityToolConfig): void {
    this.config = config;
  }

  setRoots(roots: readonly ReadingRoot[]): void {
    const wasRunning = this.running;
    if (wasRunning) {
      this.detach();
    }
    this.roots.clear();
    this.documents.clear();
    for (const root of roots) {
      this.roots.add(root);
      const documentRef =
        root.nodeType === 9 ? (root as Document) : root.ownerDocument;
      if (documentRef) {
        this.documents.add(documentRef);
      }
    }
    if (wasRunning) {
      this.attach();
    }
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.attach();
  }

  stop(): void {
    if (!this.running) {
      this.cancel();
      return;
    }
    this.running = false;
    this.detach();
    this.cancel();
  }

  cancel(): void {
    this.clearHover();
    this.speech.cancel();
    this.lastTarget = null;
    this.lastText = "";
    this.lastLanguage = "";
    if (this.activeTarget) {
      this.effects.clearHighlight(this.activeTarget);
      this.activeTarget = null;
    }
  }

  speakElement(element: HTMLElement, force = false): void {
    if (!this.state.isEnabled() || !element.isConnected || !isVisible(element)) {
      return;
    }
    if (
      this.targets.isRegionContainer(element) ||
      this.targets.isTabSpeechTarget(element)
    ) {
      return;
    }
    if (
      shouldIgnoreReadingTarget(element, [
        ...this.config.speech.ignoreSelectors,
        "[data-a11y-sensitive]",
        "[data-a11y-security-keyboard]",
        "[data-captcha]",
        ".captcha",
        '[autocomplete="cc-number"]',
        '[autocomplete="cc-csc"]',
      ])
    ) {
      return;
    }
    const text = getAccessibleText(element);
    const language = resolveSpeechLanguage({
      element,
      text,
      preferredLanguage: this.state.getPreferredLanguage(),
      projectDefault: this.config.locale,
    }).language;
    if (
      !text ||
      (!force &&
        element === this.lastTarget &&
        text === this.lastText &&
        language === this.lastLanguage)
    ) {
      return;
    }

    this.lastTarget = element;
    this.lastText = text;
    this.lastLanguage = language;
    this.activeTarget = element;
    this.effects.setHighlight(element);
    this.speech.speak(
      text,
      language,
      this.state.getRate(),
      {
        onEnd: () => this.finishElement(element),
        onError: () => this.finishElement(element),
      },
    );
  }

  private attach(): void {
    for (const root of this.roots) {
      root.addEventListener("focusin", this.handleFocusIn, true);
      root.addEventListener("pointerover", this.handlePointerOver, true);
      root.addEventListener("pointerout", this.handlePointerOut, true);
      root.addEventListener("click", this.handleClick, true);
    }
    for (const documentRef of this.documents) {
      documentRef.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }
  }

  private detach(): void {
    for (const root of this.roots) {
      root.removeEventListener("focusin", this.handleFocusIn, true);
      root.removeEventListener("pointerover", this.handlePointerOver, true);
      root.removeEventListener("pointerout", this.handlePointerOut, true);
      root.removeEventListener("click", this.handleClick, true);
    }
    for (const documentRef of this.documents) {
      documentRef.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }
  }

  private readonly handleFocusIn = (event: Event): void => {
    const target = this.getReadableTarget(event);
    if (target) {
      this.clearHover();
      this.speakElement(target);
    }
  };

  private readonly handlePointerOver = (event: Event): void => {
    const target = this.getReadableTarget(event);
    if (!target || target === this.hoverTarget) {
      return;
    }
    this.clearHover();
    this.hoverTarget = target;
    this.hoverTimer = window.setTimeout(() => {
      if (this.hoverTarget === target) {
        this.speakElement(target);
      }
    }, this.config.speech.hoverDelayMs);
  };

  private readonly handlePointerOut = (event: Event): void => {
    const related = (event as PointerEvent).relatedTarget;
    if (
      this.hoverTarget &&
      (!isHTMLElement(related) || !this.hoverTarget.contains(related))
    ) {
      this.clearHover();
    }
  };

  private readonly handleClick = (event: Event): void => {
    const target = this.getReadableTarget(event);
    if (target) {
      this.clearHover();
      this.speakElement(target, Boolean(target.ownerDocument.getSelection()?.toString().trim()));
    }
  };

  private readonly handleVisibilityChange = (event: Event): void => {
    const documentRef = event.currentTarget as Document;
    if (documentRef.visibilityState === "hidden") {
      this.cancel();
    }
  };

  private getReadableTarget(event: Event): HTMLElement | null {
    const rawTarget = event
      .composedPath()
      .find((item): item is HTMLElement => isHTMLElement(item));
    return getClosestReadableElement(rawTarget ?? null);
  }

  private clearHover(): void {
    if (this.hoverTimer !== null) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.hoverTarget = null;
  }

  private finishElement(element: HTMLElement): void {
    if (this.activeTarget === element) {
      this.effects.clearHighlight(element);
      this.activeTarget = null;
    }
  }
}
