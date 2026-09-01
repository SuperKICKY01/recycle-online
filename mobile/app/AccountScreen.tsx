/**
 * THIS DEVICE'S ACCOUNT — profile, and the one password it may change. P1.23.
 *
 * Presentation only. Every sentence, every bound and every refusal comes from
 * src/settings/account.ts, where a headless proof can reach them; this file owns
 * the input BUFFER and nothing else. Same move and reason as SettingsScreen and
 * DailyScreen.
 *
 * NO MODAL ELEMENT AND NO `visible` PROP — one Modal exists (app/SheetHost) and
 * `npm run prove:sheets` reddens if a second appears here.
 *
 * ON A SUCCESSFUL CHANGE the server has already ended this session (it bumped
 * token_version). The app sets `sessionEnded` and the login path takes over; this
 * screen shows the "changed — sign in again" notice with the sign-in exit, and the
 * queued work is named as kept. It does NOT go through the sign-out gate.
 */
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { checkPasswordForm } from "../src/settings/account";
import type {
  AccountProfile,
  PasswordChangeRequest,
  PasswordChangeOutcome,
  PasswordForm,
} from "../src/settings/account";
import { useTheme, type ThemeTokens } from "./theme";
import { SheetHeader } from "./SheetHeader";

interface Props {
  /** null while /whoami is in flight. */
  profile: AccountProfile | null;
  /** The last password-change result, or null before any attempt. */
  outcome: PasswordChangeOutcome | null;
  busy: boolean;
  onClose: () => void;
  /** The sign-in exit — for the "changed" and "session" outcomes. */
  onSignIn: () => void;
  /** The app performs the network change; this hands it the validated request. */
  onSubmit: (request: PasswordChangeRequest) => void;
}

