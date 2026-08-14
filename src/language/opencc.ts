import { ConverterBuilder, type ConverterFunction } from "opencc-js/core";
import * as cn2t from "opencc-js/preset/cn2t";
import * as t2cn from "opencc-js/preset/t2cn";
import type { CaptionScript } from "../types";

let simplifiedConverter: ConverterFunction | null = null;
let traditionalConverter: ConverterFunction | null = null;

export function convertCaptionText(
  original: string,
  script: CaptionScript,
): string {
  if (!simplifiedConverter) {
    simplifiedConverter = ConverterBuilder(t2cn)({ from: "t", to: "cn" });
  }
  if (!traditionalConverter) {
    traditionalConverter = ConverterBuilder(cn2t)({ from: "cn", to: "t" });
  }
  return script === "traditional"
    ? traditionalConverter(original)
    : simplifiedConverter(original);
}
