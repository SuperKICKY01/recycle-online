/**
 * THE OWNER'S DASHBOARD — one screen, period × dimension over GET /reports/summary,
 * with the day's per-bill list absorbed as the today view. P1.23 item 4, unit 3.
 *
 * THIS FILE DECIDES NOTHING. What it shows, in what order, with what wording, whose
 * money it is, whether the entry may even be here — all of it comes from the pure
 * builders under src/dashboard/ (period.ts, summaryView.ts, unsentLine.ts,
 * dashboardView.ts), where a headless proof (`npm run prove:dashboard`) reaches
 * them. This file lays them out. Same move and same reason as DailyScreen was, and
 * as StatusStrip and SettingsScreen are.
 *
 * MONEY IS RENDERED WITH `{value}` AND NOTHING ELSE. No formatter, no separator, no
 * toFixed: the string the server sent, in a Text node. The ONE number this screen
 * turns into geometry is the bar length — a LAYOUT fraction the builder produced,
 * never shown as text (E6: bars are plain Views, no chart library, no native module).
 *
 * NO MODAL ELEMENT here — the app has exactly one (app/SheetHost), and
 * `npm run prove:sheets` scans this directory and goes red if a second appears.
 */
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { PresetKind } from "../src/dashboard/period";
import type {
  DashboardScreenModel,
  DashboardReport,
} from "../src/dashboard/dashboardView";
import type { SummaryReport, SummaryTone } from "../src/dashboard/summaryView";
import type { DailyScreen as DailyScreenModel } from "../src/reports/dailyView";
import { BillList } from "./BillList";

const TAP_MIN = 56;

const TONE: Record<SummaryTone, { bg: string; fg: string; badge: string }> = {
  // Nothing is broken in any of these; only one is even about a fault.
  forbidden: { bg: "#fee2e2", fg: "#7f1d1d", badge: "#b91c1c" },
  session: { bg: "#fef3c7", fg: "#78350f", badge: "#b45309" },
  offline: { bg: "#f1f5f9", fg: "#334155", badge: "#64748b" },
  server: { bg: "#f1f5f9", fg: "#334155", badge: "#64748b" },
  invalid: { bg: "#fef3c7", fg: "#78350f", badge: "#b45309" },
};

export interface DashboardCustom {
  from: string;
  to: string;
  /** The device-side refusal sentence for an invalid range, or null. */
  error: string | null;
}

interface Props {
  /** null while a request is in flight, so a spinner is a state and not a guess. */
  model: DashboardScreenModel | null;
  /** The /reports/daily result for the today view's bill list, or null. */
  daily: DailyScreenModel | null;
  custom: DashboardCustom;
  onClose: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  onPickPreset: (preset: PresetKind) => void;
  onPickBy: (by: string) => void;
  onPickState: (state: string) => void;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
  onApplyCustom: () => void;
}

