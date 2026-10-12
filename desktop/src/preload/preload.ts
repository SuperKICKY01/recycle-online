/**
 * THE BRIDGE between the sandboxed renderer and the main process. Deliberately narrow: the
 * renderer gets named functions, never `ipcRenderer` itself. B1 exposes only the app version;
 * the session (B2) adds its calls here and nowhere else.
 */
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("recycle", {
  version: "0.0.0",
});
