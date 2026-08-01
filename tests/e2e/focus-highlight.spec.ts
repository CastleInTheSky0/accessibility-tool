import { expect, test, type Locator } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?debug=1");
  await page.evaluate(() => {
    const fixture = document.createElement("div");
    fixture.id = "focus-highlight-fixture";
    fixture.style.cssText =
      "position:fixed;left:160px;top:220px;z-index:1;display:flex;gap:12px";
    fixture.innerHTML = `
      <button id="focus-first" type="button" style="outline-color:rgb(0 85 204)!important;outline-style:solid!important;outline-width:3px!important;outline-offset:2px!important">焦点目标一</button>
      <button id="focus-second" type="button">焦点目标二</button>
    `;
    document.body.append(fixture);
  });
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
});

test("follows native page focus from keyboard, script and mouse", async ({
  page,
}) => {
  const host = page.locator("[data-a11y-tool-host]");
  const overlay = host.locator(".a11y-focus-highlight");
  const first = page.locator("#focus-first");
  const second = page.locator("#focus-second");

  await first.focus();
  await expect(first).toBeFocused();
  await expectOverlayToMatch(overlay, first);
  await expect(first).toHaveAttribute("data-a11y-page-focus-owned", "");
  await expect(first).toHaveCSS("outline-style", "none");

  await page.keyboard.press("Tab");
  await expect(second).toBeFocused();
  await expectOverlayToMatch(overlay, second);

  await page.keyboard.press("Shift+Tab");
  await expect(first).toBeFocused();
  await expectOverlayToMatch(overlay, first);

  await second.click();
  await expect(second).toBeFocused();
  await expectOverlayToMatch(overlay, second);
  await expect(first).not.toHaveAttribute("tabindex", /.+/);
  await expect(second).not.toHaveAttribute("tabindex", /.+/);
});

test("excludes toolbar controls and removes focus tracking on close and destroy", async ({
  page,
}) => {
  const host = page.locator("[data-a11y-tool-host]");
  const overlay = host.locator(".a11y-focus-highlight");
  const pageTarget = page.locator("#focus-first");

  await pageTarget.focus();
  await expect(overlay).not.toHaveAttribute("hidden", "");
  await expect(pageTarget).toHaveCSS("outline-style", "none");

  await host.locator('[data-action="reading"]').focus();
  await expect(overlay).toHaveAttribute("hidden", "");
  await page.evaluate(() => window.AccessibilityTool.refresh());
  await expect(overlay).toHaveAttribute("hidden", "");

  await host.locator('[data-mode="main"] [data-action="exit"]').click();
  await pageTarget.focus();
  await expect(overlay).toHaveAttribute("hidden", "");
  await expect(pageTarget).not.toHaveAttribute(
    "data-a11y-page-focus-owned",
    "",
  );
  await expect(pageTarget).toHaveCSS("outline-style", "solid");
  await expect
    .poll(() =>
      pageTarget.evaluate((element) => ({
        color: element.style.getPropertyValue("outline-color"),
        offset: element.style.getPropertyValue("outline-offset"),
        style: element.style.getPropertyValue("outline-style"),
        stylePriority: element.style.getPropertyPriority("outline-style"),
        width: element.style.getPropertyValue("outline-width"),
      })),
    )
    .toEqual({
      color: "rgb(0, 85, 204)",
      offset: "2px",
      style: "solid",
      stylePriority: "important",
      width: "3px",
    });

  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  await expect(host).toHaveCount(1);
  await pageTarget.focus();
  await expectOverlayToMatch(overlay, pageTarget);

  await page.evaluate(() => window.AccessibilityTool.destroy());
  await expect(host).toHaveCount(0);
});

test("keeps a distinct region frame while native Tab traverses descendants", async ({
  page,
}) => {
  const host = page.locator("[data-a11y-tool-host]");
  const focusOverlay = host.locator(".a11y-focus-highlight");
  const regionOverlay = host.locator(".a11y-region-highlight");
  await host.locator('[data-mode="main"] [data-action="readScreen"]').click();
  await host.getByRole("button", { name: "导航区，共 4 个" }).click();

  const region = page.locator("header nav");
  const firstLink = region.getByRole("link", { name: "盲道区域" });
  const secondLink = region.getByRole("link", { name: "选项卡" });
  const previousLink = page.getByRole("link", { name: "A11Y / TOOL" });
  await expect(region).toBeFocused();
  await expectOverlayToMatch(regionOverlay, region);
  await expect(regionOverlay).toHaveCSS("border-color", "rgb(0, 229, 255)");
  await expect(focusOverlay).toHaveAttribute("hidden", "");
  await expect(region).toHaveCSS("outline-style", "none");

  await page.keyboard.press("Tab");
  await expect(firstLink).toBeFocused();
  await expectOverlayToMatch(regionOverlay, region);
  await expectOverlayToMatch(focusOverlay, firstLink);

  await page.keyboard.press("Tab");
  await expect(secondLink).toBeFocused();
  await expectOverlayToMatch(regionOverlay, region);
  await expectOverlayToMatch(focusOverlay, secondLink);

  await page.keyboard.press("Shift+Tab");
  await expect(firstLink).toBeFocused();
  await expectOverlayToMatch(regionOverlay, region);
  await expectOverlayToMatch(focusOverlay, firstLink);
  await expect(firstLink).not.toHaveAttribute("tabindex", /.+/);
  await expect(secondLink).not.toHaveAttribute("tabindex", /.+/);

  await page.keyboard.press("Shift+Tab");
  await expect(previousLink).toBeFocused();
  await expect(regionOverlay).toHaveAttribute("hidden", "");
  await expectOverlayToMatch(focusOverlay, previousLink);
});

