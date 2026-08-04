import { expect, test, type Locator, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?debug=1");
});

test("opens lazily and supports the toolbar keyboard model", async ({ page }) => {
  const launcher = page.getByRole("button", { name: "打开无障碍工具" });
  const host = page.locator("[data-a11y-tool-host]");
  await expect(host).toHaveCount(0);

  await launcher.click();
  await expect(host).toBeVisible();
  await expect(launcher).toHaveAttribute("aria-expanded", "true");

  const labels = await host
    .locator('[data-mode="main"] .a11y-control__label')
    .allTextContents();
  expect(labels).toEqual([
    "朗读",
    "语速",
    "配色",
    "放大",
    "缩小",
    "大鼠标",
    "十字线",
    "大界面",
    "固定",
    "重置",
    "帮助",
    "读屏专用",
    "退出",
  ]);

  const reading = host.locator('[data-action="reading"]');
  const rate = host.locator('[data-action="speechRate"]');
  await expect(reading).toBeFocused();
  await expect(reading).toHaveAttribute("data-icon-state", "sound-off");
  await expect(rate).toHaveAttribute("data-icon-state", "rate-1");
  await page.keyboard.press("ArrowRight");
  await expect(rate).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rate).toHaveAttribute("data-icon-state", "rate-1.25");
  await expect(rate).toBeFocused();
  await expect(host.locator(".a11y-rate-panel")).toHaveCount(0);
  await expect(rate).not.toHaveAttribute("aria-haspopup", /.+/);
  await expect(rate).not.toHaveAttribute("aria-expanded", /.+/);
  await expect(rate).not.toHaveAttribute("aria-controls", /.+/);

  const colorScheme = host.locator('[data-action="colorScheme"]');
  await expect(colorScheme).toHaveAttribute(
    "data-icon-state",
    "scheme-original",
  );
  await colorScheme.click();
  await expect(colorScheme).toHaveAttribute(
    "data-icon-state",
    "scheme-white-black",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-a11y-color-scheme",
    "white-black",
  );
  await expect(
    colorScheme.locator(".a11y-icon__palette-background"),
  ).toHaveCSS("fill", "rgb(255, 255, 255)");
  await expect(
    colorScheme.locator(".a11y-icon__palette-foreground"),
  ).toHaveCSS("fill", "rgb(0, 0, 0)");
  const paletteStates = [
    {
      state: "scheme-black-yellow",
      background: "rgb(0, 0, 0)",
      foreground: "rgb(255, 234, 0)",
    },
    {
      state: "scheme-yellow-black",
      background: "rgb(255, 230, 0)",
      foreground: "rgb(0, 0, 0)",
    },
    {
      state: "scheme-blue-white",
      background: "rgb(6, 75, 155)",
      foreground: "rgb(255, 255, 255)",
    },
  ] as const;
  for (const palette of paletteStates) {
    await colorScheme.click();
    await expect(colorScheme).toHaveAttribute("data-icon-state", palette.state);
    await expect(page.locator("html")).toHaveAttribute(
      "data-a11y-color-scheme",
      palette.state.replace("scheme-", ""),
    );
    await expect(
      colorScheme.locator(".a11y-icon__palette-background"),
    ).toHaveCSS("fill", palette.background);
    await expect(
      colorScheme.locator(".a11y-icon__palette-foreground"),
    ).toHaveCSS("fill", palette.foreground);
  }
  await colorScheme.click();
  await expect(colorScheme).toHaveAttribute(
    "data-icon-state",
    "scheme-original",
  );
  await expect(
    colorScheme.locator(
      ".a11y-icon__palette-background, .a11y-icon__palette-foreground",
    ),
  ).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-a11y-color-scheme",
    /.+/,
  );
  await host.locator('[data-mode="main"] [data-action="exit"]').click();
  await expect(launcher).toBeFocused();
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-a11y-color-scheme",
    /.+/,
  );
});

test("cycles speech rate directly, wraps presets and persists the result", async ({
  page,
}) => {
  await page.evaluate(() => {
    const spoken: Array<{ rate: number; text: string }> = [];
    (
      window as unknown as {
        __a11yRateSpoken: Array<{ rate: number; text: string }>;
      }
    ).__a11yRateSpoken = spoken;
    window.AccessibilityTool.configure({
      speech: {
        defaultRate: 1.1,
        adapter: {
          isSupported: () => true,
          speak: (text, options) => {
            spoken.push({ rate: options.rate, text });
            options.onStart?.();
            options.onEnd?.();
          },
          cancel: () => undefined,
        },
      },
    });
  });

  const launcher = page.getByRole("button", { name: "打开无障碍工具" });
  await launcher.click();
  const host = page.locator("[data-a11y-tool-host]");
  const rate = host.locator('[data-mode="main"] [data-action="speechRate"]');
  const reading = host.locator('[data-mode="main"] [data-action="reading"]');
  const status = host.locator('[role="status"]');
  const expectRate = async (value: number, label: string): Promise<void> => {
    await expect
      .poll(() =>
        page.evaluate(() => window.AccessibilityTool.getState().speechRate),
      )
      .toBe(value);
    await expect(rate).toHaveAttribute("data-icon-state", `rate-${label}`);
    await expect(rate.locator("[data-control-meta]")).toHaveText(`${label}×`);
    await expect(rate).toHaveAttribute("aria-label", `语速，当前 ${label} 倍`);
  };

  await expectRate(1.1, "1.1");
  await expect(host.locator(".a11y-rate-panel")).toHaveCount(0);
  await expect(rate).not.toHaveAttribute("aria-haspopup", /.+/);
  await expect(rate).not.toHaveAttribute("aria-expanded", /.+/);
  await expect(rate).not.toHaveAttribute("aria-controls", /.+/);

  await reading.click();
  await expect(reading).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => {
    (
      window as unknown as {
        __a11yRateSpoken: Array<{ rate: number; text: string }>;
      }
    ).__a11yRateSpoken.length = 0;
  });

  await rate.click();
  await expectRate(1.25, "1.25");
  await expect(rate).toBeFocused();
  await expect(status).toHaveText("当前语速 1.25 倍");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __a11yRateSpoken: Array<{ rate: number; text: string }>;
          }
        ).__a11yRateSpoken.at(-1),
      ),
    )
    .toEqual({ rate: 1.25, text: "当前语速 1.25 倍" });
  await expect(reading).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Space");
  await expectRate(1.5, "1.5");
  await expect(rate).toBeFocused();
  await page.keyboard.press("Enter");
  await expectRate(0.75, "0.75");
  await expect(rate).toBeFocused();
  await rate.click();
  await expectRate(1, "1");
  await rate.click();
  await expectRate(1.25, "1.25");

  await reading.click();
  await expect(reading).toHaveAttribute("aria-pressed", "false");
  await expectRate(1.25, "1.25");

  await host.locator('[data-mode="main"] [data-action="exit"]').click();
  await expect(host).not.toBeVisible();
  await launcher.click();
  await expectRate(1.25, "1.25");
  await expect(host.locator(".a11y-rate-panel")).toHaveCount(0);

  const pin = host.locator('[data-mode="main"] [data-action="pin"]');
  await pin.click();
  await rate.focus();
  await page.mouse.move(500, 70);
  await page.mouse.move(500, 400);
  await expect(host).toHaveAttribute("data-a11y-tool-collapsed", "", {
    timeout: 500,
  });
  await expect(
    host.getByRole("button", { name: "展开无障碍工具栏" }),
  ).toBeFocused();
});

