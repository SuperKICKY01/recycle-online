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

import { billNotice, canRequestVoid, voidProgressLine } from "../src/sync/parkedReason";
import type { NoticeTone, SessionState } from "../src/sync/parkedReason";
import type { LocalBill, SyncState } from "../src/sync/types";
import { isVoided } from "../src/sync/types";
import { shopDateTime } from "../src/time/shopTime";

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

/**
 * The notice box, one style per tone. A Record — NOT a ternary chain — so adding
 * a tone to billNotice without deciding how it looks is a compile error rather
 * than an unstyled or invisible message. The old chain ended in `: null`, which
 * is precisely the shape that renders nothing for a state nobody thought about.
 */
const TONE_BOX: Record<Exclude<NoticeTone, "none">, object> = {
  // Amber "waiting" family: the bill is fine and nothing is owed at the yard.
  waiting: { backgroundColor: "#f1f5f9" },
  session: { backgroundColor: "#fef3c7" },
  parked: { backgroundColor: "#fef3c7" },
  // Red, and the only one: the server has permanently refused this bill.
  error: { backgroundColor: "#fee2e2" },
};

const TONE_LEAD: Record<Exclude<NoticeTone, "none">, object> = {
  waiting: { color: "#334155" },
  session: { color: "#78350f" },
  parked: { color: "#78350f" },
  error: { color: "#7f1d1d" },
};

/**
 * The notice region for one bill.
 *
 * It takes the tone as a PROP typed `Exclude<NoticeTone, "none">`, and that is
 * the whole point of it existing rather than being inlined. Written inline, the
 * `notice.tone !== "none"` check narrows correctly at the outer element and then
 * SILENTLY EVAPORATES inside the `.map` callback — TypeScript cannot know the
 * property has not changed by the time a closure runs, so `TONE_LEAD[notice.tone]`
 * was an implicit `any` (TS7053) and would have rendered an unstyled line for a
 * "none" that cannot occur. A cast or a `!` there would have re-asserted by hand
 * exactly the thing the compiler had just refused to grant.
 *
 * Passing the narrowed value across a typed boundary hands the guarantee to the
 * compiler instead: inside here the tone simply IS one of the four, everywhere,
 * closures included. Same discipline as the branded shop-time type — make the
 * wrong thing fail to compile rather than remember not to write it.
 */
