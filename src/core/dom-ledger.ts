type AttributeSnapshot = Map<string, string | null>;
interface StyleValueSnapshot {
  value: string;
  priority: string;
}
type StyleSnapshot = Map<string, StyleValueSnapshot>;

export class DomLedger {
  private readonly attributes = new Map<Element, AttributeSnapshot>();
  private readonly styles = new Map<HTMLElement, StyleSnapshot>();
  private readonly addedNodes = new Set<Node>();

  setAttribute(element: Element, name: string, value: string): void {
    const snapshot =
      this.attributes.get(element) ?? new Map<string, string | null>();
    if (!snapshot.has(name)) {
      snapshot.set(name, element.getAttribute(name));
      this.attributes.set(element, snapshot);
    }
    element.setAttribute(name, value);
  }

  removeAttribute(element: Element, name: string): void {
    const snapshot =
      this.attributes.get(element) ?? new Map<string, string | null>();
    if (!snapshot.has(name)) {
      snapshot.set(name, element.getAttribute(name));
      this.attributes.set(element, snapshot);
    }
    element.removeAttribute(name);
  }

  setStyle(
    element: HTMLElement,
    property: string,
    value: string,
    priority = "",
  ): void {
    const snapshot =
      this.styles.get(element) ?? new Map<string, StyleValueSnapshot>();
    if (!snapshot.has(property)) {
      snapshot.set(property, {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      });
      this.styles.set(element, snapshot);
    }
    element.style.setProperty(property, value, priority);
  }

  addNode(node: Node): void {
    this.addedNodes.add(node);
  }

  restore(): void {
    for (const [element, snapshot] of this.attributes) {
      for (const [name, value] of snapshot) {
        if (value === null) {
          element.removeAttribute(name);
        } else {
          element.setAttribute(name, value);
        }
      }
    }

    for (const [element, snapshot] of this.styles) {
      for (const [property, style] of snapshot) {
        if (style.value) {
          element.style.setProperty(property, style.value, style.priority);
        } else {
          element.style.removeProperty(property);
        }
      }
    }

    for (const node of this.addedNodes) {
      node.parentNode?.removeChild(node);
    }

    this.attributes.clear();
    this.styles.clear();
    this.addedNodes.clear();
  }
}
