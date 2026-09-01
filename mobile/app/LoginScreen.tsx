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
 * PRESENTATION (P1.23 phase E): the fields, button and notice come from the one
 * component vocabulary (Kit). Fields are single-line at the tap floor — a field
 * says "a short line goes here". Nothing about the two states, the props, or the
 * password-drop-on-submit changed; only how it is drawn.
 *
 * LEAVING THE SHOP IS NOT HERE, and its absence is deliberate rather than
 * forgotten. Signing OUT ends a session and keeps the shop; leaving the shop is
 * a different act that must refuse while this shop's bills are unsent, and
 * nothing counts that yet. There is no control on this screen for it, and none
 * should be added until that refusal exists — see SqliteShopStore, which has no
 * clear() for the same reason.
 */
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useTheme, type ThemeTokens } from "./theme";
import { Button, Card, Field } from "./Kit";

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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const setUp = shopTenantId !== null;
  const canSetup = code.trim().length > 0 && !busy;
  const canSignIn = username.trim().length > 0 && password.length > 0 && !busy;

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <View style={styles.brand}>
        <Text style={styles.wordmark}>รับซื้อของเก่า</Text>
      </View>
      <Card>
        <Text style={styles.title}>{setUp ? "เข้าสู่ระบบ" : "ตั้งค่าเครื่องนี้"}</Text>
        {setUp ? (
          <>
            <Field
              label="ชื่อผู้ใช้"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              placeholder="ชื่อผู้ใช้"
              style={styles.field}
            />
            <Field
              label="รหัสผ่าน"
              value={password}
              onChangeText={setPassword}
              /*
               * secureTextEntry, and autoCorrect OFF with it. A password field
               * that feeds the keyboard's learned-words dictionary puts the
               * shop's password in a suggestion strip on the next device.
               */
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              placeholder="รหัสผ่าน"
              style={styles.field}
            />
            <Button
              label="เข้าสู่ระบบ"
              onPress={() => {
                onSignIn(username.trim(), password);
                // The password is dropped from component state the moment it is
                // handed over. The username is kept: retyping it after a typo in
                // the password is the commonest thing that happens here.
                setPassword("");
              }}
              disabled={!canSignIn}
              busy={busy}
              style={styles.action}
            />
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              กรอกรหัสร้าน 8 หลักที่ร้านได้รับ — กรอกครั้งเดียว เครื่องจะจำร้านไว้
            </Text>
            <Field
              label="รหัสร้าน"
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
              style={styles.field}
              inputStyle={styles.code}
            />
            <Button
              label="ตั้งค่า"
              onPress={() => onSetup(code.trim())}
              disabled={!canSetup}
              busy={busy}
              style={styles.action}
            />
          </>
        )}

        {/*
          The failure line. Not clamped: it names which of three different things
          went wrong and what to do, and a truncated instruction at five in the
          morning is an instruction that did not happen.
        */}
        {notice !== null ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    wrap: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: t.layout.screenPad,
      paddingVertical: t.space.x5,
      gap: t.space.x4,
    },
    brand: { alignItems: "center" },
    wordmark: { fontSize: t.type.headline, fontWeight: "800", color: t.color.text, letterSpacing: -0.3 },
    title: {
      fontSize: t.type.titleLg,
      fontWeight: "800",
      color: t.color.text,
      textAlign: "center",
      marginBottom: t.space.lg,
    },
    hint: { fontSize: t.type.bodyLg, color: t.color.textMuted, lineHeight: 21, marginBottom: t.space.lg },
    field: { marginBottom: t.space.xl },
    // Wide tracking: the code is read off paper and typed once, and
    // character-by-character comparison is the whole task.
    code: { letterSpacing: 4, fontSize: t.type.titleLg, fontWeight: "700" },
    action: { marginTop: t.space.md },
    notice: {
      marginTop: t.space.x3,
      backgroundColor: t.color.dangerBg,
      borderColor: t.color.danger,
      borderWidth: 1,
      borderRadius: t.radius.md,
      padding: t.space.xl,
    },
    noticeText: { fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.dangerFg, lineHeight: 20 },
  });
}
