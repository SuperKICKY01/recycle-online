/**
 * The local bill list, and the place a bill is voided from.
 *
 * Not a history screen: it shows what is on THIS device, it does not page
 * through the server, and it exists because voiding needs something to void
 * from. A bill is never removed from it — a voided bill stays, marked
 * ยกเลิกแล้ว, carrying its reason and its doc_no, because "this load was bought
 * and then cancelled" is a different fact from "this load never happened" and
 * the shop owner needs to be able to see which.
 *
 * The reason field is FREE TEXT and so uses the OS keyboard. That is not a
 * regression against the Phase 2c-4 numpad rule, which is about the numeric
 * entry path — a cancellation reason is prose and cannot come from a numpad.
 */
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { LocalBill, SyncState } from "../src/sync/types";
import { isVoided, isVoidSettled } from "../src/sync/types";

const STATE_TH: Record<SyncState, string> = {
  pending: "รอส่ง",
  syncing: "กำลังส่ง",
  synced: "ส่งแล้ว",
  failed: "ผิดพลาด",
};

const STATE_COLOR: Record<SyncState, string> = {
  pending: "#b45309",
  syncing: "#1d4ed8",
  synced: "#15803d",
  failed: "#b91c1c",
};

interface Props {
  visible: boolean;
  bills: LocalBill[];
  busy: boolean;
  /**
   * The bill currently jamming the send queue (stuck at the head past the alarm
   * threshold), or null. It is called out here so the operator can find the one
   * bill holding up everything behind it, and act on THAT bill specifically.
   */
  blockerId: string | null;
  onClose: () => void;
  onVoid: (billId: string, reason: string) => void;
}

