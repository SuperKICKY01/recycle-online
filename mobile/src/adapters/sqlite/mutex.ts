/**
 * A promise-chain mutex serialising access to ONE SQLite connection.
 *
 * Why this exists as of Phase 2c-3. Until now every store method was a single
 * SQL statement, so SQLite's implicit per-statement transaction supplied all
 * the atomicity needed and nothing could interleave. The cart's draft -> bill
 * promotion breaks that: it must insert the bill AND clear the draft as one
 * indivisible step, which means an explicit BEGIN ... COMMIT.
 *
 * The hazard that forces a mutex, rather than just wrapping the transaction:
 * on an async driver (expo-sqlite) any other awaited statement on the same
 * connection can land BETWEEN the BEGIN and the COMMIT. It would silently join
 * the transaction — and be rolled back with it, or commit early with it. A
 * mutex around only the transaction does NOT prevent this, because the
 * intruder never asks for the lock.
 *
 * So the rule is: EVERY operation on the connection takes this lock, and the
 * statements inside a transaction bypass it (they already hold it, via the
 * transaction that owns them). Anything else deadlocks or corrupts.
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  /**
   * Queues `fn` to run after everything already queued. Rejections are
   * contained: a failed operation must not poison the chain for the next one,
   * or one thrown statement would wedge the database for the whole session.
   */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
