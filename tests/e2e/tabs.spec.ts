import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?debug=1");
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
});

test("tabs through automatic options and returns focus from the panel", async ({
  page,
}) => {
  const overview = page.getByRole("tab", { name: "概览" });
  const protocol = page.getByRole("tab", { name: "属性协议" });
  const keyboard = page.getByRole("tab", { name: "键盘模型" });
  const overviewPanel = page.locator("#panel-overview");
  const protocolPanel = page.locator("#panel-protocol");
  const keyboardPanel = page.locator("#panel-keyboard");
  await expect(overview).toHaveAttribute("tabindex", "0");
  await expect(protocol).toHaveAttribute("tabindex", "0");
  await expect(keyboard).toHaveAttribute("tabindex", "0");
  await expect(overviewPanel).not.toHaveAttribute("data-a11y-hidden", "");
  await expect(protocolPanel).toHaveAttribute("data-a11y-hidden", "");
  await expect(keyboardPanel).toHaveAttribute("data-a11y-hidden", "");
  await expect(overviewPanel).toHaveAttribute("aria-hidden", "false");
  await expect(protocolPanel).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator('[role="tabpanel"][hidden]')).toHaveCount(0);
  await overview.focus();
  await page.keyboard.press("Tab");
  await expect(protocol).toBeFocused();
  await expect(protocol).toHaveAttribute("aria-selected", "true");
  await expect(protocolPanel).not.toHaveAttribute("data-a11y-hidden", "");
  await expect(overviewPanel).toHaveAttribute("data-a11y-hidden", "");
  await expect(protocolPanel).toHaveAttribute("aria-hidden", "false");
  await expect(overviewPanel).toHaveAttribute("aria-hidden", "true");
  await expect(protocolPanel).not.toHaveAttribute("hidden", "");
  await expect(protocolPanel).toBeVisible();

  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.getByRole("tabpanel", { name: "属性协议" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(protocol).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(overview).toBeFocused();
  await expect(overview).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(protocol).toBeFocused();
  await expect(protocol).toHaveAttribute("aria-selected", "true");
});

test("keeps manual tabs inactive until Enter and triggers mouseover", async ({
  page,
}) => {
  const tabA = page.getByRole("tab", { name: "方案 A" });
  const tabB = page.getByRole("tab", { name: "方案 B" });
  const panelA = page.locator("#panel-manual-a");
  const panelB = page.locator("#panel-manual-b");
  await expect(tabA).toHaveAttribute("tabindex", "0");
  await expect(tabB).toHaveAttribute("tabindex", "0");
  await expect(panelA).not.toHaveAttribute("data-a11y-hidden", "");
  await expect(panelB).toHaveAttribute("data-a11y-hidden", "");
  await expect(panelA).toHaveAttribute("aria-hidden", "false");
  await expect(panelB).toHaveAttribute("aria-hidden", "true");
  await tabA.focus();
  await page.keyboard.press("Tab");
  await expect(tabB).toBeFocused();
  await expect(tabB).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Enter");
  await expect(tabB).toHaveAttribute("aria-selected", "true");
  await expect(panelA).toHaveAttribute("data-a11y-hidden", "");
  await expect(panelB).not.toHaveAttribute("data-a11y-hidden", "");
  await expect(panelA).toHaveAttribute("aria-hidden", "true");
  await expect(panelB).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator('[role="tabpanel"][hidden]')).toHaveCount(0);
  await expect(panelB).toBeVisible();
});

test("opens and closes the configured floating panel through host-owned visibility", async ({
  page,
}) => {
  const floatingTab = page.getByRole("tab", { name: "非模态浮层" });
  const floatingPanel = page.locator("#panel-floating");

  await expect(floatingPanel).toHaveAttribute("data-a11y-hidden", "");
  await expect(floatingPanel).not.toHaveAttribute("hidden", "");
  await expect(floatingPanel).toHaveAttribute("aria-hidden", "true");

  await floatingTab.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(floatingPanel).toBeFocused();
  await expect(floatingPanel).not.toHaveAttribute("data-a11y-hidden", "");
  await expect(floatingPanel).not.toHaveAttribute("hidden", "");
  await expect(floatingPanel).toHaveAttribute("aria-hidden", "false");
  await expect(floatingPanel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(floatingTab).toBeFocused();
  await expect(floatingPanel).toHaveAttribute("data-a11y-hidden", "");
  await expect(floatingPanel).not.toHaveAttribute("hidden", "");
  await expect(floatingPanel).not.toBeVisible();
});

test("enters and closes the native modal with Escape", async ({ page }) => {
  const modalTab = page.getByRole("tab", { name: "模态窗口" });
  await modalTab.focus();
  await page.keyboard.press("Alt+ArrowDown");
  const dialog = page.locator("#panel-modal");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(modalTab).toBeFocused();
});
