/**
 * THE ONE SHEET HEADER — a leading close, a centred title, an optional trailing action.
 *
 * Before P1.23 item 3 phase C, eight sheets each hand-rolled a `head` block: a
 * left-aligned title, a right-aligned `ปิด`, and a byte-identical style carrying a raw
 * top padding of 56. The reference the owner set uses ONE sub-screen shape — a leading
 * control, a centred title, trailing actions — so this is that shape, once, and every
 * full-screen sheet reads it.
 *
 * WHY THE TOP INSET IS A TOKEN, NOT 56. A sheet renders inside the single sheet host
 * (`SheetHost`), which sits OUTSIDE `App.tsx`'s `SafeAreaView`, so a sheet header cannot
 * inherit the status-bar inset and names `t.layout.sheetTopInset` instead — the one
 * place that 56 now lives (it was copied into seven `head` blocks).
 *
 * THE `ปิด` IS MOVED, NOT REWORDED. The eight copies of the close label consolidate to
 * this one, text identical; the leading chevron beside it is a bare glyph, not an icon
 * library and not part of the Thai string. Every control clears `t.tapMin`.
 */
import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemeTokens } from "./theme";

export function SheetHeader({
  title,
  onClose,
  actions,
}: {
  readonly title: string;
  readonly onClose: () => void;
  /** Trailing actions, before nothing — e.g. the picker's `+ เพิ่มผู้ขาย`. */
  readonly actions?: ReactNode;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.head}>
      <Pressable
        style={styles.close}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="ปิด"
      >
        <Text style={styles.chevron}>‹</Text>
        <Text style={styles.closeText}>ปิด</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.actions}>{actions}</View>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    head: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: t.layout.screenPad,
      paddingTop: t.layout.sheetTopInset,
      paddingBottom: t.space.xl,
      backgroundColor: t.color.surface,
      borderBottomWidth: 1,
      borderBottomColor: t.color.borderSoft,
    },
    // Leading zone: the close, sized to the wet-hand floor.
    close: {
      minHeight: t.tapMin,
      flexDirection: "row",
      alignItems: "center",
      gap: t.space.xs,
      paddingRight: t.space.md,
      justifyContent: "center",
    },
    chevron: { fontSize: t.type.headline, fontWeight: "800", color: t.color.primary },
    closeText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.primary },
    // The title takes the middle and centres, one line, so a long one truncates rather
    // than pushing the trailing zone off the edge (the collision this whole pass removes).
    title: { flex: 1, textAlign: "center", fontSize: t.type.title, fontWeight: "900", color: t.color.text },
    // Trailing zone: a floor width so the centred title is not thrown off by an empty side.
    actions: { flexDirection: "row", alignItems: "center", minWidth: t.tapMin, justifyContent: "flex-end", gap: t.space.md },
  });
}
