/**
 * The production Clock. Pure TypeScript — setTimeout is a global on every
 * runtime we target (node, Hermes, browsers), so nothing is imported here and
 * the engine stays platform-neutral.
 *
 * The proof replaces this with FakeClock, which advances virtual time instead
 * of waiting. That is the whole reason Clock is an injected interface.
 */
import type { Clock } from "./types.js";

export const systemClock: Clock = {
  now: (): Date => new Date(),
  sleep: (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    }),
};
