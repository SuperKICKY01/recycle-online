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
import { useEffect, useMemo, useState } from "react";
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
import { moveActiveTier, validateNewTier } from "../src/settings/gradeTierAdmin";
import type {
  GradeTierCreateBody,
  TierAdminRow,
  TierAdminScreen,
} from "../src/settings/gradeTierAdmin";
import { useTheme, useThemeControl, type ThemePref, type ThemeTokens } from "./theme";
import { SheetHeader } from "./SheetHeader";
import { API_BASE_URL } from "./config";

/**
 * The three theme choices. A device preference, not a shop setting. Order is
 * light / system / dark (P1.23 item 3 phase C) so the segmented control reads as the
 * reference's own shape, auto in the middle. Labels unchanged; the canonical set order
 * is `THEME_PREFS` in theme.ts, which this display order does not have to match.
 */
const THEME_OPTIONS: readonly { pref: ThemePref; label: string }[] = [
  { pref: "light", label: "สว่าง" },
  { pref: "system", label: "ตามระบบ" },
  { pref: "dark", label: "มืด" },
];

function makeTone(t: ThemeTokens): Record<ShopMessageTone, { bg: string; fg: string; badge: string }> {
  return {
    forbidden: { bg: t.color.dangerBg, fg: t.color.dangerFg, badge: t.color.danger },
    session: { bg: t.color.warningBg, fg: t.color.warningFg, badge: t.color.warning },
    offline: { bg: t.color.neutralBg, fg: t.color.neutralFg, badge: t.color.textSubtle },
    server: { bg: t.color.neutralBg, fg: t.color.neutralFg, badge: t.color.textSubtle },
    invalid: { bg: t.color.warningBg, fg: t.color.warningFg, badge: t.color.warning },
  };
}

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
  /**
   * THE GRADE-TIER ADMIN (S16 / P1.24). null while loading or on a message screen;
   * a value only when both /shop and /grade-tiers landed. Drawn below the form.
   */
  tierScreen: TierAdminScreen | null;
  /** The last tier write's refusal (the F4 count, a duplicate, an outage), or null. */
  tierRefusal: string | null;
  /** A tier write is in flight — the controls are disabled. */
  tierBusy: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  /** The app performs the network PATCH and the re-read; this passes the diff. */
  onSave: (patch: ShopPatch) => void;
  /** The app performs the network POST and re-reads the list; this passes a valid body. */
  onAddTier: (body: GradeTierCreateBody) => void;
  /** The app PUTs the whole new order and re-reads; this passes the full tier-id order. */
  onReorderTiers: (order: readonly string[]) => void;
  /** Open the ⋯ actions menu for a tier row (P1.23 item 3 phase D) — rename and retire
   *  move into a sheet so the destructive control leaves the row (they wire to the sheet
   *  in App.tsx, not here). */
  onTierMenu: (row: TierAdminRow) => void;
}

