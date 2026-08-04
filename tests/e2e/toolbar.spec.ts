import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?debug=1");
});

test("opens lazily and supports the toolbar keyboard model", async ({ page }) => {
  const launcher = page.getByRole("button", { name: "打开无障碍工具" });
  const host = page.locator("[data-a11y-tool-host]");
  await expect(host).toHaveCount(0);

  await launcher.click();
  await expect(host).toBeVisible();
  await expect(launcher).toHaveAttribute("aria-expanded", "true");

  const labels = await host
    .locator('[data-mode="main"] .a11y-control__label')
    .allTextContents();
  expect(labels).toEqual([
    "朗读",
    "语速",
    "配色",
    "放大",
    "缩小",
    "大鼠标",
    "十字线",
    "大界面",
    "固定",
    "重置",
    "帮助",
    "读屏专用",
    "退出",
  ]);

  const reading = host.locator('[data-action="reading"]');
  const rate = host.locator('[data-action="speechRate"]');
  await expect(reading).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(rate).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(host.getByRole("dialog", { name: "语速设置" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(rate).toBeFocused();

  await host.locator('[data-action="colorScheme"]').click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-a11y-color-scheme",
    "white-black",
  );
  await host.locator('[data-mode="main"] [data-action="exit"]').click();
  await expect(launcher).toBeFocused();
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-a11y-color-scheme",
    /.+/,
  );
});

test("keeps the default push toolbar fixed during real page scrolling", async ({
  page,
}) => {
  const originalPadding = await getBodyPaddingTop(page);
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const toolbarHeight = await host.evaluate(
    (element) => element.getBoundingClientRect().height,
  );

  await expect(host).toHaveCSS("position", "fixed");
  await expect.poll(() => getHostTop(page)).toBe(0);
  await expect
    .poll(() => getBodyPaddingTop(page))
    .toBeCloseTo(originalPadding + toolbarHeight, 1);
  await expectToolbarFixedThroughScroll(page);

  await host.locator('[data-mode="main"] [data-action="exit"]').click();
  await expect.poll(() => getBodyPaddingTop(page)).toBeCloseTo(
    originalPadding,
    1,
  );
});

test("keeps overlay fixed without reserving page space", async ({ page }) => {
  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      toolbar: { layoutMode: "overlay" },
    });
  });
  const originalPadding = await getBodyPaddingTop(page);
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");

  await expect(host).toHaveCSS("position", "fixed");
  await expect.poll(() => getBodyPaddingTop(page)).toBeCloseTo(
    originalPadding,
    1,
  );
  await expectToolbarFixedThroughScroll(page);
});

test("pins, collapses and expands with Alt+Shift+A", async ({ page }) => {
  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      toolbar: { pinHideDelayMs: 60 },
    });
  });
  const originalPadding = await getBodyPaddingTop(page);
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const expandedHeight = await getHostHeight(page);
  await host.locator('[data-action="pin"]').click();
  await expect.poll(() => getBodyPaddingTop(page)).toBeCloseTo(
    originalPadding,
    1,
  );
  await page.getByRole("searchbox", { name: "示例检索" }).focus();
  await page.mouse.move(500, 400);
  await expect(host).toHaveAttribute("data-a11y-tool-collapsed", "", {
    timeout: 1500,
  });
  await expect.poll(() => getHostHeight(page)).toBe(12);
  await expect.poll(() => getHostTop(page)).toBe(0);

  await page.keyboard.press("Alt+Shift+KeyA");
  await expect(host).not.toHaveAttribute("data-a11y-tool-collapsed", "");
  await expect(host.locator('[data-action="reading"]')).toBeFocused();
  await expect.poll(() => getHostHeight(page)).toBeCloseTo(expandedHeight, 1);
  await expect.poll(() => getHostTop(page)).toBe(0);
  await expect.poll(() => getBodyPaddingTop(page)).toBeCloseTo(
    originalPadding,
    1,
  );
});

test("cycles zoom without scaling the toolbar", async ({ page }) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const initialWidth = await host.locator('[data-action="zoomIn"]').evaluate(
    (element) => element.getBoundingClientRect().width,
  );

  await host.locator('[data-action="zoomIn"]').click();
  await expect(host.locator('[data-action="zoomIn"]')).toHaveAttribute(
    "aria-label",
    "放大，当前 125%",
  );
  const zoomedWidth = await host.locator('[data-action="zoomIn"]').evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(zoomedWidth).toBeCloseTo(initialWidth, 1);
  await expect(page.locator("main")).toHaveCSS("zoom", "1.25");
});

test("reset restores page effects and keeps focus on reset", async ({ page }) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  await host.locator('[data-action="colorScheme"]').click();
  await host.locator('[data-action="zoomIn"]').click();
  await host.locator('[data-action="largeCursor"]').click();
  await host.locator('[data-action="crosshair"]').click();

  const reset = host.locator('[data-action="reset"]');
  await reset.click();
  await expect(reset).toBeFocused();
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-a11y-color-scheme",
    /.+/,
  );
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-a11y-large-cursor",
    "",
  );
  await expect(page.locator("main")).toHaveCSS("zoom", "1");
  const state = await page.evaluate(() => window.AccessibilityTool.getState());
  expect(state).toMatchObject({
    isOpen: true,
    colorScheme: "original",
    zoom: 1,
    largeCursor: false,
    crosshair: false,
    isPinned: false,
    isReadScreen: false,
  });
});

test("uses the standard Fullscreen API from the same control", async ({ page }) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const fullscreen = page
    .locator("[data-a11y-tool-host]")
    .locator('[data-action="fullscreen"]');
  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);

  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(false);
});

async function expectToolbarFixedThroughScroll(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect.poll(() => getHostTop(page)).toBe(0);
}

async function getHostTop(page: Page): Promise<number> {
  return page.locator("[data-a11y-tool-host]").evaluate((element) =>
    Math.round(element.getBoundingClientRect().top),
  );
}

async function getHostHeight(page: Page): Promise<number> {
  return page.locator("[data-a11y-tool-host]").evaluate(
    (element) => element.getBoundingClientRect().height,
  );
}

async function getBodyPaddingTop(page: Page): Promise<number> {
  return page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.body).paddingTop),
  );
}