test("keeps all main controls on one centered row from 1024 to 2048 pixels", async ({
  page,
}) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const toolbar = host.locator(".a11y-toolbar");

  for (const viewport of [
    { width: 2048, minimumControlWidth: 80, maximumControlWidth: 85 },
    { width: 1440, minimumControlWidth: 80, maximumControlWidth: 85 },
    { width: 1200, minimumControlWidth: 79, maximumControlWidth: 85 },
    { width: 1024, minimumControlWidth: 68, maximumControlWidth: 76 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: 800 });
    const metrics = await toolbar.evaluate((element) => {
      const toolbarRect = element.getBoundingClientRect();
      const frame = element.querySelector<HTMLElement>(".a11y-toolbar__frame");
      const frameRect = frame?.getBoundingClientRect();
      const brandRect = element
        .querySelector<HTMLElement>(".a11y-toolbar__brand")
        ?.getBoundingClientRect();
      const controls = Array.from(
        element.querySelectorAll<HTMLElement>(
          '[data-mode="main"] [data-toolbar-item]',
        ),
      );
      const rects = controls.map((control) => control.getBoundingClientRect());
      const tops = rects.map((rect) => rect.top);
      const firstControl = rects[0];
      const lastControl = rects.at(-1);
      return {
        background: getComputedStyle(element).backgroundColor,
        brandWithinFrame: Boolean(
          frameRect &&
            brandRect &&
            brandRect.left >= frameRect.left - 0.5 &&
            brandRect.right <= frameRect.right + 0.5,
        ),
        controlCount: controls.length,
        controlWidths: rects.map((rect) => rect.width),
        frameCenterDelta: frameRect
          ? Math.abs(
              frameRect.left + frameRect.width / 2 -
                (toolbarRect.left + toolbarRect.width / 2),
            )
          : Number.POSITIVE_INFINITY,
        frameWidth: frameRect?.width ?? 0,
        height: toolbarRect.height,
        firstControlInset: firstControl
          ? firstControl.left - toolbarRect.left
          : Number.NEGATIVE_INFINITY,
        lastControlInset: lastControl
          ? toolbarRect.right - lastControl.right
          : Number.NEGATIVE_INFINITY,
        exitWithinFrame: Boolean(
          frameRect &&
            lastControl &&
            lastControl.left >= frameRect.left - 0.5 &&
            lastControl.right <= frameRect.right + 0.5,
        ),
        overflowX: getComputedStyle(element).overflowX,
        outerWidth: toolbarRect.width,
        rowTopSpread: Math.max(...tops) - Math.min(...tops),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        clipped: rects.some(
          (rect) =>
            rect.left < toolbarRect.left - 0.5 ||
            rect.right > toolbarRect.right + 0.5 ||
            rect.top < toolbarRect.top - 0.5 ||
            rect.bottom > toolbarRect.bottom + 0.5,
        ),
      };
    });

    expect(metrics.controlCount).toBe(13);
    expect(metrics.background).toBe("rgb(24, 27, 30)");
    expect(metrics.brandWithinFrame).toBe(true);
    expect(metrics.exitWithinFrame).toBe(true);
    expect(metrics.outerWidth).toBeCloseTo(viewport.width, 1);
    expect(metrics.frameWidth).toBeCloseTo(Math.min(viewport.width, 1200), 1);
    expect(metrics.frameWidth).toBeLessThanOrEqual(1200);
    expect(metrics.frameCenterDelta).toBeLessThanOrEqual(0.5);
    expect(metrics.firstControlInset).toBeGreaterThan(4);
    expect(metrics.lastControlInset).toBeGreaterThan(4);
    expect(metrics.height).toBeCloseTo(146, 1);
    expect(metrics.overflowX).toBe("hidden");
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.rowTopSpread).toBeLessThanOrEqual(1);
    expect(metrics.clipped).toBe(false);
    for (const controlWidth of metrics.controlWidths) {
      expect(controlWidth).toBeGreaterThanOrEqual(viewport.minimumControlWidth);
      expect(controlWidth).toBeLessThanOrEqual(viewport.maximumControlWidth);
    }
  }

  const reading = host.locator('[data-mode="main"] [data-action="reading"]');
  const rate = host.locator('[data-mode="main"] [data-action="speechRate"]');
  await reading.focus();
  await page.keyboard.press("ArrowRight");
  await expect(rate).toBeFocused();
  const focusStyle = await rate.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.outlineColor,
      style: style.outlineStyle,
      width: style.outlineWidth,
    };
  });
  expect(focusStyle).toEqual({
    color: "rgb(255, 255, 255)",
    style: "solid",
    width: "3px",
  });
  expect(focusStyle.color).not.toBe("rgb(244, 122, 0)");

  await page.keyboard.press("End");
  await expect(
    host.locator('[data-mode="main"] [data-action="exit"]'),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "打开无障碍工具" })).toBeFocused();
});

