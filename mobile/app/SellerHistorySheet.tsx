/**
 * SELLER HISTORY AT THE WEIGHBRIDGE — the panel a staff member opens from the
 * cart's seller header to see what this seller last sold (P1.21 drawing half).
 *
 * THIS FILE DECIDES NOTHING. Every sentence, the money gate, the shop-date, the
 * empty and failure states come from the pure builder src/sellerHistory/
 * sellerHistoryView.ts, where `npm run prove:sellerhistory` reaches them. This
 * file lays them out — same move and reason as DashboardScreen and SettingsScreen.
 *
 * MONEY IS RENDERED WITH `{value}` AND NOTHING ELSE: the string the server sent,
 * in a Text node, and only when the builder decided (money_included). No formatter,
 * no separator, no toFixed.
 *
 * NO MODAL ELEMENT here — the app has exactly one (app/SheetHost), and
 * `npm run prove:sheets` scans this directory and goes red if a second appears.
 */
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { HistoryTone, SellerHistoryScreen } from "../src/sellerHistory/sellerHistoryView";
import { useTheme, type ThemeTokens } from "./theme";
import { SheetHeader } from "./SheetHeader";
import { Touchable } from "./Press";
import { display } from "../src/money/format";

function makeTone(t: ThemeTokens): Record<HistoryTone, { bg: string; fg: string; badge: string }> {
  return {
    session: { bg: t.color.warningBg, fg: t.color.warningFg, badge: t.color.warning },
    offline: { bg: t.color.neutralBg, fg: t.color.neutralFg, badge: t.color.textSubtle },
    server: { bg: t.color.neutralBg, fg: t.color.neutralFg, badge: t.color.textSubtle },
    calm: { bg: t.color.infoBg, fg: t.color.infoFg, badge: t.color.info },
  };
}

interface Props {
  sellerName: string;
  /** The built screen, or null while the read is in flight. */
  screen: SellerHistoryScreen | null;
  onClose: () => void;
  onRetry: () => void;
  onSignIn: () => void;
}

export function SellerHistorySheet({ sellerName, screen, onClose, onRetry, onSignIn }: Props) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.fill}>
      <SheetHeader
        title={sellerName === "" ? "ประวัติผู้ขาย" : `ประวัติ ${sellerName}`}
        onClose={onClose}
      />
      {screen === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loading}>กำลังอ่านประวัติจากระบบ…</Text>
        </View>
      ) : screen.kind === "message" ? (
        <MessageBody screen={screen} onRetry={onRetry} onSignIn={onSignIn} />
      ) : (
        <ReportBody report={screen} />
      )}
    </View>
  );
}

/* ------------------------------------------------------------- message ---- */

