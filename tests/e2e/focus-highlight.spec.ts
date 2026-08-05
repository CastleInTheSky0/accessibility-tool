import { expect, test, type Locator } from "@playwright/test";

const FOCUS_COLOR = "rgb(255, 184, 0)";
const REGION_COLOR = "rgb(255, 108, 0)";

test.beforeEach(async ({ page }) => {
  await page.goto("/?debug=1");
  await page.evaluate(() => {
    const fixture = document.createElement("div");
    fixture.id = "focus-highlight-fixture";
    fixture.style.cssText =
      "position:fixed;left:160px;top:220px;z-index:1;display:flex;gap:12px";
    fixture.innerHTML = `
      <button id="focus-first" type="button" style="outline-color:rgb(0 85 204)!important;outline-style:solid!important;outline-width:3px!important;outline-offset:2px!important;box-shadow:0 0 0 4px rgb(0 85 204)!important">焦点目标一</button>
      <button id="focus-second" type="button">焦点目标二</button>
      <p id="static-paragraph">普通正文</p>
      <span id="custom-aria-button" role="button">自定义按钮</span>
      <img id="static-image" alt="普通图片">
      <a id="custom-aria-link" role="link">自定义链接</a>
      <span id="explicit-negative-control" role="button" tabindex="-1">显式跳过</span>
      <input id="focus-pointer" aria-label="鼠标焦点目标">
    `;
    document.body.append(fixture);
    const regionWithHostShadow = document.querySelector("header nav");
    if (regionWithHostShadow instanceof HTMLElement) {
      regionWithHostShadow.style.setProperty(
        "box-shadow",
        "0 0 0 4px rgb(0 85 204)",
        "important",
      );
    }
  });
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
});

test("follows native page focus from keyboard, script and mouse", async ({
  page,
}) => {
  const host = page.locator("[data-a11y-tool-host]");
  const first = page.locator("#focus-first");
  const second = page.locator("#focus-second");
  const pointerTarget = page.getByRole("textbox", { name: "鼠标焦点目标" });
  const originalFirstOutline = await snapshotInlineOutline(first);

  await first.focus();
  await expect(first).toBeFocused();
  await expectOwnedOutline(first, FOCUS_COLOR);
  await expect(first).toHaveAttribute("data-a11y-page-focus-owned", "");

  await page.keyboard.press("Tab");
  await expect(second).toBeFocused();
  await expectOwnedOutline(second, FOCUS_COLOR);
  expect(await snapshotInlineOutline(first)).toEqual(originalFirstOutline);

  await page.keyboard.press("Shift+Tab");
  await expect(first).toBeFocused();
  await expectOwnedOutline(first, FOCUS_COLOR);

  await pointerTarget.click();
  await expect(pointerTarget).toBeFocused();
  await expectOwnedOutline(pointerTarget, FOCUS_COLOR);
  await expect(first).not.toHaveAttribute("tabindex", /.+/);
  await expect(second).not.toHaveAttribute("tabindex", /.+/);
  await expect(host.locator(".a11y-focus-highlight")).toHaveCount(0);
  await expect(host.locator(".a11y-region-highlight")).toHaveCount(0);
});

test("excludes toolbar controls and restores focus styles on close and destroy", async ({
  page,
}) => {
  const host = page.locator("[data-a11y-tool-host]");
  const pageTarget = page.locator("#focus-first");
  const originalOutline = await snapshotInlineOutline(pageTarget);

  await pageTarget.focus();
  await expectOwnedOutline(pageTarget, FOCUS_COLOR);

  const toolbarControl = host.locator('[data-action="reading"]');
  await toolbarControl.focus();
  await expect(toolbarControl).toBeFocused();
  expect(await snapshotInlineOutline(pageTarget)).toEqual(originalOutline);
  await expect(toolbarControl).not.toHaveAttribute(
    "data-a11y-page-focus-owned",
    "",
  );

  await page.evaluate(() => window.AccessibilityTool.refresh());
  expect(await snapshotInlineOutline(pageTarget)).toEqual(originalOutline);

  await host.locator('[data-mode="main"] [data-action="exit"]').click();
  await pageTarget.focus();
  expect(await snapshotInlineOutline(pageTarget)).toEqual(originalOutline);

  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  await expect(host).toHaveCount(1);
  await pageTarget.focus();
  await expectOwnedOutline(pageTarget, FOCUS_COLOR);

  await page.evaluate(() => window.AccessibilityTool.destroy());
  await expect(host).toHaveCount(0);
  expect(await snapshotInlineOutline(pageTarget)).toEqual(originalOutline);
});