test("keeps push offsets and toolbar height stable while switching modes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      toolbar: { offsetSelectors: [".site-header"] },
    });
  });
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const mainReadScreen = host.locator(
    '[data-mode="main"] [data-action="readScreen"]',
  );

  const readGeometry = async (): Promise<{
    bodyPaddingTop: number;
    frame: number;
    headerTop: number;
    host: number;
    root: number;
    toolbar: number;
  }> =>
    page.evaluate(() => {
      const toolHost = document.querySelector<HTMLElement>(
        "[data-a11y-tool-host]",
      );
      const root = toolHost?.shadowRoot?.querySelector<HTMLElement>(
        "[data-a11y-tool-root]",
      );
      const frame = toolHost?.shadowRoot?.querySelector<HTMLElement>(
        ".a11y-toolbar__frame",
      );
      const toolbarElement = toolHost?.shadowRoot?.querySelector<HTMLElement>(
        ".a11y-toolbar",
      );
      const header = document.querySelector<HTMLElement>(".site-header");
      return {
        bodyPaddingTop: Number.parseFloat(getComputedStyle(document.body).paddingTop),
        frame: frame?.getBoundingClientRect().height ?? 0,
        headerTop: Number.parseFloat(getComputedStyle(header as HTMLElement).top),
        host: toolHost?.getBoundingClientRect().height ?? 0,
        root: root?.getBoundingClientRect().height ?? 0,
        toolbar: toolbarElement?.getBoundingClientRect().height ?? 0,
      };
    });

  const mainGeometry = await readGeometry();
  expect(mainGeometry.host).toBeCloseTo(146, 1);
  expect(mainGeometry.frame).toBeCloseTo(146, 1);
  expect(mainGeometry.root).toBeCloseTo(146, 1);
  expect(mainGeometry.toolbar).toBeCloseTo(146, 1);

  await mainReadScreen.click();
  const screenGroup = host.locator('[data-mode="screen"]');
  await expect(screenGroup).toBeVisible();
  const screenActions = await screenGroup
    .locator("[data-toolbar-item]")
    .evaluateAll((controls) =>
      controls.map((control) => (control as HTMLElement).dataset.action),
    );
  expect(screenActions).toEqual([
    "region:viewport",
    "region:navigation",
    "region:interaction",
    "region:service",
    "region:list",
    "region:content",
    "screenSound",
    "help",
    "readScreen",
    "exit",
  ]);
  const screenSound = screenGroup.locator('[data-action="screenSound"]');
  await expect(screenSound).toHaveAttribute("aria-label", "朗读，当前关闭");
  await expect(screenSound.locator("[data-control-meta]")).toHaveText("关闭");
  const screenReadScreen = screenGroup.locator('[data-action="readScreen"]');
  await expect(screenReadScreen).toHaveAttribute("aria-pressed", "true");
  await expect(screenReadScreen.locator("[data-control-meta]")).toHaveText(
    "当前模式",
  );

  const screenGeometry = await readGeometry();
  expect(screenGeometry).toEqual(mainGeometry);

  await screenReadScreen.click();
  await expect(host.locator('[data-mode="main"]')).toBeVisible();
  expect(await readGeometry()).toEqual(mainGeometry);
});

