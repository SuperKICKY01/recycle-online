/**
 * The one confirmation in the app.
 *
 * Saving is the only irreversible action here: the bill enters the sync queue
 * immediately, gets a permanent doc_no, and from then on the only way back is a
 * void that stays on the record forever. Everything else that destroys work —
 * deleting a line — is undoable instead, because a confirm on a frequent action
 * is tapped through reflexively and stops being a decision.
 *
 * Built as a Modal rather than Alert.alert because the numbers have to be LARGE.
 * A system alert renders the total in body text, at which point the operator is
 * confirming a sentence rather than checking a figure — and the figure is the
 * entire point of asking.
 */
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { pricingProvenanceLine } from "../src/master/freshness";
import type { PricingProvenance } from "../src/master/freshness";
import { saveConfirmNotice } from "../src/master/saveConfirmNotice";
import { tierName } from "../src/cart/sellers";
import type { NamedTier } from "../src/cart/sellers";
import { useTheme, type ThemeTokens } from "./theme";
import { Touchable } from "./Press";
import { display } from "../src/money/format";

/**
 * NO MODAL ELEMENT AND NO `visible` PROP. This app has one Modal — app/SheetHost
 * — and the sheet stack decides which sheet is inside it. A second one anywhere
 * reintroduces the presentation defect SheetHost's header describes, and
 * `npm run prove:sheets` goes red the moment one appears in this directory.
 */
interface Props {
  lineCount: number;
  total: string;
  sellerName: string;
  /** Null means the seller has no grade — the bill will park. Say so here. */
  sellerGrade: string | null;
  /** The shop's cached grade tiers, to show the grade by its NAME (S16, F3). */
  tiers: readonly NamedTier[];
  /** The plate, already trimmed. Null when none was entered. */
  vehicleNo: string | null;
  busy: boolean;
  /**
   * Which master data these prices were defaulted from, so the last screen
   * before the cash leaves can say it was not current. Null when there is no
   * draft to describe. The sentence itself comes from src/master/freshness.ts —
   * this file decides nothing.
   */
  pricedFrom: PricingProvenance | null;
  /**
   * Every impurity deduction on the bill, one sentence per line (cart.deductionLines), shown HERE
   * so the seller sees what was taken off before the cash is counted out (server migration 0027).
   * Empty when nothing is deducted, and then nothing is drawn.
   */
  deductions: readonly string[];
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmSaveDialog({
  lineCount,
  total,
  sellerName,
  sellerGrade,
  tiers,
  vehicleNo,
  busy,
  pricedFrom,
  deductions,
  onCancel,
  onConfirm,
}: Props) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const pricedLine = pricedFrom === null ? null : pricingProvenanceLine(pricedFrom);
  /*
   * WHAT THIS BILL'S FATE IS, in words, decided by the ONE fact that decides it.
   * The red "waits for the office" line and the amber "cannot edit" line used to
   * be two independent renderers here and contradicted each other for a seller
   * with no grade. Both now come from one pure function under a proof, so the
   * claim that the bill enters the system now and the claim that it waits can
   * never appear on one card. See src/master/saveConfirmNotice.ts.
   */
  const fate = saveConfirmNotice(sellerGrade);
  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>ยืนยันบันทึกบิล</Text>

        <View style={styles.figures}>
          <Text style={styles.label}>จำนวนรายการ</Text>
          <Text style={styles.lines}>{lineCount}</Text>

          <Text style={styles.label}>รวมทั้งสิ้น (บาท)</Text>
          <Text style={styles.total}>{display(total)}</Text>

          {/*
            Seller and plate are shown HERE, at the last irreversible step,
            because both are now per-bill choices: a bill filed to the wrong
            customer is only recoverable by a void, which stays on the record
            forever.
          */}
          <Text style={styles.label}>ผู้ขาย</Text>
          <Text style={styles.seller}>{sellerName}</Text>
          <Text style={sellerGrade === null ? styles.gradeNone : styles.grade}>
            {sellerGrade === null ? "ยังไม่ได้จัดเกรด" : `เกรด ${tierName(tiers, sellerGrade)}`}
          </Text>

