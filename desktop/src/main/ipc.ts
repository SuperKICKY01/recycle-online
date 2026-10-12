/**
 * The main process's IPC handlers. Each one refuses a caller whose frame is not this program's
 * own page (app://recycle): a navigation the window refused anyway, or an embedded frame, must
 * not reach the session.
 */
import { ipcMain, type IpcMainInvokeEvent } from "electron";

import { pageToPdf, saveFile } from "./files";
import { isOurPage } from "./origin";
import { sendToPrinter } from "./printer";
import { isPrinterSettings, loadPrinterSettings, savePrinterSettings } from "./printerStore";
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
  if (!isOurPage(url)) throw new Error(`refused: IPC from ${url || "an unknown frame"}`);
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
  ipcMain.handle("printer:load", (e) => { fromOurPage(e); return loadPrinterSettings(); });
  ipcMain.handle("printer:save", (e, s: unknown) => {
    fromOurPage(e);
    if (!isPrinterSettings(s)) throw new Error("refused: not printer settings");
    savePrinterSettings(s);
  });
  ipcMain.handle("file:save", async (e, bytes: unknown, name: unknown) => {
    fromOurPage(e);
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 50_000_000 || typeof name !== "string") {
      throw new Error("refused: not a file");
    }
    return saveFile(e.sender, bytes, name);
  });
  ipcMain.handle("print:pdf", async (e) => { fromOurPage(e); return pageToPdf(e.sender); });
  // The bytes go to the SAVED printer only: the page cannot name a host or a share of its own.
  ipcMain.handle("printer:send", async (e, bytes: unknown) => {
    fromOurPage(e);
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 1_000_000) throw new Error("refused: not slip bytes");
    const s = loadPrinterSettings();
    if (s === null) return { kind: "not_configured" };
    return sendToPrinter(s.target, bytes);
  });
}
