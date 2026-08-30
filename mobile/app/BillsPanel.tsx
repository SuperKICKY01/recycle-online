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
import { useMemo, useState } from "react";
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

import { pricingProvenanceLine } from "../src/master/freshness";
import type { DeviceRole } from "../src/session/deviceRole";
import {
  billNotice,
  canRequestVoid,
  voidProgressLine,
  voidRoleNote,
} from "../src/sync/parkedReason";
import type { AccountState, NoticeTone, SessionState } from "../src/sync/parkedReason";
import type { LocalBill, SyncState } from "../src/sync/types";
import { isVoided, isVoidRefused } from "../src/sync/types";
import { shopDateTime } from "@recycle/shop-time";
import { useTheme, type ThemeTokens } from "./theme";

const STATE_TH: Record<SyncState, string> = {
  pending: "รอส่ง",
  syncing: "กำลังส่ง",
  synced: "ส่งแล้ว",
  failed: "ผิดพลาด",
};

function makeStateColor(t: ThemeTokens): Record<SyncState, string> {
  return {
    pending: t.color.warning,
    syncing: t.color.infoStrong,
    synced: t.color.success,
    failed: t.color.danger,
  };
}

/**
 * The notice box, one style per tone. A Record — NOT a ternary chain — so adding
 * a tone to billNotice without deciding how it looks is a compile error rather
 * than an unstyled or invisible message. The old chain ended in `: null`, which
 * is precisely the shape that renders nothing for a state nobody thought about.
 */
function makeToneBox(t: ThemeTokens): Record<Exclude<NoticeTone, "none">, object> {
  return {
    // Amber "waiting" family: the bill is fine and nothing is owed at the yard.
    waiting: { backgroundColor: t.color.neutralBg },
    session: { backgroundColor: t.color.warningBg },
    parked: { backgroundColor: t.color.warningBg },
    // The two RED ones, and they are red for the same reason: a human must act and
    // nothing resolves without one. They are separate tones rather than one,
    // because they name different people — `error` sends the office a purchase the
    // system never took, `forbidden` tells the shop owner a permission is wrong —
    // and because a state with no tone of its own cannot be told apart anywhere.
    forbidden: { backgroundColor: t.color.dangerBg },
    error: { backgroundColor: t.color.dangerBg },
  };
}

function makeToneLead(t: ThemeTokens): Record<Exclude<NoticeTone, "none">, object> {
  return {
    waiting: { color: t.color.neutralFg },
    session: { color: t.color.warningFg },
    parked: { color: t.color.warningFg },
    forbidden: { color: t.color.dangerFg },
    error: { color: t.color.dangerFg },
  };
}

/**
 * The badge colour per tone. A Record for the same reason as the two above: the
 * badge used to be hardcoded amber (`badgeParked`) for every replacement badge
 * there was, which was fine while every one of them meant "waiting". A refused
 * void does not, and an amber ไม่มีสิทธิ์ยกเลิกบิล beside a struck-through total
 * would read as one more thing quietly in hand.
 */
