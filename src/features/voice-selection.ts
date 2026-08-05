import { normalizeLanguageTag } from "./language";
import type { PersistedVoicePreference } from "../types";

export type VoiceCatalogStatus = "loading" | "ready" | "unsupported";

export interface VoiceCatalogCapability {
  readonly providerId: string;
  readonly localOnly: boolean;
  readonly supportsPreview: boolean;
}

export interface LocalVoiceDescriptor extends PersistedVoicePreference {
  id: string;
  isDefault: boolean;
}

export interface VoiceCatalogSnapshot {
  capability: VoiceCatalogCapability;
  status: VoiceCatalogStatus;
  voices: readonly LocalVoiceDescriptor[];
}

export interface VoiceCatalogProvider {
  readonly capability: VoiceCatalogCapability;
  start(): void;
  stop(): void;
  subscribe(listener: (snapshot: VoiceCatalogSnapshot) => void): () => void;
  getSnapshot(): VoiceCatalogSnapshot;
  getCompatibleVoices(language: string): readonly LocalVoiceDescriptor[];
  resolvePreference(
    preference: PersistedVoicePreference | null,
    language: string,
  ): LocalVoiceDescriptor | null;
}

export interface BrowserNativeVoiceResolver {
  resolveNativeVoice(
    preference: PersistedVoicePreference | null,
    language: string,
  ): SpeechSynthesisVoice | null;
}

export interface VoiceRuntimeCapability {
  catalog: VoiceCatalogProvider;
  nativeVoiceResolver: BrowserNativeVoiceResolver;
}

interface NativeVoiceEntry {
  descriptor: LocalVoiceDescriptor;
  voice: SpeechSynthesisVoice;
}

const BROWSER_LOCAL_CAPABILITY: VoiceCatalogCapability = Object.freeze({
  providerId: "browser-local",
  localOnly: true,
  supportsPreview: true,
});

