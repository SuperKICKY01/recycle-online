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
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { pricingProvenanceLine } from "../src/master/freshness";
import type { PricingProvenance } from "../src/master/freshness";

interface Props {
  visible: boolean;
  lineCount: number;
  total: string;
  sellerName: string;
  /** Null means the seller has no grade — the bill will park. Say so here. */
  sellerGrade: string | null;
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
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmSaveDialog({
  visible,
  lineCount,
  total,
  sellerName,
  sellerGrade,
  vehicleNo,
  busy,
  pricedFrom,
  onCancel,
  onConfirm,
}: Props) {
  const pricedLine = pricedFrom === null ? null : pricingProvenanceLine(pricedFrom);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>ยืนยันบันทึกบิล</Text>

          <View style={styles.figures}>
            <Text style={styles.label}>จำนวนรายการ</Text>
            <Text style={styles.lines}>{lineCount}</Text>

            <Text style={styles.label}>รวมทั้งสิ้น (บาท)</Text>
            <Text style={styles.total}>{total}</Text>

            {/*
              Seller and plate are shown HERE, at the last irreversible step,
              because both are now per-bill choices: a bill filed to the wrong
              customer is only recoverable by a void, which stays on the record
              forever.
            */}
            <Text style={styles.label}>ผู้ขาย</Text>
            <Text style={styles.seller}>{sellerName}</Text>
            <Text style={sellerGrade === null ? styles.gradeNone : styles.grade}>
              {sellerGrade === null ? "ยังไม่ได้จัดเกรด" : `เกรด ${sellerGrade}`}
            </Text>

            <Text style={styles.label}>ทะเบียนรถ</Text>
            <Text style={vehicleNo === null ? styles.vehicleNone : styles.vehicle}>
              {vehicleNo ?? "ไม่ได้ระบุ"}
            </Text>
          </View>

          {sellerGrade === null ? (
            <Text style={styles.park}>
              ผู้ขายรายนี้ยังไม่มีเกรด — บันทึกได้ แต่บิลจะค้างรอสำนักงานกำหนดเกรดก่อนจึงจะส่งเข้าระบบ
            </Text>
          ) : null}

          {/*
            The prices on this bill came from data that was not current. Said
            HERE, at the last irreversible step, because this is the moment the
            cash is about to be counted out — and because a strip at the top of
            the screen has been there all morning and stopped being read.
          */}
          {pricedLine !== null ? <Text style={styles.priced}>{pricedLine}</Text> : null}

          <Text style={styles.warn}>
            บันทึกแล้วจะส่งเข้าระบบทันที แก้ไขไม่ได้ — หากผิดต้องยกเลิกบิลและออกใบใหม่
          </Text>

          <View style={styles.buttons}>
            <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel} disabled={busy}>
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.confirm, busy && styles.dim]}
              onPress={onConfirm}
              disabled={busy}
            >
              <Text style={styles.confirmText}>ยืนยันบันทึก</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "center", padding: 20,
  },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  title: { fontSize: 20, fontWeight: "900", color: "#0f172a", marginBottom: 12 },
  figures: { borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 12 },
  label: { fontSize: 13, fontWeight: "700", color: "#64748b", marginTop: 10 },
  lines: { fontSize: 34, fontWeight: "900", color: "#0f172a" },
  total: { fontSize: 44, fontWeight: "900", color: "#0f766e" },
  seller: { fontSize: 22, fontWeight: "800", color: "#0f172a" },
  grade: { fontSize: 15, fontWeight: "800", color: "#0f766e", marginTop: 2 },
  gradeNone: { fontSize: 15, fontWeight: "900", color: "#b91c1c", marginTop: 2 },
  vehicle: { fontSize: 22, fontWeight: "800", color: "#0f172a" },
  vehicleNone: { fontSize: 18, fontWeight: "700", color: "#94a3b8" },
  park: {
    fontSize: 13, color: "#7f1d1d", backgroundColor: "#fee2e2", padding: 10,
    borderRadius: 8, marginTop: 16, fontWeight: "700",
  },
  warn: {
    fontSize: 13, color: "#78350f", backgroundColor: "#fef3c7", padding: 10,
    borderRadius: 8, marginTop: 16, fontWeight: "600",
  },
  priced: {
    fontSize: 13, color: "#0c4a6e", backgroundColor: "#e0f2fe", padding: 10,
    borderRadius: 8, marginTop: 16, fontWeight: "700",
  },
  buttons: { flexDirection: "row", gap: 12, marginTop: 18 },
  btn: { flex: 1, minHeight: 60, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cancel: { backgroundColor: "#e2e8f0" },
  cancelText: { fontSize: 17, fontWeight: "800", color: "#334155" },
  confirm: { backgroundColor: "#0f766e" },
  confirmText: { fontSize: 17, fontWeight: "900", color: "#fff" },
  dim: { opacity: 0.4 },
});
