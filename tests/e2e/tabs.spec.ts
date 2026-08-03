import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?debug=1");
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
});

test("tabs through automatic options and returns focus from the panel", async ({
  page,
}) => {
  const liveRegion = page
    .locator("[data-a11y-tool-host]")
    .getByRole("status");
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
  await expect(liveRegion).toHaveText(
    "Tab，概览，正文区，当前有浮动窗口，按 ALT+下键进入窗口",
  );
  await page.keyboard.press("Tab");
  await expect(protocol).toBeFocused();
  await expect(liveRegion).toHaveText(
    "Tab，属性协议，正文区，当前有浮动窗口，按 ALT+下键进入窗口",
  );
  await expect(protocol).toHaveAttribute("aria-selected", "true");
  await expect(protocolPanel).not.toHaveAttribute("data-a11y-hidden", "");
  await expect(overviewPanel).toHaveAttribute("data-a11y-hidden", "");
  await expect(protocolPanel).toHaveAttribute("aria-hidden", "false");
  await expect(overviewPanel).toHaveAttribute("aria-hidden", "true");
  await expect(protocolPanel).not.toHaveAttribute("hidden", "");
  await expect(protocolPanel).toBeVisible();

  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.getByRole("tabpanel", { name: "属性协议" })).toBeFocused();
  await expect(liveRegion).toHaveText(
    "您已进入属性协议正文区标签面板，按 Tab 键遍历信息，按 Esc 键退出面板并返回属性协议选项",
  );
  await page.keyboard.press("Escape");
  await expect(protocol).toBeFocused();
  await expect(liveRegion).toHaveText("已返回属性协议选项");

  await page.keyboard.press("Shift+Tab");
  await expect(overview).toBeFocused();
  await expect(liveRegion).toHaveText(
    "Tab，概览，正文区，当前有浮动窗口，按 ALT+下键进入窗口",
  );
  await expect(overview).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(protocol).toBeFocused();
  await expect(liveRegion).toHaveText(
    "Tab，属性协议，正文区，当前有浮动窗口，按 ALT+下键进入窗口",
  );
  await expect(protocol).toHaveAttribute("aria-selected", "true");
});

test("announces a static panel without adding descendant tab stops", async ({
  page,
}) => {
  const liveRegion = page
    .locator("[data-a11y-tool-host]")
    .getByRole("status");
  const tab = page.getByRole("tab", { name: "方案 A" });
  const panel = page.locator("#panel-manual-a");

  await tab.focus();
  await page.keyboard.press("Alt+ArrowDown");

  await expect(panel).toBeFocused();
  await expect(liveRegion).toHaveText(
    "您已进入方案 A正文区标签面板，当前面板暂无可通过 Tab 遍历的信息，按 Esc 键退出面板并返回方案 A选项",
  );
  await expect(panel.locator("[tabindex]")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(tab).toBeFocused();
  await expect(liveRegion).toHaveText("已返回方案 A选项");
});

test("uses scanned region categories in DOM, Shadow Root and same-origin iframe", async ({
  page,
}) => {
  const liveRegion = page
    .locator("[data-a11y-tool-host]")
    .getByRole("status");
  await page.evaluate(() => {
    const normal = document.createElement("section");
    normal.id = "speech-dom-region";
    normal.dataset.a11yRegion = "navigation";
    normal.innerHTML = `
      <div role="tablist"><button role="tab" aria-controls="speech-dom-panel">普通选项</button></div>
      <section id="speech-dom-panel" role="tabpanel">普通面板</section>
    `;
    document.body.append(normal);

    const shadowHost = document.createElement("section");
    shadowHost.id = "speech-shadow-host";
    shadowHost.dataset.a11yRegion = "service";
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `
      <div role="tablist"><button role="tab" aria-controls="speech-shadow-panel">影子选项</button></div>
      <section id="speech-shadow-panel" role="tabpanel">影子面板</section>
    `;
    document.body.append(shadowHost);

    const frame = document.createElement("iframe");
    frame.id = "speech-frame";
    frame.srcdoc = `<!doctype html><html><body>
      <section data-a11y-region="list">
        <div role="tablist"><button role="tab" aria-controls="speech-frame-panel">框架选项</button></div>
        <section id="speech-frame-panel" role="tabpanel">框架面板</section>
      </section>
    </body></html>`;
    document.body.append(frame);
  });

  const frameTab = page
    .frameLocator("#speech-frame")
    .getByRole("tab", { name: "框架选项" });
  await expect(frameTab).toBeVisible();
  await page.evaluate(() => window.AccessibilityTool.refresh());

  await page.getByRole("tab", { name: "普通选项" }).focus();
  await expect(liveRegion).toHaveText(
    "Tab，普通选项，导航区，当前有浮动窗口，按 ALT+下键进入窗口",
  );

  await page.getByRole("tab", { name: "影子选项" }).focus();
  await expect(liveRegion).toHaveText(
    "Tab，影子选项，服务区，当前有浮动窗口，按 ALT+下键进入窗口",
  );

  await frameTab.focus();
  await expect(liveRegion).toHaveText(
    "Tab，框架选项，列表区，当前有浮动窗口，按 ALT+下键进入窗口",
  );
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
