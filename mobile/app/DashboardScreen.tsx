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
import { useMemo } from "react";
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
import { useTheme, type ThemeTokens } from "./theme";
import { SheetHeader } from "./SheetHeader";
import { Touchable } from "./Press";
import { display } from "../src/money/format";

function makeTone(t: ThemeTokens): Record<SummaryTone, { bg: string; fg: string; badge: string }> {
  return {
    // Nothing is broken in any of these; only one is even about a fault.
    forbidden: { bg: t.color.dangerBg, fg: t.color.dangerFg, badge: t.color.danger },
    session: { bg: t.color.warningBg, fg: t.color.warningFg, badge: t.color.warning },
    offline: { bg: t.color.neutralBg, fg: t.color.neutralFg, badge: t.color.textSubtle },
    server: { bg: t.color.neutralBg, fg: t.color.neutralFg, badge: t.color.textSubtle },
    invalid: { bg: t.color.warningBg, fg: t.color.warningFg, badge: t.color.warning },
  };
}

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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { model } = props;
  return (
    <View style={styles.fill}>
      <SheetHeader
        title={model !== null && model.kind === "dashboard" ? model.title : "ยอด"}
        onClose={props.onClose}
      />

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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const tone = makeTone(t)[screen.tone];
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
          <Touchable style={styles.messageBtn} onPress={handler} haptic="light" accessibilityLabel={screen.action.label}>
            <Text style={styles.messageBtnText}>{screen.action.label}</Text>
          </Touchable>
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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <Touchable style={[styles.chip, selected && styles.chipOn]} onPress={onPress} haptic="light" accessibilityLabel={label} selected={selected}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
      {note ? <Text style={[styles.chipNote, selected && styles.chipTextOn]}>{note}</Text> : null}
    </Touchable>
  );
}

