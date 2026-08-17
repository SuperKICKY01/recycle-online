/**
 * ADD A SELLER, FROM THE WEIGHBRIDGE (P1.8a phase 3).
 *
 * A walk-in arrives with a load and is not on the shop's list. `fk_bills_seller`
 * refuses a bill for a seller who does not exist, so until this screen existed a
 * shop that could not reach the office in the minute the truck was on the scale
 * could not buy the load at all.
 *
 * THIS FILE DECIDES NOTHING IT SAYS. Every sentence comes from
 * `src/master/sellerCreateNotice.ts`, every field-to-draft conversion from
 * `src/master/sellerForm.ts`, and both are pure and under `src/` for one reason:
 * `tsconfig.node.json` has `rootDir: "src"`, so nothing here can be reached by a
 * headless proof. Wording that lives under `app/` is unproven BY CONSTRUCTION,
 * which is how an expired session came to be displayed as ออฟไลน์ with every
 * proof green. Same division as StatusStrip/statusNotice and BillsPanel/billNotice.
 *
 * WHAT IS LEFT HERE IS PRESENTATION AND ONE PIECE OF ROUTING — the action
 * dispatch, which is an exhaustive switch with a `never` arm on purpose: a
 * button kind added to the notice union must be a compile error here rather than
 * a green button that does nothing, which is a worse defect than the one being
 * fixed (lessons/correct-classification-can-still-render-as-an-error.md, the R2b
 * amendment).
 *
 * ===========================================================================
 * THE DRAW ORDER IS PART OF THE CONTRACT: headline, then every line, then the
 * button. `src/proof/proveSellerNotice.ts` asserts the CONCATENATION in exactly
 * that order, because the defect that discipline exists for was one card whose
 * regions were each correct and which contradicted itself as a whole. Nothing
 * mechanical ties the two orders together — this file is outside that program —
 * so reordering here without reordering there leaves the proof measuring the old
 * screen.
 * ===========================================================================
 *
 * THE NOTICE SITS ABOVE THE FORM AND THE FORM STAYS VISIBLE. That is not layout
 * preference: three of the eight outcomes are fixed by editing a box that is
 * centimetres away, and a sheet that hides the fix while describing the problem
 * is the R2b defect — a refusal standing beside its own exit and unable to see
 * it.
 *
 * NO GRADE FIELD. See `src/master/sellerForm.ts`: a grade selects which price
 * tier the yard pays at, ROADMAP D1 settled that a yard phone must not re-price,
 * and the absence is enforced by there being no field rather than by anyone
 * remembering.
 */
import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { CreateSellerOutcome, CreatedSeller, SellerDraft } from "../src/master/createSeller";
import { sellerCreateNotice } from "../src/master/sellerCreateNotice";
import type { SellerCreateButtonKind, SellerCreateTone } from "../src/master/sellerCreateNotice";
import { BLANK_SELLER_FORM, sellerDraftFrom, sellerFormReady } from "../src/master/sellerForm";
import type { SellerFormFields } from "../src/master/sellerForm";

const TAP_MIN = 56;

/**
 * NO MODAL ELEMENT AND NO `visible` PROP. This app has one Modal — app/SheetHost
 * — and the sheet stack decides which sheet is inside it. A second one anywhere
 * reintroduces the presentation defect SheetHost's header describes, and
 * `npm run prove:sheets` goes red the moment one appears in this directory.
 */
interface Props {
  /**
   * The real create. It returns a classified outcome and NEVER THROWS — that is
   * the documented contract of `SellerApi.createSeller`, and it is why this
   * component has no catch and no error state of its own. An error state here
   * would be a ninth situation, worded in a file no proof can reach.
   */
  create: (draft: SellerDraft) => Promise<CreateSellerOutcome>;
  /** The operator chose to use the seller that was just created. */
  onPick: (seller: CreatedSeller) => void;
  /**
   * No usable session. Closes this sheet AND the picker underneath it, because
   * both are Modals and the app's usual sign-in — the status strip's button — is
   * physically beneath them.
   */
  onSignIn: () => void;
  /** Re-read the seller list and go back to the picker to look at it. */
  onRefreshList: () => void;
  onClose: () => void;
}

