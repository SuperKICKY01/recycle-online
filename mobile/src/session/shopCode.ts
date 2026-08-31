/**
 * EXCHANGING A TYPED SHOP CODE FOR THE SHOP'S IDENTIFIER — step one of setup,
 * and the only request this app makes before any principal exists.
 *
 * PURE TypeScript, no React and no Expo, for the reason signInIdentity.ts gives:
 * `app/api.ts` reaches expo-constants through `./config` and no headless proof
 * can load it, so a classification living there is one no assertion can redden.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE SERVER ACTUALLY DOES, read from server/app/directory.py
 * ---------------------------------------------------------------------------
 * `POST /auth/shop-code {code}` answers `200 {tenant_id}` or **404**. The 404 is
 * ONE module-level object raised from three sites — unknown code, malformed
 * code, over-long input — and that is deliberate: the caller holds no credential
 * and has claimed to be nobody, so a refusal that distinguished those cases
 * would be a free oracle over the shop directory. THIS CLIENT MUST NOT
 * RE-INVENT THE DISTINCTION the server refused to make. There is exactly one
 * "that code did not work" answer here, and no shape check before sending:
 * a client-side pattern would tell the person typing something the server
 * declines to tell them, and would disagree with `ck_shop_code` the day the
 * alphabet changes.
 *
 * ---------------------------------------------------------------------------
 * A CODE THAT DOES NOT RESOLVE IS NOT A LOGIN FAILURE
 * ---------------------------------------------------------------------------
 * The two are different questions asked of different relations at different
 * moments, and the person in the yard does different things: a bad code is
 * fixed by reading the card the shop was given, a bad password by typing again.
 * Folding them together is the same defect the login path carried until
 * `acea1ac`, one step earlier in the chain.
 */

/** The shop, as the SERVER resolved it. Never derived on the device. */
export interface ResolvedShop {
  tenant_id: string;
}

/** The slice of an HTTP response this needs. Structural — see signInIdentity. */
export interface ShopCodeHttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/**
 * WHAT A SHOP-CODE EXCHANGE PRODUCED.
 *
 * FOUR MEMBERS, parallel to SignInResult and separate from it on purpose: this
 * runs BEFORE any account is named, so none of its outcomes can be phrased about
 * credentials without lying.
 *
 *   ok           — the server resolved the code to a shop.
 *   unknown_code — the server ANSWERED 404. The code is not one it knows. This
 *                  is the only thing the server is willing to say, and it covers
 *                  malformed and unknown alike.
 *   unreachable  — no answer at all. The code was never judged.
 *   server_fault — the server answered with something unusable: a status that is
 *                  not 200 or 404, or a 200 whose body carries no tenant.
 */
export type ShopCodeResult =
  | ({ kind: "ok" } & ResolvedShop)
  | { kind: "unknown_code" }
  | { kind: "unreachable" }
  | { kind: "server_fault"; status: number; detail: "unexpected_status" | "no_tenant" };

/** The status the server uses for "no such code". One place, one number. */
export const UNKNOWN_SHOP_CODE_STATUS = 404;

function readString(body: unknown, key: string): string | null {
  if (typeof body !== "object" || body === null || !(key in body)) return null;
  const raw = (body as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Run the exchange and say what happened. The fetch is injected for the reason
 * attemptLogin's is: it makes every branch — the outage included — reachable by
 * a headless proof against a real server and a real dead port.
 *
 * A 200 WITHOUT A TENANT IS NOT A SHOP, and it is the same defect the login path
 * carried: a cast would make an absent field `undefined` typed as `string`, and
 * the device would then be "set up" for a shop whose identifier is the word
 * undefined, stamping it onto every row it writes.
 */
export async function exchangeShopCode(
  doFetch: () => Promise<ShopCodeHttpResponse>,
): Promise<ShopCodeResult> {
  let res: ShopCodeHttpResponse;
  try {
    res = await doFetch();
  } catch {
    return { kind: "unreachable" };
  }

  if (!res.ok) {
    return res.status === UNKNOWN_SHOP_CODE_STATUS
      ? { kind: "unknown_code" }
      : { kind: "server_fault", status: res.status, detail: "unexpected_status" };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const tenantId = readString(body, "tenant_id");
  if (tenantId === null) {
    return { kind: "server_fault", status: res.status, detail: "no_tenant" };
  }
  return { kind: "ok", tenant_id: tenantId };
}

/**
 * WHAT THE OPERATOR READS, derived from the cause.
 *
 * THE FIRST SENTENCE NAMES THE CODE AND NEVER A PASSWORD — at setup no account
 * has been named yet, so any mention of credentials would be about something the
 * person has not been asked for. And it says where to look: the code is on the
 * paper the shop was given, not something they can work out.
 */
export function shopCodeNotice(result: ShopCodeResult): string | null {
  switch (result.kind) {
    case "ok":
      return null;
    case "unknown_code":
      return "รหัสร้านนี้ใช้ไม่ได้ — ตรวจสอบรหัส 8 หลักที่ร้านได้รับ แล้วลองอีกครั้ง";
    case "unreachable":
      return "ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบการเชื่อมต่อเน็ต แล้วลองอีกครั้ง (ไม่ใช่เรื่องรหัสร้าน)";
    case "server_fault":
      return "เซิร์ฟเวอร์ตอบกลับผิดปกติ จึงตั้งค่าร้านไม่ได้ — รหัสร้านไม่ใช่ปัญหา แจ้งเจ้าของร้าน";
  }
}
