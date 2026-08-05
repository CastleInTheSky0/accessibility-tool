import { expect, test, type Page } from "@playwright/test";

interface FixtureVoiceInput {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
  default?: boolean;
}

interface CapturedUtterance {
  text: string;
  lang: string;
  rate: number;
  voiceURI: string | null;
  localService: boolean | null;
  objectId: string | null;
}

interface VoiceFixtureApi {
  cancelCount: number;
  spoken: CapturedUtterance[];
  setVoices(voices: FixtureVoiceInput[]): void;
  emitVoicesChanged(): void;
}

declare global {
  interface Window {
    __a11yVoiceFixture: VoiceFixtureApi;
  }
}

test.beforeEach(async ({ page }) => {
  await installVoiceFixture(page);
  await page.goto("/?debug=1");
});

test("refreshes an initially empty local catalog, previews the selected current object and restores it after reload", async ({
  page,
}) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const voiceControl = host.locator(
    '[data-mode="main"] [data-action="voiceSelection"]',
  );
  await expect(voiceControl).toHaveAttribute("aria-haspopup", "dialog");
  await voiceControl.click();

  const dialog = host.locator(".a11y-voice-settings");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog.locator(".a11y-voice-settings__status")).toContainText(
    "正在载入",
  );
  await expect(dialog.getByRole("radio")).toHaveCount(1);

  await setFixtureVoices(page, [
    {
      name: "本地女声",
      lang: "zh-CN",
      voiceURI: "local:woman",
      localService: true,
    },
    {
      name: "本地男声",
      lang: "zh-CN",
      voiceURI: "local:man",
      localService: true,
      default: true,
    },
    {
      name: "远程音色",
      lang: "zh-CN",
      voiceURI: "remote:voice",
      localService: false,
      default: true,
    },
    {
      name: "English Local",
      lang: "en-US",
      voiceURI: "local:english",
      localService: true,
    },
  ]);

  await expect(dialog.getByRole("radio")).toHaveCount(3);
  await expect(dialog).toContainText("本地女声");
  await expect(dialog).toContainText("本地男声");
  await expect(dialog).not.toContainText("远程音色");
  await expect(dialog).not.toContainText("English Local");

  await dialog.getByRole("radio", { name: /本地女声/ }).check();
  await expect(voiceControl.locator("[data-control-meta]")).toHaveText(
    "本地女声",
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const payload = JSON.parse(
          localStorage.getItem("accessibility-tool:preferences") ?? "null",
        ) as {
          preferences?: {
            voice?: { voiceURI?: string; name?: string; lang?: string };
          };
        } | null;
        return payload?.preferences?.voice ?? null;
      }),
    )
    .toEqual({
      voiceURI: "local:woman",
      name: "本地女声",
      lang: "zh-CN",
    });

  const preview = dialog.getByRole("button", { name: "试听当前音色" });
  await expect(preview).toBeEnabled();
  await preview.click();
  await expectLastSpoken(page, {
    voiceURI: "local:woman",
    localService: true,
    lang: "zh-CN",
    rate: 1,
  });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(voiceControl).toBeFocused();

  await page.reload();
  await expect(host).toBeVisible();
  await expect(voiceControl.locator("[data-control-meta]")).toHaveText(
    "本地女声",
  );
  await voiceControl.click();
  await expect(dialog.getByRole("radio", { name: /本地女声/ })).toBeChecked();
  await preview.click();
  await expect
    .poll(() => page.evaluate(() => window.__a11yVoiceFixture.spoken.length))
    .toBe(1);
  const firstObjectId = await page.evaluate(
    () => window.__a11yVoiceFixture.spoken.at(-1)?.objectId ?? null,
  );

  await setFixtureVoices(page, [
    {
      name: "本地女声",
      lang: "zh-CN",
      voiceURI: "local:woman",
      localService: true,
    },
    {
      name: "本地男声",
      lang: "zh-CN",
      voiceURI: "local:man",
      localService: true,
      default: true,
    },
  ]);
  await preview.click();
  await expect
    .poll(() => page.evaluate(() => window.__a11yVoiceFixture.spoken.length))
    .toBe(2);
  const replacement = await page.evaluate(
    () => window.__a11yVoiceFixture.spoken.at(-1) ?? null,
  );
  expect(replacement).toMatchObject({
    voiceURI: "local:woman",
    localService: true,
  });
  expect(replacement?.objectId).not.toBe(firstObjectId);
});

