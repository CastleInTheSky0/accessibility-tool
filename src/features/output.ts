import type { SpeechController } from "./speech";

export type CaptionVisualStatus =
  | "朗读中"
  | "显示中"
  | "已暂停"
  | "已结束";

export interface CaptionOutputModel {
  readonly text: string;
  readonly status: CaptionVisualStatus;
}

export interface CaptionOutputSink {
  showCaption(model: CaptionOutputModel, resetScroll: boolean): void;
  hideCaption(): void;
}

export type OutputKind =
  | "single"
  | "continuous"
  | "preview"
  | "announcement";

export interface OutputRequestOptions {
  kind: OutputKind;
  forceAudio?: boolean;
  onEnd?: () => void;
  onError?: () => void;
  onCancel?: () => void;
}

interface OutputStateProvider {
  isAudioEnabled: () => boolean;
  isCaptionEnabled: () => boolean;
}

type OutputPhase =
  | "pending-audio"
  | "audio"
  | "text"
  | "paused-audio"
  | "paused-text"
  | "retained";

interface ActiveOutput {
  readonly token: number;
  readonly text: string;
  readonly lang: string;
  readonly rate: number;
  readonly kind: OutputKind;
  readonly forceAudio: boolean;
  readonly callbacks: OutputRequestOptions;
  phase: OutputPhase;
  audioStartedAt: number | null;
  timerStartedAt: number | null;
  durationMs: number;
  remainingMs: number;
  timer: number | null;
  cancelSpeech: (() => void) | null;
  suppressSpeechCancel: boolean;
}

const MIN_DISPLAY_MS = 3_000;
const MAX_DISPLAY_MS = 15_000;
const RETENTION_MS = 3_000;
const MIN_FALLBACK_REMAINING_MS = 1_000;

/**
 * Coordinates every effective text output without exposing page text through
 * the public event layer. SpeechController remains the authority for real
 * audio request validity; this controller only owns the visual/text fallback
 * token and its timers.
 */
export class OutputCoordinator {
  private active: ActiveOutput | null = null;
  private token = 0;

  constructor(
    private readonly speech: SpeechController,
    private readonly caption: CaptionOutputSink,
    private readonly state: OutputStateProvider,
  ) {}

  isAudioSupported(): boolean {
    return this.speech.isSupported();
  }

  canOutput(): boolean {
    return (
      (this.state.isAudioEnabled() && this.speech.isSupported()) ||
      this.state.isCaptionEnabled()
    );
  }

  speak(
    text: string,
    lang: string,
    rate: number,
    options: OutputRequestOptions,
  ): (() => void) | null {
    if (!text) {
      return null;
    }
    const forceAudio = options.forceAudio === true;
    const attemptAudio =
      this.speech.isSupported() &&
      (forceAudio || this.state.isAudioEnabled());
    if (!attemptAudio && !this.state.isCaptionEnabled()) {
      return null;
    }

    const preserveContinuousCaption = Boolean(
      options.kind === "continuous" &&
        this.active?.kind === "continuous" &&
        this.active.phase === "retained",
    );
    this.cancelActive(true, !preserveContinuousCaption);
    const token = ++this.token;
    const active: ActiveOutput = {
      token,
      text,
      lang,
      rate,
      kind: options.kind,
      forceAudio,
      callbacks: options,
      phase: attemptAudio ? "pending-audio" : "text",
      audioStartedAt: null,
      timerStartedAt: null,
      durationMs: estimateDisplayDuration(text, rate),
      remainingMs: 0,
      timer: null,
      cancelSpeech: null,
      suppressSpeechCancel: false,
    };
    this.active = active;

    if (!attemptAudio) {
      this.startTextPhase(active, active.durationMs);
      return () => this.cancelToken(token);
    }

    const cancelSpeech = this.speech.speak(text, lang, rate, {
      onStart: () => this.handleAudioStart(token),
      onEnd: () => this.handleAudioEnd(token),
      onError: () => this.handleAudioError(token),
      onCancel: () => this.handleAudioCancel(token),
    });
    if (this.active?.token === token) {
      this.active.cancelSpeech = cancelSpeech;
      if (!cancelSpeech && this.active.phase === "pending-audio") {
        this.handleUnavailableAudio(this.active);
      }
    }
    // Once an output request has been accepted, keep returning a cancellation
    // handle even when an adapter settles synchronously. Returning `null` here
    // would make the reading layer report a second "unable to start" error
    // after the real synchronous error/end path has already run.
    return () => this.cancelToken(token);
  }