export function DashboardScreen(props: Props) {
  const { model } = props;
  return (
    <View style={styles.fill}>
      <View style={styles.head}>
        <Text style={styles.title}>
          {model !== null && model.kind === "dashboard" ? model.title : "ยอด"}
        </Text>
        <Pressable style={styles.closeBtn} onPress={props.onClose}>
          <Text style={styles.closeText}>ปิด</Text>
        </Pressable>
      </View>

      {model === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loading}>กำลังอ่านยอดจากระบบ…</Text>
        </View>
      ) : model.kind === "message" ? (
        <MessageBody
          screen={model}
          onRetry={props.onRetry}
          onSignIn={props.onSignIn}
        />
      ) : (
        <DashboardBody {...props} model={model} />
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
  screen: Extract<DashboardScreenModel, { kind: "message" }>;
  onRetry: () => void;
  onSignIn: () => void;
}) {
  const tone = TONE[screen.tone];
  const handler =
    screen.action === null
      ? undefined
      : screen.action.kind === "sign_in"
        ? onSignIn
        : onRetry;
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
          <Pressable style={styles.messageBtn} onPress={handler}>
            <Text style={styles.messageBtnText}>{screen.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------- dashboard -- */

function Chip({
  label,
  note,
  selected,
  onPress,
}: {
  label: string;
  note?: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, selected && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
      {note ? <Text style={[styles.chipNote, selected && styles.chipTextOn]}>{note}</Text> : null}
    </Pressable>
  );
}

function FigureRow({ label, value, unit, big }: { label: string; value: string; unit: string; big?: boolean }) {
  return (
    <View style={styles.figureRow}>
      <Text style={styles.figureLabel}>{label}</Text>
      <View style={styles.figureValueWrap}>
        <Text style={[styles.figureValue, big && styles.figureValueBig]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={styles.figureUnit}>{unit}</Text>
      </View>
    </View>
  );
}

function Bars({ report }: { report: SummaryReport }) {
  if (report.emptyLine !== null) {
    return <Text style={styles.empty}>{report.emptyLine}</Text>;
  }
  return (
    <View>
      {report.rows.map((r) => (
        <View key={r.key} style={styles.barRow}>
          <View style={styles.barHead}>
            <Text style={[styles.barLabel, r.isOthers && styles.barLabelOthers]} numberOfLines={1}>
              {r.label}
            </Text>
            <Text style={styles.barValue}>{r.paid_total}</Text>
          </View>
          {/* THE BAR IS A LAYOUT FRACTION, drawn from Views (E6). Two flex children,
              so no percentage string and no chart library. */}
          <View style={styles.barTrack}>
            <View style={[styles.barFill, r.isOthers && styles.barFillOthers, { flex: r.fraction }]} />
            <View style={{ flex: 1 - r.fraction }} />
          </View>
          <Text style={styles.barSub}>
            {String(r.bill_count)} ใบ · {r.net_weight} กก. · ส่วนต่าง {r.list_minus_paid}
          </Text>
        </View>
      ))}
    </View>
  );
}

function DashboardBody(props: Props & { model: DashboardReport }) {
  const { model, custom, daily } = props;
  const report = model.report;
  const customSelected = model.presetChips.some((c) => c.preset === "custom" && c.selected);

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {/* THE PERIOD */}
      <Text style={styles.sectionLabel}>ช่วงเวลา · {model.periodLabel}</Text>
      <View style={styles.chipRow}>
        {model.presetChips.map((c) => (
          <Chip
            key={c.preset}
            label={c.label}
            note={c.note}
            selected={c.selected}
            onPress={() => props.onPickPreset(c.preset)}
          />
        ))}
      </View>

      {customSelected ? (
        <View style={styles.customCard}>
          <View style={styles.customFields}>
            <TextInput
              style={styles.customInput}
              value={custom.from}
              onChangeText={props.onCustomFrom}
              placeholder="เริ่ม (ปปปป-ดด-วว)"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.customDash}>ถึง</Text>
            <TextInput
              style={styles.customInput}
              value={custom.to}
              onChangeText={props.onCustomTo}
              placeholder="สิ้นสุด (ปปปป-ดด-วว)"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Pressable style={styles.customApply} onPress={props.onApplyCustom}>
            <Text style={styles.customApplyText}>ดูช่วงนี้</Text>
          </Pressable>
          {custom.error !== null ? <Text style={styles.customError}>{custom.error}</Text> : null}
        </View>
      ) : null}

      {/* THE DIMENSION AND THE STATE */}
      <Text style={styles.sectionLabel}>แยกตาม</Text>
      <View style={styles.chipRow}>
        {report.byChips.map((c) => (
          <Chip key={c.value} label={c.label} selected={c.selected} onPress={() => props.onPickBy(c.value)} />
        ))}
      </View>
      <View style={styles.chipRow}>
        {report.stateChips.map((c) => (
          <Chip key={c.value} label={c.label} selected={c.selected} onPress={() => props.onPickState(c.value)} />
        ))}
      </View>

      {/* THE TOTALS — the server's strings, byte for byte. */}
      <View style={styles.totalsCard}>
        <FigureRow label={report.figureLabels.paid} value={report.totals.paid_total} unit="บาท" big />
        <FigureRow label={report.figureLabels.list} value={report.totals.list_total} unit="บาท" />
        <FigureRow label={report.figureLabels.diff} value={report.totals.list_minus_paid} unit="บาท" />
        <FigureRow label={report.figureLabels.weight} value={report.totals.net_weight} unit="กก." />
        <FigureRow label={report.figureLabels.count} value={String(report.totals.bill_count)} unit="ใบ" />
        <Text style={styles.explain}>{report.diffExplain}</Text>

        {/* THE UNSENT LINE (E4) — under the totals, never added into them. */}
        {model.unsent !== null ? <Text style={styles.unsent}>{model.unsent.text}</Text> : null}
      </View>

      {/* THE BREAKDOWN */}
      <View style={styles.card}>
        <Bars report={report} />
      </View>

      {/* THE TODAY VIEW'S PER-BILL LIST — admin only; staff get a sentence. */}
      {model.billList.kind === "staff_unavailable" ? (
        <View style={styles.card}>
          <Text style={styles.empty}>{model.billList.note}</Text>
        </View>
      ) : model.billList.kind === "show" ? (
        daily === null ? (
          <ActivityIndicator style={styles.billSpinner} />
        ) : daily.kind === "report" ? (
          <BillList section={daily.bills} />
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardHeading}>{daily.badge}</Text>
            {daily.lines.map((line, i) => (
              <Text key={i} style={styles.empty}>
                {line}
              </Text>
            ))}
          </View>
        )
      ) : null}
    </ScrollView>
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

  sectionLabel: { fontSize: 13, fontWeight: "800", color: "#64748b", marginTop: 6, marginBottom: 6 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  chip: {
    minHeight: TAP_MIN, paddingHorizontal: 14, borderRadius: 12, justifyContent: "center",
    backgroundColor: "#e2e8f0",
  },
  chipOn: { backgroundColor: "#0f766e" },
  chipText: { fontSize: 14, fontWeight: "800", color: "#334155" },
  chipTextOn: { color: "#fff" },
  chipNote: { fontSize: 10, fontWeight: "700", color: "#64748b" },

  customCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  customFields: { flexDirection: "row", alignItems: "center", gap: 8 },
  customInput: {
    flex: 1, minHeight: TAP_MIN, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    paddingHorizontal: 12, fontSize: 15, fontWeight: "700", color: "#0f172a",
  },
  customDash: { fontSize: 13, fontWeight: "800", color: "#64748b" },
  customApply: {
    minHeight: TAP_MIN, marginTop: 10, borderRadius: 12, backgroundColor: "#0f766e",
    alignItems: "center", justifyContent: "center",
  },
  customApplyText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  customError: {
    fontSize: 13, fontWeight: "800", color: "#7f1d1d", backgroundColor: "#fee2e2",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10,
  },

  totalsCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 8, marginBottom: 12,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  figureRow: {
    flexDirection: "row", alignItems: "baseline", justifyContent: "space-between",
    paddingVertical: 4, borderTopWidth: 1, borderTopColor: "#f1f5f9",
  },
  figureLabel: { fontSize: 14, fontWeight: "800", color: "#64748b", flexShrink: 0 },
  figureValueWrap: { flexDirection: "row", alignItems: "baseline", gap: 6, flexShrink: 1, marginLeft: 12 },
  figureValue: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  figureValueBig: { fontSize: 28, color: "#0f766e" },
  figureUnit: { fontSize: 13, fontWeight: "800", color: "#94a3b8" },
  explain: { fontSize: 12, color: "#64748b", marginTop: 8, fontWeight: "600" },
  unsent: {
    fontSize: 13, fontWeight: "800", color: "#0c4a6e", backgroundColor: "#e0f2fe",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 12,
  },

  card: {
    backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  cardHeading: { fontSize: 15, fontWeight: "900", color: "#0f172a" },
  empty: { fontSize: 13, color: "#475569", marginTop: 8, fontWeight: "700" },

  barRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  barHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  barLabel: { flex: 1, fontSize: 14, fontWeight: "800", color: "#0f172a", marginRight: 8 },
  barLabelOthers: { color: "#64748b", fontStyle: "italic" },
  barValue: { fontSize: 15, fontWeight: "900", color: "#0f766e" },
  barTrack: {
    flexDirection: "row", height: 10, backgroundColor: "#e2e8f0", borderRadius: 5,
    overflow: "hidden", marginTop: 6,
  },
  barFill: { backgroundColor: "#0f766e" },
  barFillOthers: { backgroundColor: "#94a3b8" },
  barSub: { fontSize: 11, fontWeight: "700", color: "#94a3b8", marginTop: 4 },

  billSpinner: { marginVertical: 16 },

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
