import { describe, expect, it } from "vitest";
import {
  convertCaptionText,
  deriveCaptionPresentation,
} from "../../src/ui/large-caption";

describe("large-caption language presentation", () => {
  it("converts both directions with the standard simplified/traditional presets", () => {
    expect(convertCaptionText("汉语龙马", "traditional")).toBe("漢語龍馬");
    expect(convertCaptionText("漢語龍馬", "simplified")).toBe("汉语龙马");
  });

  it("keeps non-Chinese content and builds tone-marked pinyin DOM segments", () => {
    const presentation = deriveCaptionPresentation(
      "重庆 A11Y，2026。",
      "traditional",
      true,
    );

    expect(presentation.text).toBe("重慶 A11Y，2026。");
    expect(presentation.segments?.map(({ text }) => text).join("")).toBe(
      presentation.text,
    );
    expect(
      presentation.segments
        ?.filter(({ isChinese }) => isChinese)
        .map(({ pinyin }) => pinyin),
    ).toEqual(expect.arrayContaining(["chóng", "qìng"]));
    expect(
      presentation.segments
        ?.filter(({ isChinese }) => !isChinese)
        .map(({ text }) => text)
        .join(""),
    ).toContain("A11Y，2026。");
  });

  it("derives every visual mode from the same original snapshot", () => {
    const original = "后台发展";
    const traditional = deriveCaptionPresentation(
      original,
      "traditional",
      false,
    );
    const simplified = deriveCaptionPresentation(
      original,
      "simplified",
      false,
    );

    expect(traditional.text).toBe(convertCaptionText(original, "traditional"));
    expect(simplified.text).toBe(convertCaptionText(original, "simplified"));
    expect(original).toBe("后台发展");
  });
});
