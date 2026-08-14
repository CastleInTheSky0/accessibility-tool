import { expect, test, type Page } from "@playwright/test";

interface CapturedSpeech {
  text: string;
  lang: string;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?debug=1");
});

test("applies explicit, ancestor, document and saved-language priority dynamically", async ({
  page,
}) => {
  await page.evaluate(() => {
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
          isPinned: false,
          isReadScreen: false,
          preferredLanguage: "fr_fr",
        },
      }),
    );
    document.documentElement.lang = "ko-KR";
    const parent = document.createElement("section");
    parent.id = "language-parent";
    parent.lang = "ja-JP";
    parent.innerHTML =
      '<button id="language-target" lang="en_US">Hello world</button>';
    document.body.append(parent);

    const spoken: CapturedSpeech[] = [];
    (window as typeof window & { __a11yLanguageSpoken: CapturedSpeech[] })
      .__a11yLanguageSpoken = spoken;
    window.AccessibilityTool.configure({
      speech: {
        adapter: {
          isSupported: () => true,
          speak: (text, options) => {
            spoken.push({ text, lang: options.lang });
            options.onStart?.();
            options.onEnd?.();
          },
          cancel: () => undefined,
        },
      },
    });
  });

  await enableReading(page);
  const target = page.locator("#language-target");

  await target.focus();
  await expectLastLanguage(page, "en-US");

  await page.evaluate(() => {
    document.getElementById("language-target")?.removeAttribute("lang");
  });
  await refocus(target);
  await expectLastLanguage(page, "ja-JP");

  await page.evaluate(() => {
    document.getElementById("language-parent")?.removeAttribute("lang");
  });
  await refocus(target);
  await expectLastLanguage(page, "ko-KR");

  await page.evaluate(() => {
    document.documentElement.removeAttribute("lang");
  });
  await refocus(target);
  await expectLastLanguage(page, "fr-FR");
});

test("detects local scripts and respects Shadow DOM and iframe language contexts", async ({
  page,
}) => {
  await page.evaluate(() => {
    document.documentElement.removeAttribute("lang");
    const fixture = document.createElement("section");
    fixture.innerHTML = `
      <button id="english-language">Hello world</button>
      <button id="chinese-language">这是中文内容</button>
      <button id="mixed-language">中文AB</button>
    `;
    document.body.append(fixture);

    const shadowHost = document.createElement("div");
    shadowHost.id = "language-shadow-host";
    shadowHost.lang = "ko_kr";
    document.body.append(shadowHost);
    shadowHost.attachShadow({ mode: "open" }).innerHTML =
      '<button id="shadow-language">Hello from shadow</button>';

    const frame = document.createElement("iframe");
    frame.id = "language-frame";
    frame.srcdoc =
      '<!doctype html><html lang="ja-JP"><body><button id="frame-language">Hello from frame</button></body></html>';
    document.body.append(frame);

    const spoken: CapturedSpeech[] = [];
    (window as typeof window & { __a11yLanguageSpoken: CapturedSpeech[] })
      .__a11yLanguageSpoken = spoken;
    window.AccessibilityTool.configure({
      locale: "de-DE",
      speech: {
        adapter: {
          isSupported: () => true,
          speak: (text, options) => {
            spoken.push({ text, lang: options.lang });
            options.onStart?.();
            options.onEnd?.();
          },
          cancel: () => undefined,
        },
      },
    });
  });
  await page
    .frameLocator("#language-frame")
    .locator("#frame-language")
    .waitFor();
  await enableReading(page);

  await page.locator("#english-language").focus();
  await expectLastLanguage(page, "en-US");

  await page.locator("#chinese-language").focus();
  await expectLastLanguage(page, "zh-CN");

  await page.locator("#mixed-language").focus();
  await expectLastLanguage(page, "de-DE");

  await page.locator("#language-shadow-host").locator("button").focus();
  await expectLastLanguage(page, "ko-KR");

  await page
    .frameLocator("#language-frame")
    .locator("#frame-language")
    .focus();
  await expectLastLanguage(page, "ja-JP");
});

async function enableReading(page: Page): Promise<void> {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  await host.locator('[data-action="reading"]').click();
  await page.evaluate(() => {
    (
      window as typeof window & { __a11yLanguageSpoken: CapturedSpeech[] }
    ).__a11yLanguageSpoken.length = 0;
  });
}

async function refocus(target: ReturnType<Page["locator"]>): Promise<void> {
  await target.evaluate((element) => (element as HTMLElement).blur());
  await target.focus();
}

async function expectLastLanguage(
  page: Page,
  expectedLanguage: string,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as typeof window & { __a11yLanguageSpoken: CapturedSpeech[] }
        ).__a11yLanguageSpoken.at(-1)?.lang,
      ),
    )
    .toBe(expectedLanguage);
}
