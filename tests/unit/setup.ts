import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  document.documentElement.lang = "zh-CN";
  document.body.innerHTML = "";
  document.head
    .querySelectorAll("[data-a11y-tool-style]")
    .forEach((node) => node.remove());
  localStorage.clear();
  vi.restoreAllMocks();

  if (!(HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
