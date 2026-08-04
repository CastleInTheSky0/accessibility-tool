import { expect, test, type Locator } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?debug=1");
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  await page.getByRole("button", { name: "读屏专用" }).click();
});

test("shows six live counts and navigates each category in DOM order", async ({
  page,
}) => {
  const host = page.locator("[data-a11y-tool-host]");
  await expect(
    host.getByRole("button", { name: "视窗区，共 9 个" }),
  ).toBeVisible();
  await expect(
    host.getByRole("button", { name: "导航区，共 4 个" }),
  ).toBeVisible();
  await expect(
    host.getByRole("button", { name: "交互区，共 2 个" }),
  ).toBeVisible();
  await expect(
    host.getByRole("button", { name: "服务区，共 2 个" }),
  ).toBeVisible();
  await expect(
    host.getByRole("button", { name: "列表区，共 1 个" }),
  ).toBeVisible();
  await expect(
    host.getByRole("button", { name: "正文区，共 4 个" }),
  ).toBeVisible();

  await host.getByRole("button", { name: "导航区，共 4 个" }).click();
  const firstRegion = page.locator("header nav");
  await expect(firstRegion).toBeFocused();
  await expect(firstRegion).toHaveAttribute("tabindex", "0");
  await expect(firstRegion).toHaveAttribute("aria-regionactive", "true");
  await page.keyboard.press("Alt+Shift+Digit2");
  const secondRegion = page.locator(".region-ledger nav");
  await expect(secondRegion).toBeFocused();
  await expect(secondRegion).toHaveAttribute("tabindex", "0");
  await expect(secondRegion).toHaveAttribute("aria-regionactive", "true");
  await expect(firstRegion).toHaveAttribute("tabindex", "0");
  await expect(firstRegion).not.toHaveAttribute("aria-regionactive", /.+/);
  await expect(firstRegion).not.toHaveAttribute(
    "data-a11y-page-focus-owned",
    "",
  );
});

