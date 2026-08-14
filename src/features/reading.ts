import type { ResolvedAccessibilityToolConfig } from "../core/config";
import {
  getDeepActiveElement,
  getAccessibleText,
  getClosestReadableElement,
  isHTMLElement,
  isVisible,
  shouldIgnoreReadingTarget,
} from "../core/dom";
import type {
  ContinuousReadingPosition,
  ContinuousReadingScope,
  ContinuousReadingState,
  ContinuousReadingStopReason,
} from "../types";
import {
  buildContinuousReadingSequence,
  composedContains,
  findActiveModalDialog,
  findContinuousStartIndex,
  isContinuousReadingElementIgnored,
  resolveContinuousReadingCandidate,
  type ContinuousReadingCandidate,
  type ContinuousReadingRoot,
} from "./continuous-reading";
import { resolveSpeechLanguage } from "./language";
import type { PageEffectsController } from "./page-effects";
import type { OutputRequestOptions } from "./output";

type ReadingRoot = ContinuousReadingRoot;

interface ReadingStateProvider {
  isEnabled: () => boolean;
  getRate: () => number;
  getPreferredLanguage: () => string | null;
}

interface ReadingTargetProvider {
  isRegionContainer: (element: HTMLElement) => boolean;
  isTabSpeechTarget: (element: HTMLElement) => boolean;
  isContinuousReadingTab?: (element: HTMLElement) => boolean;
  getCurrentRegionElement?: () => HTMLElement | null;
}

interface ReadingOutputController {
  speak(
    text: string,
    lang: string,
    rate: number,
    options: OutputRequestOptions,
  ): (() => void) | null;
  cancel(): void;
  canOutput?: () => boolean;
  isSupported?: () => boolean;
  pauseContinuous?: () => "audio" | "text" | null;
  resumePausedText?: () => boolean;
}

interface ContinuousReadingCallbacks {
  onStateChange?: (state: ContinuousReadingState) => void;
  onStart?: (event: {
    state: "playing";
    scope: ContinuousReadingScope;
    count: number;
  }) => void;
  onSegmentChange?: (
    event: ContinuousReadingPosition & { state: "playing" },
  ) => void;
  onPause?: (
    event: ContinuousReadingPosition & { state: "paused" },
  ) => void;
  onResume?: (
    event: ContinuousReadingPosition & { state: "playing" },
  ) => void;
  onStop?: (event: {
    state: "idle";
    reason: ContinuousReadingStopReason;
    lastIndex: number | null;
    count: number;
  }) => void;
  onError?: (error: unknown, message: string) => void;
}

export interface CurrentReadingSegment {
  readonly element: HTMLElement;
  readonly text: string;
  readonly language: string;
  readonly scope: ContinuousReadingScope;
  readonly generation: number;
  readonly index: number;
  readonly count: number;
}

export type ContinuousReadingStartResult =
  | "started"
  | "unsupported"
  | "empty";

interface PreparedSegment {
  candidateIndex: number;
  segment: CurrentReadingSegment;
}

export class ReadingController {
  private readonly roots = new Set<ReadingRoot>();
  private readonly documents = new Set<Document>();
  private readonly sessionObservers: MutationObserver[] = [];
  private hoverTimer: number | null = null;
  private hoverTarget: HTMLElement | null = null;
  private lastTarget: HTMLElement | null = null;
  private lastPageTarget: HTMLElement | null = null;
  private lastRegionTarget: HTMLElement | null = null;
  private lastText = "";
  private lastLanguage = "";
  private activeTarget: HTMLElement | null = null;
  private singleGeneration = 0;
  private running = false;
  private continuousState: ContinuousReadingState = "idle";
  private continuousSequence: readonly ContinuousReadingCandidate[] = [];
  private continuousScope: ContinuousReadingScope = "page";
  private continuousScopeElement: HTMLElement | null = null;
  private continuousIndex = -1;
  private continuousGeneration = 0;
  private currentSegment: CurrentReadingSegment | null = null;

