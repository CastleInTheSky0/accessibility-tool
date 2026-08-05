import { expect, test, type Locator } from "@playwright/test";
import type { RegistrationHandle } from "../../src/types";

type RegistrationTestWindow = Window & {
  __regionRegistrations?: RegistrationHandle[];
  __tabRegistrations?: RegistrationHandle[];
  __tabHostEventCount?: number;
};

test("registers regions before and after open and restores each handle", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") {
      warnings.push(message.text());
    }
  });
  await page.goto("/?debug=1");
  await page.evaluate(() => {
    const first = document.createElement("section");
    first.id = "api-region-before-open";
    first.setAttribute("data-a11y-region", "");
    first.setAttribute("data-a11y-label", "原始短名");
    first.textContent = "调用前区域";
    const multiA = document.createElement("section");
    const multiB = document.createElement("section");
    multiA.className = "api-multi-region";
    multiB.className = "api-multi-region";
    document.body.append(first, multiA, multiB);

    const registration = window.AccessibilityTool.registerRegions([
      {
        target: "#api-region-before-open",
        region: 4,
        label: "API 服务",
      },
      { target: ".api-multi-region", region: 3 },
      {
        target: "#api-region-before-open",
        region: 9 as 1,
      },
    ]);
    (window as RegistrationTestWindow).__regionRegistrations = [registration];
  });

  await expect(page.locator("#api-region-before-open")).toHaveAttribute(
    "data-a11y-region",
    "4",
  );
  await expect(page.locator("#api-region-before-open")).toHaveAttribute(
    "data-a11y-label",
    "API 服务",
  );
  await expect(page.locator(".api-multi-region")).toHaveCount(2);
  await expect(page.locator(".api-multi-region").first()).toHaveAttribute(
    "data-a11y-region",
    "3",
  );

  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const liveRegion = page
    .locator("[data-a11y-tool-host]")
    .getByRole("status");
  const beforeOpenRegion = page.locator("#api-region-before-open");
  await expect(beforeOpenRegion).toHaveAttribute("tabindex", "0");
  await beforeOpenRegion.focus();
  await expect(liveRegion).toHaveText(
    /提示：您已进入API 服务服务区，按下 Tab 键浏览信息；第 \d+ 个，共 \d+ 个/,
  );

  await page.evaluate(() => {
    const late = document.createElement("section");
    late.id = "api-region-after-open";
    late.textContent = "调用后区域";
    document.body.append(late);
    const registration = window.AccessibilityTool.registerRegions([
      { target: late, region: 5, label: "即时列表" },
    ]);
    (window as RegistrationTestWindow).__regionRegistrations?.push(
      registration,
    );
  });
  const afterOpenRegion = page.locator("#api-region-after-open");
  await expect(afterOpenRegion).toHaveAttribute("data-a11y-region", "5");
  await expect(afterOpenRegion).toHaveAttribute("tabindex", "0");
  await afterOpenRegion.focus();
  await expect(liveRegion).toHaveText(
    /提示：您已进入即时列表列表区，按下 Tab 键浏览信息；第 \d+ 个，共 \d+ 个/,
  );

  await page.evaluate(() => {
    const handles = (window as RegistrationTestWindow).__regionRegistrations;
    handles?.[1]?.dispose();
    handles?.[1]?.dispose();
  });
  await expect(afterOpenRegion).not.toHaveAttribute("data-a11y-region", /.+/);
  await expect(afterOpenRegion).not.toHaveAttribute("tabindex", /.+/);

  await page.evaluate(() => {
    (window as RegistrationTestWindow).__regionRegistrations?.[0]?.dispose();
  });
  await expect(beforeOpenRegion).toHaveAttribute("data-a11y-region", "");
  await expect(beforeOpenRegion).toHaveAttribute(
    "data-a11y-label",
    "原始短名",
  );
  await expect(beforeOpenRegion).not.toHaveAttribute("tabindex", /.+/);
  await expect(page.locator(".api-multi-region").first()).not.toHaveAttribute(
    "data-a11y-region",
    /.+/,
  );
  expect(warnings.some((message) => message.includes("region 无效：9"))).toBe(
    true,
  );
  await page.evaluate(() => window.AccessibilityTool.destroy());
});

