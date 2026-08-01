import { expect, test } from "@playwright/test";

test("restores across reload and same-origin navigation until close", async ({
  page,
}) => {
  await page.goto("/?debug=1");
  const host = page.locator("[data-a11y-tool-host]");
  await expect(host).toHaveCount(0);

  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  await expect(host).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem(
          "accessibility-tool:preferences:open-state",
        ),
      ),
    )
    .not.toBeNull();

  await page.addInitScript(() => {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        const target = document.querySelector<HTMLElement>(
          "[data-open-tool], #open-tool",
        );
        target?.focus();
      },
      { once: true },
    );
  });

  await page.reload();
  const reloadTrigger = page.locator("[data-open-tool]").first();
  await expect(host).toBeVisible();
  await expect(reloadTrigger).toBeFocused();
  await expect(reloadTrigger).not.toHaveAttribute("aria-expanded", "true");
  await expect(host.locator('[role="status"]')).toHaveText("");

  await reloadTrigger.click();
  await expect(host.locator('[data-action="reading"]')).toBeFocused();
  await expect(host.locator('[role="status"]')).toContainText(
    "无障碍工具栏已打开",
  );
  await expect(reloadTrigger).toHaveAttribute("aria-expanded", "true");

  await page.goto("/demos/semantic-off.html?debug=1");
  const semanticTrigger = page.locator("#open-tool");
  await expect(host).toBeVisible();
  await expect(semanticTrigger).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.AccessibilityTool.getState().isOpen))
    .toBe(true);

  await host.locator('[data-mode="main"] [data-action="exit"]').click();
  await expect(host).not.toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem(
          "accessibility-tool:preferences:open-state",
        ),
      ),
    )
    .toBeNull();

  await page.reload();
  await expect(host).toHaveCount(0);
  await expect(page.locator("#open-tool")).toBeFocused();
});
