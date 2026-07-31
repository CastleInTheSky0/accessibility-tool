import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?debug=1");
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
});

test("enhances automatic tabs and returns focus from the panel", async ({
  page,
}) => {
  const overview = page.getByRole("tab", { name: "概览" });
  const protocol = page.getByRole("tab", { name: "属性协议" });
  await overview.focus();
  await page.keyboard.press("ArrowRight");
  await expect(protocol).toBeFocused();
  await expect(protocol).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "属性协议" })).toBeVisible();

  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.getByRole("tabpanel", { name: "属性协议" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(protocol).toBeFocused();
});

test("keeps manual tabs inactive until Enter and triggers mouseover", async ({
  page,
}) => {
  const tabA = page.getByRole("tab", { name: "方案 A" });
  const tabB = page.getByRole("tab", { name: "方案 B" });
  await tabA.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabB).toBeFocused();
  await expect(tabB).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Enter");
  await expect(tabB).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "方案 B" })).toBeVisible();
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