test("uses transparent defaults, shared orange switch states and a red exit", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      speech: {
        adapter: {
          isSupported: () => true,
          speak: (_text, options) => {
            options.onStart?.();
            options.onEnd?.();
          },
          cancel: () => undefined,
        },
      },
    });
  });
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const reading = host.locator('[data-mode="main"] [data-action="reading"]');
  const rate = host.locator('[data-mode="main"] [data-action="speechRate"]');
  const pin = host.locator('[data-mode="main"] [data-action="pin"]');
  const exit = host.locator('[data-mode="main"] [data-action="exit"]');

  await expect(reading).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(reading.locator(".a11y-control__icon")).toHaveCSS(
    "background-color",
    "rgb(41, 46, 50)",
  );
  await expect(rate).toHaveCSS("border-width", "0px");

  await pin.click();
  await reading.click();
  for (const control of [pin, reading]) {
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(control.locator(".a11y-control__icon")).toHaveCSS(
      "background-color",
      "rgb(244, 122, 0)",
    );
    await expect
      .poll(() =>
        control.evaluate(
          (element) => getComputedStyle(element, "::after").width,
        ),
      )
      .toBe("14px");
    await expect
      .poll(() => getControlLocalTrackScale(control))
      .toBeGreaterThan(0.99);
  }
  const activeSurfaces = await Promise.all(
    [pin, reading].map((control) =>
      control.evaluate((element) => {
        const style = getComputedStyle(element);
        const node = getComputedStyle(element, "::after");
        const track = getComputedStyle(element, "::before");
        return {
          background: style.backgroundColor,
          icon: getComputedStyle(
            element.querySelector<HTMLElement>(".a11y-control__icon") as HTMLElement,
          ).backgroundColor,
          node: node.backgroundColor,
          nodeRing: node.boxShadow,
          nodeTransitionDuration: node.transitionDuration,
          nodeTransitionProperty: node.transitionProperty,
          nodeWidth: node.width,
          track: track.backgroundColor,
          trackOpacity: track.opacity,
          trackOrigin: track.transformOrigin,
          trackScaleState: style
            .getPropertyValue("--a11y-local-track-scale")
            .trim(),
          trackTransitionDuration: track.transitionDuration,
          trackTransitionProperty: track.transitionProperty,
          trackZIndex: track.zIndex,
        };
      }),
    ),
  );
  expect(activeSurfaces[0]).toEqual(activeSurfaces[1]);
  expect(activeSurfaces[0]).toMatchObject({
    icon: "rgb(244, 122, 0)",
    node: "rgb(244, 122, 0)",
    nodeTransitionDuration: "0.2s, 0.22s, 0.2s, 0.2s",
    nodeTransitionProperty: "background-color, box-shadow, height, width",
    nodeWidth: "14px",
    track: "rgb(244, 122, 0)",
    trackOpacity: "1",
    trackOrigin: "52px 1.5px",
    trackScaleState: "1",
    trackTransitionDuration: "0.22s, 0.18s",
    trackTransitionProperty: "transform, opacity",
    trackZIndex: "-1",
  });
  expect(activeSurfaces[0]?.nodeRing).toContain("rgb(24, 27, 30)");
  expect(activeSurfaces[0]?.nodeRing).toContain("rgb(244, 122, 0)");

  const inactiveTracks = await Promise.all(
    [rate, exit].map((control) =>
      control.evaluate((element) => {
        const node = getComputedStyle(element, "::after");
        const track = getComputedStyle(element, "::before");
        return {
          node: node.backgroundColor,
          nodeRing: node.boxShadow,
          opacity: track.opacity,
          scale: new DOMMatrixReadOnly(track.transform).a,
          scaleState: getComputedStyle(element)
            .getPropertyValue("--a11y-local-track-scale")
            .trim(),
        };
      }),
    ),
  );
  expect(inactiveTracks[0]).toMatchObject({
    nodeRing: "none",
    opacity: "0",
    scaleState: "0",
  });
  expect(inactiveTracks[0]?.scale).toBeLessThan(0.01);
  expect(inactiveTracks[1]).toMatchObject({
    node: "rgb(255, 31, 31)",
    nodeRing: "none",
    opacity: "0",
    scaleState: "0",
  });
  expect(inactiveTracks[1]?.scale).toBeLessThan(0.01);

  await expect(exit.locator(".a11y-control__icon")).toHaveCSS(
    "background-color",
    "rgb(255, 31, 31)",
  );
  const exitNode = await exit.evaluate(
    (element) => getComputedStyle(element, "::after").backgroundColor,
  );
  expect(exitNode).toBe("rgb(255, 31, 31)");

  await reading.click();
  await expect(reading).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => getControlLocalTrackScale(reading)).toBeLessThan(0.01);
  await expect.poll(() => getControlLocalTrackScale(pin)).toBeGreaterThan(0.99);
  await expect
    .poll(() =>
      reading.evaluate(
        (element) => getComputedStyle(element, "::after").boxShadow,
      ),
    )
    .toBe("none");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await reading.click();
  const reducedMotionStyle = await reading.evaluate((element) => ({
    nodeTransitionDuration: getComputedStyle(element, "::after")
      .transitionDuration,
    trackTransitionDuration: getComputedStyle(element, "::before")
      .transitionDuration,
    trackTransitionProperty: getComputedStyle(element, "::before")
      .transitionProperty,
  }));
  expect(reducedMotionStyle).toEqual({
    nodeTransitionDuration: "0s",
    trackTransitionDuration: "0s",
    trackTransitionProperty: "none",
  });
});

test("synchronizes sound and read-screen switch icons", async ({ page }) => {
  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      speech: {
        adapter: {
          isSupported: () => true,
          speak: (_text, options) => {
            options.onStart?.();
            options.onEnd?.();
          },
          cancel: () => undefined,
        },
      },
    });
  });
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const reading = host.locator('[data-mode="main"] [data-action="reading"]');
  const sound = host.locator('[data-mode="screen"] [data-action="screenSound"]');
  const mainReadScreen = host.locator(
    '[data-mode="main"] [data-action="readScreen"]',
  );
  const screenReadScreen = host.locator(
    '[data-mode="screen"] [data-action="readScreen"]',
  );
  const initialWidth = await reading.evaluate(
    (element) => element.getBoundingClientRect().width,
  );

  await expect(reading).toHaveAttribute("data-icon-state", "sound-off");
  await expect(sound).toHaveAttribute("data-icon-state", "sound-off");
  await reading.click();
  await expect(reading).toHaveAttribute("aria-pressed", "true");
  await expect(reading).toHaveAttribute("data-icon-state", "sound-on");
  await expect(sound).toHaveAttribute("data-icon-state", "sound-on");
  expect(
    await reading.evaluate((element) => element.getBoundingClientRect().width),
  ).toBeCloseTo(initialWidth, 1);

  await mainReadScreen.click();
  await expect(screenReadScreen).toBeVisible();
  await expect(mainReadScreen).toHaveAttribute(
    "data-icon-state",
    "read-screen-on",
  );
  await expect(screenReadScreen).toHaveAttribute(
    "data-icon-state",
    "read-screen-on",
  );
  await sound.click();
  await expect(sound).toHaveAttribute("data-icon-state", "sound-off");
  await expect(reading).toHaveAttribute("data-icon-state", "sound-off");
  await screenReadScreen.click();
  await expect(mainReadScreen).toBeVisible();
  await expect(mainReadScreen).toHaveAttribute(
    "data-icon-state",
    "read-screen-off",
  );
});

