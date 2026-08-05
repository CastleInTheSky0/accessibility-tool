import type {
  LocalVoiceDescriptor,
  VoiceCatalogStatus,
} from "../features/voice-selection";
import type { PersistedVoicePreference } from "../types";

export type VoiceSettingsAvailability =
  | "browser-local"
  | "custom-adapter"
  | "unsupported";

export interface VoiceSettingsModel {
  availability: VoiceSettingsAvailability;
  catalogStatus: VoiceCatalogStatus;
  preferredLanguage: string | null;
  effectiveLanguage: string;
  availableLanguages: readonly string[];
  voices: readonly LocalVoiceDescriptor[];
  selectedVoiceId: string | null;
  summary: string;
  statusMessage: string;
  hasPreferences: boolean;
  previewEnabled: boolean;
  isPreviewing: boolean;
}

interface VoiceSettingsCallbacks {
  onLanguageChange: (language: string | null) => void;
  onVoiceChange: (voice: PersistedVoicePreference | null) => void;
  onPreview: () => void;
  onClear: () => void;
  onClose: () => void;
}

interface CloseOptions {
  returnFocus?: boolean;
  notify?: boolean;
}

const LANGUAGE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "", label: "跟随页面与自动检测" },
  { value: "zh-CN", label: "中文（简体）" },
  { value: "zh-TW", label: "中文（繁体）" },
  { value: "en-US", label: "English (US)" },
  { value: "ja-JP", label: "日本語" },
  { value: "ko-KR", label: "한국어" },
];

export class VoiceSettingsUI {
  readonly element: HTMLElement;

  private readonly languageSelect: HTMLSelectElement;
  private readonly voiceList: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly previewButton: HTMLButtonElement;
  private readonly voicesById = new Map<string, LocalVoiceDescriptor>();
  private anchor: HTMLElement | null = null;
  private model: VoiceSettingsModel | null = null;
  private focusedVoiceId: string | null = null;

  constructor(
    private readonly container: HTMLElement,
    id: string,
    private readonly callbacks: VoiceSettingsCallbacks,
  ) {
    const documentRef = container.ownerDocument;
    this.element = documentRef.createElement("section");
    this.element.id = id;
    this.element.className = "a11y-voice-settings";
    this.element.hidden = true;
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-labelledby", `${id}-title`);

    const header = documentRef.createElement("div");
    header.className = "a11y-voice-settings__header";
    const title = documentRef.createElement("h2");
    title.id = `${id}-title`;
    title.textContent = "语音设置";
    const closeButton = documentRef.createElement("button");
    closeButton.type = "button";
    closeButton.className = "a11y-voice-settings__close";
    closeButton.setAttribute("aria-label", "关闭语音设置");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () =>
      this.close({ returnFocus: true, notify: true }),
    );
    header.append(title, closeButton);

    const languageField = documentRef.createElement("div");
    languageField.className = "a11y-voice-settings__field";
    const languageLabel = documentRef.createElement("label");
    languageLabel.className = "a11y-voice-settings__label";
    languageLabel.htmlFor = `${id}-language`;
    languageLabel.textContent = "默认语言";
    this.languageSelect = documentRef.createElement("select");
    this.languageSelect.id = `${id}-language`;
    this.languageSelect.className = "a11y-voice-settings__select";
    this.populateLanguageOptions(null, []);
    this.languageSelect.addEventListener("change", () => {
      this.callbacks.onLanguageChange(this.languageSelect.value || null);
    });
    languageField.append(languageLabel, this.languageSelect);