test("tracks open Shadow DOM and same-origin iframe focus while scrolling", async ({
  page,
}) => {
  const overlay = page
    .locator("[data-a11y-tool-host]")
    .locator(".a11y-focus-highlight");
  const shadowLink = page.locator("#shadow-demo").getByRole("link", {
    name: "返回区域协议",
  });

  await shadowLink.focus();
  await expectOverlayToMatch(overlay, shadowLink);

  const frameLink = page
    .frameLocator('iframe[title="同源区域演示"]')
    .getByRole("link", { name: "iframe 内链接" });
  await page.locator('iframe[title="同源区域演示"]').evaluate((frame) => {
    frame.style.transform = "scale(0.8)";
    frame.style.transformOrigin = "top left";
  });
  await frameLink.focus();
  await expectOverlayToMatch(overlay, frameLink);

  await page.evaluate(() => window.scrollBy(0, 40));
  await expectOverlayToMatch(overlay, frameLink);
  await page.setViewportSize({ width: 1180, height: 760 });
  await expectOverlayToMatch(overlay, frameLink);
});

test("keeps an outer region active while focus enters a same-origin iframe", async ({
  page,
}) => {
  const host = page.locator("[data-a11y-tool-host]");
  const focusOverlay = host.locator(".a11y-focus-highlight");
  const regionOverlay = host.locator(".a11y-region-highlight");
  await host.locator('[data-mode="main"] [data-action="readScreen"]').click();
  await host.getByRole("button", { name: "导航区，共 4 个" }).click();

  const region = page.locator("header nav");
  await expectOverlayToMatch(regionOverlay, region);
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.id = "region-child-frame";
    frame.title = "区域内同源页面";
    frame.srcdoc =
      "<!doctype html><html><body><nav data-a11y-region='navigation' data-a11y-label='区域内导航'><button id='inside-frame'>区域内按钮</button></nav></body></html>";
    document.querySelector("header nav")?.append(frame);
  });
  await expect(
    host.getByRole("button", { name: "导航区，共 5 个" }),
  ).toBeVisible();

  const frameButton = page
    .frameLocator("#region-child-frame")
    .getByRole("button", { name: "区域内按钮" });
  await frameButton.focus();
  await expectOverlayToMatch(regionOverlay, region);
  await expectOverlayToMatch(focusOverlay, frameButton);

  const outside = page.locator("#focus-first");
  await outside.focus();
  await expect(regionOverlay).toHaveAttribute("hidden", "");
  await expectOverlayToMatch(focusOverlay, outside);
});

test("keeps focus and region frames distinct in forced colors", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active" });
  const host = page.locator("[data-a11y-tool-host]");
  const focusOverlay = host.locator(".a11y-focus-highlight");
  const regionOverlay = host.locator(".a11y-region-highlight");
  await host.locator('[data-mode="main"] [data-action="readScreen"]').click();
  await host.getByRole("button", { name: "导航区，共 4 个" }).click();
  await page.keyboard.press("Tab");
  await expect(focusOverlay).toBeVisible();
  await expect(regionOverlay).toBeVisible();

  const presentation = await host.evaluate((element) => {
    const root = element.shadowRoot;
    const focus = root?.querySelector<HTMLElement>(".a11y-focus-highlight");
    const region = root?.querySelector<HTMLElement>(".a11y-region-highlight");
    if (!focus || !region) {
      return null;
    }
    const focusStyle = getComputedStyle(focus);
    const regionStyle = getComputedStyle(region);
    return {
      focusBackground: focusStyle.backgroundColor,
      focusBorderStyle: focusStyle.borderStyle,
      regionBackground: regionStyle.backgroundColor,
      regionBorderStyle: regionStyle.borderStyle,
    };
  });
  expect(presentation).toEqual({
    focusBackground: "rgba(0, 0, 0, 0)",
    focusBorderStyle: "solid",
    regionBackground: "rgba(0, 0, 0, 0)",
    regionBorderStyle: "double",
  });
});

async function expectOverlayToMatch(
  overlay: Locator,
  target: Locator,
): Promise<void> {
  await expect(overlay).toBeVisible();
  await expect
    .poll(async () => {
      const [overlayBox, targetBox] = await Promise.all([
        overlay.boundingBox(),
        target.boundingBox(),
      ]);
      if (!overlayBox || !targetBox) {
        return null;
      }
      return {
        x: normalizeRounded(overlayBox.x - targetBox.x),
        y: normalizeRounded(overlayBox.y - targetBox.y),
        width: normalizeRounded(overlayBox.width - targetBox.width),
        height: normalizeRounded(overlayBox.height - targetBox.height),
      };
    })
    .toEqual({ x: 0, y: 0, width: 0, height: 0 });
}

function normalizeRounded(value: number): number {
  return Math.round(value) || 0;
}
