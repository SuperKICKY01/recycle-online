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