    const voiceField = documentRef.createElement("div");
    voiceField.className = "a11y-voice-settings__field";
    const voiceLabel = documentRef.createElement("div");
    voiceLabel.id = `${id}-voices-label`;
    voiceLabel.className = "a11y-voice-settings__label";
    voiceLabel.textContent = "本地音色";
    this.voiceList = documentRef.createElement("div");
    this.voiceList.className = "a11y-voice-settings__list";
    this.voiceList.setAttribute("role", "radiogroup");
    this.voiceList.setAttribute("aria-labelledby", voiceLabel.id);
    this.voiceList.addEventListener("focusin", (event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.type === "radio") {
        this.focusedVoiceId = input.value;
      }
    });
    this.voiceList.addEventListener("focusout", (event) => {
      const nextTarget = event.relatedTarget;
      if (!(nextTarget instanceof Node) || !this.voiceList.contains(nextTarget)) {
        this.focusedVoiceId = null;
      }
    });
    this.voiceList.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "radio") {
        return;
      }
      const voice = input.value ? this.voicesById.get(input.value) : null;
      this.callbacks.onVoiceChange(
        voice
          ? { voiceURI: voice.voiceURI, name: voice.name, lang: voice.lang }
          : null,
      );
    });
    voiceField.append(voiceLabel, this.voiceList);

    this.status = documentRef.createElement("p");
    this.status.className = "a11y-voice-settings__status";
    this.status.setAttribute("role", "status");

    const privacy = documentRef.createElement("p");
    privacy.className = "a11y-voice-settings__privacy";
    privacy.innerHTML = [
      '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">',
      '<path d="M8 1.5 13 3.5v3.7c0 3.2-2.1 5.8-5 7.3-2.9-1.5-5-4.1-5-7.3V3.5l5-2Z"/>',
      '<path d="m5.8 8 1.4 1.4L10.5 6"/>',
      "</svg>",
      "<span>仅显示浏览器或系统提供的本地音色</span>",
    ].join("");

    const actions = documentRef.createElement("div");
    actions.className = "a11y-voice-settings__actions";
    this.clearButton = documentRef.createElement("button");
    this.clearButton.type = "button";
    this.clearButton.className = "a11y-voice-settings__button a11y-voice-settings__button--secondary";
    this.clearButton.textContent = "清除偏好";
    this.clearButton.addEventListener("click", () => this.callbacks.onClear());
    this.previewButton = documentRef.createElement("button");
    this.previewButton.type = "button";
    this.previewButton.className = "a11y-voice-settings__button a11y-voice-settings__button--primary";
    this.previewButton.textContent = "试听";
    this.previewButton.addEventListener("click", () =>
      this.callbacks.onPreview(),
    );
    actions.append(this.clearButton, this.previewButton);

    this.element.append(
      header,
      languageField,
      voiceField,
      this.status,
      privacy,
      actions,
    );
    container.append(this.element);
  }

  update(model: VoiceSettingsModel): void {
    this.model = model;
    this.populateLanguageOptions(
      model.preferredLanguage,
      model.availableLanguages,
    );
    this.languageSelect.value = model.preferredLanguage ?? "";
    this.element.toggleAttribute(
      "data-voice-settings-unavailable",
      model.availability !== "browser-local",
    );
    this.element.setAttribute(
      "aria-busy",
      String(
        model.availability === "browser-local" &&
          model.catalogStatus === "loading",
      ),
    );
    this.renderVoices(model);
    this.status.textContent = model.statusMessage;
    this.clearButton.disabled = !model.hasPreferences;
    this.previewButton.disabled = !model.previewEnabled;
    this.previewButton.textContent = model.isPreviewing ? "重新试听" : "试听";
    this.previewButton.setAttribute(
      "aria-label",
      model.isPreviewing ? "重新试听当前音色" : "试听当前音色",
    );
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
    this.languageSelect.focus({ preventScroll: true });
  }

  close(options: CloseOptions = {}): void {
    if (!this.isOpen()) {
      return;
    }
    const anchor = this.anchor;
    this.unbindOpenEvents();
    this.element.hidden = true;
    anchor?.setAttribute("aria-expanded", "false");
    this.anchor = null;
    if (options.notify) {
      this.callbacks.onClose();
    }
    if (options.returnFocus && anchor?.isConnected) {
      anchor.focus({ preventScroll: true });
    }
  }

  isOpen(): boolean {
    return !this.element.hidden;
  }

  destroy(): void {
    this.close();
    this.element.remove();
  }

  private populateLanguageOptions(
    current: string | null,
    availableLanguages: readonly string[],
  ): void {
    const previous = this.languageSelect?.value ?? "";
    this.languageSelect?.replaceChildren();
    const options = [...LANGUAGE_OPTIONS];
    const knownLanguages = new Set(options.map(({ value }) => value));
    const extraLanguages = new Set(
      availableLanguages.filter((language) => !knownLanguages.has(language)),
    );
    if (current && !knownLanguages.has(current)) {
      extraLanguages.add(current);
    }
    for (const language of Array.from(extraLanguages).sort((left, right) =>
      left.localeCompare(right),
    )) {
      options.push({ value: language, label: language });
    }
    for (const optionConfig of options) {
      const option = this.container.ownerDocument.createElement("option");
      option.value = optionConfig.value;
      option.textContent = optionConfig.label;
      this.languageSelect?.append(option);
    }
    if (this.languageSelect) {
      this.languageSelect.value = current ?? previous;
    }
  }

  private renderVoices(model: VoiceSettingsModel): void {
    const focusedVoiceId = this.focusedVoiceId;
    this.voicesById.clear();
    const disabled = model.availability !== "browser-local";
    const rows: HTMLElement[] = [
      this.createVoiceRow({
        id: "",
        name: "自动选择（推荐）",
        lang: "系统默认",
        checked: model.selectedVoiceId === null,
        disabled,
      }),
    ];
    for (const voice of model.voices) {
      this.voicesById.set(voice.id, voice);
      rows.push(
        this.createVoiceRow({
          id: voice.id,
          name: voice.name,
          lang: voice.lang,
          checked: model.selectedVoiceId === voice.id,
          disabled,
        }),
      );
    }
    this.voiceList.replaceChildren(...rows);
    if (focusedVoiceId !== null) {
      const radios = Array.from(
        this.voiceList.querySelectorAll<HTMLInputElement>(
          'input[type="radio"]',
        ),
      );
      const focusTarget =
        radios.find((radio) => radio.value === focusedVoiceId) ??
        radios.find((radio) => radio.checked);
      focusTarget?.focus({ preventScroll: true });
    }
  }

  private createVoiceRow(input: {
    id: string;
    name: string;
    lang: string;
    checked: boolean;
    disabled: boolean;
  }): HTMLLabelElement {
    const documentRef = this.container.ownerDocument;
    const row = documentRef.createElement("label");
    row.className = "a11y-voice-settings__voice";
    const radio = documentRef.createElement("input");
    radio.type = "radio";
    radio.name = `${this.element.id}-voice`;
    radio.value = input.id;
    radio.checked = input.checked;
    radio.disabled = input.disabled;
    const marker = documentRef.createElement("span");
    marker.className = "a11y-voice-settings__radio";
    marker.setAttribute("aria-hidden", "true");
    const name = documentRef.createElement("strong");
    name.textContent = input.name;
    const language = documentRef.createElement("small");
    language.textContent = input.lang;
    row.append(radio, marker, name, language);
    return row;
  }

  private bindOpenEvents(): void {
    const documentRef = this.container.ownerDocument;
    documentRef.addEventListener(
      "pointerdown",
      this.handleDocumentPointer,
      true,
    );
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
    const panelWidth = this.element.getBoundingClientRect().width || 430;
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
      "--a11y-voice-settings-arrow-left",
      `${arrowLeft}px`,
    );
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
