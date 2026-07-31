import styles from "../styles/accessibility-tool.scss?inline";
import type { ResolvedAccessibilityToolConfig } from "../core/config";

const THEME_PROPERTIES = {
  background: "--a11y-toolbar-bg",
  foreground: "--a11y-toolbar-fg",
  controlBackground: "--a11y-control-bg",
  controlForeground: "--a11y-control-fg",
  accent: "--a11y-accent",
  danger: "--a11y-danger",
  height: "--a11y-toolbar-height",
  controlRadius: "--a11y-control-radius",
  fontSize: "--a11y-font-size",
  controlSize: "--a11y-control-size",
  gap: "--a11y-control-gap",
} as const;

export class StyleManager {
  private shadowStyleNode: HTMLStyleElement | HTMLLinkElement | null = null;
  private documentStyleNode: HTMLStyleElement | HTMLLinkElement | null = null;
  private readiness: Promise<void> = Promise.resolve();

  constructor(
    private readonly host: HTMLElement,
    private readonly shadowRoot: ShadowRoot,
  ) {}

  mount(config: ResolvedAccessibilityToolConfig): void {
    this.destroy();
    this.applyTheme(config);

    if (config.toolbar.styleUrl) {
      const shadowLink = this.createLink(config.toolbar.styleUrl);
      const documentLink = this.createLink(config.toolbar.styleUrl);
      this.shadowStyleNode = shadowLink;
      this.documentStyleNode = documentLink;
      this.readiness = Promise.all([
        waitForStylesheet(shadowLink),
        waitForStylesheet(documentLink),
      ]).then(() => undefined);
    } else {
      this.shadowStyleNode = this.createStyle(config.toolbar.styleNonce);
      this.documentStyleNode = this.createStyle(config.toolbar.styleNonce);
      this.readiness = Promise.resolve();
    }

    this.shadowRoot.prepend(this.shadowStyleNode);
    document.head.append(this.documentStyleNode);
  }

  applyTheme(config: ResolvedAccessibilityToolConfig): void {
    for (const [key, property] of Object.entries(THEME_PROPERTIES)) {
      const value = config.toolbar.theme[
        key as keyof typeof config.toolbar.theme
      ];
      this.host.style.setProperty(property, value);
    }
  }

  whenReady(): Promise<void> {
    return this.readiness;
  }

  destroy(): void {
    this.shadowStyleNode?.remove();
    this.documentStyleNode?.remove();
    this.shadowStyleNode = null;
    this.documentStyleNode = null;
    this.readiness = Promise.resolve();
  }

  private createLink(url: string): HTMLLinkElement {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.setAttribute("data-a11y-tool-style", "");
    return link;
  }

  private createStyle(nonce: string): HTMLStyleElement {
    const style = document.createElement("style");
    style.textContent = styles;
    style.setAttribute("data-a11y-tool-style", "");
    if (nonce) {
      style.nonce = nonce;
    }
    return style;
  }
}

function waitForStylesheet(link: HTMLLinkElement): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(finish, 3000);
    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", finish, { once: true });
  });
}