export function AccountScreen({ profile, outcome, busy, onClose, onSignIn, onSubmit }: Props) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  // A device-side validation message (mismatch / too short), distinct from the
  // server's outcome. Cleared on every submit.
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (): void => {
    setLocalError(null);
    const form: PasswordForm = { current, next, repeat };
    const checked = checkPasswordForm(form);
    if (!checked.ok) {
      setLocalError(checked.message);
      return;
    }
    onSubmit(checked.request);
  };

  const changed = outcome !== null && outcome.kind === "changed";
  const sessionEnded = outcome !== null && outcome.kind === "session";

  return (
    <View style={styles.fill}>
      <SheetHeader title="บัญชีของฉัน" onClose={onClose} />

      <ScrollView contentContainerStyle={styles.body}>
        {/* PROFILE — read-only. No username edit control exists (D7). */}
        {profile === null ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.loading}>กำลังอ่านข้อมูลบัญชี…</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Row label={profile.usernameLabel} value={profile.username} />
            <Row label={profile.roleLabel} value={profile.role} />
            <Row label={profile.shopLabel} value={profile.shopName} />
            <Text style={styles.note}>{profile.note}</Text>
          </View>
        )}

        {/* THE PASSWORD CHANGE — replaced by the sign-in notice once it succeeds. */}
        {changed ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeBadge}>เปลี่ยนรหัสผ่านแล้ว</Text>
            {(outcome.kind === "changed" ? outcome.lines : []).map((line, i) => (
              <Text key={i} style={i === 0 ? styles.noticeLead : styles.noticeCalm}>
                {line}
              </Text>
            ))}
            <Pressable style={styles.messageBtn} onPress={onSignIn}>
              <Text style={styles.messageBtnText}>
                {outcome.kind === "changed" ? outcome.signInLabel : "เข้าสู่ระบบ"}
              </Text>
            </Pressable>
          </View>
        ) : sessionEnded ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeBadge}>ต้องเข้าสู่ระบบใหม่</Text>
            <Text style={styles.noticeLead}>
              {outcome.kind === "session" ? outcome.message : ""}
            </Text>
            <Pressable style={styles.messageBtn} onPress={onSignIn}>
              <Text style={styles.messageBtnText}>
                {outcome.kind === "session" ? outcome.signInLabel : "เข้าสู่ระบบ"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardHeading}>เปลี่ยนรหัสผ่าน</Text>

            {/* The server outcome (a wrong current password, an outage) — never its
                body, only the sentence account.ts decided. Above the form so the
                operator sees why before they retype. */}
            {outcome !== null && (outcome.kind === "rejected" || outcome.kind === "offline" || outcome.kind === "server") ? (
              <Text style={styles.error}>{outcome.message}</Text>
            ) : null}
            {localError !== null ? <Text style={styles.error}>{localError}</Text> : null}

            <Field label="รหัสผ่านปัจจุบัน" value={current} onChange={setCurrent} />
            <Field label="รหัสผ่านใหม่" value={next} onChange={setNext} />
            <Field label="พิมพ์รหัสผ่านใหม่อีกครั้ง" value={repeat} onChange={setRepeat} />

            <Pressable
              style={[styles.saveBtn, busy && styles.saveBusy]}
              disabled={busy}
              onPress={submit}
            >
              <Text style={styles.saveText}>{busy ? "กำลังเปลี่ยน…" : "เปลี่ยนรหัสผ่าน"}</Text>
            </Pressable>
            <Text style={styles.note}>
              เมื่อเปลี่ยนสำเร็จ เครื่องนี้จะออกจากระบบ ต้องเข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholder=""
      />
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.color.background },
    body: { padding: t.space.x3, paddingBottom: t.space.x5 },
    center: { alignItems: "center", justifyContent: "center", gap: t.space.xl, paddingVertical: t.space.x5 },
    loading: { fontSize: t.type.bodyLg, color: t.color.textSubtle, fontWeight: "700" },

    card: {
      backgroundColor: t.color.surface, borderRadius: t.radius.card, padding: t.space.xxl, marginBottom: t.space.xl,
      borderWidth: 1, borderColor: t.color.borderSoft,
    },
    cardHeading: { fontSize: t.type.subhead, fontWeight: "900", color: t.color.text, marginBottom: t.space.md },
    row: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingVertical: t.space.md, borderTopWidth: 1, borderTopColor: t.color.divider,
    },
    rowLabel: { fontSize: t.type.body, fontWeight: "800", color: t.color.textSubtle },
    rowValue: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.text, flexShrink: 1, textAlign: "right" },
    note: { fontSize: t.type.body, color: t.color.textSubtle, marginTop: t.space.lg, fontWeight: "600" },
    error: {
      fontSize: t.type.body, fontWeight: "800", color: t.color.dangerFg, backgroundColor: t.color.dangerBg,
      borderRadius: t.radius.md, paddingHorizontal: t.space.lg, paddingVertical: t.space.md, marginBottom: t.space.lg,
    },

    field: { marginTop: t.space.xl },
    label: { fontSize: t.type.body, fontWeight: "800", color: t.color.textSubtle },
    input: {
      minHeight: t.tapMin, marginTop: t.space.sm, borderWidth: 1, borderColor: t.color.border,
      borderRadius: t.radius.lg, paddingHorizontal: t.space.xl, fontSize: t.type.subhead, fontWeight: "700",
      color: t.color.text, backgroundColor: t.color.surface,
    },
    saveBtn: {
      minHeight: t.tapMin, borderRadius: t.radius.xl, backgroundColor: t.color.primary,
      alignItems: "center", justifyContent: "center", marginTop: t.space.x3,
    },
    saveBusy: { opacity: 0.6 },
    saveText: { color: t.color.onPrimary, fontSize: t.type.subhead, fontWeight: "900" },

    noticeCard: {
      backgroundColor: t.color.cyanBg, borderRadius: t.radius.card, padding: t.space.x3, marginBottom: t.space.xl,
      borderWidth: 1, borderColor: t.color.cyanBorder,
    },
    noticeBadge: {
      alignSelf: "flex-start", color: t.color.onPrimary, backgroundColor: t.color.cyan, fontSize: t.type.body,
      fontWeight: "800", paddingHorizontal: t.space.lg, paddingVertical: t.space.xs, borderRadius: t.radius.sm, overflow: "hidden",
    },
    noticeLead: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.cyanFg, marginTop: t.space.xl },
    noticeCalm: { fontSize: t.type.body, fontWeight: "600", color: t.color.cyanFg, marginTop: t.space.md },
    messageBtn: {
      marginTop: t.space.x3, minHeight: t.tapMin, paddingHorizontal: t.space.x4, borderRadius: t.radius.lg,
      backgroundColor: t.color.primary, alignItems: "center", justifyContent: "center", alignSelf: "stretch",
    },
    messageBtnText: { color: t.color.onPrimary, fontSize: t.type.bodyLg, fontWeight: "800" },
  });
}
