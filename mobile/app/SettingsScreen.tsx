/**
 * THE SHOP'S OWN SETTINGS. P1.23.
 *
 * Presentation only. This file decides NOTHING about wording, tone, which fields
 * exist, whether they may be edited, what the grade options are, or what a refusal
 * says — all of that comes from src/settings/shopSettings.ts, where a headless
 * proof can reach it. Same move and same reason as DailyScreen and PricesSheet:
 * every operator-facing sentence that ever shipped wrong lived under app/ and no
 * proof could see it. The one thing this file owns is the edit BUFFER — what the
 * office has typed so far — exactly as PricesSheet owns its `Editing` state.
 *
 * NO MODAL ELEMENT AND NO `visible` PROP. One Modal exists (app/SheetHost) and the
 * sheet stack decides what is inside it; `npm run prove:sheets` reddens if a second
 * Modal appears in this directory.
 */
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  defaultGradeChangeConfirmation,
  patchChangesGrade,
  patchIsEmpty,
  shopPatchBody,
} from "../src/settings/shopSettings";
import type {
  ShopEdits,
  ShopFormScreen,
  ShopMessageScreen,
  ShopMessageTone,
  ShopPatch,
  ShopSettings,
  ShopSettingsScreen,
} from "../src/settings/shopSettings";

const TAP_MIN = 56;

const TONE: Record<ShopMessageTone, { bg: string; fg: string; badge: string }> = {
  forbidden: { bg: "#fee2e2", fg: "#7f1d1d", badge: "#b91c1c" },
  session: { bg: "#fef3c7", fg: "#78350f", badge: "#b45309" },
  offline: { bg: "#f1f5f9", fg: "#334155", badge: "#64748b" },
  server: { bg: "#f1f5f9", fg: "#334155", badge: "#64748b" },
  invalid: { bg: "#fef3c7", fg: "#78350f", badge: "#b45309" },
};

interface Props {
  /** null while a request is in flight, so a spinner is a state and not a guess. */
  screen: ShopSettingsScreen | null;
  /**
   * The shop row the form diffs a save against, or null when the screen is not a
   * form (a message, or still loading). It is the value the server last WITNESSED
   * — after a save it is the re-read response, never what was sent.
   */
  shop: ShopSettings | null;
  saving: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  /** The app performs the network PATCH and the re-read; this passes the diff. */
  onSave: (patch: ShopPatch) => void;
}

export function SettingsScreen({ screen, shop, saving, onClose, onRetry, onSignIn, onSave }: Props) {
  return (
    <View style={styles.fill}>
      <View style={styles.head}>
        <Text style={styles.title}>ตั้งค่าร้าน</Text>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>ปิด</Text>
        </Pressable>
      </View>

      {screen === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loading}>กำลังอ่านการตั้งค่าจากระบบ…</Text>
        </View>
      ) : screen.kind === "message" ? (
        <MessageBody screen={screen} onRetry={onRetry} onSignIn={onSignIn} />
      ) : (
        <FormBody form={screen} shop={shop} saving={saving} onSave={onSave} />
      )}
    </View>
  );
}

/* ------------------------------------------------------------- message ---- */

