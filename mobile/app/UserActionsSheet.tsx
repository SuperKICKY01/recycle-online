/**
 * THE ROSTER ROW'S ACTIONS MENU — reset password / deactivate / reactivate (P3.7).
 *
 * The row on UsersScreen opens this, the same grab-handle leaf as TierActionsSheet
 * and rendered inside the ONE SheetHost (no second Modal — prove:sheets reddens if
 * one appears). WHICH user it acts on is App.tsx payload, written WITH the open.
 *
 * WHAT THE SHEET DECIDES vs WHAT IT DOES NOT. It owns the two edit BUFFERS (the new
 * password, and which confirmation is showing) and the LOCAL password check
 * (checkPassword — the same bound the add form uses). It decides NOTHING about which
 * actions a row may take: `row.mayDeactivate`, `row.mayReactivate`, `row.mayReset`
 * and `row.isSelf` come from src/users/usersAdmin.ts, where a headless proof reaches
 * them, and the server refuses regardless.
 *
 * THREE CARES SPECIFIC TO PEOPLE, not tiers:
 *  - the signed-in row offers NO destructive action; it points at the account
 *    screen to change its own password (the earlier ruling);
 *  - deactivate carries a CONFIRMATION naming what it does to that person's phone;
 *  - the last active admin is not offered deactivate, and a note says WHY, so the
 *    absence reads as a protection rather than a missing button (the server's
 *    last_active_admin lock is the authority; this is the second layer).
 */
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  checkPassword,
  DEACTIVATE_CONSEQUENCE,
  LAST_ADMIN_NOTE,
  OWNER_ACCOUNT_NOTE,
  RESET_CONSEQUENCE,
  SELF_ROW_NOTE,
  PASSWORD_MAX_LENGTH,
  type UserRow,
} from "../src/users/usersAdmin";
import { useTheme, type ThemeTokens } from "./theme";
import { Touchable } from "./Press";

export function UserActionsSheet({
  row,
  busy,
  onReset,
  onDeactivate,
  onReactivate,
  onGoToAccount,
  onClose,
}: {
  /** The user the row was tapped on. App.tsx writes this WITH the open, never inferred. */
  readonly row: UserRow;
  readonly busy: boolean;
  /** The app POSTs the reset, re-reads the roster, and closes this sheet. */
  readonly onReset: (id: string, newPassword: string) => void;
  readonly onDeactivate: (id: string) => void;
  readonly onReactivate: (id: string) => void;
  /** The signed-in row's only move: open the account screen to change own password. */
  readonly onGoToAccount: () => void;
  readonly onClose: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  // The buffers, owned here and gone when the sheet unmounts on close — the new
  // password never lives in any state that outlives this sheet, and nothing logs it.
  const [mode, setMode] = useState<"menu" | "resetting" | "confirmDeactivate">("menu");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submitReset = (): void => {
    const v = checkPassword(password);
    if (!v.ok) {
      setError(v.message);
      return;
    }
    onReset(row.user_id, password);
  };

  return (
    <View style={styles.backdrop}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {row.full_name}
          </Text>
          <Text style={styles.sub}>
            {"@" + row.username + " · " + row.roleLabel + (row.is_active ? "" : " · ปิดใช้งาน")}
          </Text>

          {row.isSelf ? (
            <>
              {/* The signed-in account: no destructive action; own password lives on
                  the account screen (the earlier ruling). */}
              <Text style={styles.note}>{SELF_ROW_NOTE}</Text>
              <Touchable
                style={styles.action}
                disabled={busy}
                onPress={onGoToAccount}
                accessibilityLabel="ไปที่บัญชีของฉัน"
              >
                <Text style={styles.actionText}>ไปที่บัญชีของฉัน</Text>
              </Touchable>
            </>
          ) : mode === "resetting" ? (
            <>
              <Text style={styles.note}>{RESET_CONSEQUENCE}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setError(null);
                }}
                secureTextEntry
                autoFocus
                maxLength={PASSWORD_MAX_LENGTH}
                placeholder="รหัสผ่านใหม่"
                placeholderTextColor={t.color.placeholder}
              />
              {error !== null ? <Text style={styles.error}>{error}</Text> : null}
              <Touchable
                style={[styles.action, styles.actionPrimary]}
                disabled={busy}
                haptic="light"
                accessibilityLabel="บันทึกรหัสใหม่"
                onPress={submitReset}
              >
                <Text style={styles.actionPrimaryText}>บันทึกรหัสใหม่</Text>
              </Touchable>
            </>
          ) : mode === "confirmDeactivate" ? (
            <>
              <Text style={styles.note}>{DEACTIVATE_CONSEQUENCE}</Text>
              <Touchable
                style={styles.action}
                disabled={busy}
                haptic="medium"
                accessibilityLabel="ยืนยันปิดบัญชี"
                onPress={() => onDeactivate(row.user_id)}
              >
                <Text style={styles.actionDanger}>ยืนยันปิดบัญชี</Text>
              </Touchable>
            </>
          ) : row.ownerAccountLocked ? (
            // Another person's OWNER row (3a, widened 2026-10-19): no action at all — every
            // one would be refused — and the note says why. Not the last-admin note.
            <Text style={styles.note}>{OWNER_ACCOUNT_NOTE}</Text>
          ) : (
            <>
              {row.mayReset ? (
                <Touchable
                  style={styles.action}
                  disabled={busy}
                  onPress={() => setMode("resetting")}
                  accessibilityLabel="ตั้งรหัสผ่านใหม่"
                >
                  <Text style={styles.actionText}>ตั้งรหัสผ่านใหม่</Text>
                </Touchable>
              ) : null}

              {row.is_active ? (
                row.mayDeactivate ? (
                  <Touchable
                    style={styles.action}
                    disabled={busy}
                    onPress={() => setMode("confirmDeactivate")}
                    accessibilityLabel="ปิดบัญชี"
                  >
                    <Text style={styles.actionDanger}>ปิดบัญชี</Text>
                  </Touchable>
                ) : (
                  // The last active admin (or another un-deactivatable active row):
                  // the button is absent and the note says what the absence protects.
                  <Text style={styles.note}>{LAST_ADMIN_NOTE}</Text>
                )
              ) : row.mayReactivate ? (
                <Touchable
                  style={styles.action}
                  disabled={busy}
                  onPress={() => onReactivate(row.user_id)}
                  accessibilityLabel="เปิดบัญชีอีกครั้ง"
                >
                  <Text style={styles.actionText}>เปิดบัญชีอีกครั้ง</Text>
                </Touchable>
              ) : null}
            </>
          )}

          <Touchable style={styles.action} onPress={onClose} accessibilityLabel="ยกเลิก">
            <Text style={styles.actionText}>ยกเลิก</Text>
          </Touchable>
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
    sub: { fontSize: t.type.body, fontWeight: "700", color: t.color.textSubtle },
    // A calm explanatory line; the consequence and the last-admin/self notes use it.
    note: { fontSize: t.type.body, color: t.color.textMuted, lineHeight: 20 },
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
    actionPrimary: { backgroundColor: t.color.primaryFill, borderColor: t.color.primary },
    actionPrimaryText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.onPrimaryFill },
    // The destructive text sits on `surface`, never on a danger tint (the tier sheet's
    // proven contrast pair).
    actionDanger: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.danger },
  });
}