test("uses configurable pure danger color for both 3px non-interactive crosshair lines", async ({
  page,
}) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const crosshair = host.locator('[data-action="crosshair"]');
  await crosshair.click();
  await expect(crosshair).toHaveAttribute("data-icon-state", "crosshair-on");
  await page.mouse.move(480, 360);

  const horizontal = host.locator(".a11y-crosshair--x");
  const vertical = host.locator(".a11y-crosshair--y");
  for (const line of [horizontal, vertical]) {
    await expect(line).toBeVisible();
    await expect(line).toHaveAttribute("aria-hidden", "true");
    await expect(line).toHaveCSS("background-color", "rgb(255, 31, 31)");
    await expect(line).toHaveCSS("position", "fixed");
    await expect(line).toHaveCSS("pointer-events", "none");
    await expect(line).toHaveCSS("border-width", "0px");
    await expect(line).toHaveCSS("box-shadow", "none");
    await expect(line).toHaveCSS("outline-style", "none");
  }
  await expect(horizontal).toHaveCSS("height", "3px");
  await expect(vertical).toHaveCSS("width", "3px");
  await expect(
    host.locator(
      '[data-mode="main"] [data-action="exit"] .a11y-control__icon',
    ),
  ).toHaveCSS("background-color", "rgb(255, 31, 31)");

  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      toolbar: { theme: { danger: "#b00020" } },
    });
  });
  for (const line of [horizontal, vertical]) {
    await expect(line).toHaveCSS("background-color", "rgb(176, 0, 32)");
    await expect(line).toHaveCSS("pointer-events", "none");
    await expect(line).toHaveCSS("box-shadow", "none");
  }
  await expect(
    host.locator(
      '[data-mode="main"] [data-action="exit"] .a11y-control__icon',
    ),
  ).toHaveCSS("background-color", "rgb(176, 0, 32)");
});

test("restores persisted value and switch icon states", async ({ page }) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  let host = page.locator("[data-a11y-tool-host]");
  await host.locator('[data-action="colorScheme"]').click();
  await host.locator('[data-action="zoomIn"]').click();
  await host.locator('[data-action="largeCursor"]').click();
  await host.locator('[data-action="crosshair"]').click();

  await page.reload();
  host = page.locator("[data-a11y-tool-host]");
  await expect(host).toBeVisible();
  await expect(host.locator('[data-action="colorScheme"]')).toHaveAttribute(
    "data-icon-state",
    "scheme-white-black",
  );
  await expect(host.locator('[data-action="zoomIn"]')).toHaveAttribute(
    "aria-label",
    "放大，当前 125%",
  );
  await expect(host.locator('[data-action="largeCursor"]')).toHaveAttribute(
    "data-icon-state",
    "cursor-on",
  );
  await expect(host.locator('[data-action="crosshair"]')).toHaveAttribute(
    "data-icon-state",
    "crosshair-on",
  );
});

test("keeps the default push toolbar fixed during real page scrolling", async ({
  page,
}) => {
  const originalPadding = await getBodyPaddingTop(page);
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const toolbarHeight = await host.evaluate(
    (element) => element.getBoundingClientRect().height,
  );

  await expect(host).toHaveCSS("position", "fixed");
  await expect.poll(() => getHostTop(page)).toBe(0);
  await expect
    .poll(() => getBodyPaddingTop(page))
    .toBeCloseTo(originalPadding + toolbarHeight, 1);
  await expectToolbarFixedThroughScroll(page);

  await host.locator('[data-mode="main"] [data-action="exit"]').click();
  await expect.poll(() => getBodyPaddingTop(page)).toBeCloseTo(
    originalPadding,
    1,
  );
});

test("keeps overlay fixed without reserving page space", async ({ page }) => {
  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      toolbar: { layoutMode: "overlay" },
    });
  });
  const originalPadding = await getBodyPaddingTop(page);
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");

  await expect(host).toHaveCSS("position", "fixed");
  await expect.poll(() => getBodyPaddingTop(page)).toBeCloseTo(
    originalPadding,
    1,
  );
  await expectToolbarFixedThroughScroll(page);
});