  constructor(
    private config: ResolvedAccessibilityToolConfig,
    private readonly output: ReadingOutputController,
    private readonly effects: PageEffectsController,
    private readonly state: ReadingStateProvider,
    private readonly targets: ReadingTargetProvider,
    private readonly continuousCallbacks: ContinuousReadingCallbacks = {},
  ) {}

  updateConfig(config: ResolvedAccessibilityToolConfig): void {
    this.config = config;
    this.revalidateContinuousSession([], true);
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
        root.nodeType === Node.DOCUMENT_NODE
          ? (root as Document)
          : root.ownerDocument;
      if (documentRef) {
        this.documents.add(documentRef);
      }
    }
    if (wasRunning) {
      this.attach();
    }
    if (this.continuousState !== "idle") {
      this.bindSessionObservers();
      this.revalidateContinuousSession();
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
    if (this.continuousState !== "idle") {
      this.stopContinuous("lifecycle");
    }
    if (!this.running) {
      this.cancelSingleReading();
      return;
    }
    this.running = false;
    this.detach();
    this.cancelSingleReading();
    this.clearContinuousStartContext();
  }

  cancel(): void {
    if (this.continuousState !== "idle") {
      this.stopContinuous("interaction");
      return;
    }
    this.cancelSingleReading();
  }

  rememberPageTarget(element: HTMLElement | null): void {
    if (
      element?.isConnected &&
      !isToolOwnedElement(element)
    ) {
      if (
        this.lastRegionTarget &&
        !composedContains(this.lastRegionTarget, element)
      ) {
        this.lastRegionTarget = null;
      }
      this.lastPageTarget = element;
    }
  }

  rememberRegionTarget(element: HTMLElement | null): void {
    if (element?.isConnected && !isToolOwnedElement(element)) {
      this.lastRegionTarget = element;
    }
  }

  clearContinuousStartContext(): void {
    this.lastPageTarget = null;
    this.lastRegionTarget = null;
  }

  rememberActivePageTarget(): void {
    const primaryDocument =
      this.getOrderedRoots().find(
        (root): root is Document => root.nodeType === Node.DOCUMENT_NODE,
      ) ?? document;
    const activeElement = getDeepActiveElement(primaryDocument);
    if (
      !activeElement ||
      activeElement === primaryDocument.body ||
      activeElement === primaryDocument.documentElement ||
      !isVisible(activeElement)
    ) {
      return;
    }
    this.rememberPageTarget(activeElement);
  }

  getContinuousState(): ContinuousReadingState {
    return this.continuousState;
  }

  getCurrentSegment(): Readonly<CurrentReadingSegment> | null {
    return this.currentSegment ? { ...this.currentSegment } : null;
  }

  startContinuous(): ContinuousReadingStartResult {
    if (this.continuousState !== "idle") {
      return "started";
    }
    if (
      !(this.output.canOutput?.() ?? this.output.isSupported?.() ?? true)
    ) {
      return "unsupported";
    }

    this.cancelSingleReading();
    const roots = this.getOrderedRoots();
    const dialog = findActiveModalDialog(roots);
    const scope: ContinuousReadingScope = dialog ? "dialog" : "page";
    const sequence = buildContinuousReadingSequence({
      roots,
      scope: dialog,
      config: this.config,
      isTabControl: (element) =>
        this.targets.isContinuousReadingTab?.(element) ?? false,
    });
    if (sequence.length === 0) {
      return "empty";
    }

    const startIndex = this.resolveContinuousStartIndex(sequence, dialog);
    const generation = this.continuousGeneration + 1;
    const prepared = this.findNextPreparedSegment(
      sequence,
      startIndex,
      scope,
      generation,
    );
    if (!prepared) {
      return "empty";
    }

    this.continuousGeneration = generation;
    this.continuousSequence = sequence;
    this.continuousScope = scope;
    this.continuousScopeElement = dialog;
    this.continuousIndex = prepared.candidateIndex;
    this.currentSegment = prepared.segment;
    this.continuousState = "playing";
    this.bindSessionObservers();
    this.effects.setHighlight(prepared.segment.element);
    this.scrollIntoViewIfNeeded(prepared.segment.element);
    this.continuousCallbacks.onStateChange?.("playing");
    this.continuousCallbacks.onStart?.({
      state: "playing",
      scope,
      count: sequence.length,
    });
    this.continuousCallbacks.onSegmentChange?.({
      state: "playing",
      ...this.toPosition(prepared.segment),
    });
    this.speakCurrentSegment(generation);
    return "started";
  }

