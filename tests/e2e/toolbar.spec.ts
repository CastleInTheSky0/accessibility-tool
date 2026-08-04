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
  await expect(reading).toHaveAttribute("data-icon-state", "sound-off");
  await expect(rate).toHaveAttribute("data-icon-state", "rate-1");
  await page.keyboard.press("ArrowRight");
  await expect(rate).toBeFocused();
  await page.keyboard.press("Enter");
  const ratePanel = host.getByRole("dialog", { name: "语速设置" });
  await expect(ratePanel).toBeVisible();
  await ratePanel.getByRole("button", { name: "1.25×" }).click();
  await expect(rate).toHaveAttribute("data-icon-state", "rate-1.25");
  await page.keyboard.press("Escape");
  await expect(rate).toBeFocused();

  const colorScheme = host.locator('[data-action="colorScheme"]');
  await expect(colorScheme).toHaveAttribute(
    "data-icon-state",
    "scheme-original",
  );
  await colorScheme.click();
  await expect(colorScheme).toHaveAttribute(
    "data-icon-state",
    "scheme-white-black",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-a11y-color-scheme",
    "white-black",
  );
  await expect(
    colorScheme.locator(".a11y-icon__palette-background"),
  ).toHaveCSS("fill", "rgb(255, 255, 255)");
  await expect(
    colorScheme.locator(".a11y-icon__palette-foreground"),
  ).toHaveCSS("fill", "rgb(0, 0, 0)");
  const paletteStates = [
    {
      state: "scheme-black-yellow",
      background: "rgb(0, 0, 0)",
      foreground: "rgb(255, 234, 0)",
    },
    {
      state: "scheme-yellow-black",
      background: "rgb(255, 230, 0)",
      foreground: "rgb(0, 0, 0)",
    },
    {
      state: "scheme-blue-white",
      background: "rgb(6, 75, 155)",
      foreground: "rgb(255, 255, 255)",
    },
  ] as const;
  for (const palette of paletteStates) {
    await colorScheme.click();
    await expect(colorScheme).toHaveAttribute("data-icon-state", palette.state);
    await expect(page.locator("html")).toHaveAttribute(
      "data-a11y-color-scheme",
      palette.state.replace("scheme-", ""),
    );
    await expect(
      colorScheme.locator(".a11y-icon__palette-background"),
    ).toHaveCSS("fill", palette.background);
    await expect(
      colorScheme.locator(".a11y-icon__palette-foreground"),
    ).toHaveCSS("fill", palette.foreground);
  }
  await colorScheme.click();
  await expect(colorScheme).toHaveAttribute(
    "data-icon-state",
    "scheme-original",
  );
  await expect(
    colorScheme.locator(
      ".a11y-icon__palette-background, .a11y-icon__palette-foreground",
    ),
  ).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-a11y-color-scheme",
    /.+/,
  );
  await host.locator('[data-mode="main"] [data-action="exit"]').click();
  await expect(launcher).toBeFocused();
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-a11y-color-scheme",
    /.+/,
  );
});

test("synchronizes sound and read-screen switch icons", async ({ page }) => {
  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      speech: {
        adapter: {
          isSupported: () => true,
          speak: (_text, options) => {
            options.onStart?.();
            options.onEnd?.();
          },
          cancel: () => undefined,
        },
      },
    });
  });
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const reading = host.locator('[data-mode="main"] [data-action="reading"]');
  const sound = host.locator('[data-mode="screen"] [data-action="screenSound"]');
  const mainReadScreen = host.locator(
    '[data-mode="main"] [data-action="readScreen"]',
  );
  const screenReadScreen = host.locator(
    '[data-mode="screen"] [data-action="readScreen"]',
  );
  const initialWidth = await reading.evaluate(
    (element) => element.getBoundingClientRect().width,
  );

  await expect(reading).toHaveAttribute("data-icon-state", "sound-off");
  await expect(sound).toHaveAttribute("data-icon-state", "sound-off");
  await reading.click();
  await expect(reading).toHaveAttribute("aria-pressed", "true");
  await expect(reading).toHaveAttribute("data-icon-state", "sound-on");
  await expect(sound).toHaveAttribute("data-icon-state", "sound-on");
  expect(
    await reading.evaluate((element) => element.getBoundingClientRect().width),
  ).toBeCloseTo(initialWidth, 1);

  await mainReadScreen.click();
  await expect(screenReadScreen).toBeVisible();
  await expect(mainReadScreen).toHaveAttribute(
    "data-icon-state",
    "read-screen-on",
  );
  await expect(screenReadScreen).toHaveAttribute(
    "data-icon-state",
    "read-screen-on",
  );
  await sound.click();
  await expect(sound).toHaveAttribute("data-icon-state", "sound-off");
  await expect(reading).toHaveAttribute("data-icon-state", "sound-off");
  await screenReadScreen.click();
  await expect(mainReadScreen).toBeVisible();
  await expect(mainReadScreen).toHaveAttribute(
    "data-icon-state",
    "read-screen-off",
  );
});

