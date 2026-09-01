/**
 * THE ONE COMPONENT VOCABULARY (P1.23 phase E). Card, grouped Row, section
 * heading, segmented control, figure, badge, button, empty state — the single
 * set every screen composes from, replacing the message-card and row/field/chip
 * primitives that were copy-pasted per screen. All geometry is drawn from the
 * theme tokens (never a raw literal, so the tap-audit stays clean); colour comes
 * from the palette's proven pairs; the CTA fill is `primaryFill` with a `primary`
 * border so the bright accent reads as a control in light too. Comments here keep
 * no `key: <number>` shapes — the tap-audit reads this file's text.
 */
import { Children, type ReactElement, type ReactNode, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTheme } from "./theme";
import type { ThemeScheme, ThemeTokens } from "../src/ui/theme";
import { Touchable, type Haptic } from "./Press";
import { Icon, type IconName } from "./Icon";

/** Semantic tone → the tint pair that reads on it (the status vocabulary). */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

function toneColors(t: ThemeTokens, tone: Tone): { bg: string; fg: string } {
  const c = t.color;
  switch (tone) {
    case "info":
      return { bg: c.infoBg, fg: c.infoFg };
    case "success":
      return { bg: c.successBg, fg: c.successFg };
    case "warning":
      return { bg: c.warningBg, fg: c.warningFg };
    case "danger":
      return { bg: c.dangerBg, fg: c.dangerFg };
    case "accent":
      return { bg: c.tealFaint, fg: c.primary };
    case "neutral":
    default:
      return { bg: c.neutralBg, fg: c.neutralFg };
  }
}

// Styles are stable per scheme (resolveTheme returns stable token refs), so build
// once per scheme and cache — no per-instance rebuild.
const styleCache = new Map<ThemeScheme, ReturnType<typeof build>>();
function useKit(): { t: ThemeTokens; s: ReturnType<typeof build> } {
  const t = useTheme();
  let s = styleCache.get(t.scheme);
  if (!s) {
    s = build(t);
    styleCache.set(t.scheme, s);
  }
  return { t, s };
}

/** An inset card: surface, hairline, soft elevation. `tight` for a row list. */
export function Card({
  children,
  tight = false,
  style,
}: {
  children: ReactNode;
  tight?: boolean;
  style?: StyleProp<ViewStyle>;
}): ReactElement {
  const { s } = useKit();
  return <View style={[tight ? s.cardTight : s.card, style]}>{children}</View>;
}

/** A small, muted, tracked section label sitting above a card. */
export function SectionHeading({ children }: { children: ReactNode }): ReactElement {
  const { s } = useKit();
  return <Text style={s.sectionHeading}>{children}</Text>;
}

/** A hairline between grouped rows. */
export function Divider(): ReactElement {
  const { s } = useKit();
  return <View style={s.divider} />;
}

/** A tight card whose children are grouped rows separated by hairlines. */
export function GroupCard({ children }: { children: ReactNode }): ReactElement {
  const kids = Children.toArray(children).filter(Boolean);
  return (
    <Card tight>
      {kids.map((child, i) => (
        <View key={i}>
          {i > 0 ? <Divider /> : null}
          {child}
        </View>
      ))}
    </Card>
  );
}

/** A grouped row: optional leading icon, label (+ hint), optional value, chevron. */
export function Row({
  icon,
  label,
  value,
  hint,
  chevron = false,
  onPress,
  danger = false,
}: {
  icon?: IconName;
  label: string;
  value?: string;
  hint?: string;
  chevron?: boolean;
  onPress?: () => void;
  danger?: boolean;
}): ReactElement {
  const { t, s } = useKit();
  const labelColor = danger ? t.color.danger : t.color.text;
  const body = (
    <View style={s.row}>
      {icon ? (
        <View style={s.rowIcon}>
          <Icon name={icon} size={20} color={danger ? t.color.danger : t.color.primary} />
        </View>
      ) : null}
      <View style={s.rowLabelWrap}>
        <Text style={[s.rowLabel, { color: labelColor }]}>{label}</Text>
        {hint ? <Text style={s.rowHint}>{hint}</Text> : null}
      </View>
      {value !== undefined ? <Text style={s.rowValue}>{value}</Text> : null}
      {chevron ? <Icon name="chevron" size={18} color={t.color.textSubtle} /> : null}
    </View>
  );
  return onPress ? (
    <Touchable onPress={onPress} accessibilityLabel={label}>
      {body}
    </Touchable>
  ) : (
    body
  );
}