function FigureRow({ label, value, unit, big }: { label: string; value: string; unit: string; big?: boolean }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
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
            <Text style={styles.barValue}>{display(r.paid_total)}</Text>
          </View>
          {/* THE BAR IS A LAYOUT FRACTION, drawn from Views (E6). Two flex children,
              so no percentage string and no chart library. */}
          <View style={styles.barTrack}>
            <View style={[styles.barFill, r.isOthers && styles.barFillOthers, { flex: r.fraction }]} />
            <View style={{ flex: 1 - r.fraction }} />
          </View>
          <Text style={styles.barSub}>
            {String(r.bill_count)} ใบ · {display(r.net_weight)} กก. · ส่วนต่าง {display(r.list_minus_paid)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function DashboardBody(props: Props & { model: DashboardReport }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
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
              placeholderTextColor={t.color.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.customDash}>ถึง</Text>
            <TextInput
              style={styles.customInput}
              value={custom.to}
              onChangeText={props.onCustomTo}
              placeholder="สิ้นสุด (ปปปป-ดด-วว)"
              placeholderTextColor={t.color.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Touchable style={styles.customApply} onPress={props.onApplyCustom} haptic="light" accessibilityLabel="ดูช่วงนี้">
            <Text style={styles.customApplyText}>ดูช่วงนี้</Text>
          </Touchable>
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
        <FigureRow label={report.figureLabels.paid} value={display(report.totals.paid_total)} unit="บาท" big />
        <FigureRow label={report.figureLabels.list} value={display(report.totals.list_total)} unit="บาท" />
        <FigureRow label={report.figureLabels.diff} value={display(report.totals.list_minus_paid)} unit="บาท" />
        <FigureRow label={report.figureLabels.weight} value={display(report.totals.net_weight)} unit="กก." />
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

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.color.background },
    body: { padding: t.space.x3, paddingBottom: t.space.x5 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.xl },
    loading: { fontSize: t.type.bodyLg, color: t.color.textSubtle, fontWeight: "700" },

    sectionLabel: { fontSize: t.type.body, fontWeight: "800", color: t.color.textSubtle, marginTop: t.space.sm, marginBottom: t.space.sm },

    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: t.space.md, marginBottom: t.space.sm },
    chip: {
      minHeight: t.tapMin, paddingHorizontal: t.space.xxl, borderRadius: t.radius.xl, justifyContent: "center",
      backgroundColor: t.color.borderSoft,
    },
    chipOn: { backgroundColor: t.color.primary },
    chipText: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.neutralFg },
    chipTextOn: { color: t.color.onPrimary },
    chipNote: { fontSize: t.type.body, fontWeight: "700", color: t.color.textSubtle },

    customCard: {
      backgroundColor: t.color.surface, borderRadius: t.radius.xl, padding: t.space.xl, marginBottom: t.space.md,
      borderWidth: 1, borderColor: t.color.borderSoft,
    },
    customFields: { flexDirection: "row", alignItems: "center", gap: t.space.md },
    customInput: {
      flex: 1, minHeight: t.tapMin, borderWidth: 1, borderColor: t.color.border, borderRadius: t.radius.lg,
      paddingHorizontal: t.space.xl, fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.text,
    },
    customDash: { fontSize: t.type.body, fontWeight: "800", color: t.color.textSubtle },
    customApply: {
      minHeight: t.tapMin, marginTop: t.space.lg, borderRadius: t.radius.xl, backgroundColor: t.color.primaryFill,
      borderWidth: 1, borderColor: t.color.primary, alignItems: "center", justifyContent: "center",
    },
    customApplyText: { color: t.color.onPrimaryFill, fontSize: t.type.bodyLg, fontWeight: "800" },
    customError: {
      fontSize: t.type.body, fontWeight: "800", color: t.color.dangerFg, backgroundColor: t.color.dangerBg,
      borderRadius: t.radius.md, paddingHorizontal: t.space.lg, paddingVertical: t.space.md, marginTop: t.space.lg,
    },

    totalsCard: {
      backgroundColor: t.color.surface, borderRadius: t.radius.pill, padding: t.space.x3, marginTop: t.space.md, marginBottom: t.space.xl,
      borderWidth: 1, borderColor: t.color.borderSoft,
    },
    figureRow: {
      flexDirection: "row", alignItems: "baseline", justifyContent: "space-between",
      paddingVertical: t.space.xs, borderTopWidth: 1, borderTopColor: t.color.divider,
    },
    figureLabel: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.textSubtle, flexShrink: 0 },
    figureValueWrap: { flexDirection: "row", alignItems: "baseline", gap: t.space.sm, flexShrink: 1, marginLeft: t.space.xl },
    figureValue: { fontSize: t.type.subhead, fontWeight: "900", color: t.color.text },
    figureValueBig: { fontSize: t.type.headline, color: t.color.primary },
    figureUnit: { fontSize: t.type.body, fontWeight: "800", color: t.color.placeholder },
    explain: { fontSize: t.type.body, color: t.color.textSubtle, marginTop: t.space.md, fontWeight: "600" },
    unsent: {
      fontSize: t.type.body, fontWeight: "800", color: t.color.infoFg, backgroundColor: t.color.infoBg,
      borderRadius: t.radius.md, paddingHorizontal: t.space.lg, paddingVertical: t.space.md, marginTop: t.space.xl,
    },

    card: {
      backgroundColor: t.color.surface, borderRadius: t.radius.xl, padding: t.space.xl, marginBottom: t.space.xl,
      borderWidth: 1, borderColor: t.color.borderSoft,
    },
    cardHeading: { fontSize: t.type.bodyLg, fontWeight: "900", color: t.color.text },
    empty: { fontSize: t.type.body, color: t.color.textMuted, marginTop: t.space.md, fontWeight: "700" },

    barRow: { paddingVertical: t.space.md, borderTopWidth: 1, borderTopColor: t.color.divider },
    barHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
    barLabel: { flex: 1, fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.text, marginRight: t.space.md },
    barLabelOthers: { color: t.color.textSubtle, fontStyle: "italic" },
    // A1 (P1.23 item 3 phase D): the per-row money and the bar fill were teal on
    // EVERY row — the accent's most-repeated home, not its rarest. Money → neutral
    // text; the fill -> a neutral so teal is left for the ONE hero figure
    // (figureValueBig, the paid total), the selected chip and the buttons.
    barValue: { fontSize: t.type.bodyLg, fontWeight: "900", color: t.color.text },
    barTrack: {
      flexDirection: "row", height: 10, backgroundColor: t.color.borderSoft, borderRadius: t.radius.sm,
      overflow: "hidden", marginTop: t.space.sm,
    },
    barFill: { backgroundColor: t.color.textMuted },
    barFillOthers: { backgroundColor: t.color.placeholder },
    barSub: { fontSize: t.type.body, fontWeight: "700", color: t.color.placeholder, marginTop: t.space.xs },

    billSpinner: { marginVertical: t.space.x3 },

    /* --- the non-report screens --- */
    messageCard: { borderRadius: t.radius.card, padding: t.space.x3, marginTop: t.space.x5, alignItems: "flex-start" },
    messageBadge: {
      color: t.color.onPrimary, fontSize: t.type.body, fontWeight: "800", paddingHorizontal: t.space.lg,
      paddingVertical: t.space.xs, borderRadius: t.radius.sm, overflow: "hidden",
    },
    messageLead: { fontSize: t.type.bodyLg, fontWeight: "800", marginTop: t.space.xl },
    messageCalm: { fontSize: t.type.body, fontWeight: "600", marginTop: t.space.md },
    messageBtn: {
      marginTop: t.space.x3, minHeight: t.tapMin, paddingHorizontal: t.space.x4, borderRadius: t.radius.lg,
      backgroundColor: t.color.primaryFill, borderWidth: 1, borderColor: t.color.primary,
      alignItems: "center", justifyContent: "center", alignSelf: "stretch",
    },
    messageBtnText: { color: t.color.onPrimaryFill, fontSize: t.type.bodyLg, fontWeight: "800" },
  });
}
