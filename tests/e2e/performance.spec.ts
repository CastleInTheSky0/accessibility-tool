import { expect, test } from "@playwright/test";

test("scans a representative 2000-node page within 100ms", async (
  { page },
  testInfo,
) => {
  test.skip(
    !["chrome", "edge"].includes(testInfo.project.name),
    "The release performance target is measured in the supported Windows Chromium browsers.",
  );

  await page.goto("/?debug=1");
  await page.evaluate(() => {
    const fixture = document.createElement("section");
    fixture.id = "region-scan-performance-fixture";
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 2000; index += 1) {
      const element = document.createElement("div");
      element.textContent = `性能节点 ${index}`;
      if (index % 40 === 0) {
        element.dataset.a11yRegion = String((index / 40) % 6 + 1);
        element.dataset.a11yLabel = `性能区域 ${index}`;
      }
      fragment.append(element);
    }
    fixture.append(fragment);
    document.body.append(fixture);
  });

  const scanMessage = page.waitForEvent("console", {
    predicate: (message) =>
      /\[AccessibilityTool\] 区域扫描完成：\d+ 个，[\d.]+ms。/.test(
        message.text(),
      ),
  });
  await page.getByRole("button", { name: "打开无障碍工具" }).click();

  const match = (await scanMessage)
    .text()
    .match(/区域扫描完成：(\d+) 个，([\d.]+)ms/);
  expect(match).not.toBeNull();
  const regionCount = Number(match?.[1]);
  const elapsedMs = Number(match?.[2]);
  expect(regionCount).toBeGreaterThanOrEqual(50);
  expect(elapsedMs).toBeLessThanOrEqual(100);
});