  cancel(): void {
    this.cancelActive(true);
  }

  pauseContinuous(): "audio" | "text" | null {
    const active = this.active;
    if (!active || active.kind !== "continuous") {
      return null;
    }
    if (active.phase === "text") {
      active.remainingMs = this.getRemainingTimerMs(active);
      this.clearTimer(active);
      active.phase = "paused-text";
      this.render(active, false);
      return "text";
    }
    if (active.phase === "audio" || active.phase === "pending-audio") {
      active.suppressSpeechCancel = true;
      active.cancelSpeech?.();
      active.cancelSpeech = null;
      active.phase = "paused-audio";
      this.render(active, false);
      return "audio";
    }
    return null;
  }

  resumePausedText(): boolean {
    const active = this.active;
    if (
      !active ||
      active.kind !== "continuous" ||
      active.phase !== "paused-text"
    ) {
      return false;
    }
    this.startTextPhase(
      active,
      Math.max(MIN_FALLBACK_REMAINING_MS, active.remainingMs),
      false,
    );
    return true;
  }

  transitionAudioToText(): void {
    const active = this.active;
    if (
      !active ||
      active.forceAudio ||
      (active.phase !== "audio" && active.phase !== "pending-audio")
    ) {
      return;
    }
    const elapsed =
      active.audioStartedAt === null
        ? 0
        : Math.max(0, Date.now() - active.audioStartedAt);
    active.suppressSpeechCancel = true;
    active.cancelSpeech?.();
    active.cancelSpeech = null;
    if (this.state.isCaptionEnabled()) {
      this.startTextPhase(
        active,
        Math.max(
          MIN_FALLBACK_REMAINING_MS,
          active.durationMs - elapsed,
        ),
        false,
      );
      return;
    }
    this.settleWithoutFallback(active, "cancel");
  }

  setCaptionEnabled(enabled: boolean): { stopTextOnlyContinuous: boolean } {
    const active = this.active;
    if (enabled) {
      if (active && active.phase !== "pending-audio") {
        this.render(active, false);
      }
      return { stopTextOnlyContinuous: false };
    }

    this.caption.hideCaption();
    if (!active) {
      return { stopTextOnlyContinuous: false };
    }
    if (active.phase === "retained") {
      // Explicitly disabling captions ends the review window. Do not retain
      // page text or allow it to reappear if captions are enabled again before
      // the old retention timer would have expired.
      this.cancelActive(false, false);
      return { stopTextOnlyContinuous: false };
    }
    const textPhase =
      active.phase === "text" || active.phase === "paused-text";
    const noAudioSession =
      !this.state.isAudioEnabled() || !this.speech.isSupported();
    if (textPhase && active.kind === "continuous" && noAudioSession) {
      return { stopTextOnlyContinuous: true };
    }
    if (textPhase && active.kind !== "continuous") {
      this.cancelActive(true);
    }
    return { stopTextOnlyContinuous: false };
  }

  private handleAudioStart(token: number): void {
    const active = this.getActive(token);
    if (!active || active.phase !== "pending-audio") {
      return;
    }
    active.phase = "audio";
    active.audioStartedAt = Date.now();
    this.render(active, true);
  }

  private handleAudioEnd(token: number): void {
    const active = this.getActive(token);
    if (
      !active ||
      (active.phase !== "audio" && active.phase !== "pending-audio")
    ) {
      return;
    }
    active.cancelSpeech = null;
    if (active.phase === "pending-audio") {
      this.clearTimer(active);
      this.active = null;
      this.caption.hideCaption();
      active.callbacks.onEnd?.();
      return;
    }
    this.enterRetained(active);
  }

  private handleAudioError(token: number): void {
    const active = this.getActive(token);
    if (!active) {
      return;
    }
    active.cancelSpeech = null;
    const elapsed =
      active.audioStartedAt === null
        ? 0
        : Math.max(0, Date.now() - active.audioStartedAt);
    if (this.state.isCaptionEnabled()) {
      this.startTextPhase(
        active,
        Math.max(
          active.audioStartedAt === null
            ? MIN_DISPLAY_MS
            : MIN_FALLBACK_REMAINING_MS,
          active.durationMs - elapsed,
        ),
        active.audioStartedAt === null,
      );
      return;
    }
    this.settleWithoutFallback(active, "error");
  }