test("pins, animates collapse visibility and preserves expand triggers", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      toolbar: { pinHideDelayMs: 5000 },
    });
  });
  const originalPadding = await getBodyPaddingTop(page);
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const toolbar = host.locator(".a11y-toolbar");
  const expandedHeight = await getHostHeight(page);
  const pin = host.locator('[data-action="pin"]');
  await expect(pin).toHaveAttribute("data-icon-state", "pin-off");
  await page.mouse.move(500, 70);
  await page.mouse.move(500, 400);
  await expect(host).not.toHaveAttribute("data-a11y-tool-collapsed", "");
  await expect.poll(() => getBodyPaddingTop(page)).toBeCloseTo(
    originalPadding + expandedHeight,
    1,
  );

  await pin.click();
  await expect(pin).toHaveAttribute("data-icon-state", "pin-on");
  await expect(pin).toBeFocused();
  await expect.poll(() => getBodyPaddingTop(page)).toBeCloseTo(
    originalPadding,
    1,
  );
  const scrollBeforeCollapse = await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    const target = Math.min(
      900,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    window.scrollTo(0, target);
    return window.scrollY;
  });
  expect(scrollBeforeCollapse).toBeGreaterThan(0);
  await armToolbarMotionCapture(host, "collapse");
  await page.mouse.move(500, 400);
  await expect(host).toHaveAttribute("data-a11y-tool-collapsed", "", {
    timeout: 1000,
  });
  const collapseMotion = await waitForToolbarMotionCapture(host);
  expect(collapseMotion.start).toMatchObject({
    delay: "0s, 0.18s",
    duration: "0.18s, 0s",
    pointerEvents: "none",
    property: "transform, visibility",
    visibility: "visible",
  });
  expect(collapseMotion.end).toMatchObject({
    pointerEvents: "none",
    visibility: "hidden",
  });
  expect(collapseMotion.elapsedTime).toBeCloseTo(0.18, 5);
  expect(collapseMotion.end.translateY).toBeCloseTo(-expandedHeight, 0);
  const reveal = host.getByRole("button", { name: "展开无障碍工具栏" });
  await expect(reveal).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(
    scrollBeforeCollapse,
  );
  await expect.poll(() => getHostHeight(page)).toBe(12);
  await expect.poll(() => getHostTop(page)).toBe(0);

  await armToolbarMotionCapture(host, "expand");
  await page.keyboard.press("Enter");
  await expect(host).not.toHaveAttribute("data-a11y-tool-collapsed", "");
  const expandMotion = await waitForToolbarMotionCapture(host);
  expect(expandMotion.start).toMatchObject({
    delay: "0s, 0s",
    duration: "0.18s, 0s",
    pointerEvents: "auto",
    property: "transform, visibility",
    visibility: "visible",
  });
  expect(expandMotion.end.visibility).toBe("visible");
  expect(expandMotion.elapsedTime).toBeCloseTo(0.18, 5);
  expect(expandMotion.end.translateY).toBeCloseTo(0, 0);
  await expect(host.locator('[data-action="reading"]')).toBeFocused();
  await expect.poll(() => getHostHeight(page)).toBeCloseTo(expandedHeight, 1);

  await page.mouse.move(500, 70);
  await page.mouse.move(500, 400);
  await expect(host).toHaveAttribute("data-a11y-tool-collapsed", "", {
    timeout: 500,
  });
  await page.mouse.move(500, 1);
  await expect(host).not.toHaveAttribute("data-a11y-tool-collapsed", "");
  await expect.poll(() => getHostHeight(page)).toBeCloseTo(expandedHeight, 1);

  await page.mouse.move(500, 400);
  await expect(host).toHaveAttribute("data-a11y-tool-collapsed", "", {
    timeout: 500,
  });
  await page.keyboard.press("Alt+Shift+KeyA");
  await expect(host).not.toHaveAttribute("data-a11y-tool-collapsed", "");
  await expect(host.locator('[data-action="reading"]')).toBeFocused();
  await expect.poll(() => getHostHeight(page)).toBeCloseTo(expandedHeight, 1);
  await expect.poll(() => getHostTop(page)).toBe(0);
  await expect.poll(() => getBodyPaddingTop(page)).toBeCloseTo(
    originalPadding,
    1,
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(500, 70);
  await page.mouse.move(500, 400);
  await expect(host).toHaveAttribute("data-a11y-tool-collapsed", "", {
    timeout: 500,
  });
  const reducedCollapsed = await getToolbarMotionState(toolbar);
  expect(reducedCollapsed).toMatchObject({
    delay: "0s",
    duration: "0s",
    pointerEvents: "none",
    property: "none",
    visibility: "hidden",
  });
  expect(reducedCollapsed.translateY).toBeCloseTo(-expandedHeight, 0);

  await page.mouse.move(500, 1);
  await expect(host).not.toHaveAttribute("data-a11y-tool-collapsed", "");
  const reducedExpanded = await getToolbarMotionState(toolbar);
  expect(reducedExpanded).toMatchObject({
    delay: "0s",
    duration: "0s",
    pointerEvents: "auto",
    property: "none",
    visibility: "visible",
  });
  expect(reducedExpanded.translateY).toBeCloseTo(0, 0);
});

test("collapses pinned read-screen mode with the same animation and expand triggers", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      toolbar: { pinHideDelayMs: 5000 },
    });
  });
  const originalPadding = await getBodyPaddingTop(page);
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const expandedHeight = await getHostHeight(page);
  const pin = host.locator('[data-mode="main"] [data-action="pin"]');
  const mainReadScreen = host.locator(
    '[data-mode="main"] [data-action="readScreen"]',
  );

  await pin.click();
  await mainReadScreen.click();
  const screenGroup = host.locator('[data-mode="screen"]');
  const regionControls = screenGroup.locator("[data-region-control]");
  await expect(screenGroup).toBeVisible();
  await expect(host).not.toHaveAttribute("data-a11y-tool-collapsed", "");
  await expect(regionControls).toHaveCount(6);
  await expect(
    screenGroup.locator('[data-action="region:viewport"]'),
  ).toHaveAttribute("aria-label", /视窗区/);
  await expect.poll(() => getHostHeight(page)).toBeCloseTo(expandedHeight, 1);
  await expect.poll(() => getBodyPaddingTop(page)).toBeCloseTo(
    originalPadding,
    1,
  );
  await expect
    .poll(() => page.evaluate(() => window.AccessibilityTool.getState()))
    .toMatchObject({
      isCollapsed: false,
      isPinned: true,
      isReadScreen: true,
    });

  await armToolbarMotionCapture(host, "collapse");
  await page.mouse.move(500, 70);
  await page.mouse.move(500, 400);
  await expect(host).toHaveAttribute("data-a11y-tool-collapsed", "", {
    timeout: 1000,
  });
  const collapseMotion = await waitForToolbarMotionCapture(host);
  expect(collapseMotion.start).toMatchObject({
    delay: "0s, 0.18s",
    pointerEvents: "none",
    visibility: "visible",
  });
  expect(collapseMotion.end.visibility).toBe("hidden");
  expect(collapseMotion.elapsedTime).toBeCloseTo(0.18, 5);
  expect(collapseMotion.end.translateY).toBeCloseTo(-expandedHeight, 0);
  const reveal = host.getByRole("button", { name: "展开无障碍工具栏" });
  await expect(reveal).toBeFocused();
  await expect.poll(() => getHostHeight(page)).toBe(12);
  await expect.poll(() => getBodyPaddingTop(page)).toBeCloseTo(
    originalPadding,
    1,
  );

  await page.keyboard.press("Enter");
  await expect(host).not.toHaveAttribute("data-a11y-tool-collapsed", "");
  await expect(screenGroup).toBeVisible();
  await expect
    .poll(() => getHostHeight(page))
    .toBeCloseTo(expandedHeight, 1);
  await expect(
    screenGroup.locator("[data-toolbar-item]:focus"),
  ).toHaveCount(1);

  await page.mouse.move(500, 70);
  await page.mouse.move(500, 400);
  await expect(host).toHaveAttribute("data-a11y-tool-collapsed", "", {
    timeout: 500,
  });
  await page.mouse.move(500, 1);
  await expect(host).not.toHaveAttribute("data-a11y-tool-collapsed", "");
  await expect(screenGroup).toBeVisible();

  await page.mouse.move(500, 400);
  await expect(host).toHaveAttribute("data-a11y-tool-collapsed", "", {
    timeout: 500,
  });
  await page.keyboard.press("Alt+Shift+KeyA");
  await expect(host).not.toHaveAttribute("data-a11y-tool-collapsed", "");
  await expect(screenGroup).toBeVisible();
  await expect(
    screenGroup.locator("[data-toolbar-item]:focus"),
  ).toHaveCount(1);
});

