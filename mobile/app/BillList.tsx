/**
 * THE DAY'S PER-BILL LIST — enough to find a bill, not the whole detail.
 *
 * This was the bills section of the old `app/DailyScreen.tsx`. That screen was the
 * standalone `/reports/daily` view; P1.23 item 4 unit 3 absorbed it into the
 * dashboard's TODAY view (ROADMAP § What the owner has settled, S24 — the daily
 * screen becomes a view inside the dashboard), so the standalone screen is gone and
 * this is the ONE home for the bill-list rendering. It is a component, not a
 * duplicate: `DashboardScreen` renders it, and nothing else does.
 *
 * Presentation only. Every sentence, the money strings, the times — all decided in
 * `src/reports/dailyView.ts`, which a headless proof reaches; this draws the
 * `BillsSection` it produced and decides nothing. Money is `{row.amount}` and
 * nothing else: the string the server sent, in a Text node, no formatter.
 *
 * NO MODAL ELEMENT here (as everywhere but SheetHost) — `npm run prove:sheets`
 * scans this directory and goes red if a second Modal appears.
 */
import { StyleSheet, Text, View } from "react-native";

import type { BillsSection } from "../src/reports/dailyView";

export function BillList({ section }: { section: BillsSection }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardHeading}>{section.heading}</Text>
      {section.emptyLine !== null ? <Text style={styles.empty}>{section.emptyLine}</Text> : null}
      {section.rows.map((r, i) => (
        <View key={i} style={styles.billRow}>
          <Text style={styles.billTime}>{r.time}</Text>
          <View style={styles.billMid}>
            <Text style={styles.billDoc}>{r.docNo}</Text>
            <Text style={styles.billSeller} numberOfLines={1}>
              {r.seller} · {r.itemLine}
            </Text>
            {r.offListNote !== null ? <Text style={styles.billOff}>{r.offListNote}</Text> : null}
          </View>
          <Text style={styles.billAmount}>{r.amount}</Text>
        </View>
      ))}
      {section.moreNote !== null ? <Text style={styles.note}>{section.moreNote}</Text> : null}
      {section.unreadableNote !== null ? (
        <Text style={styles.note}>{section.unreadableNote}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  cardHeading: { fontSize: 15, fontWeight: "900", color: "#0f172a" },
  empty: { fontSize: 13, color: "#475569", marginTop: 8, fontWeight: "700" },
  note: { fontSize: 12, color: "#78350f", marginTop: 8, fontWeight: "700" },
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
});
