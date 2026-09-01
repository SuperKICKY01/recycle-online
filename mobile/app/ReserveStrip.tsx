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
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ReserveStripNotice, ReserveStripTone } from "../src/master/reserveStrip";
import { useTheme, type ThemeTokens } from "./theme";

interface Tone {
  bg: string;
  fg: string;
  bar: string;
}

/**
 * A Record and not a ternary chain, same as MasterDataStrip's TONES: a tone
 * added in reserveStrip.ts without deciding how it looks must be a compile
 * error, not an invisible message. The colours are the theme's now (P1.23 item
 * 3); the tone→colour decision stays here.
 */
function makeTones(t: ThemeTokens): Record<ReserveStripTone, Tone> {
  return {
    // Still able to create offline, below target — the calm, count-carrying state.
    info: { bg: t.color.infoBg, fg: t.color.infoFg, bar: t.color.info },
    // Cannot create offline: exhausted, or never provisioned. A person must act.
    red: { bg: t.color.dangerBg, fg: t.color.dangerFg, bar: t.color.danger },
  };
}

export function ReserveStrip({ notice }: { notice: ReserveStripNotice | null }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  if (notice === null) return null;
  const tone = makeTones(t)[notice.tone];
  return (
    <View style={[styles.strip, { backgroundColor: tone.bg }]}>
      <View style={[styles.dot, { backgroundColor: tone.bar }]} />
      <View style={styles.lines}>
        {notice.lines.map((line, i) => (
          <Text key={i} style={[styles.text, { color: tone.fg }]}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    strip: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: t.space.md,
      paddingHorizontal: t.space.xxl,
      paddingVertical: t.space.lg,
      borderRadius: t.radius.card,
    },
    // A leading dot carries the tone, replacing the >1px coloured left-rail
    // (craft-floor refuses that as a default); width/height are decorative.
    dot: { width: 8, height: 8, borderRadius: t.radius.sm, marginTop: t.space.xs },
    lines: { flex: 1 },
    // Not numberOfLines-clamped: a truncated "you cannot add a seller offline"
    // warning is a warning that did not happen. Each of reserveNotice's lines is
    // drawn in full, in order.
    text: { fontSize: t.type.body, fontWeight: "800" },
  });
}