  pauseContinuous(): void {
    if (this.continuousState !== "playing" || !this.currentSegment) {
      return;
    }
    const outputMode = this.output.pauseContinuous?.() ?? "audio";
    if (!this.output.pauseContinuous) {
      this.output.cancel();
    }
    const generation =
      outputMode === "text"
        ? this.continuousGeneration
        : ++this.continuousGeneration;
    this.currentSegment = {
      ...this.currentSegment,
      generation,
    };
    this.continuousState = "paused";
    this.continuousCallbacks.onStateChange?.("paused");
    this.continuousCallbacks.onPause?.({
      state: "paused",
      ...this.toPosition(this.currentSegment),
    });
  }

  resumeContinuous(): void {
    if (this.continuousState !== "paused") {
      return;
    }
    const activeDialog = findActiveModalDialog(this.getOrderedRoots());
    if (
      (this.continuousScope === "page" && activeDialog) ||
      (this.continuousScope === "dialog" &&
        activeDialog !== this.continuousScopeElement)
    ) {
      this.stopContinuous("dialog");
      return;
    }
    const nextGeneration = this.continuousGeneration + 1;
    const prepared = this.findNextPreparedSegment(
      this.continuousSequence,
      Math.max(this.continuousIndex, 0),
      this.continuousScope,
      nextGeneration,
    );
    if (!prepared) {
      this.finishContinuous("completed", false);
      return;
    }

    const previousSegment = this.currentSegment;
    const moved = prepared.candidateIndex !== this.continuousIndex;
    const resumedTextOnly = Boolean(
      !moved &&
        previousSegment &&
        previousSegment.text === prepared.segment.text &&
        previousSegment.language === prepared.segment.language &&
        this.output.resumePausedText?.(),
    );
    const generation = resumedTextOnly
      ? this.continuousGeneration
      : nextGeneration;
    this.continuousGeneration = generation;
    this.continuousIndex = prepared.candidateIndex;
    this.currentSegment = { ...prepared.segment, generation };
    this.continuousState = "playing";
    this.effects.setHighlight(prepared.segment.element);
    this.scrollIntoViewIfNeeded(prepared.segment.element);
    this.continuousCallbacks.onStateChange?.("playing");
    this.continuousCallbacks.onResume?.({
      state: "playing",
      ...this.toPosition(prepared.segment),
    });
    if (moved) {
      this.continuousCallbacks.onSegmentChange?.({
        state: "playing",
        ...this.toPosition(prepared.segment),
      });
    }
    if (!resumedTextOnly) {
      this.speakCurrentSegment(generation);
    }
  }

  stopContinuous(reason: ContinuousReadingStopReason = "stopped"): void {
    this.finishContinuous(reason, true);
  }

  revalidateContinuousSession(
    mutations: readonly MutationRecord[] = [],
    forcePrivacyRefresh = false,
  ): void {
    if (this.continuousState === "idle") {
      return;
    }
    const activeDialog = findActiveModalDialog(this.getOrderedRoots());
    if (
      (this.continuousScope === "page" && activeDialog) ||
      (this.continuousScope === "dialog" &&
        activeDialog !== this.continuousScopeElement)
    ) {
      this.stopContinuous("dialog");
      return;
    }
    if (this.continuousState !== "playing") {
      return;
    }
    const candidate = this.continuousSequence[this.continuousIndex];
    const resolved = candidate
      ? resolveContinuousReadingCandidate(candidate, this.config)
      : null;
    if (resolved) {
      const textChanged = resolved.text !== this.currentSegment?.text;
      if (
        !textChanged ||
        (!forcePrivacyRefresh &&
          !this.mutationsIntroducePrivacyBoundary(mutations))
      ) {
        return;
      }
      const generation = this.continuousGeneration;
      this.output.cancel();
      this.clearCurrentSegment();
      this.advanceContinuous(generation, this.continuousIndex);
      return;
    }
    const generation = this.continuousGeneration;
    this.output.cancel();
    this.clearCurrentSegment();
    this.advanceContinuous(generation, this.continuousIndex + 1);
  }

