/**
 * The proofs' INDEPENDENT reader of an .xlsx (not a proof itself): desktop/tools/read_xlsx.py, run
 * with the server's Python -- its own zipfile and XML parser, sharing no code with src/shared/xlsx.ts.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { DESKTOP_ROOT } from "./harness";

export interface XlsxRead {
  zip_ok: boolean; parts: string[]; content_ok: boolean; sheet_name: string; numfmts: Record<string, string>;
  xf_numfmt: string[]; cells: Record<string, { type: string; text: string; style: string | null }>;
}

export function readXlsx(path: string): XlsxRead {
  const python = join(DESKTOP_ROOT, "..", "server", ".venv", "Scripts", "python.exe");
  const r = spawnSync(python, [join(DESKTOP_ROOT, "tools", "read_xlsx.py"), path], { encoding: "utf8", env: { ...process.env, PYTHONUTF8: "1" } });
  if (r.status !== 0) throw new Error(`read_xlsx.py exited ${String(r.status)}: ${r.stderr}`);
  return JSON.parse(r.stdout) as XlsxRead;
}

/** The format code a cell is shown with. */
export const formatOf = (x: XlsxRead, style: string | null | undefined): string => x.numfmts[x.xf_numfmt[Number(style)] ?? ""] ?? "";