test("keeps the 14-control toolbar on one row with a centered 1280px maximum frame", async ({
  page,
}) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const toolbar = host.locator(".a11y-toolbar");

  for (const width of [2048, 1440, 1280, 1200, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    const metrics = await toolbar.evaluate((element) => {
      const outer = element.getBoundingClientRect();
      const frame = element
        .querySelector<HTMLElement>(".a11y-toolbar__frame")
        ?.getBoundingClientRect();
      const controls = Array.from(
        element.querySelectorAll<HTMLElement>(
          '[data-mode="main"] [data-toolbar-item]',
        ),
      );
      const rects = controls.map((control) => control.getBoundingClientRect());
      return {
        actions: controls.map((control) => control.dataset.action),
        clipped: rects.some(
          (rect) =>
            rect.left < outer.left - 0.5 ||
            rect.right > outer.right + 0.5 ||
            rect.top < outer.top - 0.5 ||
            rect.bottom > outer.bottom + 0.5,
        ),
        controlCount: controls.length,
        frameCenterDelta: frame
          ? Math.abs(
              frame.left + frame.width / 2 -
                (outer.left + outer.width / 2),
            )
          : Number.POSITIVE_INFINITY,
        frameWidth: frame?.width ?? 0,
        minimumControlWidth: Math.min(...rects.map((rect) => rect.width)),
        outerWidth: outer.width,
        rowTopSpread:
          Math.max(...rects.map((rect) => rect.top)) -
          Math.min(...rects.map((rect) => rect.top)),
        scrollOverflow: element.scrollWidth - element.clientWidth,
      };
    });

    expect(metrics.actions.slice(0, 4)).toEqual([
      "reading",
      "speechRate",
      "voiceSelection",
      "colorScheme",
    ]);
    expect(metrics.controlCount).toBe(14);
    expect(metrics.outerWidth).toBeCloseTo(width, 1);
    expect(metrics.frameWidth).toBeCloseTo(Math.min(width, 1280), 1);
    expect(metrics.frameWidth).toBeLessThanOrEqual(1280);
    expect(metrics.frameCenterDelta).toBeLessThanOrEqual(0.5);
    expect(metrics.minimumControlWidth).toBeGreaterThanOrEqual(64);
    expect(metrics.rowTopSpread).toBeLessThanOrEqual(1);
    expect(metrics.scrollOverflow).toBeLessThanOrEqual(1);
    expect(metrics.clipped).toBe(false);
  }

  await page.setViewportSize({ width: 1024, height: 800 });
  const voiceControl = host.locator('[data-action="voiceSelection"]');
  await voiceControl.click();
  const panelBox = await host.locator(".a11y-voice-settings").boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox?.x ?? -1).toBeGreaterThanOrEqual(12);
  expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0)).toBeLessThanOrEqual(1012);
});

async function installVoiceFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface StoredVoice extends FixtureVoiceInput {
      __fixtureObjectId: string;
    }

    class FixtureUtterance extends EventTarget {
      lang = "";
      rate = 1;
      voice: StoredVoice | null = null;

      constructor(readonly text: string) {
        super();
      }
    }

    class FixtureSpeechSynthesis extends EventTarget {
      voices: StoredVoice[] = [];
      generation = 0;
      cancelCount = 0;
      spoken: CapturedUtterance[] = [];

      getVoices(): StoredVoice[] {
        return this.voices;
      }

      setVoices(inputs: FixtureVoiceInput[]): void {
        this.generation += 1;
        this.voices = inputs.map((voice, index) => ({
          ...voice,
          default: Boolean(voice.default),
          __fixtureObjectId: `${this.generation}:${index}`,
        }));
        try {
          sessionStorage.setItem(
            "__a11yVoiceFixtureVoices",
            JSON.stringify(inputs),
          );
        } catch {
          // The in-memory fixture remains sufficient for this document.
        }
      }

      speak(utterance: FixtureUtterance): void {
        this.spoken.push({
          text: utterance.text,
          lang: utterance.lang,
          rate: utterance.rate,
          voiceURI: utterance.voice?.voiceURI ?? null,
          localService: utterance.voice?.localService ?? null,
          objectId: utterance.voice?.__fixtureObjectId ?? null,
        });
        queueMicrotask(() => utterance.dispatchEvent(new Event("start")));
        window.setTimeout(
          () => utterance.dispatchEvent(new Event("end")),
          20,
        );
      }

      cancel(): void {
        this.cancelCount += 1;
      }
    }

    let restoredVoices: FixtureVoiceInput[];
    try {
      restoredVoices = JSON.parse(
        sessionStorage.getItem("__a11yVoiceFixtureVoices") ?? "[]",
      ) as FixtureVoiceInput[];
    } catch {
      restoredVoices = [];
    }
    const synthesis = new FixtureSpeechSynthesis();
    if (restoredVoices.length > 0) {
      synthesis.setVoices(restoredVoices);
    }
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: synthesis,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: FixtureUtterance,
    });
    window.__a11yVoiceFixture = {
      get cancelCount() {
        return synthesis.cancelCount;
      },
      get spoken() {
        return synthesis.spoken;
      },
      setVoices: (voices) => synthesis.setVoices(voices),
      emitVoicesChanged: () =>
        synthesis.dispatchEvent(new Event("voiceschanged")),
    };
  });
}

async function setFixtureVoices(
  page: Page,
  voices: FixtureVoiceInput[],
): Promise<void> {
  await page.evaluate((nextVoices) => {
    window.__a11yVoiceFixture.setVoices(nextVoices);
    window.__a11yVoiceFixture.emitVoicesChanged();
  }, voices);
}

async function expectLastSpoken(
  page: Page,
  expected: Partial<CapturedUtterance>,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => window.__a11yVoiceFixture.spoken.at(-1) ?? null),
    )
    .toMatchObject(expected);
}
