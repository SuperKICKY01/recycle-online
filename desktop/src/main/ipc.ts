/**
 * The main process's IPC handlers. Each one refuses a caller whose frame is not this program's
 * own page (app://recycle): a navigation the window refused anyway, or an embedded frame, must
 * not reach the session.
 */
import { ipcMain, type IpcMainInvokeEvent } from "electron";

import { APP_ORIGIN } from "./origin";
import {
  clearConfig,
  clearToken,
  loadConfig,
  loadToken,
  saveConfig,
  saveToken,
  type StoredConfig,
} from "./sessionStore";

function fromOurPage(e: IpcMainInvokeEvent): void {
  const url = e.senderFrame?.url ?? "";
  if (!url.startsWith(`${APP_ORIGIN}/`)) throw new Error(`refused: IPC from ${url || "an unknown frame"}`);
}

function isConfig(c: unknown): c is StoredConfig {
  const o = c as Record<string, unknown> | null;
  return o !== null && typeof o === "object" && typeof o["apiBase"] === "string"
    && typeof o["shopCode"] === "string" && typeof o["tenantId"] === "string";
}

export function registerIpc(): void {
  ipcMain.handle("session:load", (e) => { fromOurPage(e); return loadToken(); });
  ipcMain.handle("session:save", (e, token: unknown) => {
    fromOurPage(e);
    if (typeof token !== "string" || token === "") throw new Error("refused: not a token");
    return saveToken(token);
  });
  ipcMain.handle("session:clear", (e) => { fromOurPage(e); clearToken(); });
  ipcMain.handle("config:load", (e) => { fromOurPage(e); return loadConfig(); });
  ipcMain.handle("config:save", (e, c: unknown) => {
    fromOurPage(e);
    if (!isConfig(c)) throw new Error("refused: not a shop config");
    saveConfig(c);
  });
  ipcMain.handle("config:clear", (e) => { fromOurPage(e); clearConfig(); clearToken(); });
}
