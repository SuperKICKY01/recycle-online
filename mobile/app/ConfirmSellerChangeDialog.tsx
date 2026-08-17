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
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { SellerChangeImpact } from "../src/cart/cart";
import type { Seller } from "./api";

/**
 * NO MODAL ELEMENT AND NO `visible` PROP. This app has one Modal — app/SheetHost
 * — and the sheet stack decides which sheet is inside it. A second one anywhere
 * reintroduces the presentation defect SheetHost's header describes, and
 * `npm run prove:sheets` goes red the moment one appears in this directory.
 */
interface Props {
  from: Seller | null;
  to: Seller | null;
  impact: SellerChangeImpact | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const gradeText = (s: Seller | null): string =>
  s === null ? "-" : s.grade === null ? "ไม่มีเกรด" : `เกรด ${s.grade}`;

export function ConfirmSellerChangeDialog({
  from,
  to,
  impact,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>เปลี่ยนผู้ขายของบิลนี้?</Text>

        <View style={styles.fromTo}>
          <Text style={styles.label}>จาก</Text>
          <Text style={styles.who}>
            {from?.name ?? "-"} ({gradeText(from)})
          </Text>
          <Text style={styles.label}>เป็น</Text>
          <Text style={styles.whoNew}>
            {to?.name ?? "-"} ({gradeText(to)})
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
              • {impact.withoutTier} รายการ ยังไม่มีราคาสำหรับ{gradeText(to)} — บิลจะค้างรอ
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "center", padding: 20,
  },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, maxHeight: "88%" },
  title: { fontSize: 20, fontWeight: "900", color: "#0f172a", marginBottom: 12 },

  fromTo: { borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 12 },
  label: { fontSize: 12, fontWeight: "700", color: "#64748b", marginTop: 8 },
  who: { fontSize: 18, fontWeight: "800", color: "#64748b" },
  whoNew: { fontSize: 22, fontWeight: "900", color: "#0f172a" },

  scroll: { marginTop: 12 },
  headline: { fontSize: 14, fontWeight: "900", color: "#0f172a", marginTop: 14 },
  keep: {
    fontSize: 14, fontWeight: "800", color: "#065f46", backgroundColor: "#d1fae5",
    borderRadius: 8, padding: 10, marginTop: 8,
  },
  note: { fontSize: 13, color: "#334155", marginTop: 8, fontWeight: "600" },
  warnLine: {
    fontSize: 13, color: "#78350f", backgroundColor: "#fef3c7", borderRadius: 8,
    padding: 10, marginTop: 8, fontWeight: "700",
  },

  buttons: { flexDirection: "row", gap: 12, marginTop: 18 },
  btn: { flex: 1, minHeight: 60, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cancel: { backgroundColor: "#e2e8f0" },
  cancelText: { fontSize: 17, fontWeight: "800", color: "#334155" },
  confirm: { backgroundColor: "#b45309" },
  confirmText: { fontSize: 17, fontWeight: "900", color: "#fff" },
});
