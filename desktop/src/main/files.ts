/**
 * SAVING A REPORT FILE AND PRINTING TO PDF (B7). The page hands over BYTES and a suggested NAME; it
 * never names a folder. The main process asks the operator where, through the system dialog, and
 * accepts only a plain file name ending .xlsx or .pdf -- a name carrying a path, a drive or a
 * colon (an NTFS stream on this platform) is refused before any dialog opens.
 *
 * RECYCLE_SAVE_DIR (proofs only, like RECYCLE_USER_DATA): when set, the file is written there under
 * its suggested name with no dialog, so a proof can read back what the operator would have saved.
 */
import { BrowserWindow, dialog, type WebContents } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export type SaveOutcome = { kind: "saved"; path: string } | { kind: "cancelled" } | { kind: "refused" } | { kind: "failed"; detail: string };

const NAME = /^[^\\/:*?"<>|\u0000-\u001f]{1,120}\.(xlsx|pdf)$/i;

export function nameProblem(name: unknown): string | null {
  if (typeof name !== "string" || !NAME.test(name) || name.startsWith(".") || name.trim() !== name) return "name";
  return null;
}

export async function saveFile(sender: WebContents, bytes: Uint8Array, suggested: string): Promise<SaveOutcome> {
  if (nameProblem(suggested) !== null) return { kind: "refused" };
  try {
    const proofDir = process.env["RECYCLE_SAVE_DIR"];
    let path: string;
    if (proofDir !== undefined && proofDir !== "") path = join(proofDir, suggested);
    else {
      const win = BrowserWindow.fromWebContents(sender);
      const ext = suggested.toLowerCase().endsWith(".pdf") ? "pdf" : "xlsx";
      const opts = { defaultPath: suggested, filters: [{ name: ext === "pdf" ? "PDF" : "Excel", extensions: [ext] }] };
      const r = win !== null ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || r.filePath === undefined || r.filePath === "") return { kind: "cancelled" };
      path = r.filePath;
    }
    writeFileSync(path, bytes);
    return { kind: "saved", path };
  } catch (e) {
    return { kind: "failed", detail: e instanceof Error ? e.message.slice(0, 200) : "unknown" };
  }
}

/** The calling page as an A4 PDF, Chromium's own print path (the same layout window.print() sends). */
export async function pageToPdf(sender: WebContents): Promise<Uint8Array> {
  const buf = await sender.printToPDF({ pageSize: "A4", printBackground: true, margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } });
  return new Uint8Array(buf);
}
