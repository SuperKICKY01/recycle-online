/**
 * WHERE THE SESSION TOKEN LIVES BETWEEN RUNS (ADVISOR-DECIDED D-3): Electron's OS-backed secret
 * storage. `safeStorage.encryptString` encrypts with the operating system's own key (DPAPI on
 * Windows, bound to this Windows user), and only that CIPHERTEXT is written, to
 * `<userData>/session.bin`. The plaintext token is never written to a file and never enters the
 * renderer's localStorage, sessionStorage or IndexedDB; the renderer holds it in memory only.
 *
 * IF THE OS OFFERS NO ENCRYPTION (`isEncryptionAvailable()` false), NOTHING IS PERSISTED: the
 * session lives in memory for this run and the operator signs in again next time. Falling back
 * to plain text would be the exact thing D-3 forbids.
 *
 * The shop's connection settings (server address, shop code, tenant id) are NOT secret and live
 * in `<userData>/config.json`.
 */
import { app, safeStorage } from "electron";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface StoredConfig {
  readonly apiBase: string;
  readonly shopCode: string;
  readonly tenantId: string;
}

const tokenPath = (): string => join(app.getPath("userData"), "session.bin");
const configPath = (): string => join(app.getPath("userData"), "config.json");

export function saveToken(token: string): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  writeFileSync(tokenPath(), safeStorage.encryptString(token));
  return true;
}

export function loadToken(): string | null {
  const p = tokenPath();
  if (!existsSync(p) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(readFileSync(p));
  } catch {
    // Unreadable ciphertext (another Windows user, a corrupted or truncated file): signed out.
    try {
      rmSync(p, { force: true });
    } catch {
      /* a locked file stays; it still cannot be decrypted, so it still reads as signed out */
    }
    return null;
  }
}

/**
 * Delete the stored session. If the delete fails (a file held open by a backup or virus scanner on
 * Windows), TRUNCATE it instead: an empty session.bin cannot be decrypted, so the next launch is
 * signed out either way. Only if both fail does the error reach the renderer, which says so
 * (SESSION_TEXT.clearFailed).
 */
export function clearToken(): void {
  try {
    rmSync(tokenPath(), { force: true });
  } catch {
    writeFileSync(tokenPath(), Buffer.alloc(0));
  }
}

export function loadConfig(): StoredConfig | null {
  const p = configPath();
  if (!existsSync(p)) return null;
  try {
    const o = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    if (typeof o["apiBase"] === "string" && typeof o["shopCode"] === "string" && typeof o["tenantId"] === "string") {
      return { apiBase: o["apiBase"], shopCode: o["shopCode"], tenantId: o["tenantId"] };
    }
  } catch {
    /* fall through: no usable config */
  }
  return null;
}

export function saveConfig(c: StoredConfig): void {
  writeFileSync(configPath(), JSON.stringify(c, null, 2), "utf8");
}

export function clearConfig(): void {
  rmSync(configPath(), { force: true });
}
