/**
 * WHAT THE ADD-SELLER SHEET SAYS AFTER A LOCAL-FIRST CREATE — the created
 * confirmation, and the two refusals, each derived from its CAUSE.
 *
 * PURE TypeScript — no React Native, no Expo, no node — so the headless proof
 * drives exactly what the yard reads. The sheet in `app/` renders whatever this
 * returns and decides nothing, for the reason `tsconfig.node.json`'s
 * `rootDir: "src"` makes structural: a sentence living under `app/` is unproven
 * BY CONSTRUCTION, which is how an expired session once came to be displayed as
 * ออฟไลน์ with every proof green. Same division as `saveConfirmNotice.ts`,
 * `sync/parkedReason.ts` and `sync/statusNotice.ts`.
 *
 * ===========================================================================
 * WHY THIS IS A DIFFERENT UNION FROM THE ONLINE CREATE, AND THERE ARE ONLY
 * THREE OUTCOMES
 * ===========================================================================
 * A local-first create is a LOCAL write that never waits on the network. It
 * cannot be `session_expired`, `forbidden`, `invalid`, `unavailable` or
 * `ambiguous` — those were facts about a server round-trip that no longer
 * happens here. It has exactly the two the store can produce
 * (`sync/localSeller.ts`, `CreateLocalSellerResult`): the row was written and a
 * reserved code was bound (`created`), or there was no spendable code to bind
 * (`no_code`). The second is split in the RENDERING by the one fact that tells
 * a fresh device from an emptied one, so a person is never told they used up
 * codes they never received (`sync/sellerRefill.ts`, `reserveLevel`).
 *
 * ===========================================================================
 * THE DRAW ORDER IS THE CONTRACT: headline, then every line, then the button.
 * ===========================================================================
 * `app/AddSellerSheet.tsx` draws exactly this sequence and
 * `src/proof/proveLocalSellerCreate.ts` asserts the CONCATENATION rather than
 * the parts, because the defect that discipline exists for was one card whose
 * regions were each correct and which contradicted itself as a whole
 * (`lessons/403-is-about-what-the-caller-may-do.md`, "one card, two
 * renderers"). Nothing mechanical ties the two orders together — the sheet is
 * outside this program — so reordering here without reordering there leaves the
 * proof measuring the old screen.
 *
 * ===========================================================================
 * NOTHING HERE CARRIES A DIAGNOSTIC, AND THE REFUSAL WORDING IS c4's OWN
 * ===========================================================================
 * The refusal's sentences are `reserveNotice.ts`'s, reused verbatim — the same
 * wording the continuous reserve strip shows — so an operator meets ONE account
 * of what "no codes" means, not two that can drift. A refusal never invents a
 * number: the remaining count passed to the reserve wording is `0`, which is
 * TRUE (a `no_code` refusal means the spendable holding is empty), and no
 * `target` is needed or faked, because with the spendable holding empty the
 * level is `exhausted` or `never_provisioned` and the `ample`/`low` branch that
 * reads a target is unreachable (`fallback-default-is-a-wrong-number.md`).
 */
import type { CreateLocalSellerResult, LocalSeller } from "../sync/localSeller.js";
import type { ReserveLevel } from "../sync/sellerRefill.js";
import { reserveLevelNotice } from "./reserveNotice.js";

/**
 * A tone is a STATE, not a colour — the rule `sync/parkedReason.ts` states for
 * `NoticeTone`. `created` is the green confirmation; `blocked` is the red
 * refusal a person must act on elsewhere (connect, or add at the counter).
 * There is no amber: neither state is one that clears itself on the next pass.
 */
export type LocalCreateTone = "created" | "blocked";

/**
 * The one control the notice offers, or null. Only `created` offers one — the
 * pick — and its handler reads the seller off the create RESULT, never off the
 * notice, so a diagnostic cannot travel with the button.
 */
export type LocalCreateButton = { kind: "pick"; label: string } | null;

/**
 * WHAT THE SCREEN DRAWS, and the order it draws it in: headline, then every
 * line, then the button's label. The lines ARE the whole content — a caller
 * renders the tone, the headline, then the lines, then the button.
 */
export interface LocalSellerCreateNotice {
  readonly tone: LocalCreateTone;
  readonly headline: string;
  readonly lines: readonly string[];
  readonly action: LocalCreateButton;
}

/** True of every save regardless of grade, so it is stated once. */
const PICK_LABEL = "เลือกผู้ขายรายนี้";

