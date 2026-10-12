/**
 * HOW A PRINTER IS REACHED, and the one validator both sides use (B4): the settings screen refuses a
 * value before saving it, and the main process refuses it again before a socket or a command line
 * sees it. Pure: no Node, no DOM.
 */
export type PrinterTarget =
  | { readonly kind: "tcp"; readonly host: string; readonly port: number }
  | { readonly kind: "share"; readonly path: string };

/** A host name or IPv4 address; nothing a socket would read as something else. */
const HOST = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
/** `\\COMPUTER\Share`: two parts, no further separators, quotes, wildcards, colons or shell characters. */
const SHARE = /^\\\\[A-Za-z0-9][A-Za-z0-9._-]{0,62}\\[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/;

/** Which part of a target is wrong ("host", "port", "share", "kind"), or null when it is usable. */
export function targetProblem(t: unknown): "host" | "port" | "share" | "kind" | null {
  const o = t as Record<string, unknown> | null;
  if (o === null || typeof o !== "object") return "kind";
  if (o["kind"] === "tcp") {
    if (typeof o["host"] !== "string" || !HOST.test(o["host"])) return "host";
    const p = o["port"];
    if (typeof p !== "number" || !Number.isInteger(p) || p < 1 || p > 65535) return "port";
    return null;
  }
  if (o["kind"] === "share") {
    const p = o["path"];
    if (typeof p !== "string" || !SHARE.test(p) || p.endsWith(" ") || p.endsWith(".")) return "share";
    return null;
  }
  return "kind";
}