function MessageBody({
  screen,
  onRetry,
  onSignIn,
}: {
  screen: Extract<SellerHistoryScreen, { kind: "message" }>;
  onRetry: () => void;
  onSignIn: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const tone = makeTone(t)[screen.tone];
  const handler =
    screen.action === null ? undefined : screen.action.kind === "sign_in" ? onSignIn : onRetry;
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={[styles.messageCard, { backgroundColor: tone.bg }]}>
        <Text style={[styles.messageBadge, { backgroundColor: tone.badge }]}>{screen.badge}</Text>
        {screen.lines.map((line, i) => (
          <Text key={i} style={[i === 0 ? styles.messageLead : styles.messageCalm, { color: tone.fg }]}>
            {line}
          </Text>
        ))}
        {screen.action !== null ? (
          <Touchable style={styles.messageBtn} onPress={handler} haptic="light" accessibilityLabel={screen.action.label}>
            <Text style={styles.messageBtnText}>{screen.action.label}</Text>
          </Touchable>
        ) : null}
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------- history ---- */

function ReportBody({ report }: { report: Extract<SellerHistoryScreen, { kind: "history" }> }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <ScrollView contentContainerStyle={styles.body}>
      {report.moneyNote !== null ? <Text style={styles.moneyNote}>{report.moneyNote}</Text> : null}
      {report.emptyLine !== null ? (
        <Text style={styles.empty}>{report.emptyLine}</Text>
      ) : (
        report.bills.map((b) => (
          <View key={b.bill_id} style={[styles.billCard, b.isVoid && styles.billCardVoid]}>
            <View style={styles.billHead}>
              <Text style={styles.billDoc} numberOfLines={1}>
                {b.docNoLabel}
              </Text>
              <Text style={styles.billDate}>{b.date}</Text>
            </View>
            {b.voidLabel !== null ? <Text style={styles.voidLabel}>{b.voidLabel}</Text> : null}
            {b.lines.map((l, i) => (
              <View key={i} style={styles.line}>
                <Text style={styles.lineProduct} numberOfLines={1}>
                  {l.product}
                </Text>
                <Text style={styles.lineWeight}>
                  {l.quantity}
                </Text>
                {l.unit_price !== null ? <Text style={styles.linePrice}>{display(l.unit_price)}</Text> : null}
              </View>
            ))}
            {b.total !== null ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>รวม</Text>
                <Text style={styles.totalValue}>{display(b.total)}</Text>
              </View>
            ) : null}
            {b.paymentLabel !== null ? (
              <Text style={styles.paymentBadge}>{b.paymentLabel}</Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.color.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.x3 },
    loading: { fontSize: t.type.bodyLg, color: t.color.textMuted },
    body: { padding: t.space.x3, gap: t.space.x3 },
    moneyNote: {
      fontSize: t.type.bodyLg,
      color: t.color.infoFg,
      backgroundColor: t.color.infoBg,
      padding: t.space.xl,
      borderRadius: t.radius.md,
    },
    empty: { fontSize: t.type.subhead, color: t.color.textMuted, textAlign: "center", paddingVertical: t.space.x5 },
    billCard: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      borderWidth: 1,
      borderColor: t.color.borderSoft,
      padding: t.space.x3,
      gap: t.space.md,
    },
    billCardVoid: { borderColor: t.color.warning, backgroundColor: t.color.warningBg },
    billHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    billDoc: { flex: 1, fontSize: t.type.subhead, fontWeight: "800", color: t.color.text },
    billDate: { fontSize: t.type.body, color: t.color.textMuted, marginLeft: t.space.md },
    voidLabel: {
      fontSize: t.type.body,
      fontWeight: "800",
      color: t.color.warningFg,
      alignSelf: "flex-start",
    },
    line: { flexDirection: "row", alignItems: "center", gap: t.space.md },
    lineProduct: { flex: 1, fontSize: t.type.bodyLg, color: t.color.text },
    lineWeight: { fontSize: t.type.bodyLg, color: t.color.textMuted },
    linePrice: { fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.text, minWidth: t.space.x5 * 3, textAlign: "right" },
    totalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: t.color.divider,
      paddingTop: t.space.md,
    },
    totalLabel: { fontSize: t.type.subhead, fontWeight: "700", color: t.color.textMuted },
    totalValue: { fontSize: t.type.subhead, fontWeight: "900", color: t.color.text },
    // An outstanding/partial bill is a "watch this" state, the same warning tone the
    // void label carries. Only ever drawn for a LIVE, money-shown, not-fully-paid
    // bill (sellerHistoryView.paymentLabelFor).
    paymentBadge: {
      fontSize: t.type.body,
      fontWeight: "800",
      color: t.color.warningFg,
      alignSelf: "flex-start",
    },
    messageCard: { borderRadius: t.radius.lg, padding: t.space.x3, gap: t.space.xl },
    messageBadge: {
      alignSelf: "flex-start",
      fontSize: t.type.body,
      fontWeight: "800",
      color: t.color.onPrimary,
      paddingHorizontal: t.space.xl,
      paddingVertical: t.space.xs,
      borderRadius: t.radius.pill,
      overflow: "hidden",
    },
    messageLead: { fontSize: t.type.subhead, fontWeight: "700" },
    messageCalm: { fontSize: t.type.bodyLg },
    messageBtn: {
      minHeight: t.tapMin,
      borderRadius: t.radius.lg,
      backgroundColor: t.color.primaryFill,
      borderWidth: 1,
      borderColor: t.color.primary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: t.space.x4,
    },
    messageBtnText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.onPrimaryFill },
  });
}
