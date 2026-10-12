import type { RecycleBridge } from "../preload/preload";

declare global {
  interface Window {
    readonly recycle: RecycleBridge;
  }
}

export {};
