import type { ColorScheme, FeatureId, RegionType } from "../types";

export const TOOL_NAMESPACE = "accessibility-tool";
export const TOOL_HOST_ATTRIBUTE = "data-a11y-tool-host";
export const STORAGE_VERSION = 1;
export const OPEN_STATE_STORAGE_VERSION = 1;

export const REGION_TYPES: readonly RegionType[] = [
  "viewport",
  "navigation",
  "interaction",
  "service",
  "list",
  "content",
];

export const REGION_TYPE_NUMBERS: Readonly<Record<RegionType, string>> = {
  viewport: "1",
  navigation: "2",
  interaction: "3",
  service: "4",
  list: "5",
  content: "6",
};

export const REGION_LABELS: Readonly<Record<RegionType, string>> = {
  viewport: "视窗区",
  navigation: "导航区",
  interaction: "交互区",
  service: "服务区",
  list: "列表区",
  content: "正文区",
};

export const REGION_ALIASES: Readonly<Record<string, RegionType>> = {
  "1": "viewport",
  viewport: "viewport",
  "2": "navigation",
  navigation: "navigation",
  "3": "interaction",
  interaction: "interaction",
  "4": "service",
  service: "service",
  "5": "list",
  list: "list",
  "6": "content",
  content: "content",
};

export const COLOR_SCHEMES: readonly ColorScheme[] = [
  "original",
  "white-black",
  "black-yellow",
  "yellow-black",
  "blue-white",
];

export const COLOR_SCHEME_LABELS: Readonly<Record<ColorScheme, string>> = {
  original: "原始配色",
  "white-black": "白底黑字",
  "black-yellow": "黑底黄字",
  "yellow-black": "黄底黑字",
  "blue-white": "蓝底白字",
};

export const MAIN_FEATURE_ORDER: readonly FeatureId[] = [
  "reading",
  "continuousReading",
  "speechRate",
  "voiceSelection",
  "colorScheme",
  "zoomIn",
  "zoomOut",
  "largeCursor",
  "crosshair",
  "fullscreen",
  "largeCaption",
  "pin",
  "reset",
  "help",
  "readScreen",
  "exit",
];