test("uses the danger color for both non-interactive crosshair lines", async ({
  page,
}) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const crosshair = host.locator('[data-action="crosshair"]');
  await crosshair.click();
  await expect(crosshair).toHaveAttribute("data-icon-state", "crosshair-on");
  await page.mouse.move(480, 360);

  for (const line of [
    host.locator(".a11y-crosshair--x"),
    host.locator(".a11y-crosshair--y"),
  ]) {
    await expect(line).toBeVisible();
    await expect(line).toHaveCSS("background-color", "rgb(216, 25, 18)");
    await expect(line).toHaveCSS("pointer-events", "none");
    expect(await line.evaluate((element) => getComputedStyle(element).boxShadow))
      .not.toBe("none");
  }

  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      toolbar: { theme: { danger: "#b00020" } },
    });
  });
  for (const line of [
    host.locator(".a11y-crosshair--x"),
    host.locator(".a11y-crosshair--y"),
  ]) {
    await expect(line).toHaveCSS("background-color", "rgb(176, 0, 32)");
    await expect(line).toHaveCSS("pointer-events", "none");
    expect(await line.evaluate((element) => getComputedStyle(element).boxShadow))
      .not.toBe("none");
  }
});

test("restores persisted value and switch icon states", async ({ page }) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  let host = page.locator("[data-a11y-tool-host]");
  await host.locator('[data-action="colorScheme"]').click();
  await host.locator('[data-action="zoomIn"]').click();
  await host.locator('[data-action="largeCursor"]').click();
  await host.locator('[data-action="crosshair"]').click();

  await page.reload();
  host = page.locator("[data-a11y-tool-host]");
  await expect(host).toBeVisible();
  await expect(host.locator('[data-action="colorScheme"]')).toHaveAttribute(
    "data-icon-state",
    "scheme-white-black",
  );
  await expect(host.locator('[data-action="zoomIn"]')).toHaveAttribute(
    "aria-label",
    "放大，当前 125%",
  );
  await expect(host.locator('[data-action="largeCursor"]')).toHaveAttribute(
    "data-icon-state",
    "cursor-on",
  );
  await expect(host.locator('[data-action="crosshair"]')).toHaveAttribute(
    "data-icon-state",
    "crosshair-on",
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
  const pin = host.locator('[data-action="pin"]');
  await expect(pin).toHaveAttribute("data-icon-state", "pin-off");
  await pin.click();
  await expect(pin).toHaveAttribute("data-icon-state", "pin-on");
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
  const zoomIn = host.locator('[data-action="zoomIn"]');
  const initialIcon = await zoomIn.locator("svg").innerHTML();

  await zoomIn.click();
  await expect(zoomIn).toHaveAttribute(
    "aria-label",
    "放大，当前 125%",
  );
  expect(await zoomIn.locator("svg").innerHTML()).toBe(initialIcon);
  const zoomedWidth = await zoomIn.evaluate(
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
  await expect(host.locator('[data-action="colorScheme"]')).toHaveAttribute(
    "data-icon-state",
    "scheme-white-black",
  );
  await expect(host.locator('[data-action="zoomIn"]')).toHaveAttribute(
    "aria-label",
    "放大，当前 125%",
  );
  await expect(host.locator('[data-action="largeCursor"]')).toHaveAttribute(
    "data-icon-state",
    "cursor-on",
  );
  await expect(host.locator('[data-action="crosshair"]')).toHaveAttribute(
    "data-icon-state",
    "crosshair-on",
  );

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
  await expect(host.locator('[data-action="colorScheme"]')).toHaveAttribute(
    "data-icon-state",
    "scheme-original",
  );
  await expect(host.locator('[data-action="zoomIn"]')).toHaveAttribute(
    "aria-label",
    "放大，当前 100%",
  );
  await expect(host.locator('[data-action="largeCursor"]')).toHaveAttribute(
    "data-icon-state",
    "cursor-off",
  );
  await expect(host.locator('[data-action="crosshair"]')).toHaveAttribute(
    "data-icon-state",
    "crosshair-off",
  );
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
  await expect(fullscreen).toHaveAttribute(
    "data-icon-state",
    "fullscreen-enter",
  );
  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute("aria-pressed", "true");
  await expect(fullscreen).toHaveAttribute(
    "data-icon-state",
    "fullscreen-exit",
  );
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);

  await page.evaluate(() => document.exitFullscreen());
  await expect(fullscreen).toHaveAttribute("aria-pressed", "false");
  await expect(fullscreen).toHaveAttribute(
    "data-icon-state",
    "fullscreen-enter",
  );
  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute(
    "data-icon-state",
    "fullscreen-exit",
  );
  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute("aria-pressed", "false");
  await expect(fullscreen).toHaveAttribute(
    "data-icon-state",
    "fullscreen-enter",
  );
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