function MessageBody({
  screen,
  onRetry,
  onSignIn,
}: {
  screen: ShopMessageScreen;
  onRetry: () => void;
  onSignIn: () => void;
}) {
  const tone = TONE[screen.tone];
  const handler =
    screen.action === null ? undefined : screen.action.kind === "sign_in" ? onSignIn : onRetry;
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={[styles.messageCard, { backgroundColor: tone.bg }]}>
        <Text style={[styles.messageBadge, { backgroundColor: tone.badge }]}>{screen.badge}</Text>
        {screen.lines.map((line, i) => (
          <Text
            key={i}
            style={[i === 0 ? styles.messageLead : styles.messageCalm, { color: tone.fg }]}
          >
            {line}
          </Text>
        ))}
        {screen.action !== null ? (
          <Pressable style={styles.messageBtn} onPress={handler}>
            <Text style={styles.messageBtnText}>{screen.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

/* ---------------------------------------------------------------- form ---- */

function FormBody({
  form,
  shop,
  saving,
  onSave,
}: {
  form: ShopFormScreen;
  shop: ShopSettings | null;
  saving: boolean;
  onSave: (patch: ShopPatch) => void;
}) {
  // THE EDIT BUFFER. Seeded from the form's values and re-seeded whenever they
  // change — after a save the form re-renders from the server's re-read row, and
  // the buffer must follow it, not the value that was typed.
  const [grade, setGrade] = useState<string | null>(form.grade);
  const [address, setAddress] = useState<string>(form.address ?? "");
  const [phone, setPhone] = useState<string>(form.phone ?? "");
  const [pending, setPending] = useState<{ patch: ShopPatch; confirm: string } | null>(null);

  useEffect(() => {
    setGrade(form.grade);
    setAddress(form.address ?? "");
    setPhone(form.phone ?? "");
    setPending(null);
  }, [form.grade, form.address, form.phone]);

  const readOnly = form.readOnly;

  const attemptSave = (): void => {
    if (shop === null) return;
    const edits: ShopEdits = { default_grade: grade, address, phone };
    const patch = shopPatchBody(shop, edits);
    if (patchIsEmpty(patch)) return; // nothing changed — the server has no empty SET
    if (patchChangesGrade(patch)) {
      // Measure-before-the-write, applied to a human: a default-grade change
      // re-prices every future ungraded walk-in and cannot be un-priced, so it is
      // confirmed before it is sent. The sentence is the builder's, not this file's.
      setPending({ patch, confirm: defaultGradeChangeConfirmation(patch.default_grade ?? null) });
      return;
    }
    onSave(patch);
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      {/* NAME — read-only for both roles: it is on printed slips (D4). */}
      <View style={styles.card}>
        <Text style={styles.label}>{form.nameLabel}</Text>
        <Text style={styles.readValue}>{form.name}</Text>
        <Text style={styles.note}>{form.nameNote}</Text>
      </View>

      {/* DEFAULT GRADE — chips from GRADES plus the explicit "no default". */}
      <View style={styles.card}>
        <Text style={styles.label}>{form.gradeLabel}</Text>
        {readOnly ? (
          <Text style={styles.readValue}>
            {form.gradeOptions.find((o) => o.value === form.grade)?.label ?? form.grade}
          </Text>
        ) : (
          <View style={styles.chips}>
            {form.gradeOptions.map((opt) => {
              const on = opt.value === grade;
              return (
                <Pressable
                  key={opt.value ?? "__none__"}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setGrade(opt.value)}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {grade === null ? <Text style={styles.note}>{form.gradeNoneNote}</Text> : null}
      </View>

      {/* ADDRESS */}
      <View style={styles.card}>
        <Text style={styles.label}>{form.addressLabel}</Text>
        {readOnly ? (
          form.address === null ? (
            <Text style={styles.empty}>{form.addressEmptyNote}</Text>
          ) : (
            <Text style={styles.readValue}>{form.address}</Text>
          )
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              maxLength={form.addressMaxLength}
              multiline
              placeholder=""
            />
            {address.length === 0 ? <Text style={styles.empty}>{form.addressEmptyNote}</Text> : null}
          </>
        )}
      </View>

      {/* PHONE */}
      <View style={styles.card}>
        <Text style={styles.label}>{form.phoneLabel}</Text>
        {readOnly ? (
          form.phone === null ? (
            <Text style={styles.empty}>{form.phoneEmptyNote}</Text>
          ) : (
            <Text style={styles.readValue}>{form.phone}</Text>
          )
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              maxLength={form.phoneMaxLength}
              keyboardType="phone-pad"
              placeholder=""
            />
            {phone.length === 0 ? <Text style={styles.empty}>{form.phoneEmptyNote}</Text> : null}
          </>
        )}
      </View>

      {/* THE SAVE CONTROL — drawn only when the screen is editable (admin). A staff
          session has saveLabel === null and no control is drawn at all. */}
      {form.saveLabel !== null ? (
        pending !== null ? (
          <View style={styles.confirmCard}>
            <Text style={styles.confirmText}>{pending.confirm}</Text>
            <View style={styles.confirmRow}>
              <Pressable
                style={[styles.saveBtn, styles.confirmYes]}
                disabled={saving}
                onPress={() => {
                  const p = pending.patch;
                  setPending(null);
                  onSave(p);
                }}
              >
                <Text style={styles.saveText}>ยืนยันบันทึก</Text>
              </Pressable>
              <Pressable style={styles.cancelBtn} disabled={saving} onPress={() => setPending(null)}>
                <Text style={styles.cancelText}>ยกเลิก</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={[styles.saveBtn, saving && styles.saveBusy]}
            disabled={saving}
            onPress={attemptSave}
          >
            <Text style={styles.saveText}>{saving ? "กำลังบันทึก…" : form.saveLabel}</Text>
          </Pressable>
        )
      ) : (
        <Text style={styles.readOnlyNote}>
          ดูได้อย่างเดียว — การแก้ไขการตั้งค่าร้านทำได้เฉพาะบัญชีผู้ดูแลระบบ
        </Text>
      )}
    </ScrollView>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loading: { fontSize: 14, color: "#64748b", fontWeight: "700" },

  card: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  label: { fontSize: 13, fontWeight: "900", color: "#64748b" },
  readValue: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginTop: 6 },
  note: { fontSize: 12, color: "#64748b", marginTop: 8, fontWeight: "600" },
  empty: { fontSize: 13, color: "#94a3b8", marginTop: 8, fontWeight: "700", fontStyle: "italic" },

  input: {
    minHeight: TAP_MIN, marginTop: 8, borderWidth: 1, borderColor: "#cbd5e1",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 17,
    fontWeight: "700", color: "#0f172a", backgroundColor: "#fff",
  },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: {
    minHeight: TAP_MIN, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1,
    borderColor: "#cbd5e1", backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
  },
  chipOn: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  chipText: { fontSize: 15, fontWeight: "800", color: "#334155" },
  chipTextOn: { color: "#fff" },

  saveBtn: {
    minHeight: TAP_MIN, borderRadius: 12, backgroundColor: "#0f766e",
    alignItems: "center", justifyContent: "center", marginTop: 6,
  },
  saveBusy: { opacity: 0.6 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  readOnlyNote: { fontSize: 13, color: "#64748b", fontWeight: "700", marginTop: 6, textAlign: "center" },

  confirmCard: {
    backgroundColor: "#fffbeb", borderRadius: 12, padding: 14, marginTop: 6,
    borderWidth: 2, borderColor: "#b45309",
  },
  confirmText: { fontSize: 14, fontWeight: "800", color: "#78350f" },
  confirmRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  confirmYes: { flex: 1, marginTop: 0 },
  cancelBtn: {
    minHeight: TAP_MIN, paddingHorizontal: 20, borderRadius: 12, backgroundColor: "#e2e8f0",
    alignItems: "center", justifyContent: "center",
  },
  cancelText: { fontSize: 16, fontWeight: "800", color: "#334155" },

  messageCard: { borderRadius: 14, padding: 16, marginTop: 24, alignItems: "flex-start" },
  messageBadge: {
    color: "#fff", fontSize: 12, fontWeight: "800", paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 6, overflow: "hidden",
  },
  messageLead: { fontSize: 15, fontWeight: "800", marginTop: 12 },
  messageCalm: { fontSize: 13, fontWeight: "600", marginTop: 8 },
  messageBtn: {
    marginTop: 16, minHeight: 48, paddingHorizontal: 20, borderRadius: 10,
    backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center", alignSelf: "stretch",
  },
  messageBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
