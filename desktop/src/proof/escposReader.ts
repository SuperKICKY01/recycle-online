/**
 * AN ESC/POS READER WRITTEN FOR THE PROOFS, independent of src/shared/slip.ts: commands by their
 * lengths, text up to each LF, decoded by Node's own windows-874 decoder (not our TIS-620 table).
 * Not a proof itself (the build only bundles prove*.ts).
 */
export function parseEscPos(b: Uint8Array): { lines: Uint8Array[]; commands: string[] } {
  const lines: Uint8Array[] = [];
  const commands: string[] = [];
  let cur: number[] = [];
  for (let i = 0; i < b.length; ) {
    const x = b[i] ?? 0;
    if (x === 0x1b || x === 0x1d || x === 0x1c) {
      const op = b[i + 1] ?? 0;
      const two = (x === 0x1b && op === 0x40) || (x === 0x1c && op === 0x2e);
      const four = x === 0x1d && op === 0x56;
      const len = two ? 2 : four ? 4 : 3;
      commands.push(Array.from(b.slice(i, i + len), (v) => v.toString(16).padStart(2, "0")).join(" "));
      i += len;
    } else if (x === 0x0a) {
      lines.push(Uint8Array.from(cur));
      cur = [];
      i += 1;
    } else {
      cur.push(x);
      i += 1;
    }
  }
  return { lines, commands };
}

export const decode874 = (b: Uint8Array): string => new TextDecoder("windows-874").decode(b);

/** Column count restated here: Thai above/below marks are U+0E31, U+0E34-0E3A, U+0E47-0E4E. */
export const cols = (s: string): number => s.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, "").length;
