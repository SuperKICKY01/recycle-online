/**
 * ADD A SELLER, FROM THE WEIGHBRIDGE — LOCAL-FIRST (P1.8b).
 *
 * A walk-in arrives with a load and is not on the shop's list. `fk_bills_seller`
 * refuses a bill for a seller who does not exist, so a shop that cannot reach the
 * office in the minute the truck is on the scale could not buy the load at all.
 *
 * THIS SCREEN NO LONGER TALKS TO THE SERVER. It writes the seller LOCALLY,
 * consuming one reserved code, and the `seller_create` outbox sends it (hard rule
 * 8; `sync/localSeller.ts`). So there are only two outcomes — the row was written
 * (`created`), or there was no reserved code to spend (`no_code`) — and neither
 * waits on a network round-trip.
 *
 * THIS FILE DECIDES NOTHING IT SAYS. Every sentence comes from
 * `src/master/localSellerCreateNotice.ts`, and the field-to-draft conversion from
 * `src/master/sellerForm.ts`. Both are pure and under `src/` for one reason:
 * `tsconfig.node.json` has `rootDir: "src"`, so nothing here can be reached by a
 * headless proof. Wording that lives under `app/` is unproven BY CONSTRUCTION,
 * which is how an expired session came to be displayed as ออฟไลน์ with every
 * proof green. Same division as StatusStrip/statusNotice and BillsPanel/billNotice.
 *
 * ===========================================================================
 * THE DRAW ORDER IS PART OF THE CONTRACT: headline, then every line, then the
 * button. `src/proof/proveLocalSellerCreate.ts` asserts the CONCATENATION in
 * exactly that order, because the defect that discipline exists for was one card
 * whose regions were each correct and which contradicted itself as a whole.
 * Nothing mechanical ties the two orders together — this file is outside that
 * program — so reordering here without reordering there leaves the proof
 * measuring the old screen.
 * ===========================================================================
 *
 * THE NOTICE SITS ABOVE THE FORM AND THE FORM STAYS VISIBLE, so a refusal never
 * hides the boxes it is about (the R2b defect — a refusal standing beside its own
 * exit and unable to see it).
 *
 * NO CODE FIELD AND NO GRADE FIELD. See `src/master/sellerForm.ts`: the code is a
 * RESERVATION the create binds (not something a person types), and a grade would
 * be re-pricing at the weighbridge (ROADMAP D1). Both absences are enforced by
 * there being no field rather than by anyone remembering.
 */
import { useCallback, useMemo, useState } from "react";
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

import type { CreateLocalSellerResult, LocalSeller, LocalSellerDraft } from "../src/sync/localSeller";
import { localSellerCreateNotice } from "../src/master/localSellerCreateNotice";
import type { LocalCreateButton, LocalCreateTone } from "../src/master/localSellerCreateNotice";
import { BLANK_SELLER_FORM, localSellerDraftFrom, sellerFormReady } from "../src/master/sellerForm";
import type { SellerFormFields } from "../src/master/sellerForm";
import { useTheme, type ThemeTokens } from "./theme";
import { SheetHeader } from "./SheetHeader";

/**
 * NO MODAL ELEMENT AND NO `visible` PROP. This app has one Modal — app/SheetHost
 * — and the sheet stack decides which sheet is inside it. A second one anywhere
 * reintroduces the presentation defect SheetHost's header describes, and
 * `npm run prove:sheets` goes red the moment one appears in this directory.
 */
interface Props {
  /**
   * The real create. It writes locally and returns the store's classified
   * result. It does not reach the network, so it has no session/forbidden/
   * offline outcome — only `created` or a `no_code` refusal.
   */
  create: (draft: LocalSellerDraft) => Promise<CreateLocalSellerResult>;
  /**
   * How many reserved codes this device holds, spent or not. Only the refusal
   * reads it, and only to tell a device that used its codes up (`exhausted`) from
   * one that never received any (`never_provisioned`) — the FALSE SENTENCE the
   * design refuses to let those two share.
   */
  held: number;
  /** The operator chose to use the seller that was just created. */
  onPick: (seller: LocalSeller) => void;
  onClose: () => void;
}

function makeTones(t: ThemeTokens): Record<LocalCreateTone, { bg: string; fg: string; border: string }> {
  return {
    created: { bg: t.color.successBg, fg: t.color.successFg, border: t.color.success },
    // Red, and not the support alarm: nothing is broken. The device has no code to
    // spend, and the only fixes are elsewhere — connect, or add at the counter.
    blocked: { bg: t.color.dangerBg, fg: t.color.dangerFg, border: t.color.danger },
  };
}

