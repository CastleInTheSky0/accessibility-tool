import { COLOR_SCHEMES } from "./constants";
import type {
  ColorScheme,
  PersistedPreferences,
  PersistedVoicePreference,
} from "../types";

interface StoredPayload {
  version: number;
  preferences: PersistedPreferences;
}

interface StoredOpenStatePayload {
  version: number;
  isOpen: true;
}

const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isColorScheme = (value: unknown): value is ColorScheme =>
  typeof value === "string" &&
  (COLOR_SCHEMES as readonly string[]).includes(value);

function parseVoicePreference(
  value: unknown,
): PersistedVoicePreference | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<PersistedVoicePreference>;
  if (
    typeof candidate.voiceURI !== "string" ||
    typeof candidate.name !== "string" ||
    !candidate.name.trim() ||
    typeof candidate.lang !== "string" ||
    !candidate.lang.trim()
  ) {
    return null;
  }
  return {
    voiceURI: candidate.voiceURI.trim(),
    name: candidate.name.trim(),
    lang: candidate.lang.trim(),
  };
}

function parsePreferences(value: unknown): PersistedPreferences | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<PersistedPreferences>;
  if (
    !isBoolean(candidate.readingEnabled) ||
    !isFiniteNumber(candidate.speechRate) ||
    !isColorScheme(candidate.colorScheme) ||
    !isFiniteNumber(candidate.zoom) ||
    !isBoolean(candidate.largeCursor) ||
    !isBoolean(candidate.crosshair) ||
    !isBoolean(candidate.isPinned) ||
    !isBoolean(candidate.isReadScreen)
  ) {
    return null;
  }

  const parsed: PersistedPreferences = {
    readingEnabled: candidate.readingEnabled,
    speechRate: candidate.speechRate,
    colorScheme: candidate.colorScheme,
    zoom: candidate.zoom,
    largeCursor: candidate.largeCursor,
    crosshair: candidate.crosshair,
    isPinned: candidate.isPinned,
    isReadScreen: candidate.isReadScreen,
  };
  if (
    typeof candidate.preferredLanguage === "string" &&
    candidate.preferredLanguage.trim()
  ) {
    parsed.preferredLanguage = candidate.preferredLanguage.trim();
  }
  const voice = parseVoicePreference(candidate.voice);
  if (voice) {
    parsed.voice = voice;
  }
  return parsed;
}

export class PreferenceStore {
  private memory: PersistedPreferences | null = null;

  constructor(
    private readonly key: string,
    private readonly version: number,
  ) {}

  load(): PersistedPreferences | null {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      if (!raw) {
        return this.memory;
      }
      const payload = JSON.parse(raw) as Partial<StoredPayload>;
      if (payload.version !== this.version) {
        return this.memory;
      }
      return parsePreferences(payload.preferences) ?? this.memory;
    } catch {
      return this.memory;
    }
  }

  save(preferences: PersistedPreferences): void {
    this.memory = clonePreferences(preferences);
    try {
      const payload: StoredPayload = {
        version: this.version,
        preferences,
      };
      globalThis.localStorage?.setItem(this.key, JSON.stringify(payload));
    } catch {
      // Memory fallback is intentionally sufficient.
    }
  }

  clear(): void {
    this.memory = null;
    try {
      globalThis.localStorage?.removeItem(this.key);
    } catch {
      // Storage may be unavailable; memory is already cleared.
    }
  }
}

function clonePreferences(
  preferences: PersistedPreferences,
): PersistedPreferences {
  return {
    ...preferences,
    ...(preferences.voice ? { voice: { ...preferences.voice } } : {}),
  };
}

export function deriveOpenStateStorageKey(storageKey: string): string {
  return `${storageKey}:open-state`;
}

export class OpenStateStore {
  private memory = false;

  constructor(
    private readonly key: string,
    private readonly version: number,
  ) {}

  load(): boolean {
    let raw: string | null;
    try {
      raw = globalThis.localStorage?.getItem(this.key) ?? null;
    } catch {
      return this.memory;
    }
    if (raw === null) {
      return this.memory;
    }
    try {
      const payload = JSON.parse(raw) as Partial<StoredOpenStatePayload>;
      if (payload.version !== this.version || payload.isOpen !== true) {
        this.memory = false;
        this.removePersistedValue();
        return false;
      }
      this.memory = true;
      return true;
    } catch {
      this.memory = false;
      this.removePersistedValue();
      return false;
    }
  }

  markOpen(): void {
    this.memory = true;
    try {
      const payload: StoredOpenStatePayload = {
        version: this.version,
        isOpen: true,
      };
      globalThis.localStorage?.setItem(this.key, JSON.stringify(payload));
    } catch {
      // Memory fallback cannot survive a page reload, which is expected.
    }
  }

  clear(): void {
    this.memory = false;
    this.removePersistedValue();
  }

  private removePersistedValue(): void {
    try {
      globalThis.localStorage?.removeItem(this.key);
    } catch {
      // Storage may be unavailable; the in-memory value remains authoritative.
    }
  }
}
