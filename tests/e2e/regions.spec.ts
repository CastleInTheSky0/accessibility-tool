import { expect, test } from "@playwright/test";

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