test("auto-tabs explicit ARIA controls while skipping static content", async ({
  page,
}) => {
  const host = page.locator("[data-a11y-tool-host]");
  const second = page.locator("#focus-second");
  const paragraph = page.locator("#static-paragraph");
  const image = page.locator("#static-image");
  const customButton = page.getByRole("button", { name: "自定义按钮" });
  const customLink = page.getByRole("link", { name: "自定义链接" });
  const explicitNegative = page.getByRole("button", { name: "显式跳过" });

  await expect(paragraph).not.toHaveAttribute("tabindex", /.+/);
  await expect(image).not.toHaveAttribute("tabindex", /.+/);
  await expect(customButton).toHaveAttribute("tabindex", "0");
  await expect(customLink).toHaveAttribute("tabindex", "0");
  await expect(explicitNegative).toHaveAttribute("tabindex", "-1");

  await second.focus();
  await page.keyboard.press("Tab");
  await expect(customButton).toBeFocused();
  await expectOwnedOutline(customButton, FOCUS_COLOR);

  await page.keyboard.press("Tab");
  await expect(customLink).toBeFocused();
  await expectOwnedOutline(customLink, FOCUS_COLOR);

  await page.evaluate(() => {
    const dynamic = document.createElement("span");
    dynamic.id = "dynamic-aria-control";
    dynamic.setAttribute("role", "button");
    dynamic.textContent = "动态自定义按钮";
    document.body.append(dynamic);
  });
  const dynamicControl = page.locator("#dynamic-aria-control");
  await expect(dynamicControl).toHaveAttribute("tabindex", "0");
  await dynamicControl.evaluate((element) =>
    element.setAttribute("aria-disabled", "true"),
  );
  await expect(dynamicControl).not.toHaveAttribute("tabindex", /.+/);
  await dynamicControl.evaluate((element) =>
    element.setAttribute("aria-disabled", "false"),
  );
  await expect(dynamicControl).toHaveAttribute("tabindex", "0");
  await dynamicControl.evaluate((element) => element.removeAttribute("role"));
  await expect(dynamicControl).not.toHaveAttribute("tabindex", /.+/);

  await host.locator('[data-mode="main"] [data-action="exit"]').click();
  await expect(customButton).not.toHaveAttribute("tabindex", /.+/);
  await expect(customLink).not.toHaveAttribute("tabindex", /.+/);
  await expect(explicitNegative).toHaveAttribute("tabindex", "-1");
});

