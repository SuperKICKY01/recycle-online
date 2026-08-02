/**
 * THE DAY'S MONEY — the first screen in this app built for the OWNER.
 *
 * Presentation only. This file decides NOTHING: what it shows, in what order,
 * with what wording and in what tone all come from src/reports/dailyView.ts,
 * where a headless proof can reach them. Same move and same reason as StatusStrip
 * and BillsPanel — every operator-facing sentence that ever shipped wrong on this
 * project was one that lived under app/ and no proof could see.
 *
 * THE LAYOUT IS AN ARGUMENT ABOUT PROMINENCE, and it is the one thing this file
 * really does decide. The reader is standing at the cash box at closing time
 * comparing two numbers, on a phone, possibly in an office. So, in order:
 *
 *   1. THE TOTAL, as large as the screen allows. It is the whole reason anyone
 *      opened this.
 *   2. THE UNDERSTATEMENT, immediately beneath it and inside the same card —
 *      not below the fold, not in grey at the bottom, not behind a tap. The
 *      total can be low at any moment and the person reading it is about to
 *      conclude something about their staff's honesty if it is. It is styled
 *      INFORMATIONAL BLUE rather than amber or red: this is the design working,
 *      it is true on every trading day, and a warning that looks like a fault
 *      every single evening is one nobody reads by Friday.
 *   3. VOIDS — the only place a reversal of real money becomes visible.
 *   4. OFF-LIST — surfaced, never accused.
 *   5. THE BILL LIST — enough to find a bill, not the whole detail.
 *
 * Money is rendered with `{row.amount}` and nothing else. No formatter, no
 * separator, no toFixed: the string the server sent, in a Text node.
 */
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type {
  DailyMessageTone,
  DailyReportScreen,
  DailyScreen as DailyScreenModel,
  VoidSection,
} from "../src/reports/dailyView";

const TONE: Record<DailyMessageTone, { bg: string; fg: string; badge: string }> = {
  // Nothing is broken in any of these; only one of them is even about a fault.
  forbidden: { bg: "#fee2e2", fg: "#7f1d1d", badge: "#b91c1c" },
  session: { bg: "#fef3c7", fg: "#78350f", badge: "#b45309" },
  offline: { bg: "#f1f5f9", fg: "#334155", badge: "#64748b" },
  server: { bg: "#f1f5f9", fg: "#334155", badge: "#64748b" },
  invalid: { bg: "#fef3c7", fg: "#78350f", badge: "#b45309" },
};

interface Props {
  visible: boolean;
  /** null while a request is in flight, so a spinner is a state and not a guess. */
  screen: DailyScreenModel | null;
  onClose: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  /** Load another day. null goes back to the server's own idea of today. */
  onPickDay: (wireDate: string | null) => void;
}

export function DailyScreen({ visible, screen, onClose, onRetry, onSignIn, onPickDay }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.fill}>
        <View style={styles.head}>
          <Text style={styles.title}>ยอดประจำวัน</Text>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>ปิด</Text>
          </Pressable>
        </View>

        {screen === null ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.loading}>กำลังอ่านยอดจากระบบ…</Text>
          </View>
        ) : screen.kind === "message" ? (
          <MessageBody
            screen={screen}
            onRetry={onRetry}
            onSignIn={onSignIn}
            onToday={() => onPickDay(null)}
          />
        ) : (
          <ReportBody screen={screen} onPickDay={onPickDay} />
        )}
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------- message ---- */

/**
 * Every outcome that is not a day of takings: no session, refused, unreachable,
 * a server that could not answer, a day that has not happened yet.
 *
 * NOTE WHAT IS NOT IN HERE: any money field at all. That is the structural half
 * of "an outage must not read as a zero day" — there is nothing on this screen a
 * number could be rendered from, so the leak is unrepresentable rather than
 * guarded. The button's LABEL arrives with its KIND, exactly like StatusAction,
 * so "ลองอีกครั้ง" cannot end up wired to the sign-in.
 */
