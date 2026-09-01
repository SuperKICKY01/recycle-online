/**
 * THE GRADE-TIER ROW'S ACTIONS MENU — rename / deactivate (P1.23 item 3 phase D).
 *
 * The trailing ... control on a tier row opens this. The reference gives every settings
 * row ONE trailing control and keeps its destructive action OFF the row; so the reorder
 * arrows stay on the row and rename + retire move here, where a wet thumb at 5am cannot
 * hit deactivate beside the arrows (the owner's mis-tap reason, recorded).
 *
 * NO WORDING IS INVENTED. Every visible label MOVED here from the SettingsScreen tier
 * row it used to sit on — the rename, save-rename, deactivate, reactivate and cancel
 * labels — byte for byte; and the rename validation is `validateRename`, the same module
 * the inline rename used, so no rule moved with the presentation.
 *
 * NO MODAL ELEMENT. It renders inside the ONE SheetHost (`transparent`, so a sheet can
 * paint its own backdrop) as the top of the `settings>tier_actions` stack — the second
 * two-deep stack, exactly the NoticeSheet grab-handle pattern. `prove:sheets` reddens if
 * a second Modal appears in this directory.
 */
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { validateRename } from "../src/settings/gradeTierAdmin";
import type { TierAdminRow } from "../src/settings/gradeTierAdmin";
import { useTheme, type ThemeTokens } from "./theme";

export function TierActionsSheet({
  row,
  nameMaxLength,
  busy,
  onRename,
  onDeactivate,
  onReactivate,
  onClose,
}: {
  /** The tier the ⋯ was tapped on. App.tsx writes this WITH the open, never inferred. */
  readonly row: TierAdminRow;
  readonly nameMaxLength: number;
  readonly busy: boolean;
  /** The app PATCHes the name, re-reads, and closes this sheet. Same handler the row used. */
  readonly onRename: (id: string, name: string) => void;
  readonly onDeactivate: (id: string) => void;
  readonly onReactivate: (id: string) => void;
  readonly onClose: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  // The rename buffer — the same one the inline row owned, moved here. A local
  // validation message, separate from the network refusal SettingsScreen still shows.
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(row.name);
  const [error, setError] = useState<string | null>(null);

  const submitRename = (): void => {
    const v = validateRename(name);
    if (!v.ok) {
      setError(v.message);
      return;
    }
    onRename(row.id, v.name);
  };

  return (
    <View style={styles.backdrop}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={styles.code}>{row.code}</Text>

          {renaming ? (
            <>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                maxLength={nameMaxLength}
                autoFocus
              />
              {error !== null ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[styles.action, styles.actionPrimary]}
                disabled={busy}
                onPress={submitRename}
              >
                <Text style={styles.actionPrimaryText}>บันทึกชื่อ</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.action} disabled={busy} onPress={() => setRenaming(true)}>
              <Text style={styles.actionText}>แก้ชื่อ</Text>
            </Pressable>
          )}

          {/* Retire / restore. Deactivate is drawn only when the client guard allows it
              (mayDeactivate — not the shop's last active tier); the server refuses it too. */}
          {row.is_active ? (
            row.mayDeactivate ? (
              <Pressable style={styles.action} disabled={busy} onPress={() => onDeactivate(row.id)}>
                <Text style={styles.actionDanger}>ปิดใช้งาน</Text>
              </Pressable>
            ) : null
          ) : (
            <Pressable style={styles.action} disabled={busy} onPress={() => onReactivate(row.id)}>
              <Text style={styles.actionText}>เปิดใช้งานอีกครั้ง</Text>
            </Pressable>
          )}

          <Pressable style={styles.action} onPress={onClose}>
            <Text style={styles.actionText}>ยกเลิก</Text>
          </Pressable>
        </View>
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
    // The grab handle (width/height are decorative, not spacing rungs — the NoticeSheet rule).
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: t.radius.sm,
      backgroundColor: t.color.border,
      marginBottom: t.space.md,
    },
    body: { paddingHorizontal: t.layout.screenPad, gap: t.space.md },
    title: { fontSize: t.type.subhead, fontWeight: "900", color: t.color.text },
    code: { fontSize: t.type.body, fontWeight: "700", color: t.color.textSubtle },
    input: {
      minHeight: t.tapMin,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.lg,
      paddingHorizontal: t.space.xl,
      paddingVertical: t.space.lg,
      fontSize: t.type.subhead,
      fontWeight: "700",
      color: t.color.text,
      backgroundColor: t.color.surface,
    },
    // The destructive text sits on `surface` — the pair proven at 6.47:1 (light) /
    // 5.29:1 (dark) in prove:theme (P1.23 item 3 phase D), never on a danger tint.
    error: { fontSize: t.type.body, fontWeight: "800", color: t.color.danger },
    action: {
      minHeight: t.tapMin,
      borderRadius: t.radius.lg,
      backgroundColor: t.color.surface,
      borderWidth: 1,
      borderColor: t.color.borderSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    actionText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.text },
    actionPrimary: { backgroundColor: t.color.primary, borderColor: t.color.primary },
    actionPrimaryText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.onPrimary },
    actionDanger: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.danger },
  });
}
