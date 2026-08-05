import { describe, expect, it, vi } from "vitest";
import {
  detectTextLanguage,
  normalizeLanguageTag,
  resolveSpeechLanguage,
} from "../../src/features/language";

describe("language tag normalization", () => {
  it("canonicalizes casing, separators, scripts and regions", () => {
    expect(normalizeLanguageTag("zh-cn")).toBe("zh-CN");
    expect(normalizeLanguageTag("ZH-hans-cn")).toBe("zh-Hans-CN");
    expect(normalizeLanguageTag("en_US")).toBe("en-US");
  });

  it("uses the deterministic basic fallback when Intl is unavailable", () => {
    vi.stubGlobal("Intl", {});

    expect(normalizeLanguageTag("ZH_hans_cn")).toBe("zh-Hans-CN");
    expect(normalizeLanguageTag("en_us")).toBe("en-US");
  });

  it("rejects empty, unavailable and malformed tags", () => {
    expect(normalizeLanguageTag(" ")).toBeNull();
    expect(normalizeLanguageTag("und")).toBeNull();
    expect(normalizeLanguageTag("zxx-CN")).toBeNull();
    expect(normalizeLanguageTag("en--US")).toBeNull();
    expect(normalizeLanguageTag("123")).toBeNull();
  });
});

describe("local text language detection", () => {
  it.each([
    ["这是中文内容", "zh-CN"],
    ["按钮，Hello world", "en-US"],
    ["日本語を読みます", "ja-JP"],
    ["안녕하세요 반갑습니다", "ko-KR"],
  ])("detects %s as %s", (text, language) => {
    expect(detectTextLanguage(text)).toBe(language);
  });

  it("requires two strong characters and a sixty-percent majority", () => {
    expect(detectTextLanguage("A")).toBeNull();
    expect(detectTextLanguage("中文AB")).toBeNull();
    expect(detectTextLanguage("中文内容AB")).toBe("zh-CN");
  });

  it("ignores URLs, email addresses, numbers, punctuation and emoji", () => {
    expect(
      detectTextLanguage(
        "https://example.com example.org user@example.com 123 😀",
      ),
    ).toBeNull();
  });

  it("uses the documented Han-only fallback for ambiguous Japanese text", () => {
    expect(detectTextLanguage("日本語文章")).toBe("zh-CN");
  });
});

describe("speech language resolution", () => {
  it("applies the complete six-level priority", () => {
    document.documentElement.lang = "ko-KR";
    document.body.innerHTML = `
      <section id="language-parent" lang="ja-JP">
        <button id="language-target" lang="en_US">Hello world</button>
      </section>
    `;
    const parent = get("language-parent");
    const target = get("language-target");
    const input = {
      element: target,
      text: "按钮，Hello world",
      preferredLanguage: "fr-FR",
      projectDefault: "de-DE",
    };

    expect(resolveSpeechLanguage(input)).toEqual({
      language: "en-US",
      source: "element",
    });

    target.removeAttribute("lang");
    expect(resolveSpeechLanguage(input)).toEqual({
      language: "ja-JP",
      source: "ancestor",
    });

    parent.removeAttribute("lang");
    expect(resolveSpeechLanguage(input)).toEqual({
      language: "ko-KR",
      source: "document",
    });

    document.documentElement.removeAttribute("lang");
    expect(resolveSpeechLanguage(input)).toEqual({
      language: "fr-FR",
      source: "preference",
    });

    expect(
      resolveSpeechLanguage({ ...input, preferredLanguage: null }),
    ).toEqual({
      language: "en-US",
      source: "text",
    });

    expect(
      resolveSpeechLanguage({
        ...input,
        text: "中文AB",
        preferredLanguage: null,
      }),
    ).toEqual({
      language: "de-DE",
      source: "project-default",
    });
  });

  it("continues through invalid candidates and uses the safe default", () => {
    document.documentElement.lang = "und";
    document.body.innerHTML = `
      <section lang="zxx"><button id="invalid-language" lang="bad--tag">123</button></section>
    `;

    expect(
      resolveSpeechLanguage({
        element: get("invalid-language"),
        text: "123",
        preferredLanguage: "en--US",
        projectDefault: "123",
      }),
    ).toEqual({
      language: "zh-CN",
      source: "project-default",
    });
  });

  it("walks from an open Shadow Root to its host", () => {
    const host = document.createElement("div");
    host.lang = "ko_kr";
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `<button id="shadow-language">Hello</button>`;
    const target = shadowRoot.getElementById("shadow-language");

    expect(
      resolveSpeechLanguage({
        element: target,
        text: "按钮，Hello",
        projectDefault: "zh-CN",
      }),
    ).toEqual({
      language: "ko-KR",
      source: "ancestor",
    });
  });

  it("uses the target owner document without crossing document boundaries", () => {
    const frameDocument = document.implementation.createHTMLDocument("frame");
    frameDocument.documentElement.lang = "ja-JP";
    const target = frameDocument.createElement("button");
    target.textContent = "Hello";
    frameDocument.body.append(target);

    expect(
      resolveSpeechLanguage({
        element: target,
        text: "按钮，Hello",
        projectDefault: "zh-CN",
      }),
    ).toEqual({
      language: "ja-JP",
      source: "document",
    });
  });

  it("re-resolves changed DOM language instead of caching an element", () => {
    document.body.innerHTML = `
      <section id="dynamic-language-parent" lang="en-US">
        <button id="dynamic-language-target">Hello</button>
      </section>
    `;
    const parent = get("dynamic-language-parent");
    const target = get("dynamic-language-target");
    const input = {
      element: target,
      text: "按钮，Hello",
      projectDefault: "zh-CN",
    };

    expect(resolveSpeechLanguage(input).language).toBe("en-US");
    parent.lang = "ko-KR";
    expect(resolveSpeechLanguage(input).language).toBe("ko-KR");
  });
});

function get(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}
