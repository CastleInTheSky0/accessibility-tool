import { expect, test } from "@playwright/test";

interface StoredCaptionPreferencePayload {
  preferences?: {
    captionEnabled?: boolean;
    captionFontSize?: number;
    captionScript?: string;
    captionPinyinEnabled?: boolean;
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?debug=1");
  await page.evaluate(() => {
    window.AccessibilityTool.configure({ persistOpenState: false });
    const source = document.createElement("p");
    source.id = "large-caption-source";
    source.tabIndex = 0;
    source.textContent = "汉语龙马 A11Y";
    document.body.append(source);
  });
});

test("shows independent text output, applies language settings and restores focus on close", async ({
  page,
}) => {
  const runtimeResourceRequests: string[] = [];
  page.on("request", (request) => {
    if (["script", "fetch", "xhr"].includes(request.resourceType())) {
      runtimeResourceRequests.push(request.url());
    }
  });
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const mainEntry = host.locator(
    '[data-mode="main"] [data-action="largeCaption"]',
  );
  const screenEntry = host.locator(
    '[data-mode="screen"] [data-action="largeCaption"]',
  );
  const readScreenEntry = host.locator(
    '[data-mode="main"] [data-action="readScreen"]',
  );
  const screenGroup = host.locator('[data-mode="screen"]');
  const caption = host.locator(".a11y-large-caption");
  const captionText = caption.locator(".a11y-large-caption__text");

  await expect(mainEntry).toHaveAttribute("aria-pressed", "false");
  await readScreenEntry.click();
  await expect(screenGroup).toHaveJSProperty("hidden", false);
  await screenEntry.click();
  await expect(mainEntry).toHaveAttribute("aria-pressed", "true");
  await expect(screenEntry).toHaveAttribute("aria-pressed", "true");
  await expect(mainEntry).toHaveAttribute(
    "data-icon-state",
    "large-caption-on",
  );
  await expect(screenEntry).toHaveAttribute(
    "data-icon-state",
    "large-caption-on",
  );
  await expect(mainEntry.locator("[data-control-meta]")).toHaveText("开启");
  await expect(screenEntry.locator("[data-control-meta]")).toHaveText("开启");
  await screenEntry.click();
  await expect(mainEntry).toHaveAttribute("aria-pressed", "false");
  await expect(screenEntry).toHaveAttribute("aria-pressed", "false");
  await expect(mainEntry).toHaveAttribute(
    "data-icon-state",
    "large-caption-off",
  );
  await expect(screenEntry).toHaveAttribute(
    "data-icon-state",
    "large-caption-off",
  );
  await expect(mainEntry.locator("[data-control-meta]")).toHaveText("关闭");
  await expect(screenEntry.locator("[data-control-meta]")).toHaveText("关闭");
  await screenEntry.click();
  await expect(mainEntry).toHaveAttribute("aria-pressed", "true");
  await expect(screenEntry).toHaveAttribute("aria-pressed", "true");
  await expect(caption).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.AccessibilityTool.getState()))
    .toMatchObject({
      isReadScreen: true,
      readingEnabled: false,
      captionEnabled: true,
    });

  await page.locator("#large-caption-source").focus();
  await expect(caption).toBeVisible();
  await expect(caption.locator("[data-caption-status]")).toHaveText("显示中");
  await expect(captionText).toHaveText("文本：汉语龙马 A11Y");
  await expect(caption).not.toHaveAttribute("role", /.+/);
  await expect(caption).not.toHaveAttribute("aria-label", /.+/);
  await expect(caption).not.toHaveAttribute("aria-live", /.+/);
  await expect(
    caption.getByRole("region", { name: "当前大字幕内容" }),
  ).toBeVisible();
  await expect(
    caption.locator('[aria-live], [role="status"], [role="alert"]'),
  ).toHaveCount(0);

  const viewport = page.viewportSize();
  const captionBox = await caption.boundingBox();
  expect(viewport).not.toBeNull();
  expect(captionBox).not.toBeNull();
  expect(captionBox?.x).toBeCloseTo(0, 1);
  expect(captionBox?.width).toBeCloseTo(viewport?.width ?? 0, 1);
  expect((captionBox?.y ?? 0) + (captionBox?.height ?? 0)).toBeCloseTo(
    viewport?.height ?? 0,
    1,
  );

  const traditional = caption.locator(
    '[data-caption-script="traditional"]',
  );
  await traditional.click();
  await expect(traditional).toHaveAttribute("aria-pressed", "true");
  await expect(captionText).toHaveText("文本：漢語龍馬 A11Y");

  const pinyin = caption.getByRole("button", { name: /字幕拼音/ });
  await pinyin.click();
  await expect(pinyin).toHaveAttribute("aria-pressed", "true");
  await expect(
    caption.locator(".a11y-large-caption__pinyin", { hasText: "hàn" }),
  ).toHaveCount(1);
  await expect
    .poll(() =>
      caption.locator(".a11y-large-caption__written").evaluateAll((nodes) =>
        nodes.map((node) => node.textContent ?? "").join(""),
      ),
    )
    .toBe("文本：漢語龍馬 A11Y");

  const size48 = caption.getByRole("button", { name: "字幕字号 48px" });
  await size48.click();
  await expect(size48).toHaveAttribute("aria-pressed", "true");
  await expect(captionText).toHaveCSS("font-size", "48px");

  await caption.getByRole("button", { name: "简体", exact: true }).click();
  await expect
    .poll(() =>
      caption.locator(".a11y-large-caption__written").evaluateAll((nodes) =>
        nodes.map((node) => node.textContent ?? "").join(""),
      ),
    )
    .toBe("文本：汉语龙马 A11Y");
  await expect
    .poll(() => page.evaluate(() => window.AccessibilityTool.getState()))
    .toMatchObject({
      readingEnabled: false,
      captionEnabled: true,
      captionFontSize: 48,
      captionScript: "simplified",
      captionPinyinEnabled: true,
    });

  await caption.getByRole("button", { name: "关闭大字幕" }).click();
  await expect(caption).toBeHidden();
  await expect(mainEntry).toHaveAttribute("aria-pressed", "false");
  await expect(screenEntry).toHaveAttribute("aria-pressed", "false");
  await expect(screenEntry).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.AccessibilityTool.getState()))
    .toMatchObject({
      isReadScreen: true,
      readingEnabled: false,
      captionEnabled: false,
    });
  expect(runtimeResourceRequests).toEqual([]);
});