const TONES: Record<SellerCreateTone, { bg: string; fg: string; border: string }> = {
  created: { bg: "#dcfce7", fg: "#14532d", border: "#15803d" },
  // The operator fixes it here, now. Amber: nothing is broken and nothing is lost.
  fix_form: { bg: "#fef3c7", fg: "#78350f", border: "#b45309" },
  session: { bg: "#fef3c7", fg: "#78350f", border: "#b45309" },
  // Red, and not the support alarm: a real disagreement about what this account
  // may do, which only the shop owner can settle.
  forbidden: { bg: "#fee2e2", fg: "#7f1d1d", border: "#b91c1c" },
  retry: { bg: "#fef3c7", fg: "#78350f", border: "#b45309" },
  // Its own colour, because "we do not know" is not a shade of failure.
  verify: { bg: "#dbeafe", fg: "#1e3a8a", border: "#1d4ed8" },
};

export function AddSellerSheet({
  create,
  onPick,
  onSignIn,
  onRefreshList,
  onClose,
}: Props) {
  const [form, setForm] = useState<SellerFormFields>(BLANK_SELLER_FORM);
  const [outcome, setOutcome] = useState<CreateSellerOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = sellerFormReady(form);
  const notice = outcome === null ? null : sellerCreateNotice(outcome, "yard_add_seller");

  const set = (key: keyof SellerFormFields, value: string): void =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = useCallback(async (): Promise<void> => {
    if (busy) return;
    // The same gate the button is dimmed by. Checked here too because a retry
    // reaches this function without passing the button.
    if (!sellerFormReady(form)) return;
    setBusy(true);
    // Cleared FIRST: leaving the previous refusal on screen while the next
    // request is in flight is the half-updated state that produced the 2c-6
    // repeat — a row saying "not parked" and "here is why it was parked" at once.
    setOutcome(null);
    try {
      setOutcome(await create(sellerDraftFrom(form)));
    } finally {
      setBusy(false);
    }
  }, [busy, create, form]);

  const close = useCallback((): void => {
    setForm(BLANK_SELLER_FORM);
    setOutcome(null);
    onClose();
  }, [onClose]);

  /**
   * WHICH HANDLER THE NOTICE'S BUTTON REACHES. The label travelled with the kind
   * out of the pure renderer, so this cannot pair "เข้าสู่ระบบ" with the retry.
   */
  const act = (kind: SellerCreateButtonKind): void => {
    switch (kind) {
      case "pick_seller":
        // Only `created` produces this button and only `created` carries a
        // seller: this is a narrowing, not a branch — there is no state in which
        // the button exists and the outcome is something else.
        if (outcome !== null && outcome.kind === "created") {
          setForm(BLANK_SELLER_FORM);
          setOutcome(null);
          onPick(outcome.seller);
        }
        return;
      case "back_to_form":
        // The form is still on screen and still filled in. Dropping the notice
        // is the whole action.
        setOutcome(null);
        return;
      case "retry":
        void submit();
        return;
      case "sign_in":
        setForm(BLANK_SELLER_FORM);
        setOutcome(null);
        onSignIn();
        return;
      case "refresh_list":
        setForm(BLANK_SELLER_FORM);
        setOutcome(null);
        onRefreshList();
        return;
      default: {
        const never: never = kind;
        throw new Error(`unhandled add-seller action: ${JSON.stringify(never)}`);
      }
    }
  };

  const field = (
    key: keyof SellerFormFields,
    label: string,
    hint: string | null,
    extra: { multiline?: boolean; keyboardType?: "phone-pad" | "default" } = {},
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint !== null ? <Text style={styles.hint}>{hint}</Text> : null}
      <TextInput
        style={[styles.input, extra.multiline === true && styles.inputTall]}
        value={form[key]}
        onChangeText={(v) => set(key, v)}
        autoCorrect={false}
        autoCapitalize="none"
        multiline={extra.multiline === true}
        keyboardType={extra.keyboardType ?? "default"}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.head}>
        <Text style={styles.title}>เพิ่มผู้ขายใหม่</Text>
        <Pressable style={styles.closeBtn} onPress={close}>
          <Text style={styles.closeText}>ปิด</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/*
          THE NOTICE, IN DRAW ORDER: headline, then every line, then the button.
          proveSellerNotice asserts this concatenation; see the header.
        */}
        {notice !== null ? (
          <View
            style={[
              styles.notice,
              { backgroundColor: TONES[notice.tone].bg, borderColor: TONES[notice.tone].border },
            ]}
          >
            <Text style={[styles.noticeHead, { color: TONES[notice.tone].fg }]}>
              {notice.headline}
            </Text>
            {notice.lines.map((line, i) => (
              <Text key={i} style={[styles.noticeLine, { color: TONES[notice.tone].fg }]}>
                {line}
              </Text>
            ))}
            {notice.action !== null ? (
              <Pressable
                style={[styles.noticeBtn, { backgroundColor: TONES[notice.tone].border }]}
                onPress={() => {
                  if (notice.action !== null) act(notice.action.kind);
                }}
              >
                <Text style={styles.noticeBtnText}>{notice.action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {field("name", "ชื่อผู้ขาย (จำเป็น)", null)}
        {/*
          THE HINT PROMISES NOTHING. It says the box may be left empty, and not
          that the system will succeed in assigning a code — because
          `code_assignment_failed` is exactly the outcome where it does not, and
          a form line insisting otherwise two centimetres under that refusal
          would be one screen holding two opposite claims.
        */}
        {field("code", "รหัสผู้ขาย", "เว้นว่างได้ ถ้าร้านไม่ได้ใช้ระบบรหัสของตัวเอง")}
        {field("phone", "เบอร์โทร", null, { keyboardType: "phone-pad" })}
        {field("id_number", "เลขบัตรประชาชนหรือเลขที่เอกสาร", null)}
        {field("address", "ที่อยู่", null, { multiline: true })}
        {/*
          NOT the plate on this bill. A seller's vehicle_no is the truck they
          usually arrive in; purchase_bills.vehicle_no is the one that turned up
          today, and SRS 1.6 keeps them apart. Collapsing them is how a seller's
          master record ends up rewritten by one day's delivery.
        */}
        {field("vehicle_no", "ทะเบียนรถที่ใช้ประจำ", "ไม่ใช่ทะเบียนรถของบิลใบนี้")}

        <Pressable
          style={[styles.save, (!ready || busy) && styles.saveOff]}
          disabled={!ready || busy}
          onPress={() => void submit()}
        >
          <Text style={styles.saveText}>{busy ? "กำลังบันทึก…" : "บันทึกผู้ขาย"}</Text>
        </Pressable>
        {!ready ? <Text style={styles.gate}>ต้องกรอกชื่อผู้ขายก่อนจึงจะบันทึกได้</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#f8fafc" },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  title: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  closeBtn: {
    minHeight: 48, paddingHorizontal: 20, borderRadius: 10,
    backgroundColor: "#e2e8f0", alignItems: "center", justifyContent: "center",
  },
  closeText: { fontSize: 16, fontWeight: "800", color: "#334155" },

  body: { padding: 16, paddingBottom: 64 },

  notice: { borderRadius: 12, borderWidth: 2, padding: 12, marginBottom: 16 },
  noticeHead: { fontSize: 17, fontWeight: "900", marginBottom: 6 },
  noticeLine: { fontSize: 14, fontWeight: "700", marginTop: 4, lineHeight: 21 },
  noticeBtn: {
    minHeight: 48, borderRadius: 10, marginTop: 12,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 16,
  },
  noticeBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  field: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  hint: { fontSize: 12, color: "#64748b", fontWeight: "600", marginBottom: 4 },
  input: {
    borderWidth: 2, borderColor: "#cbd5e1", borderRadius: 10, paddingHorizontal: 12,
    minHeight: TAP_MIN, fontSize: 17, fontWeight: "700", color: "#0f172a",
    backgroundColor: "#fff",
  },
  inputTall: { minHeight: 88, textAlignVertical: "top", paddingTop: 10 },

  save: {
    minHeight: 60, borderRadius: 12, backgroundColor: "#0f766e",
    alignItems: "center", justifyContent: "center", marginTop: 8,
  },
  saveOff: { opacity: 0.4 },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  gate: { fontSize: 13, color: "#64748b", fontWeight: "700", textAlign: "center", marginTop: 10 },
});