test("keeps keyboard focusout on the configured pinned collapse delay", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.AccessibilityTool.configure({
      toolbar: { pinHideDelayMs: 400 },
    });
  });
  await page.mouse.move(500, 400);
  await page.getByRole("button", { name: "打开无障碍工具" }).focus();
  await page.keyboard.press("Enter");
  const host = page.locator("[data-a11y-tool-host]");
  const pin = host.locator('[data-action="pin"]');
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(pin).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await armCollapsedMutationTiming(host);
  await page.keyboard.press("Tab");
  await expect(pin).not.toBeFocused();

  await expect(host).toHaveAttribute("data-a11y-tool-collapsed", "", {
    timeout: 2000,
  });
  expect(await getCollapsedMutationDelay(host)).toBeGreaterThanOrEqual(300);
});

test("cycles zoom without scaling the toolbar", async ({ page }) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  const initialWidth = await host.locator('[data-action="zoomIn"]').evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  const zoomIn = host.locator('[data-action="zoomIn"]');
  const initialIcon = await zoomIn.locator("svg").innerHTML();

  await zoomIn.click();
  await expect(zoomIn).toHaveAttribute(
    "aria-label",
    "放大，当前 125%",
  );
  expect(await zoomIn.locator("svg").innerHTML()).toBe(initialIcon);
  const zoomedWidth = await zoomIn.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(zoomedWidth).toBeCloseTo(initialWidth, 1);
  await expect(page.locator("main")).toHaveCSS("zoom", "1.25");
});

test("reset restores page effects and keeps focus on reset", async ({ page }) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const host = page.locator("[data-a11y-tool-host]");
  await host.locator('[data-action="colorScheme"]').click();
  await host.locator('[data-action="zoomIn"]').click();
  await host.locator('[data-action="largeCursor"]').click();
  await host.locator('[data-action="crosshair"]').click();
  await expect(host.locator('[data-action="colorScheme"]')).toHaveAttribute(
    "data-icon-state",
    "scheme-white-black",
  );
  await expect(host.locator('[data-action="zoomIn"]')).toHaveAttribute(
    "aria-label",
    "放大，当前 125%",
  );
  await expect(host.locator('[data-action="largeCursor"]')).toHaveAttribute(
    "data-icon-state",
    "cursor-on",
  );
  await expect(host.locator('[data-action="crosshair"]')).toHaveAttribute(
    "data-icon-state",
    "crosshair-on",
  );

  const reset = host.locator('[data-action="reset"]');
  await reset.click();
  await expect(reset).toBeFocused();
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-a11y-color-scheme",
    /.+/,
  );
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-a11y-large-cursor",
    "",
  );
  await expect(page.locator("main")).toHaveCSS("zoom", "1");
  await expect(host.locator('[data-action="colorScheme"]')).toHaveAttribute(
    "data-icon-state",
    "scheme-original",
  );
  await expect(host.locator('[data-action="zoomIn"]')).toHaveAttribute(
    "aria-label",
    "放大，当前 100%",
  );
  await expect(host.locator('[data-action="largeCursor"]')).toHaveAttribute(
    "data-icon-state",
    "cursor-off",
  );
  await expect(host.locator('[data-action="crosshair"]')).toHaveAttribute(
    "data-icon-state",
    "crosshair-off",
  );
  const state = await page.evaluate(() => window.AccessibilityTool.getState());
  expect(state).toMatchObject({
    isOpen: true,
    colorScheme: "original",
    zoom: 1,
    largeCursor: false,
    crosshair: false,
    isPinned: false,
    isReadScreen: false,
  });
});

test("uses the standard Fullscreen API from the same control", async ({ page }) => {
  await page.getByRole("button", { name: "打开无障碍工具" }).click();
  const fullscreen = page
    .locator("[data-a11y-tool-host]")
    .locator('[data-action="fullscreen"]');
  await expect(fullscreen).toHaveAttribute(
    "data-icon-state",
    "fullscreen-enter",
  );
  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute("aria-pressed", "true");
  await expect(fullscreen).toHaveAttribute(
    "data-icon-state",
    "fullscreen-exit",
  );
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);

  await page.evaluate(() => document.exitFullscreen());
  await expect(fullscreen).toHaveAttribute("aria-pressed", "false");
  await expect(fullscreen).toHaveAttribute(
    "data-icon-state",
    "fullscreen-enter",
  );
  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute(
    "data-icon-state",
    "fullscreen-exit",
  );
  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute("aria-pressed", "false");
  await expect(fullscreen).toHaveAttribute(
    "data-icon-state",
    "fullscreen-enter",
  );
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(false);
});

async function expectToolbarFixedThroughScroll(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect.poll(() => getHostTop(page)).toBe(0);
}

async function getHostTop(page: Page): Promise<number> {
  return page.locator("[data-a11y-tool-host]").evaluate((element) =>
    Math.round(element.getBoundingClientRect().top),
  );
}

async function getHostHeight(page: Page): Promise<number> {
  return page.locator("[data-a11y-tool-host]").evaluate(
    (element) => element.getBoundingClientRect().height,
  );
}

async function getBodyPaddingTop(page: Page): Promise<number> {
  return page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.body).paddingTop),
  );
}

async function getControlLocalTrackScale(control: Locator): Promise<number> {
  return control.evaluate((element) => {
    const transform = getComputedStyle(element, "::before").transform;
    return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).a;
  });
}

