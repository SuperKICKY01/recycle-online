/**
 * THE PRINTER SETTINGS (B4): paper width, the printer's Thai code page, and how the printer is
 * reached. Not secret; `<userData>/printer.json`. Read back through the same validation the IPC
 * applies on save, so a hand-edited file cannot hand the sender a target it would refuse.
 */
import { app } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isCodePage, isPaperWidth, type PaperWidth } from "../shared/slip";
import { targetProblem, type PrinterTarget } from "../shared/printerTarget";

export interface PrinterSettings {
  readonly width: PaperWidth;
  readonly codePage: number;
  readonly target: PrinterTarget;
}

const settingsPath = (): string => join(app.getPath("userData"), "printer.json");

export function isPrinterSettings(v: unknown): v is PrinterSettings {
  const o = v as Record<string, unknown> | null;
  return o !== null && typeof o === "object" && isPaperWidth(o["width"]) && isCodePage(o["codePage"])
    && targetProblem(o["target"]) === null;
}

export function loadPrinterSettings(): PrinterSettings | null {
  const p = settingsPath();
  if (!existsSync(p)) return null;
  try {
    const v: unknown = JSON.parse(readFileSync(p, "utf8"));
    return isPrinterSettings(v) ? v : null;
  } catch {
    return null;
  }
}

export function savePrinterSettings(s: PrinterSettings): void {
  writeFileSync(settingsPath(), JSON.stringify(s, null, 2), "utf8");
}
