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
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { NumKey } from "../src/cart/entry";

const KEY_H = 56;

interface Props {
  /** Thai label of the field being edited, e.g. "น้ำหนักรวม". */
  fieldLabel: string;
  value: string;
  /** Live readout, already computed by the money module. */
  net: string;
  amount: string;
  onKey: (key: NumKey) => void;
  onDone: () => void;
}

const ROWS: NumKey[][] = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
];

export function Numpad({ fieldLabel, value, net, amount, onKey, onDone }: Props) {
  return (
    <View style={styles.panel}>
      {/* Readout: carried by the panel so it is never hidden behind it. */}
      <View style={styles.readout}>
        <View style={styles.readoutLeft}>
          <Text style={styles.fieldLabel}>{fieldLabel}</Text>
          <Text style={styles.fieldValue}>{value === "" ? "0" : value}</Text>
        </View>
        <View style={styles.readoutRight}>
          <Text style={styles.readoutSmall}>สุทธิ {net}</Text>
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

const styles = StyleSheet.create({
  panel: { backgroundColor: "#e2e8f0", borderTopWidth: 1, borderTopColor: "#cbd5e1" },

  readout: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#0f172a",
  },
  readoutLeft: { flex: 1 },
  readoutRight: { alignItems: "flex-end" },
  fieldLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "700" },
  fieldValue: { color: "#fff", fontSize: 32, fontWeight: "900" },
  readoutSmall: { color: "#94a3b8", fontSize: 12, fontWeight: "700" },
  readoutAmount: { color: "#5eead4", fontSize: 26, fontWeight: "900" },

  grid: { flexDirection: "row", padding: 6 },
  digits: { flex: 3 },
  side: { flex: 1 },
  row: { flexDirection: "row" },

  key: {
    flex: 1, height: KEY_H, margin: 4, borderRadius: 10, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  keyTall: { height: KEY_H * 2 + 8 },
  keyAlt: { backgroundColor: "#cbd5e1" },
  keyWarn: { backgroundColor: "#b45309" },
  keyDone: { backgroundColor: "#0f766e" },
  keyPressed: { opacity: 0.6 },
  keyText: { fontSize: 26, fontWeight: "800", color: "#0f172a" },
  keyTextOnDark: { color: "#fff", fontSize: 20 },
});