test("registered tabs use one existing behavior pipeline and overlap safely", async ({
  page,
}) => {
  await page.goto("/?debug=1");
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const serviceControl = host.locator('[data-action="region:service"]');
  const baselineCount = await getRegionCount(serviceControl);

  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent =
      '[role="tabpanel"][data-a11y-hidden] { display: none !important; }';
    const list = document.createElement("div");
    list.dataset.apiTablist = "";
    list.innerHTML = `
      <button data-api-tab="overview">概览</button>
      <button data-api-tab="policy">政策</button>
    `;
    const overviewPanel = document.createElement("section");
    overviewPanel.dataset.apiPanel = "overview";
    overviewPanel.innerHTML = '<a href="#api-overview">概览详情</a>';
    const policyPanel = document.createElement("section");
    policyPanel.dataset.apiPanel = "policy";
    policyPanel.innerHTML = '<a href="#api-policy">政策详情</a>';
    document.head.append(style);
    document.body.append(list, overviewPanel, policyPanel);

    const overviewTab = list.querySelector<HTMLElement>(
      '[data-api-tab="overview"]',
    );
    const policyTab = list.querySelector<HTMLElement>(
      '[data-api-tab="policy"]',
    );
    if (!overviewTab || !policyTab) {
      throw new Error("Missing API tab fixture");
    }
    const activate = (tab: HTMLElement): void => {
      (window as RegistrationTestWindow).__tabHostEventCount =
        ((window as RegistrationTestWindow).__tabHostEventCount ?? 0) + 1;
      overviewPanel.toggleAttribute("data-a11y-hidden", tab !== overviewTab);
      policyPanel.toggleAttribute("data-a11y-hidden", tab !== policyTab);
    };
    overviewTab.addEventListener("click", () => activate(overviewTab));
    policyTab.addEventListener("click", () => activate(policyTab));

    const createRegistration = (): RegistrationHandle =>
      window.AccessibilityTool.registerTabs([
        {
          tab: "[data-api-tab]",
          panel: "[data-api-panel]",
          region: 4,
        },
      ]);
    (window as RegistrationTestWindow).__tabRegistrations = [
      createRegistration(),
      createRegistration(),
    ];
    (window as RegistrationTestWindow).__tabHostEventCount = 0;
  });

  const list = page.locator("[data-api-tablist]");
  const overviewTab = page.locator('[data-api-tab="overview"]');
  const policyTab = page.locator('[data-api-tab="policy"]');
  const overviewPanel = page.locator('[data-api-panel="overview"]');
  const policyPanel = page.locator('[data-api-panel="policy"]');
  const liveRegion = host.getByRole("status");
  const generatedOverviewTabId = await overviewTab.getAttribute("id");
  const generatedPolicyPanelId = await policyPanel.getAttribute("id");

  await expect(list).toHaveAttribute("role", "tablist");
  await expect(overviewTab).toHaveAttribute("role", "tab");
  await expect(policyTab).toHaveAttribute("role", "tab");
  await expect(overviewPanel).toHaveAttribute("role", "tabpanel");
  await expect(policyPanel).toHaveAttribute("role", "tabpanel");
  expect(generatedOverviewTabId).toMatch(
    /^accessibility-tool-registered-tab-/,
  );
  expect(generatedPolicyPanelId).toMatch(
    /^accessibility-tool-registered-panel-/,
  );
  await expect(policyTab).toHaveAttribute(
    "aria-controls",
    generatedPolicyPanelId ?? "",
  );
  await expect(policyPanel).toHaveAttribute(
    "aria-labelledby",
    await policyTab.getAttribute("id") ?? "",
  );
  await expect(overviewTab).toHaveAttribute("data-a11y-activation", "automatic");
  await expect(overviewTab).toHaveAttribute("data-a11y-trigger-event", "click");
  await expect(list).not.toHaveAttribute("data-a11y-activation", /.+/);
  await expect(policyPanel).toHaveAttribute("data-a11y-hidden", "");
  await expect(policyPanel).not.toHaveAttribute("hidden", /.+/);
  expect(await getRegionCount(serviceControl)).toBe(baselineCount + 2);

  await overviewTab.focus();
  await expect(liveRegion).toHaveText(
    "Tab，概览，服务区，当前有浮动窗口，按 ALT+下键进入窗口",
  );
  await page.keyboard.press("Tab");
  await expect(policyTab).toBeFocused();
  await expect(liveRegion).toHaveText(
    "Tab，政策，服务区，当前有浮动窗口，按 ALT+下键进入窗口",
  );
  await expect(policyTab).toHaveAttribute("aria-selected", "true");
  await expect(policyPanel).not.toHaveAttribute("data-a11y-hidden", "");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as RegistrationTestWindow).__tabHostEventCount ?? 0,
      ),
    )
    .toBe(1);

  await page.keyboard.press("Shift+Tab");
  await expect(overviewTab).toBeFocused();
  await expect(liveRegion).toHaveText(
    "Tab，概览，服务区，当前有浮动窗口，按 ALT+下键进入窗口",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as RegistrationTestWindow).__tabHostEventCount ?? 0,
      ),
    )
    .toBe(2);
  await page.keyboard.press("Tab");
  await expect(policyTab).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as RegistrationTestWindow).__tabHostEventCount ?? 0,
      ),
    )
    .toBe(3);

  await page.keyboard.press("Alt+ArrowDown");
  await expect(policyPanel).toBeFocused();
  await expect(liveRegion).toHaveText(
    "您已进入政策服务区标签面板，按 Tab 键遍历信息，按 Esc 键退出面板并返回政策选项",
  );
  await page.keyboard.press("Escape");
  await expect(policyTab).toBeFocused();
  await expect(liveRegion).toHaveText("已返回政策选项");

  await overviewTab.click();
  await expect(policyPanel).toHaveAttribute("data-a11y-hidden", "");
  await host.getByRole("button", { name: "读屏专用" }).click();
  const registeredCount = await getRegionCount(serviceControl);
  let reachedPolicyPanel = false;
  for (let index = 0; index < registeredCount * 2; index += 1) {
    await page.keyboard.press("Alt+Shift+Digit4");
    await page.waitForTimeout(50);
    reachedPolicyPanel = await policyPanel.evaluate(
      (element) => element.ownerDocument.activeElement === element,
    );
    if (reachedPolicyPanel) {
      break;
    }
  }
  expect(reachedPolicyPanel).toBe(true);
  await expect(policyPanel).toBeFocused();
  await expect(policyPanel).not.toHaveAttribute("data-a11y-hidden", "");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as RegistrationTestWindow).__tabHostEventCount ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(5);

  await page.evaluate(() => {
    (window as RegistrationTestWindow).__tabRegistrations?.[0]?.dispose();
  });
  await expect(overviewTab).toHaveAttribute("role", "tab");
  await expect(overviewTab).toHaveAttribute("id", generatedOverviewTabId ?? "");
  await expect(policyPanel).toHaveAttribute("id", generatedPolicyPanelId ?? "");
  expect(await getRegionCount(serviceControl)).toBe(baselineCount + 2);

  await page.evaluate(() => {
    const handle = (window as RegistrationTestWindow).__tabRegistrations?.[1];
    handle?.dispose();
    handle?.dispose();
  });
  await expect(list).not.toHaveAttribute("role", /.+/);
  await expect(overviewTab).not.toHaveAttribute("role", /.+/);
  await expect(policyPanel).not.toHaveAttribute("role", /.+/);
  await expect(overviewTab).not.toHaveAttribute("id", /.+/);
  await expect(policyPanel).not.toHaveAttribute("id", /.+/);
  await expect(overviewTab).not.toHaveAttribute("aria-controls", /.+/);
  await expect(policyPanel).not.toHaveAttribute("aria-labelledby", /.+/);
  await expect(overviewTab).not.toHaveAttribute("data-a11y-region", /.+/);
  await expect(policyPanel).not.toHaveAttribute("data-a11y-region", /.+/);
  await expect(policyPanel).not.toHaveAttribute("data-a11y-hidden", /.+/);
  await expect(policyPanel).not.toHaveAttribute("hidden", /.+/);
  expect(await getRegionCount(serviceControl)).toBe(baselineCount);

  await page.evaluate(() => window.AccessibilityTool.destroy());
});

