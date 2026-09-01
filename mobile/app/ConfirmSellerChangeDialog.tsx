/**
 * "This bill already has lines — are you sure it belongs to someone else?"
 *
 * Shown only when the cart is NOT empty. With an empty cart there is nothing to
 * warn about and an extra tap would just train the habit of tapping through.
 *
 * WHY THIS IS A WARNING AND NOT A BLOCK. Blocking would leave the operator two
 * ways out and both cost more than the mis-tap: clearing the cart destroys
 * weights for loads already tipped onto the pile, and saving-then-voiding puts
 * a wrong-money bill plus a reversal on a record that never forgets. One bill
 * has exactly one seller, so this can only ever be a correction of who the bill
 * in progress belongs to — never a second customer. See cart.ts/changeSeller.
 *
 * So the dialog's job is to state, in numbers, exactly what happens to the
 * lines already entered. It never says "prices will update"; it says what does
 * and does not move.
 */
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { SellerChangeImpact } from "../src/cart/cart";
import { tierName } from "../src/cart/sellers";
import type { NamedTier } from "../src/cart/sellers";
import type { Seller } from "./api";
import { useTheme, type ThemeTokens } from "./theme";

/**
 * NO MODAL ELEMENT AND NO `visible` PROP. This app has one Modal — app/SheetHost
 * — and the sheet stack decides which sheet is inside it. A second one anywhere
 * reintroduces the presentation defect SheetHost's header describes, and
 * `npm run prove:sheets` goes red the moment one appears in this directory.
 */
interface Props {
  from: Seller | null;
  to: Seller | null;
  /** The shop's cached grade tiers, to show a grade by its NAME (S16, F3). */
  tiers: readonly NamedTier[];
  impact: SellerChangeImpact | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const gradeText = (s: Seller | null, tiers: readonly NamedTier[]): string =>
  s === null ? "-" : s.grade === null ? "ไม่มีเกรด" : `เกรด ${tierName(tiers, s.grade)}`;

export function ConfirmSellerChangeDialog({
  from,
  to,
  tiers,
  impact,
  onCancel,
  onConfirm,
}: Props) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>เปลี่ยนผู้ขายของบิลนี้?</Text>

        <View style={styles.fromTo}>
          <Text style={styles.label}>จาก</Text>
          <Text style={styles.who}>
            {from?.name ?? "-"} ({gradeText(from, tiers)})
          </Text>
          <Text style={styles.label}>เป็น</Text>
          <Text style={styles.whoNew}>
            {to?.name ?? "-"} ({gradeText(to, tiers)})
          </Text>
        </View>

        <ScrollView style={styles.scroll}>
          <Text style={styles.headline}>
            มีรายการในบิลแล้ว {impact?.keptLines ?? 0} รายการ
          </Text>

          {/* The money answer first, because it is the only one that matters. */}
          <Text style={styles.keep}>
            ✓ รายการที่บันทึกไว้แล้ว ยังใช้ราคาเดิมที่กรอกไว้ ยอดเงินรวมไม่เปลี่ยน
          </Text>

          {impact !== null && impact.rereferenced > 0 ? (
            <Text style={styles.note}>
              • {impact.rereferenced} รายการจะเทียบกับราคาตามเกรดใหม่แทน (ใช้ดูว่าจ่ายต่างจาก
              ราคาตั้งไว้เท่าไร ไม่ใช่ราคาที่จ่ายจริง)
            </Text>
          ) : null}

          {impact !== null && impact.withoutTier > 0 ? (
            <Text style={styles.warnLine}>
              • {impact.withoutTier} รายการ ยังไม่มีราคาสำหรับ{gradeText(to, tiers)} — บิลจะค้างรอ
              สำนักงานตั้งราคาก่อนจึงจะส่งได้
            </Text>
          ) : null}

          {to?.grade === null ? (
            <Text style={styles.warnLine}>
              • ผู้ขายรายนี้ยังไม่ได้จัดเกรด — บิลจะค้างรอสำนักงานกำหนดเกรดก่อนจึงจะส่งได้
            </Text>
          ) : null}

          <Text style={styles.headline}>รายการที่กำลังกรอก (ยังไม่ได้กด “เพิ่มลงบิล”)</Text>
          {impact?.priceLockHeld === true ? (
            <Text style={styles.warnLine}>
              • ราคาถูก “ค้างค่า” ไว้ จึงไม่เปลี่ยนตามเกรดใหม่ — ปลดล็อกก่อนถ้าต้องการราคาตามเกรด
            </Text>
          ) : (
            <Text style={styles.note}>
              • ราคาจะเปลี่ยนเป็นราคาตามเกรดใหม่{" "}
              {impact === null
                ? ""
                : `(${impact.pendingPriceWas === "" ? "ว่าง" : impact.pendingPriceWas} → ${
                    impact.pendingPriceNow === "" ? "ว่าง" : impact.pendingPriceNow
                  })`}
            </Text>
          )}
          <Text style={styles.note}>• น้ำหนักที่ชั่งไว้ไม่ถูกล้าง — ของยังอยู่บนตาชั่งเหมือนเดิม</Text>
        </ScrollView>

        <View style={styles.buttons}>
          <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel}>
            <Text style={styles.cancelText}>ไม่เปลี่ยน</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.confirm]} onPress={onConfirm}>
            <Text style={styles.confirmText}>เปลี่ยนผู้ขาย</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1, backgroundColor: t.color.overlay, justifyContent: "center", padding: t.space.x4,
    },
    card: { backgroundColor: t.color.surface, borderRadius: t.radius.card, padding: t.space.x4, maxHeight: "88%" },
    title: { fontSize: t.type.title, fontWeight: "900", color: t.color.text, marginBottom: t.space.xl },

    fromTo: { borderTopWidth: 1, borderTopColor: t.color.borderSoft, paddingTop: t.space.xl },
    label: { fontSize: t.type.body, fontWeight: "700", color: t.color.textSubtle, marginTop: t.space.md },
    who: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.textSubtle },
    whoNew: { fontSize: t.type.titleLg, fontWeight: "900", color: t.color.text },

    scroll: { marginTop: t.space.xl },
    headline: { fontSize: t.type.bodyLg, fontWeight: "900", color: t.color.text, marginTop: t.space.xxl },
    keep: {
      fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.successAltFg, backgroundColor: t.color.greenSoft,
      borderRadius: t.radius.md, padding: t.space.lg, marginTop: t.space.md,
    },
    note: { fontSize: t.type.body, color: t.color.neutralFg, marginTop: t.space.md, fontWeight: "600" },
    warnLine: {
      fontSize: t.type.body, color: t.color.warningFg, backgroundColor: t.color.warningBg, borderRadius: t.radius.md,
      padding: t.space.lg, marginTop: t.space.md, fontWeight: "700",
    },

    buttons: { flexDirection: "row", gap: t.space.xl, marginTop: t.space.x4 },
    btn: { flex: 1, minHeight: t.tapMin + t.space.xs, borderRadius: t.radius.xl, alignItems: "center", justifyContent: "center" },
    cancel: { backgroundColor: t.color.borderSoft },
    cancelText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.neutralFg },
    confirm: { backgroundColor: t.color.warning },
    confirmText: { fontSize: t.type.subhead, fontWeight: "900", color: t.color.onPrimary },
  });
}
