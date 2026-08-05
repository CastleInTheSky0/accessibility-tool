export type RegionType =
  | "viewport"
  | "navigation"
  | "interaction"
  | "service"
  | "list"
  | "content";

export type ColorScheme =
  | "original"
  | "white-black"
  | "black-yellow"
  | "yellow-black"
  | "blue-white";

export type ToolbarLayoutMode = "push" | "overlay";
export type TabActivationMode = "automatic" | "manual";

export type FeatureId =
  | "reading"
  | "speechRate"
  | "colorScheme"
  | "zoomIn"
  | "zoomOut"
  | "largeCursor"
  | "crosshair"
  | "fullscreen"
  | "pin"
  | "reset"
  | "help"
  | "readScreen"
  | "exit";

export type ScanRoot = Document | ShadowRoot | HTMLElement;

export interface SpeechRequestOptions {
  lang: string;
  rate: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

export interface SpeechAdapter {
  speak(text: string, options: SpeechRequestOptions): void;
  cancel(): void;
  isSupported(): boolean;
}

export interface RegionSelectorConfig {
  viewport?: string | readonly string[];
  navigation?: string | readonly string[];
  interaction?: string | readonly string[];
  service?: string | readonly string[];
  list?: string | readonly string[];
  content?: string | readonly string[];
}

export interface RegionsConfig {
  autoDetect?: boolean;
  observe?: boolean;
  mutationDebounceMs?: number;
  selectors?: RegionSelectorConfig;
  ignoreSelectors?: readonly string[];
  additionalRoots?: readonly ScanRoot[];
}

export interface TabsConfig {
  enabled?: boolean;
  defaultActivation?: TabActivationMode;
  triggerEvents?: string | readonly string[];
  preventDefaultNavigation?: boolean;
  panelReadyTimeoutMs?: number;
  manageModalBackground?: boolean;
  dialogSelectors?: readonly string[];
  closeDialog?: (dialog: HTMLElement) => void | Promise<void>;
}

export interface SpeechConfig {
  adapter?: SpeechAdapter;
  hoverDelayMs?: number;
  defaultRate?: number;
  ignoreSelectors?: readonly string[];
}

export interface ZoomConfig {
  target?: string | HTMLElement | null;
  min?: number;
  max?: number;
  step?: number;
}

export interface ToolbarTheme {
  background?: string;
  foreground?: string;
  controlBackground?: string;
  controlForeground?: string;
  accent?: string;
  danger?: string;
  height?: string;
  controlRadius?: string;
  fontSize?: string;
  controlSize?: string;
  gap?: string;
}

export interface ToolbarConfig {
  layoutMode?: ToolbarLayoutMode;
  helpUrl?: string;
  styleUrl?: string;
  styleNonce?: string;
  pinHideDelayMs?: number;
  offsetSelectors?: readonly string[];
  theme?: ToolbarTheme;
}

export interface AccessibilityToolConfig {
  debug?: boolean;
  strict?: boolean;
  locale?: string;
  storageKey?: string;
  persistOpenState?: boolean;
  features?: Partial<Record<FeatureId, boolean>>;
  toolbar?: ToolbarConfig;
  speech?: SpeechConfig;
  zoom?: ZoomConfig;
  regions?: RegionsConfig;
  tabs?: TabsConfig;
  colorExclusions?: readonly string[];
}

export interface AccessibilityToolOpenOptions {
  trigger?: HTMLElement;
  config?: AccessibilityToolConfig;
}

export interface AccessibilityToolState {
  isOpen: boolean;
  isPinned: boolean;
  isCollapsed: boolean;
  isReadScreen: boolean;
  readingEnabled: boolean;
  speechRate: number;
  colorScheme: ColorScheme;
  zoom: number;
  largeCursor: boolean;
  crosshair: boolean;
  isFullscreen: boolean;
}

export interface RegionChangeEvent {
  type: RegionType;
  index: number;
  count: number;
  element: HTMLElement;
  label: string;
}

export interface AccessibilityToolEventMap {
  open: Readonly<AccessibilityToolState>;
  close: Readonly<AccessibilityToolState>;
  statechange: Readonly<AccessibilityToolState>;
  regionchange: RegionChangeEvent;
  speechstart: { textLength: number };
  speechend: undefined;
  error: { error: unknown; message: string };
}

export interface AccessibilityToolApi {
  configure(config: AccessibilityToolConfig): AccessibilityToolApi;
  open(options?: AccessibilityToolOpenOptions): Promise<AccessibilityToolApi>;
  close(): Promise<AccessibilityToolApi>;
  toggle(options?: AccessibilityToolOpenOptions): Promise<AccessibilityToolApi>;
  reset(): Promise<AccessibilityToolApi>;
  refresh(): AccessibilityToolApi;
  destroy(): Promise<void>;
  getState(): Readonly<AccessibilityToolState>;
  on<K extends keyof AccessibilityToolEventMap>(
    eventName: K,
    listener: (payload: AccessibilityToolEventMap[K]) => void,
  ): AccessibilityToolApi;
  off<K extends keyof AccessibilityToolEventMap>(
    eventName: K,
    listener: (payload: AccessibilityToolEventMap[K]) => void,
  ): AccessibilityToolApi;
}

export interface PersistedPreferences {
  readingEnabled: boolean;
  speechRate: number;
  colorScheme: ColorScheme;
  zoom: number;
  largeCursor: boolean;
  crosshair: boolean;
  isPinned: boolean;
  isReadScreen: boolean;
}

declare global {
  interface Window {
    AccessibilityTool: AccessibilityToolApi;
  }
}
