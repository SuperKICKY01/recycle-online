/**
 * THE BRIDGE between the sandboxed renderer and the main process. Deliberately narrow: named
 * functions only, never `ipcRenderer` itself. The session token crosses it in one direction per
 * call and is stored by the main process alone (src/main/sessionStore.ts, OS-backed encryption).
 */
import { contextBridge, ipcRenderer } from "electron";

export interface ShopConfigBridge {
  apiBase: string;
  shopCode: string;
  tenantId: string;
}

const bridge = {
  version: "0.0.0",
  session: {
    load: (): Promise<string | null> => ipcRenderer.invoke("session:load"),
    save: (token: string): Promise<boolean> => ipcRenderer.invoke("session:save", token),
    clear: (): Promise<void> => ipcRenderer.invoke("session:clear"),
  },
  config: {
    load: (): Promise<ShopConfigBridge | null> => ipcRenderer.invoke("config:load"),
    save: (c: ShopConfigBridge): Promise<void> => ipcRenderer.invoke("config:save", c),
    clear: (): Promise<void> => ipcRenderer.invoke("config:clear"),
  },
};

export type RecycleBridge = typeof bridge;

contextBridge.exposeInMainWorld("recycle", bridge);
