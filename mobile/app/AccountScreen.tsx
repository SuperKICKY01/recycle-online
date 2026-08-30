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
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { checkPasswordForm } from "../src/settings/account";
import type {
  AccountProfile,
  PasswordChangeRequest,
  PasswordChangeOutcome,
  PasswordForm,
} from "../src/settings/account";

const TAP_MIN = 56;

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
      <View style={styles.head}>
        <Text style={styles.title}>บัญชีของฉัน</Text>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>ปิด</Text>
        </Pressable>
      </View>

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

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#f8fafc" },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  title: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  closeBtn: {
    minHeight: 48, paddingHorizontal: 20, borderRadius: 10,
    backgroundColor: "#e2e8f0", alignItems: "center", justifyContent: "center",
  },
  closeText: { fontSize: 16, fontWeight: "800", color: "#334155" },
  body: { padding: 16, paddingBottom: 48 },
  center: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 40 },
  loading: { fontSize: 14, color: "#64748b", fontWeight: "700" },

  card: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  cardHeading: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginBottom: 8 },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#f1f5f9",
  },
  rowLabel: { fontSize: 13, fontWeight: "800", color: "#64748b" },
  rowValue: { fontSize: 16, fontWeight: "800", color: "#0f172a", flexShrink: 1, textAlign: "right" },
  note: { fontSize: 12, color: "#64748b", marginTop: 10, fontWeight: "600" },
  error: {
    fontSize: 13, fontWeight: "800", color: "#7f1d1d", backgroundColor: "#fee2e2",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10,
  },

  field: { marginTop: 12 },
  label: { fontSize: 13, fontWeight: "900", color: "#64748b" },
  input: {
    minHeight: TAP_MIN, marginTop: 6, borderWidth: 1, borderColor: "#cbd5e1",
    borderRadius: 10, paddingHorizontal: 12, fontSize: 17, fontWeight: "700",
    color: "#0f172a", backgroundColor: "#fff",
  },
  saveBtn: {
    minHeight: TAP_MIN, borderRadius: 12, backgroundColor: "#0f766e",
    alignItems: "center", justifyContent: "center", marginTop: 16,
  },
  saveBusy: { opacity: 0.6 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  noticeCard: {
    backgroundColor: "#ecfeff", borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: "#67e8f9",
  },
  noticeBadge: {
    alignSelf: "flex-start", color: "#fff", backgroundColor: "#0891b2", fontSize: 12,
    fontWeight: "800", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, overflow: "hidden",
  },
  noticeLead: { fontSize: 15, fontWeight: "800", color: "#0e7490", marginTop: 12 },
  noticeCalm: { fontSize: 13, fontWeight: "600", color: "#0e7490", marginTop: 8 },
  messageBtn: {
    marginTop: 16, minHeight: 48, paddingHorizontal: 20, borderRadius: 10,
    backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center", alignSelf: "stretch",
  },
  messageBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