function MessageBody({
  screen,
  onRetry,
  onSignIn,
  onToday,
}: {
  screen: Extract<DailyScreenModel, { kind: "message" }>;
  onRetry: () => void;
  onSignIn: () => void;
  onToday: () => void;
}) {
  const tone = TONE[screen.tone];
  const handler =
    screen.action === null
      ? undefined
      : screen.action.kind === "sign_in"
        ? onSignIn
        : screen.action.kind === "retry"
          ? onRetry
          : onToday;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={[styles.messageCard, { backgroundColor: tone.bg }]}>
        <Text style={[styles.messageBadge, { backgroundColor: tone.badge }]}>{screen.badge}</Text>
        {screen.lines.map((line, i) => (
          <Text
            key={i}
            style={[i === 0 ? styles.messageLead : styles.messageCalm, { color: tone.fg }]}
          >
            {line}
          </Text>
        ))}
        {screen.action !== null ? (
          <Pressable style={styles.messageBtn} onPress={handler}>
            <Text style={styles.messageBtnText}>{screen.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

/* -------------------------------------------------------------- report ---- */

function ReportBody({
  screen,
  onPickDay,
}: {
  screen: DailyReportScreen;
  onPickDay: (wireDate: string | null) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.body}>
      {/*
        THE DAY, AND HOW TO CHANGE IT. Two steppers rather than a calendar: a date
        picker is a dependency this app does not have, while "yesterday" is one
        subtraction from an instant the server already sent. ถัดไป is absent
        entirely on today — bounded by the SERVER's shop_today, never by this
        handset's clock, so a fast phone cannot walk the owner into a day the
        server will refuse.
      */}
      <View style={styles.dayBar}>
        <Pressable
          style={[styles.stepBtn, screen.stepBackTo === null && styles.stepOff]}
          disabled={screen.stepBackTo === null}
          onPress={() => onPickDay(screen.stepBackTo)}
        >
          <Text style={styles.stepText}>‹ ก่อนหน้า</Text>
        </Pressable>
        <Text style={styles.dayLabel}>{screen.dayHeading}</Text>
        <Pressable
          style={[styles.stepBtn, screen.stepForwardTo === null && styles.stepOff]}
          disabled={screen.stepForwardTo === null}
          onPress={() => onPickDay(screen.stepForwardTo)}
        >
          <Text style={styles.stepText}>ถัดไป ›</Text>
        </Pressable>
      </View>

      {screen.pastDayNote !== null ? (
        <Text style={styles.pastDay}>
          {screen.pastDayNote}
          {"  "}
          <Text style={styles.pastDayLink} onPress={() => onPickDay(null)}>
            กลับไปดูวันนี้
          </Text>
        </Text>
      ) : null}

      {screen.basisWarning !== null ? (
        <Text style={styles.basisWarn}>{screen.basisWarning}</Text>
      ) : null}

      {/*
        THE NUMBER, and the caveat INSIDE the same card. Splitting them into two
        cards is the version where the caveat becomes a footnote — the amount is
        what gets photographed, quoted down the phone, and remembered.
      */}
      <View style={styles.headlineCard}>
        <Text style={styles.headlineCaption}>{screen.headline.caption}</Text>
        <View style={styles.amountRow}>
          <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
            {screen.headline.amount}
          </Text>
          <Text style={styles.unit}>{screen.headline.unit}</Text>
        </View>
        <Text style={styles.countLine}>{screen.headline.countLine}</Text>
        {screen.docNoLine !== null ? (
          <Text style={styles.docNoLine}>{screen.docNoLine}</Text>
        ) : null}

        <View style={styles.caveat}>
          {screen.understatement.map((line, i) => (
            <Text key={i} style={i === 0 ? styles.caveatLead : styles.caveatCalm}>
              {line}
            </Text>
          ))}
          <Text style={styles.caveatCalm}>{screen.dayBoundary}</Text>
        </View>
      </View>

      <Voids section={screen.voided} />
      {screen.earlierVoids.rows.length > 0 ? <Voids section={screen.earlierVoids} alarm /> : null}

      {/* OFF LIST — surfaced, never accused. */}
      <View style={styles.card}>
        <Text style={styles.cardHeading}>{screen.offList.heading}</Text>
        {screen.offList.emptyLine !== null ? (
          <Text style={styles.empty}>{screen.offList.emptyLine}</Text>
        ) : (
          <>
            <Text style={styles.offSummary}>{screen.offList.summary}</Text>
            {screen.offList.varianceLine !== null ? (
              <Text style={styles.offVariance}>{screen.offList.varianceLine}</Text>
            ) : null}
            <Text style={styles.offDocs}>{screen.offList.docNos.join("  ·  ")}</Text>
            {screen.offList.incompleteNote !== null ? (
              <Text style={styles.note}>{screen.offList.incompleteNote}</Text>
            ) : null}
          </>
        )}
        <Text style={styles.explain}>{screen.offList.explain}</Text>
      </View>

      {/* THE BILL LIST — enough to find a bill, not the whole detail. */}
      <View style={styles.card}>
        <Text style={styles.cardHeading}>{screen.bills.heading}</Text>
        {screen.bills.emptyLine !== null ? (
          <Text style={styles.empty}>{screen.bills.emptyLine}</Text>
        ) : null}
        {screen.bills.rows.map((r, i) => (
          <View key={i} style={styles.billRow}>
            <Text style={styles.billTime}>{r.time}</Text>
            <View style={styles.billMid}>
              <Text style={styles.billDoc}>{r.docNo}</Text>
              <Text style={styles.billSeller} numberOfLines={1}>
                {r.seller} · {r.itemLine}
              </Text>
              {r.offListNote !== null ? (
                <Text style={styles.billOff}>{r.offListNote}</Text>
              ) : null}
            </View>
            <Text style={styles.billAmount}>{r.amount}</Text>
          </View>
        ))}
        {screen.bills.moreNote !== null ? (
          <Text style={styles.note}>{screen.bills.moreNote}</Text>
        ) : null}
        {screen.bills.unreadableNote !== null ? (
          <Text style={styles.note}>{screen.bills.unreadableNote}</Text>
        ) : null}
      </View>

      <Text style={styles.asOf}>{screen.asOf}</Text>
    </ScrollView>
  );
}

/**
 * A void list. Both sections share this because they ARE the same shape — the
 * difference is which question they answer, and that is carried in their own
 * heading and intro text rather than in two renderers that would drift.
 *
 * `alarm` is the earlier-day list: a void performed today against an older bill
 * appears in no day anyone would otherwise open, so it gets a border rather than
 * being read past.
 */
function Voids({ section, alarm = false }: { section: VoidSection; alarm?: boolean }) {
  return (
    <View style={[styles.card, alarm && styles.cardAlarm]}>
      <Text style={styles.cardHeading}>{section.heading}</Text>
      <Text style={styles.explain}>{section.intro}</Text>
      {section.emptyLine !== null ? <Text style={styles.empty}>{section.emptyLine}</Text> : null}
      {section.totalLine !== null ? (
        <Text style={styles.voidTotal}>{section.totalLine}</Text>
      ) : null}
      {section.rows.map((r, i) => (
        <View key={i} style={styles.voidRow}>
          <View style={styles.voidTop}>
            <Text style={styles.voidDoc}>{r.docNo}</Text>
            {/* Struck through: this money is NOT in the total above. */}
            <Text style={styles.voidAmount}>{r.amount}</Text>
          </View>
          <Text style={styles.voidReason}>เหตุผล: {r.reason}</Text>
          <Text style={styles.voidWho}>
            {r.who} · {r.when} · {r.seller}
          </Text>
          {r.fromDayNote !== null ? (
            <Text style={styles.voidFromDay}>{r.fromDayNote}</Text>
          ) : null}
        </View>
      ))}
      {section.truncatedNote !== null ? (
        <Text style={styles.note}>{section.truncatedNote}</Text>
      ) : null}
    </View>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loading: { fontSize: 14, color: "#64748b", fontWeight: "700" },

  /* --- the day and its steppers --- */
  dayBar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  dayLabel: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "900", color: "#0f172a" },
  stepBtn: {
    minHeight: 44, paddingHorizontal: 12, borderRadius: 10, justifyContent: "center",
    backgroundColor: "#e2e8f0",
  },
  stepOff: { opacity: 0.3 },
  stepText: { fontSize: 13, fontWeight: "800", color: "#334155" },
  pastDay: {
    fontSize: 13, fontWeight: "800", color: "#78350f", backgroundColor: "#fef3c7",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10,
  },
  pastDayLink: { color: "#0f766e", textDecorationLine: "underline" },
  basisWarn: {
    fontSize: 13, fontWeight: "800", color: "#7f1d1d", backgroundColor: "#fee2e2",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10,
  },

  /* --- the number --- */
  headlineCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  headlineCaption: { fontSize: 14, fontWeight: "800", color: "#64748b" },
  amountRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 },
  // The largest thing on the screen, and deliberately so.
  amount: { flex: 1, fontSize: 44, fontWeight: "900", color: "#0f766e" },
  unit: { fontSize: 18, fontWeight: "800", color: "#0f766e" },
  countLine: { fontSize: 15, fontWeight: "800", color: "#334155", marginTop: 2 },
  docNoLine: { fontSize: 12, color: "#64748b", marginTop: 2, fontWeight: "700" },

  /*
   * Informational blue, the same tone as the bill card's pricing provenance —
   * NOT amber and NOT red. This is normal, it is true every single evening, and
   * a caveat dressed as a fault stops being read by the end of the week.
   */
  caveat: {
    marginTop: 14, padding: 10, borderRadius: 10, backgroundColor: "#e0f2fe",
  },
  caveatLead: { fontSize: 13, fontWeight: "800", color: "#0c4a6e" },
  caveatCalm: { fontSize: 12, fontWeight: "600", color: "#0c4a6e", marginTop: 6 },

  /* --- sections --- */
  card: {
    backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  cardAlarm: { borderColor: "#b45309", borderWidth: 2, backgroundColor: "#fffbeb" },
  cardHeading: { fontSize: 15, fontWeight: "900", color: "#0f172a" },
  explain: { fontSize: 12, color: "#64748b", marginTop: 6, fontWeight: "600" },
  empty: { fontSize: 13, color: "#475569", marginTop: 8, fontWeight: "700" },
  note: { fontSize: 12, color: "#78350f", marginTop: 8, fontWeight: "700" },

  voidTotal: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginTop: 8 },
  voidRow: {
    marginTop: 10, padding: 10, backgroundColor: "#f8fafc", borderRadius: 8,
    borderLeftWidth: 3, borderLeftColor: "#b91c1c",
  },
  voidTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  voidDoc: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  voidAmount: {
    fontSize: 16, fontWeight: "900", color: "#94a3b8", textDecorationLine: "line-through",
  },
  voidReason: { fontSize: 13, color: "#0f172a", marginTop: 4, fontWeight: "700" },
  voidWho: { fontSize: 12, color: "#64748b", marginTop: 2, fontWeight: "600" },
  voidFromDay: { fontSize: 12, color: "#78350f", marginTop: 4, fontWeight: "800" },

  offSummary: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginTop: 8 },
  offVariance: { fontSize: 13, fontWeight: "800", color: "#334155", marginTop: 4 },
  offDocs: { fontSize: 13, fontWeight: "700", color: "#0f766e", marginTop: 6 },

  billRow: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: "#f1f5f9",
  },
  billTime: { fontSize: 12, fontWeight: "800", color: "#94a3b8", width: 42 },
  billMid: { flex: 1 },
  billDoc: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  billSeller: { fontSize: 12, color: "#64748b", fontWeight: "600" },
  billOff: { fontSize: 11, color: "#b45309", fontWeight: "800", marginTop: 2 },
  billAmount: { fontSize: 16, fontWeight: "900", color: "#0f766e" },

  asOf: { fontSize: 12, color: "#94a3b8", textAlign: "center", fontWeight: "700" },

  /* --- the non-report screens --- */
  messageCard: { borderRadius: 14, padding: 16, marginTop: 24, alignItems: "flex-start" },
  messageBadge: {
    color: "#fff", fontSize: 12, fontWeight: "800", paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 6, overflow: "hidden",
  },
  messageLead: { fontSize: 15, fontWeight: "800", marginTop: 12 },
  messageCalm: { fontSize: 13, fontWeight: "600", marginTop: 8 },
  messageBtn: {
    marginTop: 16, minHeight: 48, paddingHorizontal: 20, borderRadius: 10,
    backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center",
    alignSelf: "stretch",
  },
  messageBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