test("one selector config keeps repeated tab components independent", async ({
  page,
}) => {
  await page.goto("/?debug=1");
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  await page.evaluate(() => {
    const fixture = document.createElement("section");
    fixture.id = "multi-tab-registration-fixture";
    fixture.innerHTML = `
      <div class="api-view" data-api-view="news">
        <div class="api-tab-list">
          <button class="api-shared-tab">要闻动态</button>
          <button class="api-shared-tab">今日常山</button>
        </div>
        <section class="api-shared-panel">要闻动态内容</section>
        <section class="api-shared-panel">今日常山内容</section>
      </div>
      <div class="api-view" data-api-view="policy">
        <div class="api-tab-list">
          <button class="api-shared-tab">政策文件</button>
          <button class="api-shared-tab">政策解读</button>
        </div>
        <section class="api-shared-panel">政策文件内容</section>
        <section class="api-shared-panel">政策解读内容</section>
      </div>
    `;
    document.body.append(fixture);
    for (const view of fixture.querySelectorAll<HTMLElement>(".api-view")) {
      view.dataset.hostEventCount = "0";
      const tabs = Array.from(
        view.querySelectorAll<HTMLElement>(".api-shared-tab"),
      );
      const panels = Array.from(
        view.querySelectorAll<HTMLElement>(".api-shared-panel"),
      );
      tabs.forEach((tab, tabIndex) => {
        tab.addEventListener("click", () => {
          view.dataset.hostEventCount = String(
            Number(view.dataset.hostEventCount ?? 0) + 1,
          );
          panels.forEach((panel, panelIndex) => {
            panel.toggleAttribute("data-a11y-hidden", panelIndex !== tabIndex);
          });
        });
      });
    }
    (window as RegistrationTestWindow).__tabRegistrations = [
      window.AccessibilityTool.registerTabs([
        {
          tab: ".api-shared-tab",
          panel: ".api-shared-panel",
          region: 1,
        },
      ]),
    ];
  });

  const fixture = page.locator("#multi-tab-registration-fixture");
  const lists = fixture.locator(".api-tab-list");
  const tabs = fixture.locator(".api-shared-tab");
  const panels = fixture.locator(".api-shared-panel");
  await expect(lists).toHaveCount(2);
  await expect(lists.nth(0)).toHaveAttribute("role", "tablist");
  await expect(lists.nth(1)).toHaveAttribute("role", "tablist");
  await expect(tabs).toHaveCount(4);
  await expect(panels).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await expect(tabs.nth(index)).toHaveAttribute(
      "aria-controls",
      (await panels.nth(index).getAttribute("id")) ?? "",
    );
  }
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "false");
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(3)).toHaveAttribute("aria-selected", "false");

  await tabs.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "false");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(3)).toHaveAttribute("aria-selected", "false");
  await expect(fixture.locator('[data-api-view="news"]')).toHaveAttribute(
    "data-host-event-count",
    "1",
  );
  await expect(fixture.locator('[data-api-view="policy"]')).toHaveAttribute(
    "data-host-event-count",
    "0",
  );

  await page.evaluate(() => {
    (window as RegistrationTestWindow).__tabRegistrations?.[0]?.dispose();
  });
  await expect(lists.nth(0)).not.toHaveAttribute("role", /.+/);
  await expect(lists.nth(1)).not.toHaveAttribute("role", /.+/);
  await expect(tabs.nth(0)).not.toHaveAttribute("aria-controls", /.+/);
  await expect(panels.nth(0)).not.toHaveAttribute("aria-labelledby", /.+/);
  await page.evaluate(() => window.AccessibilityTool.destroy());
});

async function getRegionCount(control: Locator): Promise<number> {
  const label = await control.getAttribute("aria-label");
  const match = label?.match(/共 (\d+) 个/);
  if (!match?.[1]) {
    throw new Error(`Unexpected region label: ${label}`);
  }
  return Number(match[1]);
}
