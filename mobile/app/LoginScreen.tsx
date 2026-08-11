/**
 * THE LOGIN SCREEN, and the one-time setup that precedes it.
 *
 * TWO STATES, decided by whether this device knows its shop:
 *
 *   NOT SET UP — one field, the 8-character code the shop was given. Entered
 *                ONCE, exchanged with the server for the shop's identifier, and
 *                remembered. The person at the scale never sees it again.
 *   SET UP     — two fields, username and password. What a shift change needs,
 *                and nothing more.
 *
 * THIS FILE DECIDES NOTHING. Every sentence comes from src/session/shopCode.ts
 * or src/session/signInIdentity.ts, and every classification with it, for the
 * reason recorded in lessons/correct-classification-can-still-render-as-an-
 * error.md: app/ is unreachable by the headless proofs, so wording that lives
 * here is wording no assertion can ever go red on.
 *
 * LEAVING THE SHOP IS NOT HERE, and its absence is deliberate rather than
 * forgotten. Signing OUT ends a session and keeps the shop; leaving the shop is
 * a different act that must refuse while this shop's bills are unsent, and
 * nothing counts that yet. There is no control on this screen for it, and none
 * should be added until that refusal exists — see SqliteShopStore, which has no
 * clear() for the same reason.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

interface Props {
  /** Null until this device has been set up. Decides which state is drawn. */
  shopTenantId: string | null;
  busy: boolean;
  /**
   * What went wrong last time, already worded. Null on a first attempt and
   * after a success. It is a STRING and never a code: the decision of what to
   * say was taken where a proof could watch it.
   */
  notice: string | null;
  onSetup: (code: string) => void;
  onSignIn: (username: string, password: string) => void;
}

export function LoginScreen({ shopTenantId, busy, notice, onSetup, onSignIn }: Props) {
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const setUp = shopTenantId !== null;
  const canSetup = code.trim().length > 0 && !busy;
  const canSignIn = username.trim().length > 0 && password.length > 0 && !busy;

  return (
    <View style={styles.wrap}>
      {setUp ? (
        <>
          <Text style={styles.title}>เข้าสู่ระบบ</Text>
          <Text style={styles.label}>ชื่อผู้ใช้</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            placeholder="ชื่อผู้ใช้"
          />
          <Text style={styles.label}>รหัสผ่าน</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            /*
             * secureTextEntry, and autoCorrect OFF with it. A password field
             * that feeds the keyboard's learned-words dictionary puts the
             * shop's password in a suggestion strip on the next device the
             * account is typed into.
             */
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            placeholder="รหัสผ่าน"
          />
          <Pressable
            style={[styles.btn, !canSignIn && styles.dim]}
            disabled={!canSignIn}
            onPress={() => {
              onSignIn(username.trim(), password);
              // The password is dropped from component state the moment it is
              // handed over. The username is kept: retyping it after a typo in
              // the password is the commonest thing that happens here.
              setPassword("");
            }}
          >
            <Text style={styles.btnText}>เข้าสู่ระบบ</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.title}>ตั้งค่าเครื่องนี้</Text>
          <Text style={styles.hint}>
            กรอกรหัสร้าน 8 หลักที่ร้านได้รับ — กรอกครั้งเดียว เครื่องจะจำร้านไว้
          </Text>
          <Text style={styles.label}>รหัสร้าน</Text>
          <TextInput
            style={[styles.input, styles.code]}
            value={code}
            onChangeText={setCode}
            /*
             * NO client-side pattern and no length limit. The server answers
             * one refusal for unknown, malformed and over-long alike, and
             * deliberately so (server/app/directory.py) — a check here would
             * tell the person something the server declines to, and would
             * disagree with ck_shop_code the day the alphabet changes.
             */
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            placeholder="เช่น K7M2P9QB"
          />
          <Pressable
            style={[styles.btn, !canSetup && styles.dim]}
            disabled={!canSetup}
            onPress={() => onSetup(code.trim())}
          >
            <Text style={styles.btnText}>ตั้งค่า</Text>
          </Pressable>
        </>
      )}

      {/*
        The failure line. Not numberOfLines-clamped: it names which of three
        different things went wrong and what to do, and a truncated instruction
        at five in the morning is an instruction that did not happen.
      */}
      {notice !== null && <Text style={styles.notice}>{notice}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 24, gap: 6 },
  title: { fontSize: 22, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  hint: { fontSize: 14, color: "#475569", marginBottom: 10, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: "700", color: "#475569", marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    paddingHorizontal: 14, minHeight: 52, fontSize: 18, backgroundColor: "#fff",
    color: "#0f172a",
  },
  // Wide tracking and a monospace-ish feel: the code is read off paper and
  // typed once, and character-by-character comparison is the whole task.
  code: { letterSpacing: 4, fontSize: 22, fontWeight: "700" },
  btn: {
    marginTop: 18, minHeight: 60, borderRadius: 12, backgroundColor: "#0f766e",
    alignItems: "center", justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  dim: { opacity: 0.4 },
  notice: {
    marginTop: 16, fontSize: 14, fontWeight: "700", color: "#7f1d1d",
    backgroundColor: "#fee2e2", borderRadius: 8, padding: 12, lineHeight: 20,
  },
});
