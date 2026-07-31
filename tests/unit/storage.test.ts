import { describe, expect, it, vi } from "vitest";
import { PreferenceStore } from "../../src/core/storage";
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
