/**
 * In-app numeric keypad. Replaces the OS keyboard for gross / tare / price.
 *
 * Two things make this safer than the system keyboard, not just bigger:
 *
 *  1. NO PASTE. The value is rendered as Text, not a TextInput, so there is no
 *     long-press paste target anywhere in the entry path. A pasted string is
 *     the one way a value the pad cannot produce (an exponent, a minus, a
 *     thousands separator) could reach the money parser.
 *  2. The live readout lives INSIDE this panel. Whatever is scrolled off above,
 *     the operator can always see which field is being edited, its current
 *     value, and the resulting net and amount — the panel cannot obscure the
 *     numbers it is producing, because it carries them.
 *
 * Keys append to a STRING via cart/entry.applyKey. Nothing here parses to a JS
 * number (project hard rule 1).
 */
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { NumKey } from "../src/cart/entry";
import { useTheme, type ThemeTokens } from "./theme";

interface Props {
  /** Thai label of the field being edited, e.g. "น้ำหนักรวม". */
  fieldLabel: string;
  value: string;
  /** Live readout, already computed by the money module. `measure` is the small line above the
   *  amount with its noun ("สุทธิ 92.150", "จำนวน 3"), or null where the basis has none (lump). */
  measure: string | null;
  amount: string;
  onKey: (key: NumKey) => void;
  onDone: () => void;
}

const ROWS: NumKey[][] = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
];

export function Numpad({ fieldLabel, value, measure, amount, onKey, onDone }: Props) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.panel}>
      {/* Readout: carried by the panel so it is never hidden behind it. */}
      <View style={styles.readout}>
        <View style={styles.readoutLeft}>
          <Text style={styles.fieldLabel}>{fieldLabel}</Text>
          <Text style={styles.fieldValue}>{value === "" ? "0" : value}</Text>
        </View>
        <View style={styles.readoutRight}>
          {measure !== null ? <Text style={styles.readoutSmall}>{measure}</Text> : null}
          <Text style={styles.readoutAmount}>{amount}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.digits}>
          {ROWS.map((row) => (
            <View key={row.join()} style={styles.row}>
              {row.map((k) => (
                <Key key={k} label={k} onPress={() => onKey(k)} />
              ))}
            </View>
          ))}
          <View style={styles.row}>
            <Key label="." onPress={() => onKey(".")} />
            <Key label="0" onPress={() => onKey("0")} />
            <Key label="⌫" onPress={() => onKey("back")} tone="alt" />
          </View>
        </View>

        <View style={styles.side}>
          <Key label="ล้าง" onPress={() => onKey("clear")} tone="warn" tall />
          <Key label="เสร็จ" onPress={onDone} tone="done" tall />
        </View>
      </View>
    </View>
  );
}

function Key({
  label,
  onPress,
  tone = "digit",
  tall = false,
}: {
  label: string;
  onPress: () => void;
  tone?: "digit" | "alt" | "warn" | "done";
  tall?: boolean;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.key,
        tone === "alt" && styles.keyAlt,
        tone === "warn" && styles.keyWarn,
        tone === "done" && styles.keyDone,
        tall && styles.keyTall,
        pressed && styles.keyPressed,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.keyText,
          tone === "warn" && styles.keyTextOnDark,
          tone === "done" && styles.keyTextOnDark,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    panel: { backgroundColor: t.color.borderSoft, borderTopWidth: 1, borderTopColor: t.color.border },

    readout: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: t.space.x3, paddingVertical: t.space.lg, backgroundColor: t.color.text,
    },
    readoutLeft: { flex: 1 },
    readoutRight: { alignItems: "flex-end" },
    fieldLabel: { color: t.color.placeholder, fontSize: t.type.body, fontWeight: "700" },
    fieldValue: { color: t.color.onPrimary, fontSize: t.type.display, fontWeight: "900" },
    readoutSmall: { color: t.color.placeholder, fontSize: t.type.body, fontWeight: "700" },
    readoutAmount: { color: t.color.tealSoft, fontSize: t.type.headline, fontWeight: "900" },

    grid: { flexDirection: "row", padding: t.space.sm },
    digits: { flex: 3 },
    side: { flex: 1 },
    row: { flexDirection: "row" },

    key: {
      flex: 1, height: t.tapMin, margin: t.space.xs, borderRadius: t.radius.lg, backgroundColor: t.color.surface,
      alignItems: "center", justifyContent: "center",
    },
    keyTall: { height: t.tapMin * 2 + 8 },
    keyAlt: { backgroundColor: t.color.border },
    keyWarn: { backgroundColor: t.color.warning },
    keyDone: { backgroundColor: t.color.primary },
    keyPressed: { opacity: 0.6 },
    keyText: { fontSize: t.type.headline, fontWeight: "800", color: t.color.text },
    keyTextOnDark: { color: t.color.onPrimary, fontSize: t.type.title },
  });
}