export function BillsPanel({ visible, bills, busy, blockerId, onClose, onVoid }: Props) {
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  // No default reason, ever: a pre-filled box would be accepted unread, and the
  // reason is the only record of WHY real money was reversed.
  const reasonOk = reason.trim().length > 0;

  const startVoid = (id: string): void => {
    setVoidingId(id);
    setReason("");
  };

  const submitVoid = (): void => {
    if (voidingId === null || !reasonOk) return;
    onVoid(voidingId, reason.trim());
    setVoidingId(null);
    setReason("");
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.head}>
          <Text style={styles.title}>บิลในเครื่อง ({bills.length})</Text>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>ปิด</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {bills.length === 0 ? (
            <Text style={styles.empty}>ยังไม่มีบิลในเครื่อง</Text>
          ) : null}

          {bills.map((b) => {
            const voided = isVoided(b);
            const settled = isVoidSettled(b);
            const isBlocker = b.id === blockerId;
            return (
              <View
                key={b.id}
                style={[styles.card, voided && styles.cardVoided, isBlocker && styles.cardBlocker]}
              >
                {isBlocker ? (
                  <Text style={styles.blockerBanner}>
                    ⚠ บิลนี้ส่งไม่ผ่านและกำลังขวางคิว — บิลที่เหลือจะส่งไม่ได้จนกว่าจะแก้ไขใบนี้
                  </Text>
                ) : null}
                <View style={styles.cardTop}>
                  {voided ? (
                    <Text style={[styles.badge, styles.badgeVoid]}>ยกเลิกแล้ว</Text>
                  ) : (
                    <Text style={[styles.badge, { backgroundColor: STATE_COLOR[b.sync_state] }]}>
                      {STATE_TH[b.sync_state]}
                    </Text>
                  )}
                  <Text style={styles.doc}>{b.doc_no ?? "ยังไม่มีเลขที่บิล"}</Text>
                  <Text style={[styles.total, voided && styles.struck]}>
                    {b.payload.total_amount ?? "-"}
                  </Text>
                </View>

                <Text style={styles.meta}>
                  {b.payload.items.length} รายการ · {b.created_at.slice(0, 10)}{" "}
                  {b.created_at.slice(11, 16)}
                </Text>

                {voided ? (
                  <View style={styles.voidBox}>
                    <Text style={styles.voidReason}>เหตุผล: {b.void_reason}</Text>
                    <Text style={styles.voidState}>
                      {settled
                        ? "แจ้งระบบแล้ว"
                        : b.doc_no === null
                          ? "รอส่งบิลเข้าระบบก่อน แล้วจะยกเลิกให้อัตโนมัติ"
                          : "รอแจ้งระบบ จะดำเนินการให้อัตโนมัติ"}
                    </Text>
                  </View>
                ) : null}

                {b.last_error !== null && !voided ? (
                  <Text style={styles.err}>ผิดพลาด: {b.last_error}</Text>
                ) : null}

                {!voided && voidingId !== b.id ? (
                  <Pressable
                    style={styles.voidBtn}
                    onPress={() => startVoid(b.id)}
                    disabled={busy}
                  >
                    <Text style={styles.voidBtnText}>ยกเลิกบิลนี้</Text>
                  </Pressable>
                ) : null}

                {voidingId === b.id ? (
                  <View style={styles.reasonBox}>
                    <Text style={styles.reasonLabel}>เหตุผลที่ยกเลิก (จำเป็นต้องกรอก)</Text>
                    <TextInput
                      style={styles.reasonInput}
                      value={reason}
                      onChangeText={setReason}
                      placeholder="เช่น ชั่งผิด / ลูกค้าเปลี่ยนใจ"
                      multiline
                      autoFocus
                      editable={!busy}
                    />
                    {!reasonOk ? (
                      <Text style={styles.reasonErr}>ต้องกรอกเหตุผลก่อนจึงจะยกเลิกได้</Text>
                    ) : null}
                    <View style={styles.reasonBtns}>
                      <Pressable
                        style={[styles.rBtn, styles.rCancel]}
                        onPress={() => setVoidingId(null)}
                      >
                        <Text style={styles.rCancelText}>ไม่ยกเลิก</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.rBtn, styles.rConfirm, !reasonOk && styles.dim]}
                        onPress={submitVoid}
                        disabled={!reasonOk || busy}
                      >
                        <Text style={styles.rConfirmText}>ยืนยันยกเลิกบิล</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
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
  body: { padding: 16, paddingBottom: 48 },
  empty: { textAlign: "center", color: "#64748b", marginTop: 40, fontSize: 15 },

  card: {
    backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  cardVoided: { backgroundColor: "#f8fafc", borderColor: "#cbd5e1" },
  cardBlocker: { borderColor: "#b91c1c", borderWidth: 2, backgroundColor: "#fef2f2" },
  blockerBanner: {
    fontSize: 13, fontWeight: "800", color: "#7f1d1d", backgroundColor: "#fee2e2",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: {
    color: "#fff", fontSize: 11, fontWeight: "800", paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 6, overflow: "hidden",
  },
  badgeVoid: { backgroundColor: "#475569" },
  doc: { flex: 1, fontSize: 15, fontWeight: "800", color: "#0f172a" },
  total: { fontSize: 20, fontWeight: "900", color: "#0f766e" },
  struck: { textDecorationLine: "line-through", color: "#94a3b8" },
  meta: { fontSize: 12, color: "#64748b", marginTop: 6 },
  err: { fontSize: 12, color: "#b91c1c", marginTop: 6, fontWeight: "600" },

  voidBox: {
    marginTop: 10, padding: 10, backgroundColor: "#f1f5f9", borderRadius: 8,
  },
  voidReason: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  voidState: { fontSize: 12, color: "#475569", marginTop: 4 },

  voidBtn: {
    marginTop: 12, minHeight: 48, borderRadius: 10, backgroundColor: "#fee2e2",
    alignItems: "center", justifyContent: "center",
  },
  voidBtnText: { fontSize: 15, fontWeight: "800", color: "#b91c1c" },

  reasonBox: { marginTop: 12 },
  reasonLabel: { fontSize: 13, fontWeight: "800", color: "#334155" },
  reasonInput: {
    borderWidth: 2, borderColor: "#b91c1c", borderRadius: 10, padding: 12,
    fontSize: 17, backgroundColor: "#fff", marginTop: 6, minHeight: 72,
    color: "#0f172a", textAlignVertical: "top",
  },
  reasonErr: { fontSize: 12, color: "#b91c1c", marginTop: 6, fontWeight: "700" },
  reasonBtns: { flexDirection: "row", gap: 10, marginTop: 12 },
  rBtn: { flex: 1, minHeight: 56, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rCancel: { backgroundColor: "#e2e8f0" },
  rCancelText: { fontSize: 15, fontWeight: "800", color: "#334155" },
  rConfirm: { backgroundColor: "#b91c1c" },
  rConfirmText: { fontSize: 15, fontWeight: "900", color: "#fff" },
  dim: { opacity: 0.4 },
});
