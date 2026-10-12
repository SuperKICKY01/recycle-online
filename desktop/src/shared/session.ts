/**
 * THE DESKTOP SESSION — pure, so a proof drives exactly this (B2, ADVISOR-DECIDED 2026-10-12).
 *
 * THE RULE PART 0 OF THIS RUN PAID FOR, built in rather than remembered: a 401 ENDS the session.
 * The token is dropped (memory AND the OS-backed store, through `persist`), the operator is told,
 * and NO further request is sent until a sign-in — every authenticated call short-circuits to
 * `unauthorized` without touching the network while there is no token. There is no timer and no
 * poll anywhere in this module, so nothing can re-send a dead token on a schedule
 * (lessons/401-is-about-the-caller-not-the-bill.md, the 2026-10-12 amendment).
 *
 * The token never enters this page's storage: it lives in this object's memory and, between
 * runs, in the main process's safeStorage file (src/main/sessionStore.ts).
 */
import type { ApiClient, ApiOutcome, WhoAmI } from "./api";

/** What the screen says, decided here so the screen writes no Thai of its own about a session. */
export const SESSION_TEXT = {
  expired: "หมดเวลาเข้าใช้งาน — กรุณาเข้าสู่ระบบอีกครั้ง",
  badCredentials: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
  unknownShop: "ไม่พบรหัสร้านนี้ — ตรวจรหัส 8 ตัวอีกครั้ง",
  offline: "ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจการเชื่อมต่อเครือข่าย แล้วลองอีกครั้ง",
  outdated: "โปรแกรมนี้เก่ากว่าที่เซิร์ฟเวอร์รองรับ — ต้องอัปเดตก่อนจึงจะใช้งานได้",
  signedOut: "ออกจากระบบแล้ว",
  badAddress: "ที่อยู่เซิร์ฟเวอร์ไม่ถูกต้อง — ใช้รูปแบบ http://ที่อยู่:พอร์ต",
} as const;

export interface ShopConfig {
  readonly apiBase: string;
  readonly shopCode: string;
  readonly tenantId: string;
}

/** What the main process keeps between runs, behind the preload bridge. */
export interface SessionPersistence {
  saveToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

export type SignInResult = { ok: true; me: WhoAmI } | { ok: false; notice: string };

/** One outcome that is not `ok`, as the sentence the operator reads. */
export function noticeFor(outcome: ApiOutcome<unknown>, context: "login" | "shop" | "session"): string {
  switch (outcome.kind) {
    case "unauthorized":
      return context === "login" ? SESSION_TEXT.badCredentials : SESSION_TEXT.expired;
    case "not_found":
      return context === "shop" ? SESSION_TEXT.unknownShop : SESSION_TEXT.offline;
    case "outdated":
      return SESSION_TEXT.outdated;
    case "unavailable":
      return SESSION_TEXT.offline;
    case "forbidden":
      return "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้";
    case "invalid":
      return context === "shop" ? SESSION_TEXT.unknownShop : "คำขอไม่ถูกต้อง";
    case "ok":
      return "";
  }
}

/** A typed server address, normalised, or null when it is not an http(s) URL. */
export function normaliseApiBase(raw: string): string | null {
  const s = raw.trim().replace(/\/+$/, "");
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.pathname !== "/" && u.pathname !== "") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export class Session {
  private token: string | null;
  me: WhoAmI | null = null;
  /** The sentence the sign-in screen shows; null when there is nothing to say. */
  notice: string | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly persistence: SessionPersistence,
    initialToken: string | null,
  ) {
    this.token = initialToken;
  }

  get signedIn(): boolean {
    return this.token !== null;
  }

  /** Sign in with the shop's tenant; the token is kept only once whoami confirms it. */
  async signIn(tenantId: string, username: string, password: string): Promise<SignInResult> {
    const login = await this.api.login(tenantId, username, password);
    if (login.kind !== "ok") return { ok: false, notice: noticeFor(login, "login") };
    const who = await this.api.whoami(login.value);
    if (who.kind !== "ok") return { ok: false, notice: noticeFor(who, "session") };
    this.token = login.value;
    this.me = who.value;
    this.notice = null;
    await this.persistence.saveToken(login.value);
    return { ok: true, me: who.value };
  }

  /** On start-up with a stored token: confirm it once. A 401 ends it like any other. */
  async resume(): Promise<boolean> {
    if (this.token === null) return false;
    const who = await this.authed((t) => this.api.whoami(t));
    if (who.kind !== "ok") return false;
    this.me = who.value;
    return true;
  }

  /**
   * EVERY authenticated call goes through here. No token: answered `unauthorized` WITHOUT a
   * request. A 401: the session ends, once, and stays ended until signIn.
   */
  async authed<T>(call: (token: string) => Promise<ApiOutcome<T>>): Promise<ApiOutcome<T>> {
    if (this.token === null) return { kind: "unauthorized" };
    const out = await call(this.token);
    if (out.kind === "unauthorized") await this.end(SESSION_TEXT.expired);
    return out;
  }

  async signOut(): Promise<void> {
    await this.end(SESSION_TEXT.signedOut);
  }

  private async end(notice: string): Promise<void> {
    this.token = null;
    this.me = null;
    this.notice = notice;
    await this.persistence.clearToken();
  }
}
