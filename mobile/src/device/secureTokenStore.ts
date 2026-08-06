/**
 * TokenStore over expo-secure-store — the DEVICE path.
 *
 * ============================ NOT EXECUTED ============================
 * Same situation as ExpoSqliteDriver in this directory: expo-secure-store is
 * `requireNativeModule('ExpoSecureStore')`, which exists only inside an Expo app
 * runtime, so nothing here runs under node and no proof reaches it. The proof
 * exercises the TokenStore CONTRACT through MemoryTokenStore; that this file
 * honours the contract is UNVERIFIED until it runs on a phone.
 * ======================================================================
 *
 * WHY THE KEYSTORE AND NOT SQLITE. See src/session/tokenStore.ts for the full
 * trade. Short version: persisting the token is what makes an offline morning
 * workable, and the cost of that is a credential at rest — so it goes in the
 * platform's encrypted store (Keychain / Android Keystore) rather than into
 * recycle.db, which is an ordinary file sitting next to it.
 *
 * WHY AFTER_FIRST_UNLOCK. The default (WHEN_UNLOCKED) makes the value
 * unreadable while the device is locked. Today that would be fine, because the
 * only read is at boot with someone looking at the screen — but it silently
 * breaks the moment anything runs in the background, and this is a value we want
 * available for the whole shift after the phone has been unlocked once. It is
 * still not readable on a phone that has not been unlocked since power-on.
 *
 * NOTHING HERE MAY THROW OUTWARD. A keystore that is unavailable (web, an
 * emulator without one, a corrupt entry) must degrade to "no stored token" —
 * which costs one sign-in — and never to a boot that fails. The failure to avoid
 * is a yard staring at a crashed app because of a credential cache.
 */
import * as SecureStore from "expo-secure-store";

import type { ClearOutcome, TokenStore } from "../session/tokenStore.js";

/** Namespaced so a future second value cannot collide with this one. */
const KEY = "recycle.session.token";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export class SecureTokenStore implements TokenStore {
  async load(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEY, OPTIONS);
    } catch {
      // Unavailable or unreadable. Signed out is a correct, safe answer.
      return null;
    }
  }

  async save(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(KEY, token, OPTIONS);
    } catch {
      // The session still works for this launch; only the restore is lost.
    }
  }

  /**
   * THIS COMMENT USED TO SAY "nothing depends on it having happened". R1b made
   * that false, so the swallow is gone.
   *
   * Sign-out acts on this answer: a `cleared` result is what lets the app render
   * the login screen. If the delete throws we must assume THE TOKEN IS STILL
   * THERE — a failure here and a partial success are indistinguishable from
   * outside, and the safe reading is the pessimistic one. Reporting `cleared`
   * anyway would put the yard in front of a login screen while the next cold
   * start silently restores the departed user's session.
   *
   * Deleting a key that is absent is NOT an error in expo-secure-store; it
   * resolves. So `cleared` genuinely means "no token remains", not merely "a
   * delete was attempted".
   *
   * STILL UNVERIFIED OFF-DEVICE, like everything in this directory: nothing here
   * runs under node, so the headless proof exercises this CONTRACT through
   * MemoryTokenStore and a throwing fake. That the Keychain delete itself works
   * is a DEVICE observation and nothing else can stand in for it.
   */
  async clear(): Promise<ClearOutcome> {
    try {
      await SecureStore.deleteItemAsync(KEY, OPTIONS);
      return { kind: "cleared" };
    } catch (err) {
      return {
        kind: "failed",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