test("adds region anchors to ordinary Tab order and preserves native descendants", async ({
  page,
}) => {
  const host = page.locator("[data-a11y-tool-host]");

  const region = page.locator("header nav");
  await region.evaluate((element) => {
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "区域前操作";
    element.before(previous);
    const first = document.createElement("button");
    first.type = "button";
    first.textContent = "区域内操作一";
    const second = document.createElement("button");
    second.type = "button";
    second.textContent = "区域内操作二";
    element.prepend(first, second);
  });
  const firstControl = region.getByRole("button", { name: "区域内操作一" });
  const secondControl = region.getByRole("button", { name: "区域内操作二" });
  const previousControl = page.getByRole("button", { name: "区域前操作" });
  const originalRegionOutline = await snapshotInlineOutline(region);

  await previousControl.focus();
  await expect(previousControl).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(region).toBeFocused();
  await expect(region).toHaveAttribute("tabindex", "0");
  await expect(region).toHaveAttribute("aria-regionactive", "true");
  await expectOwnedOutline(region, FOCUS_COLOR);

  await page.keyboard.press("Tab");
  await expect(firstControl).toBeFocused();
  await expectOwnedOutline(region, REGION_COLOR);
  await expectOwnedOutline(firstControl, FOCUS_COLOR);

  await page.keyboard.press("Tab");
  await expect(secondControl).toBeFocused();
  await expectOwnedOutline(region, REGION_COLOR);
  await expectOwnedOutline(secondControl, FOCUS_COLOR);

  await page.keyboard.press("Shift+Tab");
  await expect(firstControl).toBeFocused();
  await expectOwnedOutline(region, REGION_COLOR);
  await expectOwnedOutline(firstControl, FOCUS_COLOR);
  await expect(firstControl).not.toHaveAttribute("tabindex", /.+/);
  await expect(secondControl).not.toHaveAttribute("tabindex", /.+/);

  await page.keyboard.press("Shift+Tab");
  await expect(region).toBeFocused();
  await expectOwnedOutline(region, FOCUS_COLOR);

  await page.keyboard.press("Shift+Tab");
  await expect(previousControl).toBeFocused();
  await expectOwnedOutline(previousControl, FOCUS_COLOR);
  await expect(region).toHaveAttribute("tabindex", "0");
  await expect(region).not.toHaveAttribute("aria-regionactive", /.+/);
  expect(await snapshotInlineOutline(region)).toEqual(originalRegionOutline);

  await host.locator('[data-mode="main"] [data-action="exit"]').click();
  await expect(region).not.toHaveAttribute("tabindex", /.+/);
  expect(await snapshotInlineOutline(region)).toEqual(originalRegionOutline);
});

test("tracks open Shadow DOM and same-origin iframe focus without geometry overlays", async ({
  page,
}) => {
  const shadowLink = page.locator("#shadow-demo").getByRole("link", {
    name: "返回区域协议",
  });

  await shadowLink.focus();
  await expectOwnedOutline(shadowLink, FOCUS_COLOR);

  const frameLink = page
    .frameLocator('iframe[title="同源区域演示"]')
    .getByRole("link", { name: "iframe 内链接" });
  await page.locator('iframe[title="同源区域演示"]').evaluate((frame) => {
    frame.style.transform = "scale(0.8)";
    frame.style.transformOrigin = "top left";
  });
  await frameLink.focus();
  await expectOwnedOutline(frameLink, FOCUS_COLOR);
  await expect(shadowLink).not.toHaveAttribute("data-a11y-page-focus-owned", "");

  await page.evaluate(() => window.scrollBy(0, 40));
  await expectOwnedOutline(frameLink, FOCUS_COLOR);
  await page.setViewportSize({ width: 1180, height: 760 });
  await expectOwnedOutline(frameLink, FOCUS_COLOR);
});

test("keeps an outer region active while focus enters a same-origin iframe", async ({
  page,
}) => {
  const host = page.locator("[data-a11y-tool-host]");
  await host.locator('[data-mode="main"] [data-action="readScreen"]').click();
  await host.getByRole("button", { name: "导航区，共 4 个" }).click();

  const region = page.locator("header nav");
  await expectOwnedOutline(region, FOCUS_COLOR);
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.id = "region-child-frame";
    frame.title = "区域内同源页面";
    frame.srcdoc =
      "<!doctype html><html><body><button id='inside-frame'>区域内按钮</button></body></html>";
    document.querySelector("header nav")?.append(frame);
  });

  const frameButton = page
    .frameLocator("#region-child-frame")
    .getByRole("button", { name: "区域内按钮" });
  await expect(frameButton).toBeVisible();
  await frameButton.focus();
  await expectOwnedOutline(region, REGION_COLOR);
  await expectOwnedOutline(frameButton, FOCUS_COLOR);

  const outside = page.locator("#focus-first");
  await outside.focus();
  await expectOwnedOutline(outside, FOCUS_COLOR);
  await expect(region).not.toHaveAttribute("aria-regionactive", /.+/);
  await expect(region).toHaveAttribute("tabindex", "0");
});

