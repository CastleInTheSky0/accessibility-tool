export class TypedEmitter<EventMap extends object> {
  private readonly listeners = new Map<keyof EventMap, Set<(value: never) => void>>();

  on<K extends keyof EventMap>(
    eventName: K,
    listener: (payload: EventMap[K]) => void,
  ): void {
    const listeners = this.listeners.get(eventName) ?? new Set();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
  }

  off<K extends keyof EventMap>(
    eventName: K,
    listener: (payload: EventMap[K]) => void,
  ): void {
    this.listeners
      .get(eventName)
      ?.delete(listener);
  }

  emit<K extends keyof EventMap>(eventName: K, payload: EventMap[K]): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
      (listener as (value: EventMap[K]) => void)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
