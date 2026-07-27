/**
 * The second always-visible strip: how old the data underneath the operator is.
 *
 * Separate from StatusStrip on purpose. That one answers "are my BILLS getting
 * out"; this one answers "is what I am pricing against still true". They fail
 * independently — a yard can be perfectly online with a queue at zero and still
 * be looking at a price list from before a change — so folding them into one
 * line would mean one of the two facts being silently outranked by the other.
 *
 * It renders nothing when the data was just refreshed. A strip that is always on
 * screen is a strip nobody reads, and the wording that matters here has to still
 * register at 07:00 on the fourth day of an outage.
 *
 * THIS FILE DECIDES NOTHING. Every sentence and the tone come from
 * src/master/freshness.ts, for the reason recorded in
 * lessons/correct-classification-can-still-render-as-an-error.md: app/ is
 * unreachable by the headless proofs, so wording that lives here is wording no
 * assertion can ever go red on.
 */
import { StyleSheet, Text, View } from "react-native";

import type { MasterNotice, MasterTone } from "../src/master/freshness";

interface Tone {
  bg: string;
  fg: string;
  bar: string;
}

/**
 * A Record and not a ternary chain, same as BillsPanel's TONE_BOX: adding a tone
 * in freshness.ts without deciding how it looks must be a compile error, not an
 * invisible message.
 */
const TONES: Record<MasterTone, Tone> = {
  // Cannot work at all: no master data on the device.
  block: { bg: "#fee2e2", fg: "#7f1d1d", bar: "#b91c1c" },
  // Working, but the app has withdrawn the price default.
  warn: { bg: "#fef3c7", fg: "#78350f", bar: "#b45309" },
  // Working normally, told how old the data is.
  info: { bg: "#e0f2fe", fg: "#0c4a6e", bar: "#0369a1" },
};

export function MasterDataStrip({ notice }: { notice: MasterNotice | null }) {
  if (notice === null) return null;
  const tone = TONES[notice.tone];
  return (
    <View style={[styles.strip, { backgroundColor: tone.bg, borderLeftColor: tone.bar }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{notice.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderLeftWidth: 6,
  },
  // Not numberOfLines-clamped: this is the one message on the screen that must
  // be readable in full, and a truncated price warning is a price warning that
  // did not happen.
  text: { fontSize: 13, fontWeight: "800" },
});
