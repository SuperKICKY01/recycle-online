/**
 * The third always-visible strip: how much of the device's reserved seller-code
 * holding is left, so exhaustion is legible BEFORE it bites.
 *
 * Separate from the other two on purpose. StatusStrip answers "are my bills
 * getting out"; MasterDataStrip answers "is what I am pricing against still
 * true"; this answers "can I still add a walk-in from the yard offline". All
 * three fail independently, so folding any two into one line would silently
 * outrank one fact by another.
 *
 * It renders NOTHING when the reserve is ample — an always-on "you are fine"
 * line is one nobody reads, and the message that matters here has to still
 * register when the reserve is genuinely low. `src/master/reserveStrip.ts`
 * decides that, and the four states' sentences are c4's
 * (`src/master/reserveNotice.ts`); this file decides nothing it says, for the
 * reason recorded in
 * lessons/correct-classification-can-still-render-as-an-error.md: app/ is
 * unreachable by the headless proofs, so wording that lives here is wording no
 * assertion can ever go red on.
 */
import { StyleSheet, Text, View } from "react-native";

import type { ReserveStripNotice, ReserveStripTone } from "../src/master/reserveStrip";

interface Tone {
  bg: string;
  fg: string;
  bar: string;
}

/**
 * A Record and not a ternary chain, same as MasterDataStrip's TONES: a tone
 * added in reserveStrip.ts without deciding how it looks must be a compile
 * error, not an invisible message.
 */
const TONES: Record<ReserveStripTone, Tone> = {
  // Still able to create offline, below target — the calm, count-carrying state.
  info: { bg: "#e0f2fe", fg: "#0c4a6e", bar: "#0369a1" },
  // Cannot create offline: exhausted, or never provisioned. A person must act.
  red: { bg: "#fee2e2", fg: "#7f1d1d", bar: "#b91c1c" },
};

export function ReserveStrip({ notice }: { notice: ReserveStripNotice | null }) {
  if (notice === null) return null;
  const tone = TONES[notice.tone];
  return (
    <View style={[styles.strip, { backgroundColor: tone.bg, borderLeftColor: tone.bar }]}>
      {notice.lines.map((line, i) => (
        <Text key={i} style={[styles.text, { color: tone.fg }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderLeftWidth: 6,
  },
  // Not numberOfLines-clamped: a truncated "you cannot add a seller offline"
  // warning is a warning that did not happen. Each of reserveNotice's lines is
  // drawn in full, in order.
  text: { fontSize: 13, fontWeight: "800" },
});