export function SettingsScreen({
  screen,
  shop,
  saving,
  tierScreen,
  tierRefusal,
  tierBusy,
  onClose,
  onRetry,
  onSignIn,
  onSave,
  onAddTier,
  onReorderTiers,
  onTierMenu,
}: Props) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.fill}>
      <SheetHeader title="ตั้งค่าร้าน" onClose={onClose} />

      <ThemeControl />
      <ServerDiagnostics />

      {screen === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loading}>กำลังอ่านการตั้งค่าจากระบบ…</Text>
        </View>
      ) : screen.kind === "message" ? (
        <MessageBody screen={screen} onRetry={onRetry} onSignIn={onSignIn} />
      ) : (
        <FormBody
          form={screen}
          shop={shop}
          saving={saving}
          onSave={onSave}
          tierScreen={tierScreen}
          tierRefusal={tierRefusal}
          tierBusy={tierBusy}
          onAddTier={onAddTier}
          onReorderTiers={onReorderTiers}
          onTierMenu={onTierMenu}
        />
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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const tone = makeTone(t)[screen.tone];
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
  tierScreen,
  tierRefusal,
  tierBusy,
  onAddTier,
  onReorderTiers,
  onTierMenu,
}: {
  form: ShopFormScreen;
  shop: ShopSettings | null;
  saving: boolean;
  onSave: (patch: ShopPatch) => void;
  tierScreen: TierAdminScreen | null;
  tierRefusal: string | null;
  tierBusy: boolean;
  onAddTier: (body: GradeTierCreateBody) => void;
  onReorderTiers: (order: readonly string[]) => void;
  onTierMenu: (row: TierAdminRow) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
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

      {/* DEFAULT GRADE — options are the shop's ACTIVE tiers, by name (S16). F2: the
          whole control is not drawn when the shop has one active tier — a note takes
          its place, because a one-tier shop does not choose a default. */}
      {form.showGrade ? (
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
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>{form.gradeLabel}</Text>
          <Text style={styles.note}>{form.gradeSingleTierNote}</Text>
        </View>
      )}

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
          ดูได้อย่างเดียว — การแก้ไขการตั้งค่าร้านทำได้เฉพาะบัญชีเจ้าของร้าน
        </Text>
      )}

      {/* THE GRADE-TIER ADMIN (S16 / P1.24). Below the /shop fields, in the same
          scroll. Present whenever both reads landed; a staff session sees it
          read-only. The LIST is never hidden — a one-tier shop must add its second
          tier here even though its default-grade control (above) is hidden by F2. */}
      {tierScreen !== null ? (
        <TierAdminBody
          tierScreen={tierScreen}
          refusal={tierRefusal}
          busy={tierBusy}
          onAdd={onAddTier}
          onReorder={onReorderTiers}
          onTierMenu={onTierMenu}
        />
      ) : null}
    </ScrollView>
  );
}

/* ----------------------------------------------------------- tier admin ---- */

/**
 * THE SHOP'S GRADE TIERS — declare, rename, retire (S16 / P1.24). Presentation
 * only: every bound, refusal, and gate comes from src/settings/gradeTierAdmin.ts,
 * which a headless proof reaches. This owns the edit BUFFERS (the add form and the
 * one in-progress rename) exactly as FormBody owns its shop-field buffer.
 */