  speakElement(element: HTMLElement, force = false): void {
    if (isToolOwnedElement(element)) {
      return;
    }
    if (!this.state.isEnabled() || !element.isConnected || !isVisible(element)) {
      return;
    }
    if (this.continuousState !== "idle") {
      this.stopContinuous(this.getInteractionStopReason());
      force = true;
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

    const generation = ++this.singleGeneration;
    this.lastTarget = element;
    this.lastText = text;
    this.lastLanguage = language;
    this.activeTarget = element;
    this.effects.setHighlight(element);
    const request = this.output.speak(text, language, this.state.getRate(), {
      kind: "single",
      onEnd: () => this.finishElement(element, generation),
      onError: () => this.finishElement(element, generation),
      onCancel: () => this.finishElement(element, generation),
    });
    if (!request) {
      this.finishElement(element, generation);
    }
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
    const rawTarget = this.getPathElement(event);
    this.rememberPageTarget(rawTarget);
    const target = getClosestReadableElement(rawTarget);
    if (target) {
      this.clearHover();
      this.speakElement(target);
    }
  };

  private readonly handlePointerOver = (event: Event): void => {
    if (!this.state.isEnabled() || this.continuousState !== "idle") {
      return;
    }
    const target = this.getReadableTarget(event);
    if (!target || target === this.hoverTarget) {
      return;
    }
    this.clearHover();
    this.hoverTarget = target;
    this.hoverTimer = window.setTimeout(() => {
      if (this.hoverTarget === target && this.continuousState === "idle") {
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
    const rawTarget = this.getPathElement(event);
    this.rememberPageTarget(rawTarget);
    const target = getClosestReadableElement(rawTarget);
    if (target) {
      this.clearHover();
      this.speakElement(
        target,
        Boolean(target.ownerDocument.getSelection()?.toString().trim()),
      );
    }
  };

  private readonly handleVisibilityChange = (event: Event): void => {
    const documentRef = event.currentTarget as Document;
    if (documentRef.visibilityState === "hidden") {
      if (this.continuousState !== "idle") {
        this.stopContinuous("lifecycle");
      } else {
        this.cancelSingleReading();
      }
    }
  };

  private getPathElement(event: Event): HTMLElement | null {
    return (
      event
        .composedPath()
        .find((item): item is HTMLElement => isHTMLElement(item)) ?? null
    );
  }

  private getReadableTarget(event: Event): HTMLElement | null {
    return getClosestReadableElement(this.getPathElement(event));
  }

  private clearHover(): void {
    if (this.hoverTimer !== null) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.hoverTarget = null;
  }

  private finishElement(element: HTMLElement, generation: number): void {
    if (
      generation === this.singleGeneration &&
      this.activeTarget === element
    ) {
      this.effects.clearHighlight(element);
      this.activeTarget = null;
    }
  }

  private cancelSingleReading(): void {
    this.clearHover();
    this.singleGeneration += 1;
    this.output.cancel();
    this.lastTarget = null;
    this.lastText = "";
    this.lastLanguage = "";
    if (this.activeTarget) {
      this.effects.clearHighlight(this.activeTarget);
      this.activeTarget = null;
    }
  }

  private getOrderedRoots(): ReadingRoot[] {
    const roots = Array.from(this.roots);
    const documentIndex = roots.findIndex(
      (root) => root.nodeType === Node.DOCUMENT_NODE,
    );
    if (documentIndex > 0) {
      const [primaryDocument] = roots.splice(documentIndex, 1);
      if (primaryDocument) {
        roots.unshift(primaryDocument);
      }
    }
    return roots.length > 0 ? roots : [document];
  }

  private resolveContinuousStartIndex(
    sequence: readonly ContinuousReadingCandidate[],
    scope: HTMLElement | null,
  ): number {
    const targetIndex = this.isWithinScope(this.lastPageTarget, scope)
      ? findContinuousStartIndex(sequence, this.lastPageTarget)
      : -1;
    if (targetIndex >= 0) {
      return targetIndex;
    }
    const currentRegion =
      this.targets.getCurrentRegionElement?.() ?? this.lastRegionTarget;
    const regionIndex = this.isWithinScope(currentRegion, scope)
      ? findContinuousStartIndex(sequence, currentRegion)
      : -1;
    return regionIndex >= 0 ? regionIndex : 0;
  }

  private isWithinScope(
    element: HTMLElement | null,
    scope: HTMLElement | null,
  ): element is HTMLElement {
    return Boolean(
      element?.isConnected &&
        isVisible(element) &&
        (!scope || composedContains(scope, element)),
    );
  }

  private findNextPreparedSegment(
    sequence: readonly ContinuousReadingCandidate[],
    startIndex: number,
    scope: ContinuousReadingScope,
    generation: number,
  ): PreparedSegment | null {
    for (let index = Math.max(startIndex, 0); index < sequence.length; index += 1) {
      const candidate = sequence[index];
      if (!candidate) {
        continue;
      }
      const resolved = resolveContinuousReadingCandidate(candidate, this.config);
      if (!resolved) {
        continue;
      }
      const language = resolveSpeechLanguage({
        element: resolved.element,
        text: resolved.text,
        preferredLanguage: this.state.getPreferredLanguage(),
        projectDefault: this.config.locale,
      }).language;
      return {
        candidateIndex: index,
        segment: {
          element: resolved.element,
          text: resolved.text,
          language,
          scope,
          generation,
          index: index + 1,
          count: sequence.length,
        },
      };
    }
    return null;
  }

  private speakCurrentSegment(generation: number): void {
    const segment = this.currentSegment;
    if (
      !segment ||
      this.continuousState !== "playing" ||
      generation !== this.continuousGeneration
    ) {
      return;
    }
    const request = this.output.speak(
      segment.text,
      segment.language,
      this.state.getRate(),
      {
        kind: "continuous",
        onEnd: () => this.handleContinuousEnd(generation, segment.index - 1),
        onError: () => this.handleContinuousError(generation),
      },
    );
    if (!request) {
      const error = new Error("无法启动连续朗读语音请求。");
      this.continuousCallbacks.onError?.(error, "语音朗读失败。");
      this.finishContinuous("error", false);
    }
  }

  private handleContinuousEnd(generation: number, index: number): void {
    if (
      generation !== this.continuousGeneration ||
      this.continuousState !== "playing" ||
      index !== this.continuousIndex
    ) {
      return;
    }
    this.clearCurrentSegment();
    this.advanceContinuous(generation, index + 1);
  }

  private handleContinuousError(generation: number): void {
    if (
      generation !== this.continuousGeneration ||
      this.continuousState !== "playing"
    ) {
      return;
    }
    this.finishContinuous("error", false);
  }

  private advanceContinuous(generation: number, startIndex: number): void {
    if (
      generation !== this.continuousGeneration ||
      this.continuousState !== "playing"
    ) {
      return;
    }
    const prepared = this.findNextPreparedSegment(
      this.continuousSequence,
      startIndex,
      this.continuousScope,
      generation,
    );
    if (!prepared) {
      this.finishContinuous("completed", false);
      return;
    }
    this.continuousIndex = prepared.candidateIndex;
    this.currentSegment = prepared.segment;
    this.effects.setHighlight(prepared.segment.element);
    this.scrollIntoViewIfNeeded(prepared.segment.element);
    this.continuousCallbacks.onSegmentChange?.({
      state: "playing",
      ...this.toPosition(prepared.segment),
    });
    this.speakCurrentSegment(generation);
  }

  private finishContinuous(
    reason: ContinuousReadingStopReason,
    cancelSpeech: boolean,
  ): void {
    if (this.continuousState === "idle") {
      return;
    }
    const lastIndex =
      this.continuousIndex >= 0 ? this.continuousIndex + 1 : null;
    const count = this.continuousSequence.length;
    this.continuousGeneration += 1;
    if (["dialog", "route", "lifecycle"].includes(reason)) {
      this.clearContinuousStartContext();
    }
    if (cancelSpeech) {
      this.output.cancel();
    }
    this.disconnectSessionObservers();
    this.clearCurrentSegment();
    this.continuousSequence = [];
    this.continuousScope = "page";
    this.continuousScopeElement = null;
    this.continuousIndex = -1;
    this.continuousState = "idle";
    this.continuousCallbacks.onStateChange?.("idle");
    this.continuousCallbacks.onStop?.({
      state: "idle",
      reason,
      lastIndex,
      count,
    });
  }

  private clearCurrentSegment(): void {
    const segment = this.currentSegment;
    this.currentSegment = null;
    if (segment) {
      this.effects.clearHighlight(segment.element);
    }
  }

  private toPosition(
    segment: CurrentReadingSegment,
  ): ContinuousReadingPosition {
    return {
      index: segment.index,
      count: segment.count,
      textLength: segment.text.length,
    };
  }

  private bindSessionObservers(): void {
    this.disconnectSessionObservers();
    for (const root of this.roots) {
      const target =
        root.nodeType === Node.DOCUMENT_NODE
          ? (root as Document).documentElement
          : root;
      if (!target) {
        continue;
      }
      const documentRef =
        root.nodeType === Node.DOCUMENT_NODE
          ? (root as Document)
          : root.ownerDocument;
      const ViewMutationObserver =
        documentRef?.defaultView?.MutationObserver ?? MutationObserver;
      const observer = new ViewMutationObserver((mutations) =>
        this.revalidateContinuousSession(mutations),
      );
      observer.observe(target, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
      this.sessionObservers.push(observer);
    }
  }

  private disconnectSessionObservers(): void {
    for (const observer of this.sessionObservers) {
      observer.disconnect();
    }
    this.sessionObservers.length = 0;
  }

  private mutationsIntroducePrivacyBoundary(
    mutations: readonly MutationRecord[],
  ): boolean {
    const elements = new Set<HTMLElement>();
    const collect = (node: Node): void => {
      if (!isHTMLElement(node)) {
        return;
      }
      elements.add(node);
      for (const descendant of Array.from(
        node.querySelectorAll<HTMLElement>("*"),
      )) {
        elements.add(descendant);
      }
    };
    for (const mutation of mutations) {
      collect(mutation.target);
      for (const node of Array.from(mutation.addedNodes)) {
        collect(node);
      }
    }
    for (const element of elements) {
      if (isContinuousReadingElementIgnored(element, this.config)) {
        return true;
      }
    }
    return false;
  }

  private getInteractionStopReason(): ContinuousReadingStopReason {
    const activeDialog = findActiveModalDialog(this.getOrderedRoots());
    return activeDialog && activeDialog !== this.continuousScopeElement
      ? "dialog"
      : "interaction";
  }

  private scrollIntoViewIfNeeded(element: HTMLElement): void {
    const view = element.ownerDocument.defaultView;
    const rect = element.getBoundingClientRect();
    const viewportWidth = view?.innerWidth ?? 0;
    const viewportHeight = view?.innerHeight ?? 0;
    const outsideViewport =
      rect.bottom < 0 ||
      rect.right < 0 ||
      rect.top > viewportHeight ||
      rect.left > viewportWidth;
    if (!outsideViewport || typeof element.scrollIntoView !== "function") {
      return;
    }
    const reducedMotion =
      view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    try {
      element.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: reducedMotion ? "auto" : "smooth",
      });
    } catch {
      element.scrollIntoView();
    }
  }
}

function isToolOwnedElement(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (current.closest("[data-a11y-tool-host]")) {
      return true;
    }
    const root = current.getRootNode();
    if ("host" in root && isHTMLElement(root.host)) {
      current = root.host;
      continue;
    }
    current = null;
  }
  return false;
}
