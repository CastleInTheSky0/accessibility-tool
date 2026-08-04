import type {
  AccessibilityToolConfig,
  FeatureId,
  RegionSelectorConfig,
  SpeechAdapter,
} from "../types";
import { MAIN_FEATURE_ORDER } from "./constants";

export interface ResolvedAccessibilityToolConfig {
  debug: boolean;
  strict: boolean;
  locale: string;
  storageKey: string;
  persistOpenState: boolean;
  features: Record<FeatureId, boolean>;
  toolbar: {
    layoutMode: "push" | "overlay";
    helpUrl: string;
    styleUrl: string;
    styleNonce: string;
    pinHideDelayMs: number;
    offsetSelectors: readonly string[];
    theme: {
      background: string;
      foreground: string;
      controlBackground: string;
      controlForeground: string;
      accent: string;
      danger: string;
      height: string;
      controlRadius: string;
      fontSize: string;
      controlSize: string;
      gap: string;
    };
  };
  speech: {
    adapter: SpeechAdapter | undefined;
    hoverDelayMs: number;
    defaultRate: number;
    ignoreSelectors: readonly string[];
  };
  zoom: {
    target: string | HTMLElement | null;
    min: number;
    max: number;
    step: number;
  };
  regions: {
    autoDetect: boolean;
    observe: boolean;
    mutationDebounceMs: number;
    selectors: RegionSelectorConfig;
    ignoreSelectors: readonly string[];
    additionalRoots: readonly (Document | ShadowRoot | HTMLElement)[];
  };
  tabs: {
    enabled: boolean;
    defaultActivation: "automatic" | "manual";
    triggerEvents: string | readonly string[];
    preventDefaultNavigation: boolean;
    panelReadyTimeoutMs: number;
    manageModalBackground: boolean;
    dialogSelectors: readonly string[];
    closeDialog: ((dialog: HTMLElement) => void | Promise<void>) | undefined;
  };
  colorExclusions: readonly string[];
}

const defaultFeatures = Object.fromEntries(
  MAIN_FEATURE_ORDER.map((feature) => [feature, true]),
) as Record<FeatureId, boolean>;

export const DEFAULT_CONFIG: ResolvedAccessibilityToolConfig = {
  debug: false,
  strict: false,
  locale: "zh-CN",
  storageKey: "accessibility-tool:preferences",
  persistOpenState: true,
  features: defaultFeatures,
  toolbar: {
    layoutMode: "push",
    helpUrl: "./help.html",
    styleUrl: "",
    styleNonce: "",
    pinHideDelayMs: 1500,
    offsetSelectors: [],
    theme: {
      background: "#181b1e",
      foreground: "#f5f5f2",
      controlBackground: "#292e32",
      controlForeground: "#f5f5f2",
      accent: "#f47a00",
      danger: "#dc3a32",
      height: "146px",
      controlRadius: "13px",
      fontSize: "14px",
      controlSize: "84px",
      gap: "0px",
    },
  },
  speech: {
    adapter: undefined,
    hoverDelayMs: 500,
    defaultRate: 1,
    ignoreSelectors: [],
  },
  zoom: {
    target: null,
    min: 0.75,
    max: 2,
    step: 0.25,
  },
  regions: {
    autoDetect: true,
    observe: true,
    mutationDebounceMs: 120,
    selectors: {},
    ignoreSelectors: [],
    additionalRoots: [],
  },
  tabs: {
    enabled: true,
    defaultActivation: "automatic",
    triggerEvents: "click",
    preventDefaultNavigation: true,
    panelReadyTimeoutMs: 2000,
    manageModalBackground: false,
    dialogSelectors: [],
    closeDialog: undefined,
  },
  colorExclusions: [],
};

export function mergeConfig(
  base: ResolvedAccessibilityToolConfig,
  next: AccessibilityToolConfig = {},
): ResolvedAccessibilityToolConfig {
  return {
    ...base,
    ...next,
    features: { ...base.features, ...next.features },
    toolbar: {
      ...base.toolbar,
      ...next.toolbar,
      offsetSelectors:
        next.toolbar?.offsetSelectors ?? base.toolbar.offsetSelectors,
      theme: { ...base.toolbar.theme, ...next.toolbar?.theme },
    },
    speech: {
      ...base.speech,
      ...next.speech,
      ignoreSelectors:
        next.speech?.ignoreSelectors ?? base.speech.ignoreSelectors,
    },
    zoom: { ...base.zoom, ...next.zoom },
    regions: {
      ...base.regions,
      ...next.regions,
      selectors: { ...base.regions.selectors, ...next.regions?.selectors },
      ignoreSelectors:
        next.regions?.ignoreSelectors ?? base.regions.ignoreSelectors,
      additionalRoots:
        next.regions?.additionalRoots ?? base.regions.additionalRoots,
    },
    tabs: {
      ...base.tabs,
      ...next.tabs,
      dialogSelectors:
        next.tabs?.dialogSelectors ?? base.tabs.dialogSelectors,
    },
    colorExclusions: next.colorExclusions ?? base.colorExclusions,
  };
}
