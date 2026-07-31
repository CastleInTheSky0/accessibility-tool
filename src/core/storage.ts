import { COLOR_SCHEMES } from "./constants";
import type { ColorScheme, PersistedPreferences } from "../types";

interface StoredPayload {
  version: number;
  preferences: PersistedPreferences;
}

const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isColorScheme = (value: unknown): value is ColorScheme =>
  typeof value === "string" &&
  (COLOR_SCHEMES as readonly string[]).includes(value);

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

  return candidate as PersistedPreferences;
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
    this.memory = { ...preferences };
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
