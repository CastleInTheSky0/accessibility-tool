import { pinyin } from "pinyin-pro";

export interface CaptionPinyinAnnotation {
  readonly origin: string;
  readonly result: string;
  readonly isZh: boolean;
}

export function annotateCaptionPinyin(
  text: string,
): readonly CaptionPinyinAnnotation[] {
  return pinyin(text, {
    type: "all",
    toneType: "symbol",
    nonZh: "consecutive",
  }).map(({ origin, result, isZh }) => ({ origin, result, isZh }));
}