test("retains distinct inline outline ownership in forced colors", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "Playwright WebKit does not expose forced-colors emulation.",
  );
  await page.emulateMedia({ forcedColors: "active" });
  const host = page.locator("[data-a11y-tool-host]");
  await host.locator('[data-mode="main"] [data-action="readScreen"]').click();
  await host.getByRole("button", { name: "导航区，共 4 个" }).click();
  await page.keyboard.press("Tab");

  const region = page.locator("header nav");
  const focused = region.getByRole("link", { name: "盲道区域" });
  expect(await snapshotOwnedInlineOutline(region)).toEqual({
    color: REGION_COLOR,
    colorPriority: "important",
    shadow: "none",
    shadowPriority: "important",
    style: "solid",
    stylePriority: "important",
    width: "2px",
    widthPriority: "important",
  });
  expect(await snapshotOwnedInlineOutline(focused)).toEqual({
    color: FOCUS_COLOR,
    colorPriority: "important",
    shadow: "none",
    shadowPriority: "important",
    style: "solid",
    stylePriority: "important",
    width: "2px",
    widthPriority: "important",
  });
  await expect(region).toHaveCSS("outline-width", "2px");
  await expect(focused).toHaveCSS("outline-width", "2px");
});

async function expectOwnedOutline(
  target: Locator,
  color: string,
): Promise<void> {
  await expect(target).toHaveCSS("outline-color", color);
  await expect(target).toHaveCSS("outline-style", "solid");
  await expect(target).toHaveCSS("outline-width", "2px");
  await expect(target).toHaveCSS("box-shadow", "none");
  await expect
    .poll(() => snapshotOwnedInlineOutline(target))
    .toMatchObject({
      colorPriority: "important",
      shadow: "none",
      shadowPriority: "important",
      stylePriority: "important",
      widthPriority: "important",
    });
}

async function snapshotOwnedInlineOutline(target: Locator): Promise<{
  color: string;
  colorPriority: string;
  shadow: string;
  shadowPriority: string;
  style: string;
  stylePriority: string;
  width: string;
  widthPriority: string;
}> {
  return target.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    return {
      color: htmlElement.style.getPropertyValue("outline-color"),
      colorPriority: htmlElement.style.getPropertyPriority("outline-color"),
      shadow: htmlElement.style.getPropertyValue("box-shadow"),
      shadowPriority: htmlElement.style.getPropertyPriority("box-shadow"),
      style: htmlElement.style.getPropertyValue("outline-style"),
      stylePriority: htmlElement.style.getPropertyPriority("outline-style"),
      width: htmlElement.style.getPropertyValue("outline-width"),
      widthPriority: htmlElement.style.getPropertyPriority("outline-width"),
    };
  });
}

async function snapshotInlineOutline(target: Locator): Promise<{
  color: string;
  colorPriority: string;
  offset: string;
  offsetPriority: string;
  shadow: string;
  shadowPriority: string;
  style: string;
  stylePriority: string;
  width: string;
  widthPriority: string;
}> {
  return target.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    return {
      color: htmlElement.style.getPropertyValue("outline-color"),
      colorPriority: htmlElement.style.getPropertyPriority("outline-color"),
      offset: htmlElement.style.getPropertyValue("outline-offset"),
      offsetPriority: htmlElement.style.getPropertyPriority("outline-offset"),
      shadow: htmlElement.style.getPropertyValue("box-shadow"),
      shadowPriority: htmlElement.style.getPropertyPriority("box-shadow"),
      style: htmlElement.style.getPropertyValue("outline-style"),
      stylePriority: htmlElement.style.getPropertyPriority("outline-style"),
      width: htmlElement.style.getPropertyValue("outline-width"),
      widthPriority: htmlElement.style.getPropertyPriority("outline-width"),
    };
  });
}
