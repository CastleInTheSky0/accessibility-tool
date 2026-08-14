import { DEFAULT_CONFIG } from "../core/config";

export type LanguageResolutionSource =
  | "element"
  | "ancestor"
  | "document"
  | "preference"
  | "text"
  | "project-default";

export interface ResolveSpeechLanguageInput {
  element?: Element | null;
  text: string;
  preferredLanguage?: string | null;
  projectDefault: string;
}

export interface LanguageResolution {
  language: string;
  source: LanguageResolutionSource;
}

const MIN_STRONG_CHARACTERS = 2;
const DOMINANCE_THRESHOLD = 0.6;
const UNAVAILABLE_LANGUAGE_CODES = new Set(["und", "zxx"]);
const TOOL_SPEECH_PREFIX =
  /^(?:打开新窗口链接，|链接，|图片，|按钮，|输入框：|复选框，|单选框，|下拉框，|文本：)\s*/u;
const URL_PATTERN =
  /\b(?:(?:https?|ftp):\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/giu;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/giu;
const HIRAGANA_PATTERN = /\p{Script=Hiragana}/u;
const KATAKANA_PATTERN = /\p{Script=Katakana}/u;
const HANGUL_PATTERN = /\p{Script=Hangul}/u;
const HAN_PATTERN = /\p{Script=Han}/u;
const LATIN_PATTERN = /\p{Script=Latin}/u;

export function normalizeLanguageTag(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const prepared = value.trim().replaceAll("_", "-");
  if (!prepared) {
    return null;
  }

  const canonical =
    canonicalizeWithIntl(prepared) ?? canonicalizeBasicTag(prepared);
  if (!canonical) {
    return null;
  }
  const primaryLanguage = canonical.split("-", 1)[0]?.toLowerCase();
  return primaryLanguage && !UNAVAILABLE_LANGUAGE_CODES.has(primaryLanguage)
    ? canonical
    : null;
}

export function detectTextLanguage(text: string): string | null {
  const subject = text
    .replace(TOOL_SPEECH_PREFIX, "")
    .replace(EMAIL_PATTERN, " ")
    .replace(URL_PATTERN, " ");
  let kana = 0;
  let hangul = 0;
  let han = 0;
  let latin = 0;

  for (const character of subject) {
    if (HIRAGANA_PATTERN.test(character) || KATAKANA_PATTERN.test(character)) {
      kana += 1;
    } else if (HANGUL_PATTERN.test(character)) {
      hangul += 1;
    } else if (HAN_PATTERN.test(character)) {
      han += 1;
    } else if (LATIN_PATTERN.test(character)) {
      latin += 1;
    }
  }

  const strongCharacterCount = kana + hangul + han + latin;
  if (strongCharacterCount < MIN_STRONG_CHARACTERS) {
    return null;
  }

  const candidates: Array<{ language: string; score: number }> = [];
  if (kana > 0) {
    candidates.push({ language: "ja-JP", score: kana + han });
  } else if (hangul === 0 && han > 0) {
    candidates.push({ language: "zh-CN", score: han });
  }
  if (hangul > 0) {
    candidates.push({ language: "ko-KR", score: hangul });
  }
  if (latin > 0) {
    candidates.push({ language: "en-US", score: latin });
  }

  const dominant = candidates.reduce<
    { language: string; score: number } | undefined
  >(
    (current, candidate) =>
      !current || candidate.score > current.score ? candidate : current,
    undefined,
  );
  return dominant &&
    dominant.score / strongCharacterCount >= DOMINANCE_THRESHOLD
    ? dominant.language
    : null;
}

export function resolveSpeechLanguage(
  input: ResolveSpeechLanguageInput,
): LanguageResolution {
  const elementLanguage = normalizeLanguageTag(
    input.element?.getAttribute("lang"),
  );
  if (elementLanguage) {
    return { language: elementLanguage, source: "element" };
  }

  const ancestorLanguage = findAncestorLanguage(input.element ?? null);
  if (ancestorLanguage) {
    return { language: ancestorLanguage, source: "ancestor" };
  }

  const documentLanguage = normalizeLanguageTag(
    input.element?.ownerDocument.documentElement.getAttribute("lang"),
  );
  if (documentLanguage) {
    return { language: documentLanguage, source: "document" };
  }

  const preferredLanguage = normalizeLanguageTag(input.preferredLanguage);
  if (preferredLanguage) {
    return { language: preferredLanguage, source: "preference" };
  }

  try {
    const detectedLanguage = detectTextLanguage(input.text);
    if (detectedLanguage) {
      return { language: detectedLanguage, source: "text" };
    }
  } catch {
    // Detection must never prevent the existing speech request.
  }

  return {
    language:
      normalizeLanguageTag(input.projectDefault) ?? DEFAULT_CONFIG.locale,
    source: "project-default",
  };
}

function findAncestorLanguage(element: Element | null): string | null {
  if (!element) {
    return null;
  }
  const documentElement = element.ownerDocument.documentElement;
  let ancestor = getComposedParentElement(element);
  while (ancestor && ancestor !== documentElement) {
    const language = normalizeLanguageTag(ancestor.getAttribute("lang"));
    if (language) {
      return language;
    }
    ancestor = getComposedParentElement(ancestor);
  }
  return null;
}

function getComposedParentElement(element: Element): Element | null {
  if (element.parentElement) {
    return element.parentElement;
  }
  const root = element.getRootNode();
  if (root.nodeType === 11 && "host" in root) {
    return (root as ShadowRoot).host;
  }
  return null;
}

function canonicalizeWithIntl(value: string): string | null {
  const intl = globalThis.Intl as typeof Intl | undefined;
  try {
    if (typeof intl?.getCanonicalLocales === "function") {
      return intl.getCanonicalLocales(value)[0] ?? null;
    }
  } catch {
    // Continue with Intl.Locale or the deterministic basic fallback.
  }
  try {
    if (typeof intl?.Locale === "function") {
      return new intl.Locale(value).toString();
    }
  } catch {
    // Continue with the deterministic basic fallback.
  }
  return null;
}

function canonicalizeBasicTag(value: string): string | null {
  const subtags = value.split("-");
  const language = subtags[0];
  if (!language || !/^[a-z]{2,8}$/iu.test(language)) {
    return null;
  }

  const normalized = [language.toLowerCase()];
  let scriptFound = false;
  let regionFound = false;
  for (const subtag of subtags.slice(1)) {
    if (!subtag) {
      return null;
    }
    if (!scriptFound && /^[a-z]{4}$/iu.test(subtag)) {
      normalized.push(
        `${subtag[0]?.toUpperCase() ?? ""}${subtag.slice(1).toLowerCase()}`,
      );
      scriptFound = true;
      continue;
    }
    if (
      !regionFound &&
      (/^[a-z]{2}$/iu.test(subtag) || /^\d{3}$/u.test(subtag))
    ) {
      normalized.push(subtag.toUpperCase());
      regionFound = true;
      continue;
    }
    if (/^(?:[a-z0-9]{5,8}|\d[a-z0-9]{3})$/iu.test(subtag)) {
      normalized.push(subtag.toLowerCase());
      continue;
    }
    return null;
  }
  return normalized.join("-");
}
