export type Listener = () => void;

export class Publisher {
  readonly #listeners = new Map<string, Set<Listener>>();

  subscribe(key: string, listener: Listener): () => void {
    const listeners = this.#listeners.get(key) ?? new Set<Listener>();
    listeners.add(listener);
    this.#listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && this.#listeners.get(key) === listeners) {
        this.#listeners.delete(key);
      }
    };
  }

  publish(key: string): void {
    const listeners = this.#listeners.get(key);
    if (listeners === undefined) {
      return;
    }
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        listeners.delete(listener);
      }
    }
  }

  listenerCount(key: string): number {
    return this.#listeners.get(key)?.size ?? 0;
  }
}
