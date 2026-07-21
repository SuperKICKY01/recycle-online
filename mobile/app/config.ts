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

/**
 * Seeded tenant-A identities from server/app/seeddata.py. Hardcoded ON PURPOSE
 * for this vertical slice: there is no login form, no seller picker and no
 * product picker yet. Phase 2c-1 proves the pipes connect, nothing more.
 */
export const DEMO = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  username: "admin",
  password: "tenantA-pw-123",
  sellerId: "aaaa0000-0000-0000-0000-0000000000a4",
  productId: "aaaa0000-0000-0000-0000-0000000000a3",
} as const;
