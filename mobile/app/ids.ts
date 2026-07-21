/**
 * UUID source for the device.
 *
 * expo-crypto rather than globalThis.crypto.randomUUID(): whether that global
 * exists under Hermes was never verified, and an idempotency key is the last
 * thing to build on an unchecked assumption. expo-crypto.randomUUID() is
 * declared `(): string` in the package's own types and is RFC4122 v4.
 */
import * as Crypto from "expo-crypto";

import type { IdSource } from "../src/sync/types";

export const deviceIds: IdSource = {
  newId: (): string => Crypto.randomUUID(),
};
