import type { CaptionPinyinAnnotation } from "../language/pinyin";
import type { CaptionScript } from "../types";
import packageMetadata from "../../package.json" with { type: "json" };

const LANGUAGE_ASSET_VERSION = encodeURIComponent(packageMetadata.version);

interface CaptionOpenCCModule {
  convertCaptionText(original: string, script: CaptionScript): string;
}

interface CaptionPinyinModule {
  annotateCaptionPinyin(text: string): readonly CaptionPinyinAnnotation[];
}

export interface CaptionLanguageRuntime {
  loadOpenCC(): Promise<CaptionOpenCCModule>;
  loadPinyin(): Promise<CaptionPinyinModule>;
}

export interface CaptionLanguageImporters {
  openCC(attempt: number): Promise<CaptionOpenCCModule>;
  pinyin(attempt: number): Promise<CaptionPinyinModule>;
}

class RetryingModuleLoader<T> {
  private request: Promise<T> | null = null;
  private failedAttempts = 0;

  constructor(
    private readonly importer: (attempt: number) => Promise<T>,
  ) {}

  load(): Promise<T> {
    if (this.request) {
      return this.request;
    }
    const attempt = this.failedAttempts;
    const request = this.importer(attempt).catch((error: unknown) => {
      if (this.request === request) {
        this.request = null;
        this.failedAttempts = attempt + 1;
      }
      throw error;
    });
    this.request = request;
    return request;
  }
}

export function createCaptionLanguageRuntime(
  importers: Partial<CaptionLanguageImporters> = {},
): CaptionLanguageRuntime {
  const openCC = new RetryingModuleLoader(
    importers.openCC ?? importOpenCC,
  );
  const pinyin = new RetryingModuleLoader(
    importers.pinyin ?? importPinyin,
  );
  return {
    loadOpenCC: () => openCC.load(),
    loadPinyin: () => pinyin.load(),
  };
}

function importOpenCC(attempt: number): Promise<CaptionOpenCCModule> {
  if (attempt === 0) {
    return import("../language/opencc");
  }
  const specifier = import.meta.env.DEV
    ? `../language/opencc.ts?v=${LANGUAGE_ASSET_VERSION}&retry=${attempt}`
    : `./accessibility-tool-opencc.js?v=${LANGUAGE_ASSET_VERSION}&retry=${attempt}`;
  return import(/* @vite-ignore */ specifier) as Promise<CaptionOpenCCModule>;
}

function importPinyin(attempt: number): Promise<CaptionPinyinModule> {
  if (attempt === 0) {
    return import("../language/pinyin");
  }
  const specifier = import.meta.env.DEV
    ? `../language/pinyin.ts?v=${LANGUAGE_ASSET_VERSION}&retry=${attempt}`
    : `./accessibility-tool-pinyin.js?v=${LANGUAGE_ASSET_VERSION}&retry=${attempt}`;
  return import(/* @vite-ignore */ specifier) as Promise<CaptionPinyinModule>;
}

export const captionLanguageRuntime = createCaptionLanguageRuntime();
