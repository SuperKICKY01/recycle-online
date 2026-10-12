/**
 * THE RENDERER'S ORIGIN (ADVISOR-DECIDED D-2; closes ROADMAP D7).
 *
 * The renderer is never loaded from `file://` -- an Electron file:// page sends
 * `Origin: null`, the same origin every sandboxed iframe presents, so a server cannot allow
 * it without allowing them all. It is served from a PRIVILEGED custom scheme instead, and
 * the server's CORS allowlist names exactly this origin (server/app/main.py). Pure: no
 * Electron import, so a proof and the server's own literal can be compared against it.
 */
export const APP_SCHEME = "app";
export const APP_HOST = "recycle";
/** What a fetch from the renderer carries in its Origin header -- MEASURED by prove:origin. */
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_INDEX_URL = `${APP_ORIGIN}/index.html`;

/**
 * IS THIS URL ONE OF THIS PROGRAM'S OWN PAGES? The one predicate both the IPC guard
 * (src/main/ipc.ts) and the navigation lock (src/main/main.ts) use, so a look-alike cannot pass
 * one and fail the other. Parsed, never substring-matched: `http://x/app://recycle/` CONTAINS the
 * origin and is not it; `app://recycle.evil/` and `app://recyclex/` START with its letters and are
 * not it. Proven by prove:session P1 (red team, 2026-10-12).
 */
export function isOurPage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}
