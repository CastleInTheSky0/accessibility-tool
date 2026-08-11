import { expect, test, type Page } from "@playwright/test";
import type { SpeechRequestOptions } from "../../src/types";

interface ContinuousFixtureEvent {
  type: string;
  state?: string;
  reason?: string;
  scope?: string;
  index?: number;
  count?: number;
  textLength?: number;
}

interface ContinuousFixtureRequest {
  text: string;
  lang: string;
  rate: number;
}

interface ContinuousReadingFixture {
  cancelCount: number;
  events: ContinuousFixtureEvent[];
  spoken: ContinuousFixtureRequest[];
  finish(index: number): void;
}

declare global {
  interface Window {
    __continuousReadingFixture: ContinuousReadingFixture;
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?debug=1");
});

test("runs one keyboard-operable session across both toolbar modes without moving page focus", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/favicon.svg") {
      requests.push(request.url());
    }
  });
  await installContinuousFixture(
    page,
    `
      <p id="continuous-before">第一段</p>
      <p id="continuous-start" tabindex="-1">从这里开始</p>
      <label for="continuous-input">账户</label>
      <input id="continuous-input" value="private-value" placeholder="请输入账户" aria-describedby="continuous-help">
      <span id="continuous-help">仅用于登录</span>
      <p id="continuous-last">最后一段</p>
      <p data-a11y-sensitive>never-speak-this</p>
    `,
  );

  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  await page.locator("#continuous-start").focus();
  await page.keyboard.press("Alt+Shift+A");
  await page.evaluate(() => {
    window.__continuousReadingFixture.events.length = 0;
  });

  const mainEntry = host.locator(
    '[data-mode="main"] [data-action="continuousReading"]',
  );
  await mainEntry.click();
  const panel = host.locator(".a11y-continuous-reading");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("role", "dialog");
  await panel.getByRole("button", { name: "开始连续朗读" }).click();
  await expect
    .poll(() => page.evaluate(() => window.AccessibilityTool.getState()))
    .toMatchObject({
      readingEnabled: true,
      continuousReadingState: "playing",
    });
  await expect(mainEntry).toHaveAttribute(
    "data-icon-state",
    "continuous-playing",
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__continuousReadingFixture.spoken[0] ?? null),
    )
    .toMatchObject({ text: "文本：从这里开始", rate: 1 });
  await expect(page.locator("#continuous-start")).not.toBeFocused();
  await expect(panel.getByRole("button", { name: "开始连续朗读" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(mainEntry).toBeFocused();
  expect(
    await page.evaluate(
      () => window.AccessibilityTool.getState().continuousReadingState,
    ),
  ).toBe("playing");

  await host
    .locator('[data-mode="main"] [data-action="readScreen"]')
    .click();
  expect(
    await page.evaluate(
      () => window.AccessibilityTool.getState().continuousReadingState,
    ),
  ).toBe("playing");
  const screenEntry = host.locator(
    '[data-mode="screen"] [data-action="continuousReading"]',
  );
  await expect(screenEntry.locator("[data-control-meta]")).toHaveText("朗读中");

  await page.evaluate(() => {
    window.__continuousReadingFixture.finish(0);
  });
  await expect
    .poll(() => page.evaluate(() => window.__continuousReadingFixture.spoken[1]))
    .toMatchObject({
      text: "输入框：账户 请输入账户 仅用于登录",
    });
  const allSpeechAfterInput = await page.evaluate(() =>
    window.__continuousReadingFixture.spoken.map(({ text }) => text).join(" "),
  );
  expect(allSpeechAfterInput).not.toContain("private-value");
  expect(allSpeechAfterInput).not.toContain("never-speak-this");

  await page.locator("#continuous-last").evaluate((element) => {
    element.textContent = "动态更新后的最后一段";
  });
  await page.evaluate(() => {
    window.__continuousReadingFixture.finish(1);
  });
  await expect
    .poll(() => page.evaluate(() => window.__continuousReadingFixture.spoken[2]))
    .toMatchObject({ text: "文本：动态更新后的最后一段" });

  await screenEntry.click();
  await panel.getByRole("button", { name: "暂停连续朗读" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.AccessibilityTool.getState().continuousReadingState),
    )
    .toBe("paused");
  await expect(screenEntry.locator("[data-control-meta]")).toHaveText("已暂停");
  await panel.getByRole("button", { name: "继续连续朗读" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__continuousReadingFixture.spoken[3]))
    .toMatchObject({ text: "文本：动态更新后的最后一段" });
  await panel.getByRole("button", { name: "停止连续朗读" }).click();
  await expect
    .poll(() => page.evaluate(() => window.AccessibilityTool.getState()))
    .toMatchObject({
      readingEnabled: true,
      continuousReadingState: "idle",
    });

  const publicEvents = await page.evaluate(
    () => window.__continuousReadingFixture.events,
  );
  expect(
    publicEvents
      .filter(({ type }) => type === "continuousreadingsegmentchange")
      .map(({ index }) => index),
  ).toEqual([2, 3, 4]);
  expect(publicEvents.at(-1)).toMatchObject({
    type: "continuousreadingstop",
    reason: "stopped",
  });
  expect(JSON.stringify(publicEvents)).not.toContain("private-value");
  expect(requests).toEqual([]);
});

test("invalidates stale requests on routes and enforces modal boundaries", async ({
  page,
}) => {
  await installContinuousFixture(page, '<p id="route-copy">背景正文</p>');
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const entry = host.locator(
    '[data-mode="main"] [data-action="continuousReading"]',
  );
  await entry.click();
  const panel = host.locator(".a11y-continuous-reading");
  await panel.getByRole("button", { name: "开始连续朗读" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__continuousReadingFixture.spoken.length))
    .toBe(1);

  await page.evaluate(() => history.pushState({}, "", "#continuous-route"));
  await expect
    .poll(() =>
      page.evaluate(() => window.AccessibilityTool.getState().continuousReadingState),
    )
    .toBe("idle");
  await page.evaluate(() => window.__continuousReadingFixture.finish(0));
  expect(
    await page.evaluate(() => window.__continuousReadingFixture.spoken.length),
  ).toBe(1);

  await panel.getByRole("button", { name: "开始连续朗读" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__continuousReadingFixture.spoken.length))
    .toBe(2);
  await page.evaluate(() => {
    const dialog = document.createElement("div");
    dialog.id = "continuous-modal";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = "<p>弹窗正文</p>";
    document.body.append(dialog);
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.AccessibilityTool.getState().continuousReadingState),
    )
    .toBe("idle");

  await panel.getByRole("button", { name: "开始连续朗读" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__continuousReadingFixture.spoken.at(-1)))
    .toMatchObject({ text: "文本：弹窗正文" });
  await page.locator("#continuous-modal").evaluate((element) => element.remove());
  await expect
    .poll(() =>
      page.evaluate(() => window.AccessibilityTool.getState().continuousReadingState),
    )
    .toBe("idle");

  const reasons = await page.evaluate(() =>
    window.__continuousReadingFixture.events
      .filter(({ type }) => type === "continuousreadingstop")
      .map(({ reason }) => reason),
  );
  expect(reasons).toEqual(["route", "dialog", "dialog"]);
});

async function installContinuousFixture(
  page: Page,
  markup: string,
): Promise<void> {
  await page.evaluate((fixtureMarkup) => {
    for (const child of Array.from(document.body.children)) {
      if (child instanceof HTMLElement) {
        child.setAttribute("data-a11y-ignore", "");
      }
    }
    const fixtureRoot = document.createElement("main");
    fixtureRoot.id = "continuous-reading-fixture";
    fixtureRoot.innerHTML = fixtureMarkup;
    document.body.prepend(fixtureRoot);

    const pending: SpeechRequestOptions[] = [];
    window.__continuousReadingFixture = {
      cancelCount: 0,
      events: [],
      spoken: [],
      finish(index) {
        pending[index]?.onEnd?.();
      },
    };
    const fixture = window.__continuousReadingFixture;
    window.AccessibilityTool.configure({
      speech: {
        adapter: {
          isSupported: () => true,
          speak: (text, options) => {
            fixture.spoken.push({
              text,
              lang: options.lang,
              rate: options.rate,
            });
            pending.push(options);
            options.onStart?.();
          },
          cancel: () => {
            fixture.cancelCount += 1;
          },
        },
      },
    });
    const capture = (type: string) => (payload: unknown) => {
      const detail =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : {};
      fixture.events.push({ type, ...detail });
    };
    for (const type of [
      "continuousreadingstart",
      "continuousreadingsegmentchange",
      "continuousreadingpause",
      "continuousreadingresume",
      "continuousreadingstop",
    ] as const) {
      window.AccessibilityTool.on(type, capture(type));
    }
  }, markup);
}