type ToolbarMotionPhase = "collapse" | "expand";

interface ToolbarMotionState {
  delay: string;
  duration: string;
  pointerEvents: string;
  property: string;
  translateY: number;
  visibility: string;
}

interface ToolbarMotionCapture {
  elapsedTime: number;
  end: ToolbarMotionState;
  start: ToolbarMotionState;
}

async function armToolbarMotionCapture(
  host: Locator,
  phase: ToolbarMotionPhase,
): Promise<void> {
  await host.evaluate((element, expectedPhase) => {
    type CaptureHost = HTMLElement & {
      __a11yToolbarMotionCapture?: {
        cancelled: boolean;
        complete: boolean;
        elapsedTime?: number;
        end?: ToolbarMotionState;
        phase: ToolbarMotionPhase;
        start?: ToolbarMotionState;
      };
    };
    const captureHost = element as CaptureHost;
    const toolbar = captureHost.shadowRoot?.querySelector<HTMLElement>(
      ".a11y-toolbar",
    );
    if (!toolbar) {
      throw new Error("Toolbar motion target is unavailable.");
    }

    const motion: NonNullable<CaptureHost["__a11yToolbarMotionCapture"]> = {
      cancelled: false,
      complete: false,
      phase: expectedPhase,
    };
    captureHost.__a11yToolbarMotionCapture = motion;
    const captureState = (): ToolbarMotionState => {
      const style = getComputedStyle(toolbar);
      const transform = style.transform;
      return {
        delay: style.transitionDelay,
        duration: style.transitionDuration,
        pointerEvents: style.pointerEvents,
        property: style.transitionProperty,
        translateY:
          transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42,
        visibility: style.visibility,
      };
    };
    const matchesExpectedPhase = (): boolean =>
      captureHost.hasAttribute("data-a11y-tool-collapsed") ===
      (expectedPhase === "collapse");
    const handleRun = (event: TransitionEvent): void => {
      if (
        event.target !== toolbar ||
        event.propertyName !== "transform" ||
        !matchesExpectedPhase()
      ) {
        return;
      }
      motion.start ??= captureState();
    };
    const handleCancel = (event: TransitionEvent): void => {
      if (event.target === toolbar && event.propertyName === "transform") {
        motion.cancelled = true;
      }
    };
    const handleEnd = (event: TransitionEvent): void => {
      if (
        event.target !== toolbar ||
        event.propertyName !== "transform" ||
        !matchesExpectedPhase()
      ) {
        return;
      }
      motion.elapsedTime = event.elapsedTime;
      window.requestAnimationFrame(() => {
        motion.end = captureState();
        motion.complete = true;
        toolbar.removeEventListener("transitionrun", handleRun);
        toolbar.removeEventListener("transitioncancel", handleCancel);
        toolbar.removeEventListener("transitionend", handleEnd);
      });
    };
    toolbar.addEventListener("transitionrun", handleRun);
    toolbar.addEventListener("transitioncancel", handleCancel);
    toolbar.addEventListener("transitionend", handleEnd);
  }, phase);
}

async function waitForToolbarMotionCapture(
  host: Locator,
): Promise<ToolbarMotionCapture> {
  await expect
    .poll(() =>
      host.evaluate(
        (element) =>
          (
            element as HTMLElement & {
              __a11yToolbarMotionCapture?: {
                cancelled: boolean;
                complete: boolean;
              };
            }
          ).__a11yToolbarMotionCapture,
      ),
    )
    .toMatchObject({ cancelled: false, complete: true });
  return host.evaluate((element) => {
    const capture = (
      element as HTMLElement & {
        __a11yToolbarMotionCapture?: Partial<ToolbarMotionCapture>;
      }
    ).__a11yToolbarMotionCapture;
    if (
      typeof capture?.elapsedTime !== "number" ||
      !capture.start ||
      !capture.end
    ) {
      throw new Error("Toolbar motion capture did not complete.");
    }
    return {
      elapsedTime: capture.elapsedTime,
      end: capture.end,
      start: capture.start,
    };
  });
}

async function armCollapsedMutationTiming(host: Locator): Promise<void> {
  await host.evaluate((element) => {
    type TimedHost = HTMLElement & {
      __a11yCollapsedMutationTiming?: {
        collapsedAt?: number;
        startedAt: number;
      };
    };
    const timedHost = element as TimedHost;
    const timing: NonNullable<TimedHost["__a11yCollapsedMutationTiming"]> = {
      startedAt: performance.now(),
    };
    timedHost.__a11yCollapsedMutationTiming = timing;
    const observer = new MutationObserver(() => {
      if (!timedHost.hasAttribute("data-a11y-tool-collapsed")) {
        return;
      }
      timing.collapsedAt = performance.now();
      observer.disconnect();
    });
    observer.observe(timedHost, {
      attributeFilter: ["data-a11y-tool-collapsed"],
      attributes: true,
    });
  });
}

async function getCollapsedMutationDelay(host: Locator): Promise<number> {
  return host.evaluate((element) => {
    const timing = (
      element as HTMLElement & {
        __a11yCollapsedMutationTiming?: {
          collapsedAt?: number;
          startedAt: number;
        };
      }
    ).__a11yCollapsedMutationTiming;
    if (typeof timing?.collapsedAt !== "number") {
      throw new Error("Collapsed mutation timing was not captured.");
    }
    return timing.collapsedAt - timing.startedAt;
  });
}

async function getToolbarMotionState(
  toolbar: Locator,
): Promise<ToolbarMotionState> {
  return toolbar.evaluate((element) => {
    const style = getComputedStyle(element);
    const transform = style.transform;
    return {
      delay: style.transitionDelay,
      duration: style.transitionDuration,
      pointerEvents: style.pointerEvents,
      property: style.transitionProperty,
      translateY:
        transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42,
      visibility: style.visibility,
    };
  });
}