function TierAdminBody({
  tierScreen,
  refusal,
  busy,
  onAdd,
  onReorder,
  onTierMenu,
}: {
  tierScreen: TierAdminScreen;
  refusal: string | null;
  busy: boolean;
  onAdd: (body: GradeTierCreateBody) => void;
  onReorder: (order: readonly string[]) => void;
  onTierMenu: (row: TierAdminRow) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const editable = tierScreen.editable;

  // The add-form buffer. A local validation message is separate from `refusal` (the
  // last NETWORK refusal): one is caught at the keypad, the other came back from the
  // server. The rename buffer moved to the ⋯ sheet (TierActionsSheet) with the label.
  const [addCode, setAddCode] = useState("");
  const [addName, setAddName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const submitAdd = (): void => {
    const v = validateNewTier(addCode, addName, tierScreen.rows);
    if (!v.ok) {
      setAddError(v.message);
      return;
    }
    setAddError(null);
    setAddCode("");
    setAddName("");
    onAdd(v.body);
  };

  // One move = one PUT of the WHOLE new order. moveActiveTier returns the full id
  // list (active reordered, inactive after) or null at the edge, which the button
  // is already disabled for; the null check is the belt to that suspenders.
  const move = (row: TierAdminRow, direction: "up" | "down"): void => {
    const order = moveActiveTier(tierScreen.rows, row.id, direction);
    if (order !== null) onReorder(order);
  };

  return (
    <View style={styles.tierCard}>
      <Text style={styles.tierTitle}>{tierScreen.title}</Text>

      {tierScreen.rows.map((row) => (
        <View key={row.id} style={styles.tierRow}>
          <View style={styles.tierRowMain}>
            <Text style={[styles.tierName, !row.is_active && styles.tierNameOff]}>
              {row.name}
            </Text>
            <Text style={styles.tierCode}>{row.code}</Text>
          </View>
          {!row.is_active ? <Text style={styles.tierOffBadge}>ปิดใช้งาน</Text> : null}

          {editable ? (
            <View style={styles.tierActions}>
              {/* Reorder ↑ ↓ stay ON the row — one PUT of the whole order per move,
                  disabled at the edges (canMoveUp / canMoveDown). */}
              {row.canMoveUp ? (
                <Pressable style={styles.tierBtn} disabled={busy} onPress={() => move(row, "up")}>
                  <Text style={styles.tierBtnText}>↑</Text>
                </Pressable>
              ) : null}
              {row.canMoveDown ? (
                <Pressable style={styles.tierBtn} disabled={busy} onPress={() => move(row, "down")}>
                  <Text style={styles.tierBtnText}>↓</Text>
                </Pressable>
              ) : null}
              {/* The ... menu (P1.23 item 3 phase D): rename and the destructive deactivate
                  leave the row into a sheet, so a wet thumb cannot hit retire beside the
                  arrows. A real tap target >= TAP_MIN; its accessibilityLabel names the tier
                  it acts on (ruling 3). */}
              <Pressable
                style={styles.tierBtn}
                disabled={busy}
                onPress={() => onTierMenu(row)}
                accessibilityRole="button"
                accessibilityLabel={row.name}
              >
                <Text style={styles.tierBtnText}>⋯</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}

      {/* The LAST NETWORK refusal — the F4 deactivation count, a duplicate, an outage. */}
      {refusal !== null ? <Text style={styles.tierRefusal}>{refusal}</Text> : null}

      {editable ? (
        <View style={styles.tierAddBox}>
          <Text style={styles.label}>เพิ่มเกรดใหม่</Text>
          <TextInput
            style={styles.input}
            value={addCode}
            onChangeText={setAddCode}
            maxLength={tierScreen.codeMaxLength}
            placeholder="รหัสเกรด"
            placeholderTextColor={t.color.placeholder}
          />
          <TextInput
            style={styles.input}
            value={addName}
            onChangeText={setAddName}
            maxLength={tierScreen.nameMaxLength}
            placeholder="ชื่อเกรด"
            placeholderTextColor={t.color.placeholder}
          />
          {addError !== null ? <Text style={styles.tierError}>{addError}</Text> : null}
          <Text style={styles.note}>{tierScreen.addHint}</Text>
          <Pressable
            style={[styles.saveBtn, busy && styles.saveBusy]}
            disabled={busy}
            onPress={submitAdd}
          >
            <Text style={styles.saveText}>{busy ? "กำลังบันทึก…" : "เพิ่มเกรด"}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.readOnlyNote}>{tierScreen.readOnlyNote}</Text>
      )}
    </View>
  );
}

/* --------------------------------------------------------------- theme ---- */

/**
 * The app-theme control. A DEVICE preference (light / dark / follow-system),
 * stored on this device via the theme context, applied app-wide. Shown to every
 * signed-in account — unlike the shop settings above, it is not role-gated and
 * says so in the note, because it is not a shop setting at all.
 */
function ThemeControl() {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { pref, setPref } = useThemeControl();
  return (
    <View style={styles.themeCard}>
      <Text style={styles.label}>ธีมของแอป</Text>
      <View style={styles.segmented}>
        {THEME_OPTIONS.map((opt) => {
          const on = opt.pref === pref;
          return (
            <Pressable
              key={opt.pref}
              style={[styles.segment, on && styles.segmentOn]}
              onPress={() => setPref(opt.pref)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>
        การตั้งค่านี้อยู่บนเครื่องนี้เท่านั้น ไม่ใช่การตั้งค่าร้าน และใช้ได้ทุกบัญชี
      </Text>
    </View>
  );
}

/**
 * THE SERVER ADDRESS — diagnostic, not operator information (P1.23 item 3 phase C). It
 * moved off the main screen's status line to here: a shop that cannot reach the server
 * needs someone to read this address, but the operator weighing a load does not. Bare
 * URL, no label — it is self-evident to whoever sets up the network; selectable to copy.
 */
function ServerDiagnostics() {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.diagCard}>
      <Text style={styles.diagText} numberOfLines={1} selectable>
        {API_BASE_URL}
      </Text>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.color.background },
    body: { padding: t.space.x3, paddingBottom: t.layout.scrollGutter },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.xl },
    loading: { fontSize: t.type.bodyLg, color: t.color.textSubtle, fontWeight: "700" },

    themeCard: {
      backgroundColor: t.color.surface, marginHorizontal: t.space.x3, marginTop: t.space.x3,
      borderRadius: t.radius.card, padding: t.space.xxl, borderWidth: 1, borderColor: t.color.borderSoft,
    },

    card: {
      backgroundColor: t.color.surface, borderRadius: t.radius.card, padding: t.space.xxl, marginBottom: t.space.xl,
      borderWidth: 1, borderColor: t.color.borderSoft,
    },
    label: { fontSize: t.type.body, fontWeight: "900", color: t.color.textSubtle },
    readValue: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.text, marginTop: t.space.sm },
    note: { fontSize: t.type.body, color: t.color.textSubtle, marginTop: t.space.md, fontWeight: "600" },
    empty: { fontSize: t.type.body, color: t.color.placeholder, marginTop: t.space.md, fontWeight: "700", fontStyle: "italic" },

    input: {
      minHeight: t.tapMin, marginTop: t.space.md, borderWidth: 1, borderColor: t.color.border,
      borderRadius: t.radius.lg, paddingHorizontal: t.space.xl, paddingVertical: t.space.lg, fontSize: t.type.subhead,
      fontWeight: "700", color: t.color.text, backgroundColor: t.color.surface,
    },

    chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.md, marginTop: t.space.lg },
    chip: {
      minHeight: t.tapMin, paddingHorizontal: t.space.x3, borderRadius: t.radius.lg, borderWidth: 1,
      borderColor: t.color.border, backgroundColor: t.color.surface, alignItems: "center", justifyContent: "center",
    },
    chipOn: { backgroundColor: t.color.primary, borderColor: t.color.primary },
    chipText: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.neutralFg },
    chipTextOn: { color: t.color.onPrimary },
    // The theme control is a SEGMENTED control (P1.23 item 3 phase C), not chips: one
    // connected track, the selected segment filled. The grade selector above stays chips.
    segmented: {
      flexDirection: "row", marginTop: t.space.md, borderRadius: t.radius.lg,
      borderWidth: 1, borderColor: t.color.border, backgroundColor: t.color.surfaceAlt, overflow: "hidden",
    },
    segment: { flex: 1, minHeight: t.tapMin, alignItems: "center", justifyContent: "center", paddingHorizontal: t.space.md },
    segmentOn: { backgroundColor: t.color.primary },
    segmentText: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.text },
    segmentTextOn: { color: t.color.onPrimary },
    // The server-address diagnostic, moved off the operator's main screen.
    diagCard: { marginHorizontal: t.space.x3, marginTop: t.space.md, paddingHorizontal: t.space.xxl, paddingVertical: t.space.md },
    diagText: { fontSize: t.type.body, color: t.color.textSubtle, fontWeight: "600" },

    saveBtn: {
      minHeight: t.tapMin, borderRadius: t.radius.xl, backgroundColor: t.color.primary,
      alignItems: "center", justifyContent: "center",
    },
    saveBusy: { opacity: 0.6 },
    saveText: { color: t.color.onPrimary, fontSize: t.type.subhead, fontWeight: "900" },
    readOnlyNote: { fontSize: t.type.body, color: t.color.textSubtle, fontWeight: "700", marginTop: t.space.sm, textAlign: "center" },

    confirmCard: {
      backgroundColor: t.color.warningSoftBg, borderRadius: t.radius.card, padding: t.space.xxl, marginTop: t.space.sm,
      borderWidth: 2, borderColor: t.color.warning,
    },
    confirmText: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.warningFg },
    confirmRow: { flexDirection: "row", gap: t.space.lg, marginTop: t.space.xl },
    confirmYes: { flex: 1 },
    cancelBtn: {
      minHeight: t.tapMin, paddingHorizontal: t.space.x4, borderRadius: t.radius.xl, backgroundColor: t.color.borderSoft,
      alignItems: "center", justifyContent: "center",
    },
    cancelText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.neutralFg },

    messageCard: { borderRadius: t.radius.card, padding: t.space.x3, marginTop: t.space.x5, alignItems: "flex-start" },
    messageBadge: {
      color: t.color.onPrimary, fontSize: t.type.body, fontWeight: "800", paddingHorizontal: t.space.lg,
      paddingVertical: t.space.xs, borderRadius: t.radius.sm, overflow: "hidden",
    },
    messageLead: { fontSize: t.type.bodyLg, fontWeight: "800", marginTop: t.space.xl },
    messageCalm: { fontSize: t.type.body, fontWeight: "600", marginTop: t.space.md },
    messageBtn: {
      marginTop: t.space.x3, minHeight: t.tapMin, paddingHorizontal: t.space.x4, borderRadius: t.radius.lg,
      backgroundColor: t.color.primary, alignItems: "center", justifyContent: "center", alignSelf: "stretch",
    },
    messageBtnText: { color: t.color.onPrimary, fontSize: t.type.bodyLg, fontWeight: "800" },

    tierCard: {
      backgroundColor: t.color.surface, borderRadius: t.radius.card, padding: t.space.xxl,
      marginBottom: t.space.xl, borderWidth: 1, borderColor: t.color.borderSoft,
    },
    // The reference's section heading: small and muted (P1.23 item 3 phase D), the
    // same body/800/textSubtle DashboardScreen's `sectionLabel` already uses. The
    // shop-info / this-device headings are new Thai and deferred (OPEN_ITEMS).
    tierTitle: { fontSize: t.type.body, fontWeight: "800", color: t.color.textSubtle, marginBottom: t.space.md },
    tierRow: {
      flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: t.space.md,
      paddingVertical: t.space.lg, borderTopWidth: 1, borderTopColor: t.color.borderSoft,
    },
    tierRowMain: { flex: 1, flexBasis: "60%", flexDirection: "row", alignItems: "center", gap: t.space.md, flexWrap: "wrap" },
    tierName: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.text },
    tierNameOff: { color: t.color.textSubtle, textDecorationLine: "line-through" },
    tierCode: { fontSize: t.type.body, fontWeight: "700", color: t.color.textSubtle },
    tierOffBadge: {
      fontSize: t.type.body, fontWeight: "800", color: t.color.textSubtle,
      backgroundColor: t.color.neutralBg, paddingHorizontal: t.space.md, paddingVertical: t.space.xs,
      borderRadius: t.radius.sm, overflow: "hidden",
    },
    tierActions: { flexDirection: "row", gap: t.space.md, flexWrap: "wrap" },
    tierBtn: {
      minHeight: t.tapMin, paddingHorizontal: t.space.xl, borderRadius: t.radius.lg, borderWidth: 1,
      borderColor: t.color.border, backgroundColor: t.color.surface, alignItems: "center", justifyContent: "center",
    },
    tierBtnText: { fontSize: t.type.body, fontWeight: "800", color: t.color.neutralFg },
    tierError: { fontSize: t.type.body, color: t.color.danger, fontWeight: "800", marginTop: t.space.md },
    tierRefusal: {
      fontSize: t.type.body, color: t.color.warningFg, fontWeight: "800", marginTop: t.space.lg,
      backgroundColor: t.color.warningSoftBg, borderRadius: t.radius.lg, padding: t.space.lg,
    },
    tierAddBox: { marginTop: t.space.xl, borderTopWidth: 1, borderTopColor: t.color.borderSoft, paddingTop: t.space.xl, gap: t.space.md },
  });
}