function makeToneBadge(t: ThemeTokens): Record<Exclude<NoticeTone, "none">, object> {
  return {
    waiting: { backgroundColor: t.color.warning },
    session: { backgroundColor: t.color.warning },
    parked: { backgroundColor: t.color.warning },
    forbidden: { backgroundColor: t.color.danger },
    error: { backgroundColor: t.color.danger },
  };
}

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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const toneBox = makeToneBox(t);
  const toneLead = makeToneLead(t);
  return (
    <View style={[styles.noticeBox, toneBox[tone]]}>
      {lines.map((line, i) => (
        <Text key={i} style={[i === 0 ? styles.noticeLead : styles.noticeCalm, toneLead[tone]]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

/**
 * NO MODAL ELEMENT AND NO `visible` PROP. This app has one Modal — app/SheetHost
 * — and the sheet stack decides which sheet is inside it. A second one anywhere
 * reintroduces the presentation defect SheetHost's header describes, and
 * `npm run prove:sheets` goes red the moment one appears in this directory.
 */
interface Props {
  bills: LocalBill[];
  busy: boolean;
  /**
   * Whether the device has a usable session. Device-global, so it is passed in
   * rather than read off a bill: the token is in memory only, and a per-bill
   * copy would keep telling the operator to sign in after they already had.
   */
  session: SessionState;
  /**
   * What the server has refused this ACCOUNT. Device-global, same reasoning as
   * `session` above: it is one fact about the phone, not N facts about rows.
   */
  account: AccountState;
  /**
   * The role this device is signed in as, or null when it cannot be read.
   *
   * Courtesy only — it decides whether the void button is OFFERED and nothing
   * else. The server re-reads the role on every request and refuses regardless,
   * which is what makes it safe for this to be a stale claim out of a token.
   */
  role: DeviceRole;
  /**
   * The bill currently jamming the send queue (stuck at the head past the alarm
   * threshold), or null. It is called out here so the operator can find the one
   * bill holding up everything behind it, and act on THAT bill specifically.
   */
  blockerId: string | null;
  onClose: () => void;
  onVoid: (billId: string, reason: string) => void;
}

export function BillsPanel({
  bills,
  busy,
  session,
  account,
  role,
  blockerId,
  onClose,
  onVoid,
}: Props) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
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

  const toneBadge = makeToneBadge(t);
  const stateColor = makeStateColor(t);

  return (
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
          /*
            TWO PREDICATES, NOT ONE. isVoided means "the owner asked", which is
            what makes an offline void visible immediately — and it is NOT the
            same as "the system cancelled it". When the server has REFUSED the
            void, showing ยกเลิกแล้ว with the total struck through would tell
            the yard a purchase was reversed while the server still holds it as
            live money, which is the one outcome this whole state exists to
            prevent.
          */
          const refused = isVoidRefused(b);
          const voided = isVoided(b) && !refused;
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
          const notice = billNotice(b, session, account);
          const parked = notice.tone === "parked";
          const voidLine = voidProgressLine(b);
          const roleNote = voidRoleNote(b, role);
          return (
            <View
              key={b.id}
              style={[
                styles.card,
                voided && styles.cardVoided,
                parked && styles.cardParked,
                // A refused void gets the red card, like the queue blocker:
                // the bill is NOT in the state the owner asked for, and only a
                // person can change that.
                refused && styles.cardBlocker,
                isBlocker && styles.cardBlocker,
              ]}
            >
              {isBlocker ? (
                <Text style={styles.blockerBanner}>
                  ⚠ บิลนี้ส่งไม่ผ่านและกำลังขวางคิว — บิลที่เหลือจะส่งไม่ได้จนกว่าจะแก้ไขใบนี้
                </Text>
              ) : null}
              <View style={styles.cardTop}>
                {notice.badge !== null && notice.tone !== "none" ? (
                  /*
                    RANKED FIRST, ahead of ยกเลิกแล้ว, and that order is the
                    fix. A parked bill's sync_state is still 'pending', so the
                    plain badge would read รอส่ง — true but misleading; the
                    badge names WHO it waits for instead. A REFUSED VOID is the
                    case that had to come before the void badge: it has
                    void_requested_at set, so the old order would have shown
                    ยกเลิกแล้ว on a bill the server still holds live.

                    The colour comes from the tone Record, so a badge cannot be
                    amber "waiting" for a state that is nothing of the kind.
                    `tone !== "none"` is tested in the condition rather than
                    asserted with a cast: there is no closure between the test
                    and the use here, so the compiler grants the narrowing —
                    and if a "none" ever did arrive carrying a badge, this falls
                    through to the plain state badge instead of rendering an
                    unstyled one.
                  */
                  <Text style={[styles.badge, toneBadge[notice.tone]]}>{notice.badge}</Text>
                ) : voided ? (
                  <Text style={[styles.badge, styles.badgeVoid]}>ยกเลิกแล้ว</Text>
                ) : (
                  <Text style={[styles.badge, { backgroundColor: stateColor[b.sync_state] }]}>
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

              {/*
                WAS THIS BILL PRICED FROM OLD DATA? The bill carries
                master_as_of — the fetch time of the master data its prices
                were defaulted from — and this is where that becomes readable
                after the fact.

                It matters because the server stamps list_price from the
                CURRENT list, so a bill priced off a stale cache arrives with
                unit_price != list_price and looks exactly like a deliberate
                override. This line is the device's own record that it was not.

                KNOWN LIMIT: device-only. The office reconciling on the server
                cannot see it, and closing that needs a server field — named,
                and deliberately not added, at the foot of freshness.ts.
              */}
              {pricingProvenanceLine(b) !== null ? (
                <Text style={styles.pricedFrom}>{pricingProvenanceLine(b)}</Text>
              ) : null}

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

              {canRequestVoid(b, role) && voidingId !== b.id ? (
                <Pressable
                  style={styles.voidBtn}
                  onPress={() => startVoid(b.id)}
                  disabled={busy}
                >
                  <Text style={styles.voidBtnText}>ยกเลิกบิลนี้</Text>
                </Pressable>
              ) : null}

              {/*
                What stands in for the button when the ROLE is what hid it.
                Not silence: a button that was there yesterday and is gone
                today reads as a broken app. The sentence comes from
                parkedReason, like every other operator-facing string, so it is
                reachable by the proofs — app/ is not.
              */}
              {roleNote !== null ? <Text style={styles.roleNote}>{roleNote}</Text> : null}

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
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.color.background },
    head: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: t.space.x3, paddingTop: 56, paddingBottom: t.space.xl,
      backgroundColor: t.color.surface, borderBottomWidth: 1, borderBottomColor: t.color.borderSoft,
    },
    title: { fontSize: t.type.title, fontWeight: "900", color: t.color.text },
    closeBtn: {
      minHeight: t.tapMin, paddingHorizontal: t.space.x4, borderRadius: t.radius.lg,
      backgroundColor: t.color.borderSoft, alignItems: "center", justifyContent: "center",
    },
    closeText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.neutralFg },
    body: { padding: t.space.x3, paddingBottom: t.space.x5 },
    empty: { textAlign: "center", color: t.color.textSubtle, marginTop: 40, fontSize: t.type.bodyLg },

    card: {
      backgroundColor: t.color.surface, borderRadius: t.radius.xl, padding: t.space.xl, marginBottom: t.space.xl,
      borderWidth: 1, borderColor: t.color.borderSoft,
    },
    cardVoided: { backgroundColor: t.color.background, borderColor: t.color.border },
    // Amber, matching รอส่ง and the offline strip — the "waiting" family, NOT the
    // red "something is wrong" family that cardBlocker belongs to.
    cardParked: { borderColor: t.color.warning, backgroundColor: t.color.warningSoftBg },
    cardBlocker: { borderColor: t.color.danger, borderWidth: 2, backgroundColor: t.color.dangerSoftBg },
    blockerBanner: {
      fontSize: t.type.body, fontWeight: "800", color: t.color.dangerFg, backgroundColor: t.color.dangerBg,
      borderRadius: t.radius.md, paddingHorizontal: t.space.lg, paddingVertical: t.space.md, marginBottom: t.space.lg,
    },
    cardTop: { flexDirection: "row", alignItems: "center", gap: t.space.md },
    badge: {
      color: t.color.onPrimary, fontSize: t.type.body, fontWeight: "800", paddingHorizontal: t.space.md,
      paddingVertical: t.space.xs, borderRadius: t.radius.sm, overflow: "hidden",
    },
    badgeVoid: { backgroundColor: t.color.textMuted },
    badgeParked: { backgroundColor: t.color.warning },
    doc: { flex: 1, fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.text },
    total: { fontSize: t.type.title, fontWeight: "900", color: t.color.primary },
    struck: { textDecorationLine: "line-through", color: t.color.placeholder },
    meta: { fontSize: t.type.body, color: t.color.textSubtle, marginTop: t.space.sm },
    // Informational blue, not amber: this is provenance, not a fault. The bill is
    // valid and may well be priced correctly — what is being recorded is where the
    // number came from, so an unexpected list_price on the server can be explained
    // rather than guessed at.
    pricedFrom: {
      fontSize: t.type.body, color: t.color.infoFg, backgroundColor: t.color.infoBg, borderRadius: t.radius.md,
      paddingHorizontal: t.space.md, paddingVertical: t.space.sm, marginTop: t.space.md, fontWeight: "700",
    },

    voidBox: {
      marginTop: t.space.lg, padding: t.space.lg, backgroundColor: t.color.surfaceAlt, borderRadius: t.radius.md,
    },
    voidReason: { fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.text },
    voidState: { fontSize: t.type.body, color: t.color.textMuted, marginTop: t.space.xs },

    // ONE box for every notice tone; the colour comes from TONE_BOX/TONE_LEAD.
    noticeBox: { marginTop: t.space.lg, padding: t.space.lg, borderRadius: t.radius.md },
    noticeLead: { fontSize: t.type.bodyLg, fontWeight: "800" },
    noticeCalm: { fontSize: t.type.body, marginTop: t.space.sm, fontWeight: "600" },

    // Quiet grey, deliberately unlike every failure style on this card: nothing has
    // gone wrong, this account simply does not do this job.
    roleNote: {
      marginTop: t.space.xl, fontSize: t.type.body, color: t.color.textSubtle, fontWeight: "700",
      textAlign: "center",
    },
    voidBtn: {
      marginTop: t.space.xl, minHeight: t.tapMin, borderRadius: t.radius.lg, backgroundColor: t.color.dangerBg,
      alignItems: "center", justifyContent: "center",
    },
    voidBtnText: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.danger },

    reasonBox: { marginTop: t.space.xl },
    reasonLabel: { fontSize: t.type.body, fontWeight: "800", color: t.color.neutralFg },
    reasonInput: {
      borderWidth: 2, borderColor: t.color.danger, borderRadius: t.radius.lg, padding: t.space.xl,
      fontSize: t.type.subhead, backgroundColor: t.color.surface, marginTop: t.space.sm, minHeight: t.tapMin + t.space.x3,
      color: t.color.text, textAlignVertical: "top",
    },
    reasonErr: { fontSize: t.type.body, color: t.color.danger, marginTop: t.space.sm, fontWeight: "700" },
    reasonBtns: { flexDirection: "row", gap: t.space.lg, marginTop: t.space.xl },
    rBtn: { flex: 1, minHeight: t.tapMin, borderRadius: t.radius.lg, alignItems: "center", justifyContent: "center" },
    rCancel: { backgroundColor: t.color.borderSoft },
    rCancelText: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.neutralFg },
    rConfirm: { backgroundColor: t.color.danger },
    rConfirmText: { fontSize: t.type.bodyLg, fontWeight: "900", color: t.color.onPrimary },
    dim: { opacity: 0.4 },
  });
}
