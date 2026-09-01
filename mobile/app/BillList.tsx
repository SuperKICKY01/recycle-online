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
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { BillsSection } from "../src/reports/dailyView";
import { useTheme, type ThemeTokens } from "./theme";
import { display } from "../src/money/format";

export function BillList({ section }: { section: BillsSection }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
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
          <Text style={styles.billAmount}>{display(r.amount)}</Text>
        </View>
      ))}
      {section.moreNote !== null ? <Text style={styles.note}>{section.moreNote}</Text> : null}
      {section.unreadableNote !== null ? (
        <Text style={styles.note}>{section.unreadableNote}</Text>
      ) : null}
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    card: {
      backgroundColor: t.color.surface, borderRadius: t.radius.xl, padding: t.space.xl, marginBottom: t.space.xl,
      borderWidth: 1, borderColor: t.color.borderSoft,
    },
    cardHeading: { fontSize: t.type.bodyLg, fontWeight: "900", color: t.color.text },
    empty: { fontSize: t.type.body, color: t.color.textMuted, marginTop: t.space.md, fontWeight: "700" },
    note: { fontSize: t.type.body, color: t.color.warningFg, marginTop: t.space.md, fontWeight: "700" },
    billRow: {
      flexDirection: "row", alignItems: "center", gap: t.space.lg, paddingVertical: t.space.md,
      borderTopWidth: 1, borderTopColor: t.color.divider,
    },
    billTime: { fontSize: t.type.body, fontWeight: "800", color: t.color.placeholder, width: 42 },
    billMid: { flex: 1 },
    billDoc: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.text },
    billSeller: { fontSize: t.type.body, color: t.color.textSubtle, fontWeight: "600" },
    billOff: { fontSize: t.type.body, color: t.color.warning, fontWeight: "800", marginTop: t.space.xs },
    billAmount: { fontSize: t.type.subhead, fontWeight: "900", color: t.color.text },
  });
}