  private handleAudioCancel(token: number): void {
    const active = this.getActive(token);
    if (!active) {
      return;
    }
    if (active.suppressSpeechCancel) {
      active.suppressSpeechCancel = false;
      return;
    }
    this.settleWithoutFallback(active, "cancel");
  }

  private handleUnavailableAudio(active: ActiveOutput): void {
    if (this.state.isCaptionEnabled()) {
      this.startTextPhase(active, active.durationMs);
      return;
    }
    this.settleWithoutFallback(active, "error");
  }

  private startTextPhase(
    active: ActiveOutput,
    durationMs: number,
    resetScroll = true,
  ): void {
    if (this.active?.token !== active.token) {
      return;
    }
    this.clearTimer(active);
    active.phase = "text";
    active.remainingMs = Math.max(1, Math.round(durationMs));
    active.timerStartedAt = Date.now();
    this.render(active, resetScroll);
    active.timer = window.setTimeout(() => {
      const current = this.getActive(active.token);
      if (!current || current.phase !== "text") {
        return;
      }
      this.enterRetained(current);
    }, active.remainingMs);
  }

  private enterRetained(active: ActiveOutput): void {
    if (this.active?.token !== active.token) {
      return;
    }
    this.clearTimer(active);
    active.phase = "retained";
    active.remainingMs = RETENTION_MS;
    active.timerStartedAt = Date.now();
    this.render(active, false);
    active.timer = window.setTimeout(() => {
      if (this.active?.token !== active.token) {
        return;
      }
      this.active = null;
      this.caption.hideCaption();
    }, RETENTION_MS);
    active.callbacks.onEnd?.();
  }

  private settleWithoutFallback(
    active: ActiveOutput,
    reason: "cancel" | "error",
  ): void {
    if (this.active?.token !== active.token) {
      return;
    }
    this.clearTimer(active);
    this.active = null;
    this.caption.hideCaption();
    if (reason === "error") {
      active.callbacks.onError?.();
    } else {
      active.callbacks.onCancel?.();
    }
  }

  private render(active: ActiveOutput, resetScroll: boolean): void {
    if (!this.state.isCaptionEnabled()) {
      return;
    }
    const status: CaptionVisualStatus =
      active.phase === "audio"
        ? "朗读中"
        : active.phase === "paused-audio" || active.phase === "paused-text"
          ? "已暂停"
          : active.phase === "retained"
            ? "已结束"
            : "显示中";
    this.caption.showCaption({ text: active.text, status }, resetScroll);
  }

  private cancelToken(token: number): void {
    if (this.active?.token === token) {
      this.cancelActive(true);
    }
  }

  private cancelActive(notify: boolean, hideCaption = true): void {
    const active = this.active;
    if (!active) {
      if (hideCaption) {
        this.caption.hideCaption();
      }
      return;
    }
    this.active = null;
    this.token += 1;
    this.clearTimer(active);
    active.cancelSpeech?.();
    active.cancelSpeech = null;
    if (hideCaption) {
      this.caption.hideCaption();
    }
    if (notify && active.phase !== "retained") {
      active.callbacks.onCancel?.();
    }
  }

  private getActive(token: number): ActiveOutput | null {
    return this.active?.token === token ? this.active : null;
  }

  private getRemainingTimerMs(active: ActiveOutput): number {
    if (active.timerStartedAt === null) {
      return active.remainingMs;
    }
    return Math.max(
      0,
      active.remainingMs - (Date.now() - active.timerStartedAt),
    );
  }

  private clearTimer(active: ActiveOutput): void {
    if (active.timer !== null) {
      window.clearTimeout(active.timer);
      active.timer = null;
    }
    active.timerStartedAt = null;
  }
}

export function estimateDisplayDuration(text: string, rate: number): number {
  const normalizedRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const strongCharacters = Array.from(text).filter(
    (character) => !/\s/u.test(character),
  ).length;
  return clampDuration((strongCharacters * 220) / normalizedRate);
}

function clampDuration(durationMs: number): number {
  return Math.round(
    Math.min(MAX_DISPLAY_MS, Math.max(MIN_DISPLAY_MS, durationMs)),
  );
}