export class BrowserLocalVoiceCatalog
  implements VoiceCatalogProvider, BrowserNativeVoiceResolver
{
  readonly capability = BROWSER_LOCAL_CAPABILITY;

  private readonly listeners = new Set<
    (snapshot: VoiceCatalogSnapshot) => void
  >();
  private snapshot: VoiceCatalogSnapshot = {
    capability: this.capability,
    status: "loading",
    voices: [],
  };
  private started = false;
  private receivedVoicesChanged = false;

  constructor(
    private readonly synthesis: SpeechSynthesis | null =
      getBrowserSpeechSynthesis(),
  ) {}

  start(): void {
    if (this.started) {
      this.refresh();
      return;
    }
    this.started = true;
    if (!this.isSupported()) {
      this.commit("unsupported", []);
      return;
    }
    this.synthesis?.addEventListener(
      "voiceschanged",
      this.handleVoicesChanged,
    );
    this.refresh();
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.synthesis?.removeEventListener(
      "voiceschanged",
      this.handleVoicesChanged,
    );
  }

  subscribe(listener: (snapshot: VoiceCatalogSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): VoiceCatalogSnapshot {
    return {
      ...this.snapshot,
      voices: this.snapshot.voices.map((voice) => ({ ...voice })),
    };
  }

  getCompatibleVoices(language: string): readonly LocalVoiceDescriptor[] {
    return sortCompatibleEntries(
      this.snapshot.voices.map((descriptor) => ({ descriptor })),
      language,
    ).map(({ descriptor }) => ({ ...descriptor }));
  }

  resolvePreference(
    preference: PersistedVoicePreference | null,
    language: string,
  ): LocalVoiceDescriptor | null {
    if (!preference) {
      return null;
    }
    const entries = sortCompatibleEntries(
      this.snapshot.voices.map((descriptor) => ({ descriptor })),
      language,
    );
    return findPreferredEntry(entries, preference)?.descriptor ?? null;
  }

  resolveNativeVoice(
    preference: PersistedVoicePreference | null,
    language: string,
  ): SpeechSynthesisVoice | null {
    const entries = sortCompatibleEntries(this.readCurrentLocalVoices(), language);
    if (entries.length === 0) {
      return null;
    }
    return (
      findPreferredEntry(entries, preference)?.voice ??
      entries.find(({ descriptor }) => descriptor.isDefault)?.voice ??
      null
    );
  }

  private readonly handleVoicesChanged = (): void => {
    this.receivedVoicesChanged = true;
    this.refresh();
  };

  private refresh(): void {
    if (!this.isSupported()) {
      this.commit("unsupported", []);
      return;
    }
    const allVoices = this.readAllVoices();
    const localVoices = toLocalEntries(allVoices).map(
      ({ descriptor }) => descriptor,
    );
    const status =
      allVoices.length === 0 && !this.receivedVoicesChanged
        ? "loading"
        : "ready";
    this.commit(status, localVoices);
  }

  private readCurrentLocalVoices(): NativeVoiceEntry[] {
    return toLocalEntries(this.readAllVoices());
  }

  private readAllVoices(): SpeechSynthesisVoice[] {
    try {
      return Array.from(this.synthesis?.getVoices() ?? []);
    } catch {
      return [];
    }
  }

  private isSupported(): boolean {
    return Boolean(
      this.synthesis && typeof this.synthesis.getVoices === "function",
    );
  }

  private commit(
    status: VoiceCatalogStatus,
    voices: readonly LocalVoiceDescriptor[],
  ): void {
    this.snapshot = {
      capability: this.capability,
      status,
      voices: voices.map((voice) => ({ ...voice })),
    };
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export function createBrowserLocalVoiceRuntime(): VoiceRuntimeCapability {
  const browserLocalCatalog = new BrowserLocalVoiceCatalog();
  return {
    catalog: browserLocalCatalog,
    nativeVoiceResolver: browserLocalCatalog,
  };
}

function getBrowserSpeechSynthesis(): SpeechSynthesis | null {
  return typeof globalThis.speechSynthesis === "undefined"
    ? null
    : globalThis.speechSynthesis;
}

function toLocalEntries(
  voices: readonly SpeechSynthesisVoice[],
): NativeVoiceEntry[] {
  const entries: NativeVoiceEntry[] = [];
  const seen = new Set<string>();
  for (const voice of voices) {
    if (voice.localService !== true) {
      continue;
    }
    const lang = normalizeLanguageTag(voice.lang);
    const name = voice.name.trim();
    if (!lang || !name) {
      continue;
    }
    const voiceURI = voice.voiceURI.trim();
    const id = createVoiceId({ voiceURI, name, lang });
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    entries.push({
      descriptor: {
        id,
        voiceURI,
        name,
        lang,
        isDefault: voice.default,
      },
      voice,
    });
  }
  return entries;
}

function sortCompatibleEntries<T extends { descriptor: LocalVoiceDescriptor }>(
  entries: readonly T[],
  language: string,
): T[] {
  const normalizedLanguage = normalizeLanguageTag(language);
  if (!normalizedLanguage) {
    return [];
  }
  const primaryLanguage = getPrimaryLanguage(normalizedLanguage);
  return entries
    .filter(({ descriptor }) => {
      const voiceLanguage = normalizeLanguageTag(descriptor.lang);
      return (
        voiceLanguage === normalizedLanguage ||
        getPrimaryLanguage(voiceLanguage) === primaryLanguage
      );
    })
    .slice()
    .sort((left, right) => {
      const leftExact = left.descriptor.lang === normalizedLanguage ? 0 : 1;
      const rightExact = right.descriptor.lang === normalizedLanguage ? 0 : 1;
      return (
        leftExact - rightExact ||
        Number(right.descriptor.isDefault) -
          Number(left.descriptor.isDefault) ||
        left.descriptor.name.localeCompare(right.descriptor.name, normalizedLanguage) ||
        left.descriptor.lang.localeCompare(right.descriptor.lang) ||
        left.descriptor.voiceURI.localeCompare(right.descriptor.voiceURI)
      );
    });
}

function findPreferredEntry<T extends { descriptor: LocalVoiceDescriptor }>(
  entries: readonly T[],
  preference: PersistedVoicePreference | null,
): T | null {
  if (!preference) {
    return null;
  }
  const voiceURI = preference.voiceURI.trim();
  if (voiceURI) {
    const uriMatch = entries.find(
      ({ descriptor }) => descriptor.voiceURI === voiceURI,
    );
    if (uriMatch) {
      return uriMatch;
    }
  }
  const language = normalizeLanguageTag(preference.lang);
  return (
    entries.find(
      ({ descriptor }) =>
        descriptor.name === preference.name.trim() &&
        descriptor.lang === language,
    ) ?? null
  );
}

function createVoiceId(preference: PersistedVoicePreference): string {
  return preference.voiceURI
    ? `uri:${preference.voiceURI}`
    : `name:${preference.name}\u0000${preference.lang}`;
}

function getPrimaryLanguage(language: string | null): string {
  return language?.split("-", 1)[0]?.toLowerCase() ?? "";
}
