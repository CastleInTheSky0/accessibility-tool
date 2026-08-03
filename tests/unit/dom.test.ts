import { describe, expect, it } from "vitest";
import {
  getAccessibleText,
  getElementLanguage,
  getFocusableElements,
  isTabbable,
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

    expect(getAccessibleText(get("target"))).toBe("按钮，工具名称");
    expect(getAccessibleText(get("by"))).toBe("按钮，关联标题");
    expect(getAccessibleText(get("field"))).toBe("文本：姓名 张三");
    expect(getAccessibleText(get("pressed"))).toBe("按钮，声音，已按下");
    expect(getAccessibleText(get("checked"))).toBe(
      "复选框，接收通知，已选中",
    );
    expect(getAccessibleText(get("image"))).toBe("图片，示例图片");
  });

  it("falls through empty names using the confirmed priority", () => {
    document.body.innerHTML = `
      <span id="label-source">关联名称</span>
      <button
        id="legacy"
        data-a11y-label=" "
        aria-readlabel="兼容名称"
        aria-label="ARIA 名称"
      >可见文字</button>
      <button
        id="aria"
        data-a11y-label=""
        aria-readlabel=" "
        aria-label="ARIA 名称"
        aria-labelledby="label-source"
      >可见文字</button>
      <button
        id="labelled"
        aria-labelledby="label-source"
        title="标题名称"
      >可见文字</button>
      <img id="title-image" title="标题描述" alt="替代描述">
      <img id="alt-image" title=" " alt="替代描述">
      <label for="fallback-field">姓名</label>
      <input id="fallback-field" value="张三">
      <p id="visible" title=" ">可见内容</p>
    `;

    expect(getAccessibleText(get("legacy"))).toBe("按钮，兼容名称");
    expect(getAccessibleText(get("aria"))).toBe("按钮，ARIA 名称");
    expect(getAccessibleText(get("labelled"))).toBe("按钮，关联名称");
    expect(getAccessibleText(get("title-image"))).toBe("图片，标题描述");
    expect(getAccessibleText(get("alt-image"))).toBe("图片，替代描述");
    expect(getAccessibleText(get("fallback-field"))).toBe(
      "文本：姓名 张三",
    );
    expect(getAccessibleText(get("visible"))).toBe("文本：可见内容");
  });

  it("formats native and equivalent ARIA semantics with existing states", () => {
    document.body.innerHTML = `
      <a id="new-window" href="/help" target="_blank">帮助</a>
      <div id="aria-new-window" role="link" target="_blank" aria-label="说明"></div>
      <map><area id="area-link" href="/map" target=" _BLANK " alt="地图入口"></map>
      <a id="link" href="#details">详情</a>
      <span id="aria-link" role="link">站内入口</span>
      <img id="native-image" alt="示意图">
      <div id="aria-image" role="img" aria-label="流程图"></div>
      <button id="button" aria-expanded="false">设置</button>
      <input id="submit-button" type="submit" value="提交表单">
      <input id="image-input" type="image" alt="图片提交">
      <div id="aria-button" role="button" aria-label="保存" aria-disabled="true"></div>
      <img id="image-button" role="button" alt="图片操作" aria-pressed="false">
      <label><input id="checkbox" type="checkbox" checked>接收通知</label>
      <div id="aria-checkbox" role="checkbox" aria-label="全选" aria-checked="mixed"></div>
      <label><input id="radio" type="radio">方案甲</label>
      <div id="aria-radio" role="radio" aria-label="方案乙" aria-checked="true"></div>
      <label for="select">城市</label>
      <select id="select"><option>北京</option><option selected>上海</option></select>
      <div id="combobox" role="combobox" aria-label="区域" aria-expanded="false"></div>
      <div id="listbox" role="listbox" aria-label="候选城市"></div>
      <div id="active-combobox" role="combobox" aria-activedescendant="active-option"></div>
      <div id="active-option" role="option">杭州</div>
      <div id="selected-listbox" role="listbox">
        <div role="option" aria-selected="false">成都</div>
        <div role="option" aria-selected="true">重庆</div>
      </div>
    `;

    expect(getAccessibleText(get("new-window"))).toBe(
      "打开新窗口链接，帮助",
    );
    expect(getAccessibleText(get("aria-new-window"))).toBe(
      "打开新窗口链接，说明",
    );
    expect(getAccessibleText(get("area-link"))).toBe(
      "打开新窗口链接，地图入口",
    );
    expect(getAccessibleText(get("link"))).toBe("链接，详情");
    expect(getAccessibleText(get("aria-link"))).toBe("链接，站内入口");
    expect(getAccessibleText(get("native-image"))).toBe("图片，示意图");
    expect(getAccessibleText(get("aria-image"))).toBe("图片，流程图");
    expect(getAccessibleText(get("button"))).toBe("按钮，设置，已收起");
    expect(getAccessibleText(get("submit-button"))).toBe("按钮，提交表单");
    expect(getAccessibleText(get("image-input"))).toBe("按钮，图片提交");
    expect(getAccessibleText(get("aria-button"))).toBe(
      "按钮，保存，不可用",
    );
    expect(getAccessibleText(get("image-button"))).toBe(
      "按钮，图片操作，未按下",
    );
    expect(getAccessibleText(get("checkbox"))).toBe(
      "复选框，接收通知，已选中",
    );
    expect(getAccessibleText(get("aria-checkbox"))).toBe(
      "复选框，全选，部分选中",
    );
    expect(getAccessibleText(get("radio"))).toBe(
      "单选框，方案甲，未选中",
    );
    expect(getAccessibleText(get("aria-radio"))).toBe(
      "单选框，方案乙，已选中",
    );
    expect(getAccessibleText(get("select"))).toBe("下拉框，城市 上海");
    expect(getAccessibleText(get("combobox"))).toBe(
      "下拉框，区域，已收起",
    );
    expect(getAccessibleText(get("listbox"))).toBe("下拉框，候选城市");
    expect(getAccessibleText(get("active-combobox"))).toBe("下拉框，杭州");
    expect(getAccessibleText(get("selected-listbox"))).toBe("下拉框，重庆");
  });

  it("uses the text prefix for every other readable element", () => {
    document.body.innerHTML = `
      <h2 id="heading">设置</h2>
      <p id="paragraph" aria-expanded="true">详细内容</p>
      <input id="text-input" value="关键词">
      <div id="switch" role="switch" aria-label="夜间模式" aria-checked="true"></div>
      <a id="not-current" href="#none" aria-current="false">非当前链接</a>
      <a id="current" href="#current" aria-current="page">当前链接</a>
      <a id="empty-link" href="#empty"></a>
      <button id="empty-button"></button>
      <p id="empty-text"></p>
    `;

    expect(getAccessibleText(get("heading"))).toBe("文本：设置");
    expect(getAccessibleText(get("paragraph"))).toBe(
      "文本：详细内容，已展开",
    );
    expect(getAccessibleText(get("text-input"))).toBe("文本：关键词");
    expect(getAccessibleText(get("switch"))).toBe(
      "文本：夜间模式，已选中",
    );
    expect(getAccessibleText(get("not-current"))).toBe("链接，非当前链接");
    expect(getAccessibleText(get("current"))).toBe(
      "链接，当前链接，当前项",
    );
    expect(getAccessibleText(get("empty-link"))).toBe("链接");
    expect(getAccessibleText(get("empty-button"))).toBe("按钮");
    expect(getAccessibleText(get("empty-text"))).toBe("");
  });

  it("does not let an unrelated text selection override name priority", () => {
    document.body.innerHTML = `
      <p id="selection-source">外部选中文本</p>
      <button id="named" aria-label="明确名称">可见名称</button>
      <p id="own-text">自身内容</p>
    `;
    const range = document.createRange();
    range.selectNodeContents(get("selection-source"));
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(getAccessibleText(get("named"))).toBe("按钮，明确名称");
    expect(getAccessibleText(get("own-text"))).toBe("文本：自身内容");
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
    expect(getAccessibleText(control as HTMLElement)).toBe("按钮，影子标题");
  });

  it("recognizes complete native Tab stops without including static content", () => {
    document.body.innerHTML = `
      <p id="paragraph">正文</p>
      <span id="span">补充文字</span>
      <img id="image" alt="示例图片">
      <a id="link" href="#target">链接</a>
      <button id="disabled-button" disabled>不可用</button>
      <input id="hidden-input" type="hidden">
      <details><summary id="summary">详情</summary><p>内容</p></details>
      <audio id="audio" controls style="display:block"></audio>
      <video id="video" controls></video>
      <div id="editable" contenteditable="true">可编辑</div>
      <div id="custom" tabindex="0">自定义焦点</div>
      <div id="negative" tabindex="-1">仅程序聚焦</div>
    `;

    expect(getFocusableElements(document).map((element) => element.id)).toEqual([
      "link",
      "summary",
      "audio",
      "video",
      "editable",
      "custom",
    ]);
    expect(isTabbable(get("paragraph"))).toBe(false);
    expect(isTabbable(get("negative"))).toBe(false);
  });
});

function get(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}