test("shows one orange current-region node for click, shortcut and page focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const host = page.locator("[data-a11y-tool-host]");
  const viewport = host.locator('[data-action="region:viewport"]');
  const navigation = host.locator('[data-action="region:navigation"]');
  const service = host.locator('[data-action="region:service"]');

  await expect(host.locator("[data-region-current]")).toHaveCount(0);
  await viewport.click();
  await expect(viewport).toHaveAttribute("aria-current", "location");
  await expect(viewport).toHaveAttribute("data-region-current", "");
  await expect(viewport).not.toHaveAttribute("aria-pressed", /.+/);
  await expect(viewport.locator("[data-region-count]")).toHaveText("1/9");
  await expect(viewport).toHaveAttribute("aria-label", "视窗区，共 9 个");
  await expect(host.locator('[aria-current="location"]')).toHaveCount(1);
  await expect.poll(() => getLocalTrackScale(viewport)).toBeGreaterThan(0.99);

  const currentStyle = await viewport.evaluate((element) => {
    const icon = element.querySelector<HTMLElement>(".a11y-control__icon");
    const elementStyle = getComputedStyle(element);
    const iconStyle = icon ? getComputedStyle(icon) : null;
    const track = getComputedStyle(element, "::before");
    const matrix = new DOMMatrixReadOnly(track.transform);
    return {
      background: elementStyle.backgroundColor,
      icon: iconStyle?.backgroundColor ?? "",
      iconRing: iconStyle?.boxShadow ?? "",
      iconTransitionDuration: iconStyle?.transitionDuration ?? "",
      iconTransitionProperty: iconStyle?.transitionProperty ?? "",
      track: track.backgroundColor,
      trackDisplay: track.display,
      trackHeight: track.height,
      trackOpacity: track.opacity,
      trackOrigin: track.transformOrigin,
      trackScale: matrix.a,
      trackScaleState: elementStyle
        .getPropertyValue("--a11y-local-track-scale")
        .trim(),
      trackTop: track.top,
      trackTransitionDuration: track.transitionDuration,
      trackTransitionProperty: track.transitionProperty,
      trackTransitionTiming: track.transitionTimingFunction,
      trackWidth: track.width,
      trackZIndex: track.zIndex,
    };
  });
  expect(currentStyle).toMatchObject({
    background: "rgba(0, 0, 0, 0)",
    icon: "rgb(244, 122, 0)",
    iconTransitionDuration: "0.2s, 0.2s, 0.22s, 0.2s",
    iconTransitionProperty:
      "background-color, border-color, box-shadow, color",
    track: "rgb(244, 122, 0)",
    trackDisplay: "block",
    trackHeight: "3px",
    trackOpacity: "1",
    trackOrigin: "52px 1.5px",
    trackScaleState: "1",
    trackTop: "27px",
    trackTransitionDuration: "0.22s, 0.18s",
    trackTransitionProperty: "transform, opacity",
    trackWidth: "104px",
    trackZIndex: "-1",
  });
  expect(currentStyle.trackScale).toBeGreaterThan(0.99);
  expect(currentStyle.trackTransitionTiming).toContain(
    "cubic-bezier(0.22, 1, 0.36, 1)",
  );
  expect(currentStyle.iconRing).toContain("rgb(24, 27, 30)");
  expect(currentStyle.iconRing).toContain("rgb(244, 122, 0)");
  await expect(navigation.locator(".a11y-control__icon")).toHaveCSS(
    "background-color",
    "rgb(107, 113, 119)",
  );

  await viewport.click();
  await expect(viewport.locator("[data-region-count]")).toHaveText("2/9");

  await navigation.click();
  await expect(viewport).not.toHaveAttribute("aria-current", /.+/);
  await expect(viewport.locator("[data-region-count]")).toHaveText("9");
  await expect(navigation).toHaveAttribute("aria-current", "location");
  await expect(navigation.locator("[data-region-count]")).toHaveText("1/4");
  await expect.poll(() => getLocalTrackScale(viewport)).toBeLessThan(0.01);
  await expect.poll(() => getLocalTrackScale(navigation)).toBeGreaterThan(0.99);

  await page.keyboard.press("Alt+Shift+Digit2");
  await expect(navigation.locator("[data-region-count]")).toHaveText("2/4");

  const pageService = page.locator("[data-demo-service]");
  await pageService.focus();
  await expect(pageService).toBeFocused();
  await expect(service).toHaveAttribute("aria-current", "location");
  await expect(service.locator("[data-region-count]")).toHaveText("1/2");
  await expect(navigation.locator("[data-region-count]")).toHaveText("4");

  await navigation.focus();
  await expect(host.locator("[data-region-current]")).toHaveCount(0);
  await expect(host.locator('[aria-current="location"]')).toHaveCount(0);
  await expect(service.locator("[data-region-count]")).toHaveText("2");
  await expect.poll(() => getLocalTrackScale(service)).toBeLessThan(0.01);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await viewport.click();
  const reducedMotionStyle = await viewport.evaluate((element) => {
    const icon = element.querySelector<HTMLElement>(".a11y-control__icon");
    const track = getComputedStyle(element, "::before");
    return {
      iconTransitionDuration: icon
        ? getComputedStyle(icon).transitionDuration
        : "",
      trackTransitionDuration: track.transitionDuration,
      trackTransitionProperty: track.transitionProperty,
    };
  });
  expect(reducedMotionStyle).toEqual({
    iconTransitionDuration: "0s",
    trackTransitionDuration: "0s",
    trackTransitionProperty: "none",
  });
});