function NoticeBox({
  tone,
  lines,
}: {
  tone: Exclude<NoticeTone, "none">;
  lines: string[];
}) {
  return (
    <View style={[styles.noticeBox, TONE_BOX[tone]]}>
      {lines.map((line, i) => (
        <Text key={i} style={[i === 0 ? styles.noticeLead : styles.noticeCalm, TONE_LEAD[tone]]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

interface Props {
  visible: boolean;
  bills: LocalBill[];
  busy: boolean;
  /**
   * Whether the device has a usable session. Device-global, so it is passed in
   * rather than read off a bill: the token is in memory only, and a per-bill
   * copy would keep telling the operator to sign in after they already had.
   */
  session: SessionState;
  /**
   * The bill currently jamming the send queue (stuck at the head past the alarm
   * threshold), or null. It is called out here so the operator can find the one
   * bill holding up everything behind it, and act on THAT bill specifically.
   */
  blockerId: string | null;
  onClose: () => void;
  onVoid: (billId: string, reason: string) => void;
}

export function BillsPanel({ visible, bills, busy, session, blockerId, onClose, onVoid }: Props) {
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
            const isBlocker = b.id === blockerId;
            /*
              PARKED IS NOT FAILED, AND NEITHER IS OFFLINE. A resolvable refusal
              means the bill is fine, the network is fine, and the office has
              something to set up. An unsent bill means the bill is fine and the
              network is not. Both are the calm amber WAITING family — never red,
              never ผิดพลาด, which is reserved for a bill the server has refused
              permanently and will never accept.

              This panel cannot read b.last_error even if someone tries: it is
              not a field of NoticeInput any more. That is deliberate — a gate
              you have to remember is a bug you have not found yet, and the first
              version of this fix was a gate with a hole in it.

              NOT named `reason`: that is the void-reason state above, and
              shadowing it silently detached the void TextInput from it. Caught by
              the app typecheck, which is why both programs are run bare.
            */
            const notice = billNotice(b, session);
            const parked = notice.tone === "parked";
            const voidLine = voidProgressLine(b);
            return (
              <View
                key={b.id}
                style={[
                  styles.card,
                  voided && styles.cardVoided,
                  parked && styles.cardParked,
                  isBlocker && styles.cardBlocker,
                ]}
              >
                {isBlocker ? (
                  <Text style={styles.blockerBanner}>
                    ⚠ บิลนี้ส่งไม่ผ่านและกำลังขวางคิว — บิลที่เหลือจะส่งไม่ได้จนกว่าจะแก้ไขใบนี้
                  </Text>
                ) : null}
                <View style={styles.cardTop}>
                  {voided ? (
                    <Text style={[styles.badge, styles.badgeVoid]}>ยกเลิกแล้ว</Text>
                  ) : notice.badge !== null ? (
                    /*
                      A parked bill's sync_state is still 'pending', so the plain
                      badge would read รอส่ง — true but misleading: nothing at
                      the yard will make it send. The badge names WHO it waits
                      for instead, in the same amber as รอส่ง.
                    */
                    <Text style={[styles.badge, styles.badgeParked]}>{notice.badge}</Text>
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

                {/*
                  created_at is a UTC instant; shopDateTime is the only thing
                  allowed to turn it into a wall clock. This line used to slice
                  the ISO string, which printed UTC verbatim — a load weighed
                  15:16 in Bangkok showed as 08:16, and for anything weighed
                  before 07:00 the DATE was a day behind too.

                  The date is พ.ศ. (26/07/2569), and it must be, because doc_no
                  is rendered ten lines above with the server's be_year in it.
                  This card previously read 2026-07-26 beside B-2569-105 —
                  contradicting itself about which business year the load
                  belongs to. Both numbers now come from a shop-time year:
                  shopTime.ts here, _be_year in app/bills.py there.
                */}
                <Text style={styles.meta}>
                  {b.payload.items.length} รายการ · {shopDateTime(b.created_at)}
                </Text>

                {voidLine !== null ? (
                  <View style={styles.voidBox}>
                    <Text style={styles.voidReason}>เหตุผล: {b.void_reason}</Text>
                    {/*
                      voidProgressLine, not a doc_no ternary. "Has it got a
                      number yet" is a different question from "can it ever get
                      one": a terminally failed bill has no doc_no and never
                      will, so branching on doc_no promised it would be cancelled
                      automatically — a promise nothing in the system can keep.
                    */}
                    <Text style={styles.voidState}>{voidLine}</Text>
                  </View>
                ) : null}

                {/*
                  THE notice region. ONE branch for every tone, styled from a
                  Record — so parked, waiting, session-ended and error travel the
                  same code path and a tone nobody styled will not compile. The
                  first fix here had two conditions and the retry window fell
                  between them.
                */}
                {notice.tone !== "none" ? (
                  <NoticeBox tone={notice.tone} lines={notice.lines} />
                ) : null}

                {canRequestVoid(b) && voidingId !== b.id ? (
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
  // Amber, matching รอส่ง and the offline strip — the "waiting" family, NOT the
  // red "something is wrong" family that cardBlocker belongs to.
  cardParked: { borderColor: "#b45309", backgroundColor: "#fffbeb" },
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
  badgeParked: { backgroundColor: "#b45309" },
  doc: { flex: 1, fontSize: 15, fontWeight: "800", color: "#0f172a" },
  total: { fontSize: 20, fontWeight: "900", color: "#0f766e" },
  struck: { textDecorationLine: "line-through", color: "#94a3b8" },
  meta: { fontSize: 12, color: "#64748b", marginTop: 6 },

  voidBox: {
    marginTop: 10, padding: 10, backgroundColor: "#f1f5f9", borderRadius: 8,
  },
  voidReason: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  voidState: { fontSize: 12, color: "#475569", marginTop: 4 },

  // ONE box for every notice tone; the colour comes from TONE_BOX/TONE_LEAD.
  noticeBox: { marginTop: 10, padding: 10, borderRadius: 8 },
  noticeLead: { fontSize: 14, fontWeight: "800" },
  noticeCalm: { fontSize: 12, marginTop: 6, fontWeight: "600" },

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