export function AddSellerSheet({ create, held, onPick, onClose }: Props) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const TONES = makeTones(t);
  const [form, setForm] = useState<SellerFormFields>(BLANK_SELLER_FORM);
  const [result, setResult] = useState<CreateLocalSellerResult | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = sellerFormReady(form);
  const notice = result === null ? null : localSellerCreateNotice(result, held);

  const set = (key: keyof SellerFormFields, value: string): void =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = useCallback(async (): Promise<void> => {
    if (busy) return;
    // The same gate the button is dimmed by. Checked here too because a retry
    // reaches this function without passing the button.
    if (!sellerFormReady(form)) return;
    setBusy(true);
    // Cleared FIRST: leaving the previous refusal on screen while the next write
    // is in flight is the half-updated state that says two things at once.
    setResult(null);
    try {
      setResult(await create(localSellerDraftFrom(form)));
    } catch {
      // A local write should not fail; if the device's own database does, the
      // create did not happen and the form is left exactly as typed for a retry.
      // There is no operator-actionable cause distinct from "try again", so no
      // card is drawn.
    } finally {
      setBusy(false);
    }
  }, [busy, create, form]);

  const close = useCallback((): void => {
    setForm(BLANK_SELLER_FORM);
    setResult(null);
    onClose();
  }, [onClose]);

  /**
   * WHICH HANDLER THE NOTICE'S BUTTON REACHES. Only `created` offers a button
   * (the pick), and the seller is read off the create RESULT, not off the notice,
   * so a diagnostic cannot travel with the button.
   */
  const act = (button: NonNullable<LocalCreateButton>): void => {
    switch (button.kind) {
      case "pick":
        // Only a `created` result produces this button and only it carries a
        // seller: a narrowing, not a branch.
        if (result !== null && result.kind === "created") {
          setForm(BLANK_SELLER_FORM);
          setResult(null);
          onPick(result.seller);
        }
        return;
      default: {
        const never: never = button.kind;
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
      <SheetHeader title="เพิ่มผู้ขายใหม่" onClose={close} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/*
          THE NOTICE, IN DRAW ORDER: headline, then every line, then the button.
          proveLocalSellerCreate asserts this concatenation; see the header.
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
                  if (notice.action !== null) act(notice.action);
                }}
              >
                <Text style={styles.noticeBtnText}>{notice.action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {field("name", "ชื่อผู้ขาย (จำเป็น)", null)}
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

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.color.background },

    body: { padding: t.space.x3, paddingBottom: t.layout.scrollGutter },

    notice: { borderRadius: t.radius.xl, borderWidth: 2, padding: t.space.xl, marginBottom: t.space.x3 },
    noticeHead: { fontSize: t.type.subhead, fontWeight: "900", marginBottom: t.space.sm },
    noticeLine: { fontSize: t.type.bodyLg, fontWeight: "700", marginTop: t.space.xs, lineHeight: 21 },
    noticeBtn: {
      minHeight: t.tapMin, borderRadius: t.radius.lg, marginTop: t.space.xl,
      alignItems: "center", justifyContent: "center", paddingHorizontal: t.space.x3,
    },
    noticeBtnText: { color: t.color.onPrimary, fontSize: t.type.bodyLg, fontWeight: "800" },

    field: { marginBottom: t.space.xxl },
    label: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.text, marginBottom: t.space.xs },
    hint: { fontSize: t.type.body, color: t.color.textSubtle, fontWeight: "600", marginBottom: t.space.xs },
    input: {
      borderWidth: 2, borderColor: t.color.border, borderRadius: t.radius.lg, paddingHorizontal: t.space.xl,
      minHeight: t.tapMin, fontSize: t.type.subhead, fontWeight: "700", color: t.color.text,
      backgroundColor: t.color.surface,
    },
    inputTall: { minHeight: t.tapMin + t.space.x5, textAlignVertical: "top", paddingTop: t.space.lg },

    save: {
      minHeight: t.tapMin + t.space.xs, borderRadius: t.radius.xl, backgroundColor: t.color.primary,
      alignItems: "center", justifyContent: "center", marginTop: t.space.md,
    },
    saveOff: { opacity: 0.4 },
    saveText: { color: t.color.onPrimary, fontWeight: "800", fontSize: t.type.subhead },
    gate: { fontSize: t.type.body, color: t.color.textSubtle, fontWeight: "700", textAlign: "center", marginTop: t.space.lg },
  });
}
