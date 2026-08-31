/**
 * THE COLLAPSED NOTICES, IN FULL — the sheet the main screen's notice count opens
 * (P1.23 item 3 phase C, P5).
 *
 * The main screen keeps at most ONE blocking notice inline; everything else collapses
 * behind a count. Tapping the count opens this — a bottom sheet with a grab handle and
 * an explicit close, listing the collapsed notices in full. It does NOT re-decide or
 * re-word anything: App.tsx builds each notice's own strip element and hands the list
 * here; this only lays them out. The one Thai word is the settled `ปิด` (close), reused,
 * not new vocabulary.
 *
 * It renders inside the single sheet host (`SheetHost`) like every other sheet, and
 * paints its own dimmed backdrop — the host is `transparent` exactly so a sheet can.
 */
import { useMemo, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemeTokens } from "./theme";

export function NoticeSheet({
  notices,
  onClose,
}: {
  /** The collapsed notices' own strip elements, in arranged order. */
  readonly notices: readonly ReactNode[];
  readonly onClose: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.backdrop}>
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="ปิด"
      />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {notices.map((n, i) => (
            <View key={i}>{n}</View>
          ))}
        </ScrollView>
        <Pressable
          style={styles.close}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="ปิด"
        >
          <Text style={styles.closeText}>ปิด</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: t.color.overlay },
    scrim: { ...StyleSheet.absoluteFillObject },
    sheet: {
      backgroundColor: t.color.background,
      borderTopLeftRadius: t.radius.card,
      borderTopRightRadius: t.radius.card,
      paddingTop: t.space.md,
      paddingBottom: t.layout.scrollGutter,
      maxHeight: "82%",
    },
    // The grab handle (width/height are decorative, not spacing rungs).
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: t.radius.sm,
      backgroundColor: t.color.border,
      marginBottom: t.space.md,
    },
    list: { paddingHorizontal: t.layout.screenPad, gap: t.layout.cardGap },
    close: {
      minHeight: t.tapMin,
      marginHorizontal: t.layout.screenPad,
      marginTop: t.space.md,
      borderRadius: t.radius.lg,
      backgroundColor: t.color.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    closeText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.text },
  });
}