test("keeps hidden tab panels in viewport order and opens them on demand", async ({
  page,
}) => {
  const host = page.locator("[data-a11y-tool-host]");
  const viewport = host.getByRole("button", { name: "视窗区，共 9 个" });
  const liveRegion = host.getByRole("status");
  const overviewPanel = page.locator("#panel-overview");
  const protocolPanel = page.locator("#panel-protocol");
  const keyboardPanel = page.locator("#panel-keyboard");

  await expect(protocolPanel).toHaveAttribute("data-a11y-hidden", "");
  await expect(protocolPanel).not.toHaveAttribute("tabindex", /.+/);

  await viewport.click();
  await viewport.click();
  await viewport.click();
  await viewport.click();

  await expect(protocolPanel).toBeFocused();
  await expect(protocolPanel).not.toHaveAttribute("data-a11y-hidden", "");
  await expect(protocolPanel).toHaveAttribute("tabindex", "0");
  await expect(overviewPanel).toHaveAttribute("data-a11y-hidden", "");
  await expect(viewport).toHaveAttribute("aria-label", "视窗区，共 9 个");
  await expect(liveRegion).toHaveText(
    "提示：您已进入属性协议视窗区，按下 Tab 键浏览信息；第 4 个，共 9 个",
  );

  await page.keyboard.press("Alt+Shift+Digit1");
  await expect(keyboardPanel).toBeFocused();
  await expect(keyboardPanel).not.toHaveAttribute("data-a11y-hidden", "");
  await expect(protocolPanel).toHaveAttribute("data-a11y-hidden", "");
  await expect(protocolPanel).not.toHaveAttribute("tabindex", /.+/);
  await expect(viewport).toHaveAttribute("aria-label", "视窗区，共 9 个");
  await expect(liveRegion).toHaveText(
    "提示：您已进入键盘模型视窗区，按下 Tab 键浏览信息；第 5 个，共 9 个",
  );
});

test("updates counts after dynamic add, hide and remove", async ({ page }) => {
  const host = page.locator("[data-a11y-tool-host]");
  const service = host.getByRole("button", { name: /服务区，共/ });
  await expect(service).toHaveAttribute("aria-label", "服务区，共 2 个");

  await page.getByRole("button", { name: "新增服务区" }).click();
  await expect(service).toHaveAttribute("aria-label", "服务区，共 3 个");
  const dynamicRegion = page.locator("#dynamic-regions > section");
  await expect(dynamicRegion).toHaveAttribute("tabindex", "0");
  await page.getByRole("button", { name: "隐藏/显示最新区域" }).click();
  await expect(service).toHaveAttribute("aria-label", "服务区，共 2 个");
  await expect(dynamicRegion).toHaveAttribute("tabindex", "-1");
  await page.getByRole("button", { name: "隐藏/显示最新区域" }).click();
  await expect(service).toHaveAttribute("aria-label", "服务区，共 3 个");
  await expect(dynamicRegion).toHaveAttribute("tabindex", "0");
  await page.getByRole("button", { name: "删除最新区域" }).click();
  await expect(service).toHaveAttribute("aria-label", "服务区，共 2 个");
});

test("does not intercept region shortcuts in editable fields", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "示例检索" });
  await search.focus();
  await page.keyboard.press("Alt+Shift+Digit2");
  await expect(search).toBeFocused();
});

test("recovers when the currently focused dynamic region is removed", async ({
  page,
}) => {
  await page.getByRole("button", { name: "新增服务区" }).click();
  const service = page
    .locator("[data-a11y-tool-host]")
    .getByRole("button", { name: "服务区，共 3 个" });
  await service.click();
  await page.keyboard.press("Alt+Shift+Digit4");
  const dynamicRegion = page.locator("#dynamic-regions > section");
  await expect(dynamicRegion).toBeFocused();

  await dynamicRegion.evaluate((element) => element.remove());
  await expect(page.locator(".final-chapter")).toBeFocused();
});

test("restores read-screen mode on the next open", async ({ page }) => {
  const host = page.locator("[data-a11y-tool-host]");
  const region = page.locator("header nav");
  await expect(region).toHaveAttribute("tabindex", "0");
  await host.getByRole("button", { name: "退出" }).click();
  await expect(region).not.toHaveAttribute("tabindex", /.+/);
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  await expect(region).toHaveAttribute("tabindex", "0");
  await expect(
    page
      .locator("[data-a11y-tool-host]")
      .getByRole("button", { name: /导航区，共/ }),
  ).toBeVisible();
});

async function getLocalTrackScale(control: Locator): Promise<number> {
  return control.evaluate((element) => {
    const transform = getComputedStyle(element, "::before").transform;
    return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).a;
  });
}