/**
 * THE CONFIRMATION FOR A SELLER JUST WRITTEN LOCALLY.
 *
 * It names the RESERVED CODE — the string that goes on the shop's paper, which
 * the operator cannot see any other way — and it PROMISES the seller will be
 * sent, which is TRUE and is the whole difference from the old online path: a
 * seller now has a queue (the `seller_create` outbox) that drains it, where the
 * online create had none and had to say so. The grade line is DERIVED from the
 * seller's own grade, not hardcoded: this sheet offers no grade field
 * (ROADMAP D1), so a seller created here arrives with none and its bill parks
 * at 424 `seller_grade_unset` — said HERE, before the pick, because the person
 * who has just created a seller never sees the picker's row warning.
 *
 * NOTHING ELSE OFF THE SELLER REACHES THIS TEXT. `LocalSeller` also carries
 * `id_number`, `address`, `vehicle_no`, a `reservation_token` and the owner
 * pair; a screen that printed any of them would be
 * `a-refusal-hands-back-what-it-refused.md` arriving through the success path.
 * The token especially is a bearer secret and never renders.
 */
function created(seller: LocalSeller): LocalSellerCreateNotice {
  const lines = [
    `${seller.name} · รหัส ${seller.code}`,
    "จะส่งขึ้นระบบให้อัตโนมัติเมื่อต่อเน็ต — ระหว่างนี้บันทึกบิลกับผู้ขายรายนี้ได้",
  ];
  if (seller.grade === null) {
    lines.push("ยังไม่ได้จัดเกรด — บิลจะค้างรอสำนักงานกำหนดเกรดก่อนจึงจะส่งได้");
  }
  return {
    tone: "created",
    headline: "เพิ่มผู้ขายแล้ว",
    lines,
    action: { kind: "pick", label: PICK_LABEL },
  };
}

/**
 * THE REFUSAL, BY CAUSE.
 *
 * A `no_code` refusal means the spendable holding is empty — that is the only
 * thing that makes `createLocalSeller` refuse. Which of the two empty states it
 * is turns on `held`: a device that has NEVER received a quota has no rows at
 * all (`held === 0`), and a device that has spent them all has rows but none
 * free. Telling a fresh device it "used up" its codes would be a confident lie
 * about something it never did, so the two must not collapse
 * (`sync/sellerRefill.ts`, `reserveLevel`; `reserveNotice.ts`).
 *
 * The lines are c4's own, and no `target` is read: the `ample`/`low` branch
 * that would need one is unreachable when the spendable holding is empty.
 */
function refusedNoCode(held: number): LocalSellerCreateNotice {
  const level: ReserveLevel = held === 0 ? "never_provisioned" : "exhausted";
  return {
    tone: "blocked",
    headline: "เพิ่มผู้ขายใหม่ไม่ได้ตอนนี้",
    // `remaining` is 0, which is TRUE for a `no_code` refusal and is shown by
    // neither of these two levels; it is not an invented convenience.
    lines: reserveLevelNotice(level, 0).lines,
    // No button: nothing on this sheet fixes it. The lines name what the yard
    // CAN still do (record against an existing seller; add at the counter once
    // online) — the same presence-sibling the reserve strip carries.
    action: null,
  };
}

/**
 * THE OPERATOR-FACING RESULT OF ONE LOCAL CREATE.
 *
 * Takes the store's RESULT and `held`, and nothing else — no status, no body,
 * no diagnostic — so the leak is unrepresentable at the signature, the move
 * `correct-classification-can-still-render-as-an-error.md` prescribes. `held`
 * is a plain count and only ever separates `exhausted` from `never_provisioned`
 * on the refusal; it is unread on `created`.
 */
export function localSellerCreateNotice(
  result: CreateLocalSellerResult,
  held: number,
): LocalSellerCreateNotice {
  switch (result.kind) {
    case "created":
      return created(result.seller);
    case "refused":
      // One refusal member today (`no_code`); the switch on the refusal keeps a
      // second one a compile error rather than a silent fall-through.
      switch (result.refusal.kind) {
        case "no_code":
          return refusedNoCode(held);
        default: {
          const never: never = result.refusal.kind;
          throw new Error(`unhandled local-create refusal: ${JSON.stringify(never)}`);
        }
      }
    default: {
      const never: never = result;
      throw new Error(`unhandled local-create result: ${JSON.stringify(never)}`);
    }
  }
}
