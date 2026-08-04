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

test("silently restores pinned read-screen mode and schedules its collapse", async ({
  page,
}) => {
  await page.addInitScript(() => {
    type RestoreProbeWindow = Window & {
      __a11yRestoreCollapseStates?: Array<{
        collapsed: boolean;
        timestamp: number;
      }>;
    };
    const states: Array<{ collapsed: boolean; timestamp: number }> = [];
    (window as RestoreProbeWindow).__a11yRestoreCollapseStates = states;
    const observedHosts = new WeakSet<Element>();
    const observeToolbarHost = (): void => {
      const host = document.querySelector<HTMLElement>(
        "[data-a11y-tool-host]",
      );
      if (!host || observedHosts.has(host)) {
        return;
      }
      observedHosts.add(host);
      const record = (): void => {
        states.push({
          collapsed: host.hasAttribute("data-a11y-tool-collapsed"),
          timestamp: performance.now(),
        });
      };
      record();
      new MutationObserver(record).observe(host, {
        attributeFilter: ["data-a11y-tool-collapsed"],
        attributes: true,
      });
    };
    new MutationObserver(observeToolbarHost).observe(document, {
      childList: true,
      subtree: true,
    });

    localStorage.setItem(
      "accessibility-tool:preferences",
      JSON.stringify({
        version: 1,
        preferences: {
          readingEnabled: false,
          speechRate: 1,
          colorScheme: "original",
          zoom: 1,
          largeCursor: false,
          crosshair: false,
          isPinned: true,
          isReadScreen: true,
        },
      }),
    );
    localStorage.setItem(
      "accessibility-tool:preferences:open-state",
      JSON.stringify({ version: 1, isOpen: true }),
    );
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        document.querySelector<HTMLElement>("[data-open-tool]")?.focus();
      },
      { once: true },
    );
  });
  await page.mouse.move(500, 400);
  await page.goto("/?debug=1");

  const host = page.locator("[data-a11y-tool-host]");
  const trigger = page.locator("[data-open-tool]").first();
  const screenGroup = host.locator('[data-mode="screen"]');
  await expect(host).toBeVisible();
  await expect(screenGroup).toHaveJSProperty("hidden", false);
  await expect(trigger).toBeFocused();
  await expect(host.locator('[role="status"]')).not.toContainText(
    "无障碍工具栏已打开",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & {
            __a11yRestoreCollapseStates?: Array<{ collapsed: boolean }>;
          }
        ).__a11yRestoreCollapseStates?.some((state) => !state.collapsed),
      ),
    )
    .toBe(true);

  await expect(host).toHaveAttribute("data-a11y-tool-collapsed", "", {
    timeout: 8000,
  });
  await expect(trigger).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.AccessibilityTool.getState()))
    .toMatchObject({
      isCollapsed: true,
      isPinned: true,
      isReadScreen: true,
    });
  const scheduledDelay = await page.evaluate(() => {
    const states = (
      window as Window & {
        __a11yRestoreCollapseStates?: Array<{
          collapsed: boolean;
          timestamp: number;
        }>;
      }
    ).__a11yRestoreCollapseStates;
    const expandedIndex = states?.findIndex((state) => !state.collapsed) ?? -1;
    const collapsed = states?.find(
      (state, index) => index > expandedIndex && state.collapsed,
    );
    const expanded =
      expandedIndex >= 0 ? states?.[expandedIndex] : undefined;
    if (!expanded || !collapsed) {
      throw new Error("Restored toolbar collapse timeline was not captured.");
    }
    return collapsed.timestamp - expanded.timestamp;
  });
  expect(scheduledDelay).toBeGreaterThanOrEqual(1400);

  await page.keyboard.press("Alt+Shift+KeyA");
  await expect(host).not.toHaveAttribute("data-a11y-tool-collapsed", "");
  await expect(screenGroup).toHaveJSProperty("hidden", false);
  await expect(
    screenGroup.locator("[data-toolbar-item]:focus"),
  ).toHaveCount(1);
});