/** A pill segmented control; the selected segment rises with the card surface. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
}): ReactElement {
  const { t, s } = useKit();
  return (
    <View style={s.segmented}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Touchable
            key={o.value}
            haptic="light"
            onPress={() => onChange(o.value)}
            accessibilityLabel={o.label}
            accessibilityRole="button"
            style={[s.segment, on ? s.segmentOn : null]}
          >
            <View style={s.segmentInner}>
              {o.icon ? <Icon name={o.icon} size={16} color={on ? t.color.text : t.color.textMuted} /> : null}
              <Text style={[s.segmentText, { color: on ? t.color.text : t.color.textMuted }]}>{o.label}</Text>
            </View>
          </Touchable>
        );
      })}
    </View>
  );
}

/** A label→figure row. `value` is already `display()`-grouped by the caller. */
export function Figure({
  label,
  value,
  unit,
  hero = false,
}: {
  label: string;
  value: string;
  unit?: string;
  hero?: boolean;
}): ReactElement {
  const { s } = useKit();
  return (
    <View style={hero ? s.figHero : s.fig}>
      <Text style={hero ? s.figHeroLabel : s.figLabel}>{label}</Text>
      <Text style={hero ? s.figHeroValue : s.figValue}>
        {value}
        {unit ? <Text style={s.figUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

/** A tinted pill; delineated with a coloured hairline in light so it reads on a pale card. */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }): ReactElement {
  const { t, s } = useKit();
  const { bg, fg } = toneColors(t, tone);
  const borderColor = t.scheme === "light" ? fg : "transparent";
  return (
    <View style={[s.badge, { backgroundColor: bg, borderColor }]}>
      <Text style={[s.badgeText, { color: fg }]}>{children}</Text>
    </View>
  );
}

/** The one button. `primary` is the bright fill; `danger` the destructive red. */
export function Button({
  label,
  onPress,
  kind = "primary",
  busy = false,
  disabled = false,
  icon,
  haptic,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  busy?: boolean;
  disabled?: boolean;
  icon?: IconName;
  haptic?: Haptic;
  style?: StyleProp<ViewStyle>;
}): ReactElement {
  const { t, s } = useKit();
  const isDisabled = disabled || busy;
  const kindStyle =
    kind === "primary"
      ? s.btnPrimary
      : kind === "danger"
        ? s.btnDanger
        : kind === "secondary"
          ? s.btnSecondary
          : s.btnGhost;
  const fg =
    kind === "primary"
      ? t.color.onPrimaryFill
      : kind === "danger"
        ? t.color.onPrimary
        : kind === "secondary"
          ? t.color.text
          : t.color.textMuted;
  const defaultHaptic: Haptic = kind === "danger" ? "medium" : kind === "primary" ? "light" : "none";
  return (
    <Touchable
      onPress={onPress}
      haptic={haptic ?? defaultHaptic}
      disabled={isDisabled}
      accessibilityLabel={label}
      style={[s.btn, kindStyle, isDisabled ? s.btnDisabled : null, style]}
    >
      <View style={s.btnInner}>
        {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={20} color={fg} /> : null}
        <Text style={[s.btnText, { color: fg }]}>{label}</Text>
      </View>
    </Touchable>
  );
}

/** A calm empty state: an icon tile and one teaching sentence. */
export function EmptyState({ icon, children }: { icon: IconName; children: ReactNode }): ReactElement {
  const { t, s } = useKit();
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Icon name={icon} size={26} color={t.color.textSubtle} />
      </View>
      <Text style={s.emptyText}>{children}</Text>
    </View>
  );
}

/**
 * A labelled text field. Single-line at the tap-floor height by default — a
 * field says "a short line goes here", not "write a paragraph" (the owner's
 * correction 2). Focus lifts the border to the accent; an error (or a hint)
 * shows beneath. `style` is the wrapper's; the input is themed here.
 */
export function Field({
  label,
  hint,
  error,
  multiline = false,
  style,
  inputStyle,
  ...input
}: {
  label?: string;
  hint?: string;
  error?: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
} & Omit<TextInputProps, "style">): ReactElement {
  const { t, s } = useKit();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? t.color.danger : focused ? t.color.primary : t.color.border;
  return (
    <View style={style}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <TextInput
        {...input}
        multiline={multiline}
        placeholderTextColor={t.color.placeholder}
        onFocus={(ev) => {
          setFocused(true);
          input.onFocus?.(ev);
        }}
        onBlur={(ev) => {
          setFocused(false);
          input.onBlur?.(ev);
        }}
        style={[multiline ? s.fieldInputMulti : s.fieldInput, { borderColor }, inputStyle]}
      />
      {error ? (
        <Text style={s.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={s.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

function build(t: ThemeTokens) {
  const c = t.color;
  const e = t.elevation;
  const shadow = {
    shadowColor: e.shadowColor,
    shadowOpacity: e.shadowOpacity,
    shadowRadius: e.shadowRadius,
    shadowOffset: e.shadowOffset,
    elevation: e.elevation,
  };
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderSoft,
      borderRadius: t.radius.card,
      padding: t.layout.cardPad,
      marginBottom: t.layout.cardGap,
      ...shadow,
    },
    cardTight: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderSoft,
      borderRadius: t.radius.card,
      marginBottom: t.layout.cardGap,
      overflow: "hidden",
      ...shadow,
    },
    sectionHeading: {
      fontSize: t.type.body,
      fontWeight: "700",
      color: c.textSubtle,
      letterSpacing: 0.4,
      marginTop: t.space.x4,
      marginBottom: t.space.md,
      marginHorizontal: t.space.xs,
    },
    divider: { height: 1, backgroundColor: c.divider },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space.xl,
      minHeight: t.tapMin,
      paddingVertical: t.space.lg,
      paddingHorizontal: t.layout.cardPad,
    },
    rowIcon: { width: 24, alignItems: "center" },
    rowLabelWrap: { flex: 1 },
    rowLabel: { fontSize: t.type.bodyLg, fontWeight: "500" },
    rowHint: { fontSize: t.type.body, color: c.textSubtle, marginTop: t.space.xs },
    rowValue: { fontSize: t.type.bodyLg, color: c.textMuted },
    segmented: {
      flexDirection: "row",
      backgroundColor: c.surfaceAlt,
      borderRadius: t.radius.pill,
      padding: t.space.xs,
      gap: t.space.xs,
      minHeight: t.tapMin,
    },
    segment: { flex: 1, borderRadius: t.radius.lg, alignItems: "center", justifyContent: "center" },
    segmentOn: { backgroundColor: c.surface, ...shadow },
    segmentInner: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
    segmentText: { fontSize: t.type.body, fontWeight: "600" },
    fig: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      paddingVertical: t.space.lg,
    },
    figLabel: { fontSize: t.type.bodyLg, color: c.textMuted },
    figValue: { fontSize: t.type.subhead, fontWeight: "700", color: c.text, fontVariant: ["tabular-nums"] },
    figUnit: { fontSize: t.type.body, color: c.textSubtle, fontWeight: "600" },
    figHero: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      paddingBottom: t.space.md,
    },
    figHeroLabel: { fontSize: t.type.bodyLg, color: c.textSubtle, fontWeight: "600" },
    figHeroValue: {
      fontSize: t.type.headline,
      fontWeight: "800",
      color: c.text,
      fontVariant: ["tabular-nums"],
      letterSpacing: -0.5,
    },
    badge: {
      alignSelf: "flex-start",
      paddingVertical: t.space.xs,
      paddingHorizontal: t.space.lg,
      borderRadius: t.radius.pill,
      borderWidth: 1,
    },
    badgeText: { fontSize: t.type.body, fontWeight: "700" },
    btn: {
      minHeight: t.tapMin,
      borderRadius: t.radius.xl,
      paddingHorizontal: t.space.x4,
      alignItems: "center",
      justifyContent: "center",
    },
    btnInner: { flexDirection: "row", alignItems: "center", gap: t.space.md },
    btnText: { fontSize: t.type.subhead, fontWeight: "700" },
    btnPrimary: { backgroundColor: c.primaryFill, borderWidth: 1, borderColor: c.primary },
    btnDanger: { backgroundColor: c.danger, borderWidth: 1, borderColor: c.danger },
    btnSecondary: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
    btnGhost: { backgroundColor: "transparent" },
    btnDisabled: { opacity: 0.5 },
    empty: {
      alignItems: "center",
      gap: t.space.xl,
      paddingVertical: t.space.x5,
      paddingHorizontal: t.space.x4,
    },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: t.radius.card,
      backgroundColor: c.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: { fontSize: t.type.bodyLg, color: c.textMuted, textAlign: "center", lineHeight: 22, maxWidth: 260 },
    fieldLabel: {
      fontSize: t.type.body,
      fontWeight: "600",
      color: c.textSubtle,
      marginBottom: t.space.sm,
      marginHorizontal: t.space.xs,
    },
    fieldInput: {
      minHeight: t.tapMin,
      borderWidth: 1,
      borderRadius: t.radius.lg,
      paddingHorizontal: t.space.xl,
      fontSize: t.type.bodyLg,
      color: c.text,
      backgroundColor: c.surfaceAlt,
    },
    fieldInputMulti: {
      minHeight: t.tapMin,
      borderWidth: 1,
      borderRadius: t.radius.lg,
      paddingHorizontal: t.space.xl,
      paddingVertical: t.space.lg,
      fontSize: t.type.bodyLg,
      color: c.text,
      backgroundColor: c.surfaceAlt,
      textAlignVertical: "top",
    },
    fieldError: {
      fontSize: t.type.body,
      color: c.danger,
      marginTop: t.space.sm,
      marginHorizontal: t.space.xs,
    },
    fieldHint: {
      fontSize: t.type.body,
      color: c.textSubtle,
      marginTop: t.space.sm,
      marginHorizontal: t.space.xs,
    },
  });
}
