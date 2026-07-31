import { describe, expect, it } from "vitest";
import {
  getAccessibleText,
  getElementLanguage,
  isVisible,
} from "../../src/core/dom";

describe("DOM accessibility helpers", () => {
  it("uses the documented accessible text priority", () => {
    document.body.innerHTML = `
      <span id="labelled">关联标题</span>
      <button id="target" data-a11y-label="工具名称" aria-label="ARIA 名称">可见文字</button>
      <button id="by" aria-labelledby="labelled">忽略文字</button>
      <label for="field">姓名</label><input id="field" value="张三">
      <button id="pressed" aria-label="声音" aria-pressed="true">声音</button>
      <label><input id="checked" type="checkbox" checked>接收通知</label>
      <img id="image" alt="示例图片">
    `;

    expect(getAccessibleText(get("target"))).toBe("工具名称");
    expect(getAccessibleText(get("by"))).toBe("关联标题");
    expect(getAccessibleText(get("field"))).toBe("姓名 张三");
    expect(getAccessibleText(get("pressed"))).toBe("声音，已按下");
    expect(getAccessibleText(get("checked"))).toBe("接收通知，已选中");
    expect(getAccessibleText(get("image"))).toBe("示例图片");
  });

  it("filters hidden ancestors and resolves language fallback", () => {
    document.body.innerHTML = `
      <section hidden><p id="hidden">隐藏</p></section>
      <section lang="en"><p id="english">Hello</p></section>
    `;

    expect(isVisible(get("hidden"))).toBe(false);
    expect(isVisible(get("english"))).toBe(true);
    expect(getElementLanguage(get("english"))).toBe("en");
  });

  it("resolves aria-labelledby inside an open Shadow Root", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <span id="shadow-label">影子标题</span>
      <button id="shadow-control" aria-labelledby="shadow-label">忽略文字</button>
    `;
    const control = shadow.getElementById("shadow-control");
    expect(control).toBeInstanceOf(HTMLElement);
    expect(getAccessibleText(control as HTMLElement)).toBe("影子标题");
  });
});

function get(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}
