export class TurnQueue {
  readonly #tails = new Map<string, Promise<void>>();

  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const tail = this.#tails.get(key) ?? Promise.resolve();
    const result = tail.then(work);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.#tails.set(key, settled);
    void settled.then(() => {
      if (this.#tails.get(key) === settled) {
        this.#tails.delete(key);
      }
    });
    return result;
  }

  pending(key: string): boolean {
    return this.#tails.has(key);
  }
}