          <Text style={styles.label}>ทะเบียนรถ</Text>
          <Text style={vehicleNo === null ? styles.vehicleNone : styles.vehicle}>
            {vehicleNo ?? "ไม่ได้ระบุ"}
          </Text>
          {deductions.length > 0 ? (
            <>
              <Text style={styles.label}>หักสิ่งเจือปน</Text>
              {deductions.map((d) => (
                <Text key={d} style={styles.deduction}>{d}</Text>
              ))}
            </>
          ) : null}
        </View>

        {fate.park !== null ? <Text style={styles.park}>{fate.park}</Text> : null}

        {/*
          The prices on this bill came from data that was not current. Said
          HERE, at the last irreversible step, because this is the moment the
          cash is about to be counted out — and because a strip at the top of
          the screen has been there all morning and stopped being read.
        */}
        {pricedLine !== null ? <Text style={styles.priced}>{pricedLine}</Text> : null}

        <Text style={styles.warn}>{fate.warn}</Text>

        <View style={styles.buttons}>
          <Touchable style={[styles.btn, styles.cancel]} onPress={onCancel} disabled={busy} accessibilityLabel="ยกเลิก">
            <Text style={styles.cancelText}>ยกเลิก</Text>
          </Touchable>
          <Touchable
            style={[styles.btn, styles.confirm, busy && styles.dim]}
            onPress={onConfirm}
            disabled={busy}
            haptic="success"
            accessibilityLabel="ยืนยันบันทึก"
          >
            <Text style={styles.confirmText}>ยืนยันบันทึก</Text>
          </Touchable>
        </View>
      </View>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1, backgroundColor: t.color.overlay,
      justifyContent: "center", padding: t.space.x4,
    },
    card: { backgroundColor: t.color.surface, borderRadius: t.radius.card, padding: t.space.x4 },
    title: { fontSize: t.type.title, fontWeight: "900", color: t.color.text, marginBottom: t.space.xl },
    figures: { borderTopWidth: 1, borderTopColor: t.color.borderSoft, paddingTop: t.space.xl },
    label: { fontSize: t.type.body, fontWeight: "700", color: t.color.textSubtle, marginTop: t.space.lg },
    lines: { fontSize: t.type.display, fontWeight: "900", color: t.color.text },
    total: { fontSize: t.type.hero, fontWeight: "900", color: t.color.text },
    seller: { fontSize: t.type.titleLg, fontWeight: "800", color: t.color.text },
    grade: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.text, marginTop: t.space.xs },
    gradeNone: { fontSize: t.type.bodyLg, fontWeight: "900", color: t.color.danger, marginTop: t.space.xs},
    vehicle: { fontSize: t.type.titleLg, fontWeight: "800", color: t.color.text },
    vehicleNone: { fontSize: t.type.subhead, fontWeight: "700", color: t.color.placeholder },
    deduction: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.text, marginTop: t.space.xs },
    park: {
      fontSize: t.type.body, color: t.color.dangerFg, backgroundColor: t.color.dangerBg, padding: t.space.lg,
      borderRadius: t.radius.md, marginTop: t.space.x3, fontWeight: "700",
    },
    warn: {
      fontSize: t.type.body, color: t.color.warningFg, backgroundColor: t.color.warningBg, padding: t.space.lg,
      borderRadius: t.radius.md, marginTop: t.space.x3, fontWeight: "600",
    },
    priced: {
      fontSize: t.type.body, color: t.color.infoFg, backgroundColor: t.color.infoBg, padding: t.space.lg,
      borderRadius: t.radius.md, marginTop: t.space.x3, fontWeight: "700",
    },
    buttons: { flexDirection: "row", gap: t.space.xl, marginTop: t.space.x4 },
    btn: { flex: 1, minHeight: t.tapMin + t.space.xs, borderRadius: t.radius.xl, alignItems: "center", justifyContent: "center" },
    cancel: { backgroundColor: t.color.borderSoft },
    cancelText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.neutralFg },
    confirm: { backgroundColor: t.color.primaryFill, borderWidth: 1, borderColor: t.color.primary },
    confirmText: { fontSize: t.type.subhead, fontWeight: "900", color: t.color.onPrimaryFill },
    dim: { opacity: 0.4 },
  });
}