test("restores caption preferences across reload and navigation without persisting text", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.AccessibilityTool.configure({ persistOpenState: true });
    const source = document.getElementById("large-caption-source");
    if (source) {
      source.textContent = "CAPTION_BODY_MUST_NOT_PERSIST_20260814";
    }
  });
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  let host = page.locator("[data-a11y-tool-host]");
  let caption = host.locator(".a11y-large-caption");
  await host
    .locator('[data-mode="main"] [data-action="largeCaption"]')
    .click();
  await page.locator("#large-caption-source").focus();
  await expect(caption).toBeVisible();
  await caption
    .locator('[data-caption-script="traditional"]')
    .click();
  await caption.getByRole("button", { name: /字幕拼音/ }).click();
  await caption.getByRole("button", { name: "字幕字号 48px" }).click();

  const storedBeforeReload = await page.evaluate(() =>
    JSON.stringify(Object.fromEntries(Object.entries(localStorage))),
  );
  const rawPreferences = await page.evaluate(() =>
    localStorage.getItem("accessibility-tool:preferences"),
  );
  expect(rawPreferences).not.toBeNull();
  const preferencePayload = rawPreferences
    ? (JSON.parse(rawPreferences) as StoredCaptionPreferencePayload)
    : null;
  expect(preferencePayload?.preferences).toMatchObject({
    captionEnabled: true,
    captionFontSize: 48,
    captionScript: "traditional",
    captionPinyinEnabled: true,
  });
  expect(storedBeforeReload).not.toContain(
    "CAPTION_BODY_MUST_NOT_PERSIST_20260814",
  );

  await page.mouse.move(1, 1);
  await page.reload();
  host = page.locator("[data-a11y-tool-host]");
  caption = host.locator(".a11y-large-caption");
  await expect(host).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.AccessibilityTool.getState()))
    .toMatchObject({
      captionEnabled: true,
      captionFontSize: 48,
      captionScript: "traditional",
      captionPinyinEnabled: true,
    });
  await expect(
    host.locator('[data-mode="main"] [data-action="largeCaption"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    host.locator('[data-mode="screen"] [data-action="largeCaption"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(caption).toBeHidden();
  await expect(caption.locator(".a11y-large-caption__text")).toHaveText("");

  await page.goto("/demos/semantic-off.html?debug=1");
  host = page.locator("[data-a11y-tool-host]");
  caption = host.locator(".a11y-large-caption");
  await expect(host).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.AccessibilityTool.getState()))
    .toMatchObject({
      captionEnabled: true,
      captionFontSize: 48,
      captionScript: "traditional",
      captionPinyinEnabled: true,
    });
  await expect(
    host.locator('[data-mode="main"] [data-action="largeCaption"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    host.locator('[data-mode="screen"] [data-action="largeCaption"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(caption).toBeHidden();
  await expect(caption.locator(".a11y-large-caption__text")).toHaveText("");
  expect(
    await page.evaluate(() =>
      JSON.stringify(Object.fromEntries(Object.entries(localStorage))),
    ),
  ).not.toContain("CAPTION_BODY_MUST_NOT_PERSIST_20260814");
});

test("loads bundled language data once and makes no runtime language requests", async ({
  page,
}) => {
  const runtimeResourceRequests: Array<{ type: string; url: string }> = [];
  page.on("request", (request) => {
    if (["script", "fetch", "xhr"].includes(request.resourceType())) {
      runtimeResourceRequests.push({
        type: request.resourceType(),
        url: request.url(),
      });
    }
  });

  await page.reload();
  const initialRequests = runtimeResourceRequests.slice();
  expect(
    initialRequests
      .map(({ type, url }) => ({ type, path: new URL(url).pathname }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  ).toEqual([
    { type: "script", path: "/accessibility-tool.min.js" },
    { type: "script", path: "/demo.js" },
  ]);

  await page.evaluate(() => {
    window.AccessibilityTool.configure({ persistOpenState: false });
    const source = document.createElement("p");
    source.id = "large-caption-network-source";
    source.tabIndex = 0;
    source.textContent = "汉语龙马 A11Y";
    document.body.append(source);
  });
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const caption = host.locator(".a11y-large-caption");
  await host
    .locator('[data-mode="main"] [data-action="largeCaption"]')
    .click();
  await page.locator("#large-caption-network-source").focus();
  await caption
    .locator('[data-caption-script="traditional"]')
    .click();
  await caption.getByRole("button", { name: /字幕拼音/ }).click();
  await expect(
    caption.locator(".a11y-large-caption__pinyin", { hasText: "hàn" }),
  ).toHaveCount(1);
  await page.waitForTimeout(250);

  expect(runtimeResourceRequests).toEqual(initialRequests);
  expect(
    runtimeResourceRequests.filter(({ url }) =>
      /(?:opencc|pinyin|language|locale)/i.test(url),
    ),
  ).toEqual([]);
});

test("reflows long pinyin text without moving or hiding its controls", async ({
  page,
}) => {
  await page.evaluate(() => {
    const source = document.getElementById("large-caption-source");
    if (source) {
      source.textContent = "汉字 English 2026，".repeat(240);
    }
  });
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  await host
    .locator('[data-mode="main"] [data-action="largeCaption"]')
    .click();
  await page.locator("#large-caption-source").focus();
  const caption = host.locator(".a11y-large-caption");
  await caption.getByRole("button", { name: /字幕拼音/ }).click();
  await caption.getByRole("button", { name: "字幕字号 48px" }).click();

  await page.emulateMedia({ forcedColors: "active" });
  await page.setViewportSize({ width: 640, height: 720 });
  await expect(caption).toBeVisible();
  await expect(caption.locator(".a11y-large-caption__text")).toHaveCSS(
    "font-size",
    "48px",
  );
  expect(
    await caption.locator(".a11y-large-caption__pinyin").count(),
  ).toBeGreaterThan(50);

  const close = caption.getByRole("button", { name: "关闭大字幕" });
  const closeBeforeScroll = await close.boundingBox();
  const metrics = await caption.evaluate((element) => {
    const body = element.querySelector<HTMLElement>(
      ".a11y-large-caption__body",
    );
    const controls = element.querySelector<HTMLElement>(
      ".a11y-large-caption__controls",
    );
    if (!body || !controls) {
      throw new Error("Missing large-caption regions");
    }
    const rect = element.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      bottomDelta: Math.abs(window.innerHeight - rect.bottom),
      captionHeight: rect.height,
      captionWidth: rect.width,
      controlsVisible: controlsRect.bottom <= rect.bottom + 1,
      forcedColorAdjust: style.forcedColorAdjust,
      horizontalOverflow: Math.max(
        element.scrollWidth - element.clientWidth,
        body.scrollWidth - body.clientWidth,
      ),
      left: rect.left,
      overflowY: getComputedStyle(body).overflowY,
      scrollable: body.scrollHeight > body.clientHeight,
    };
  });

  expect(metrics.left).toBeCloseTo(0, 1);
  expect(metrics.captionWidth).toBeCloseTo(640, 1);
  expect(metrics.bottomDelta).toBeLessThanOrEqual(1);
  expect(metrics.captionHeight).toBeLessThanOrEqual(720 * 0.32 + 1);
  expect(metrics.controlsVisible).toBe(true);
  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(metrics.overflowY).toBe("auto");
  expect(metrics.scrollable).toBe(true);
  expect(metrics.forcedColorAdjust).toBe("auto");

  await caption.locator(".a11y-large-caption__body").evaluate((body) => {
    body.scrollTop = body.scrollHeight;
  });
  const closeAfterScroll = await close.boundingBox();
  expect(closeBeforeScroll).not.toBeNull();
  expect(closeAfterScroll).not.toBeNull();
  expect(closeAfterScroll?.y).toBeCloseTo(closeBeforeScroll?.y ?? 0, 1);
});
