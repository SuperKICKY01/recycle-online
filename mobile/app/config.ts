/**
 * THE server URL. This is the only place it exists.
 *
 * The value itself lives in app.json under expo.extra.apiBaseUrl. To point the
 * app at a different server — a colleague's machine now, a cloud host later —
 * edit that one line in app.json and restart the bundler. No code changes, no
 * rebuild of anything else, and nothing platform-specific: the same value is
 * used on iOS, Android and web.
 */
import Constants from "expo-constants";

interface AppExtra {
  apiBaseUrl?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as AppExtra;

if (!extra.apiBaseUrl) {
  throw new Error(
    "expo.extra.apiBaseUrl is missing from app.json — the app has no server to talk to.",
  );
}

export const API_BASE_URL: string = extra.apiBaseUrl;

/*
 * THE HARDCODED SHOP AND CREDENTIALS ARE GONE — P1.7 step 6.
 *
 * This module exported a `DEMO` constant holding a tenant uuid, a username and
 * a real password for a seeded account. Everything that signed in read it, so
 * every device ran as the same person in the same shop and no ownership
 * mechanism built in this phase was ever exercised by a real identity.
 *
 * The shop now comes from a code typed once at setup and resolved BY THE SERVER
 * (src/session/shopCode.ts), and is remembered in `local_shop`. The account
 * comes from a person typing a username and password on the login screen. This
 * module is left holding the one thing it was always for: the server URL.
 *
 * NOTHING MAY PUT CREDENTIALS BACK HERE. A value in this file is compiled into
 * the bundle, is readable by anyone who has the app, and cannot be changed
 * without a release — and the last one sat in a tracked file for months.
 */

