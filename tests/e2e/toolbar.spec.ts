import { expect, test } from "@playwright/test";

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

test("pins, collapses and expands with Alt+Shift+A", async ({ page }) => {
  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      toolbar: { pinHideDelayMs: 60 },
    });
  });
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  await host.locator('[data-action="pin"]').click();
  await page.getByRole("searchbox", { name: "示例检索" }).focus();
  await page.mouse.move(500, 400);
  await expect(host).toHaveAttribute("data-a11y-tool-collapsed", "", {
    timeout: 1500,
  });

  await page.keyboard.press("Alt+Shift+KeyA");
  await expect(host).not.toHaveAttribute("data-a11y-tool-collapsed", "");
  await expect(host.locator('[data-action="reading"]')).toBeFocused();
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
