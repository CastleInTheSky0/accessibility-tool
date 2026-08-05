import { describe, expect, it, vi } from "vitest";
import {
  deriveOpenStateStorageKey,
  OpenStateStore,
  PreferenceStore,
} from "../../src/core/storage";
import type { PersistedPreferences } from "../../src/types";

const preferences: PersistedPreferences = {
  readingEnabled: true,
  speechRate: 1.25,
  colorScheme: "black-yellow",
  zoom: 1.5,
  largeCursor: true,
  crosshair: false,
  isPinned: true,
  isReadScreen: false,
};

describe("PreferenceStore", () => {
  it("round-trips validated preferences", () => {
    const store = new PreferenceStore("test:preferences", 1);
    store.save(preferences);

    expect(store.load()).toEqual(preferences);
    store.clear();
    expect(store.load()).toBeNull();
  });

  it("accepts an optional preferred language without breaking v0.1 payloads", () => {
    const legacyKey = "test:legacy-preferences";
    localStorage.setItem(
      legacyKey,
      JSON.stringify({ version: 1, preferences }),
    );
    expect(new PreferenceStore(legacyKey, 1).load()).toEqual(preferences);

    const languagePreferences: PersistedPreferences = {
      ...preferences,
      preferredLanguage: "en-US",
    };
    const store = new PreferenceStore("test:language-preferences", 1);
    store.save(languagePreferences);
    expect(store.load()).toEqual(languagePreferences);
  });

  it("ignores only a corrupt preferred-language field", () => {
    const key = "test:invalid-language-preferences";
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        preferences: { ...preferences, preferredLanguage: 42 },
      }),
    );

    expect(new PreferenceStore(key, 1).load()).toEqual(preferences);
  });

  it("round-trips a serializable voice descriptor", () => {
    const voicePreferences: PersistedPreferences = {
      ...preferences,
      voice: {
        voiceURI: "local:zh-female",
        name: "本地女声",
        lang: "zh-CN",
      },
    };
    const store = new PreferenceStore("test:voice-preferences", 1);

    store.save(voicePreferences);

    expect(store.load()).toEqual(voicePreferences);
    const payload = JSON.parse(
      localStorage.getItem("test:voice-preferences") ?? "null",
    ) as { preferences?: { voice?: unknown } } | null;
    expect(payload?.preferences?.voice).toEqual(voicePreferences.voice);
  });

  it("ignores only a corrupt voice descriptor", () => {
    const key = "test:invalid-voice-preferences";
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        preferences: {
          ...preferences,
          preferredLanguage: "ja-JP",
          voice: { voiceURI: 7, name: "", lang: false },
        },
      }),
    );

    expect(new PreferenceStore(key, 1).load()).toEqual({
      ...preferences,
      preferredLanguage: "ja-JP",
    });
  });

  it("ignores corrupt or incompatible payloads", () => {
    localStorage.setItem("test:corrupt", "not-json");
    expect(new PreferenceStore("test:corrupt", 1).load()).toBeNull();

    localStorage.setItem(
      "test:version",
      JSON.stringify({ version: 99, preferences }),
    );
    expect(new PreferenceStore("test:version", 1).load()).toBeNull();

    localStorage.setItem(
      "test:shape",
      JSON.stringify({ version: 1, preferences: { speechRate: "fast" } }),
    );
    expect(new PreferenceStore("test:shape", 1).load()).toBeNull();
  });

  it("falls back to page memory when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    const store = new PreferenceStore("test:memory", 1);
    store.save(preferences);
    expect(store.load()).toEqual(preferences);
    store.clear();
    expect(store.load()).toBeNull();
  });
});

describe("OpenStateStore", () => {
  it("uses a separate versioned key and round-trips only a true intent", () => {
    const key = deriveOpenStateStorageKey("test:preferences");
    const store = new OpenStateStore(key, 1);

    expect(key).toBe("test:preferences:open-state");
    expect(store.load()).toBe(false);
    store.markOpen();
    expect(store.load()).toBe(true);
    expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual({
      version: 1,
      isOpen: true,
    });
    store.clear();
    expect(store.load()).toBe(false);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("removes corrupt and incompatible open-state payloads", () => {
    const corruptKey = "test:open-corrupt";
    const emptyKey = "test:open-empty";
    const versionKey = "test:open-version";
    localStorage.setItem(corruptKey, "not-json");
    localStorage.setItem(emptyKey, "");
    localStorage.setItem(
      versionKey,
      JSON.stringify({ version: 99, isOpen: true }),
    );

    expect(new OpenStateStore(corruptKey, 1).load()).toBe(false);
    expect(new OpenStateStore(emptyKey, 1).load()).toBe(false);
    expect(new OpenStateStore(versionKey, 1).load()).toBe(false);
    expect(localStorage.getItem(corruptKey)).toBeNull();
    expect(localStorage.getItem(emptyKey)).toBeNull();
    expect(localStorage.getItem(versionKey)).toBeNull();
  });

  it("does not reuse an in-memory true intent after persisted data becomes corrupt", () => {
    const key = "test:open-memory-corrupt";
    const store = new OpenStateStore(key, 1);
    store.markOpen();
    localStorage.setItem(key, "");

    expect(store.load()).toBe(false);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("falls back to page memory when open-state storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    const store = new OpenStateStore("test:open-memory", 1);

    store.markOpen();
    expect(store.load()).toBe(true);
    store.clear();
    expect(store.load()).toBe(false);
  });
});
