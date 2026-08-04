import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("isolates toolbar styles from hostile host CSS", async ({ page }) => {
  await page.goto("/demos/hostile.html?debug=1");
  await page.getByRole("button", { name: "打开隔离工具栏" }).click();
  const control = page
    .locator("[data-a11y-tool-host]")
    .locator('[data-action="reading"]');
  await expect(control).toBeVisible();
  await expect(control).toHaveCSS("border-radius", "13px");
  await expect(control).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(control.locator(".a11y-control__icon")).toHaveCSS(
    "background-color",
    "rgb(41, 46, 50)",
  );
  const icon = control.locator("svg");
  await expect(icon).toHaveCSS("width", "24px");
  await expect(icon).toHaveCSS("transform", "none");
});

test("uses a closed Shadow Root outside debug mode", async ({ page }) => {
  await page.goto("/demos/semantic-off.html");
  await page.getByRole("button", { name: "打开工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  await expect(host).toBeVisible();
  expect(await host.evaluate((element) => element.shadowRoot)).toBeNull();
});

test("loads the toolbar under strict external-style CSP", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/demos/csp.html?debug=1");
  await page.getByRole("button", { name: "打开工具" }).click();
  await expect(page.getByRole("toolbar", { name: "无障碍工具栏" })).toBeVisible();
  const target = page.getByRole("link", { name: "返回完整演示" });
  await target.focus();
  await expect(target).toHaveCSS("outline-color", "rgb(255, 184, 0)");
  await expect(target).toHaveCSS("outline-style", "solid");
  await expect(target).toHaveCSS("outline-width", "2px");
  await expect(
    page.locator("[data-a11y-tool-host] .a11y-focus-highlight"),
  ).toHaveCount(0);
  expect(errors.filter((message) => message.includes("Content Security Policy"))).toEqual([]);
});

test("honors disabled semantic auto-detection", async ({ page }) => {
  await page.goto("/demos/semantic-off.html?debug=1");
  await page.getByRole("button", { name: "打开工具" }).click();
  await page.getByRole("button", { name: "读屏专用" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const navigation = host.getByRole("button", { name: "导航区，共 0 个" });
  await expect(navigation).toHaveAttribute("aria-disabled", "true");
  await expect(
    host.getByRole("button", { name: "服务区，共 1 个" }),
  ).toBeVisible();
  await navigation.focus();
  await page.keyboard.press("Alt+Shift+Digit2");
  await expect(navigation).toBeFocused();
  await expect(host.locator("[data-region-current]")).toHaveCount(0);
  await expect(host.locator('[aria-current="location"]')).toHaveCount(0);
  await expect(navigation.locator("[data-region-count]")).toHaveText("0");
});

test("adds no serious or critical axe violations", async ({ page }) => {
  await page.goto("/demos/semantic-off.html?debug=1");
  await page.getByRole("button", { name: "打开工具" }).click();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const severe = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(severe).toEqual([]);
});
