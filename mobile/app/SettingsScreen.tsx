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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  ADD_CHANNEL_HEADING,
  ADD_CHANNEL_LABEL,
  BANK_CODE_HINT,
  CHANNEL_FIELD_LABEL,
  CHANNEL_KIND_LABEL,
  CHANNEL_MAX,
  checkChannelDraft,
  PROXY_TYPE_LABEL,
  type ChannelCreateBody,
  type ChannelDraft,
  type ChannelKind,
  type DrawerSettingsScreen,
  type ProxyType,
} from "../src/counter/drawerView";
import type { PaymentMethod } from "../src/counter/counterView";

import {
  defaultGradeChangeConfirmation,
  MONEY_CHANGE_CONFIRMATION,
  patchChangesGrade,
  patchChangesMoney,
  patchIsEmpty,
  shopPatchBody,
} from "../src/settings/shopSettings";
import type {
  ShopEdits,
  ShopMoneyRules,
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
import { Icon } from "./Icon";
import { Touchable } from "./Press";
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
  /** Open the user-management screen (P3.7). NULL for a staff session — the entry is
   *  ADMIN-ONLY (mayManageUsers, decided in App.tsx), so a staff account does not see
   *  the row at all, the dashboard-entry-gate shape. */
  onManageUsers: (() => void) | null;
  /** Open the product-management screen (P1.15). NULL for a staff session — the entry
   *  is ADMIN-ONLY (mayManageProducts, decided in App.tsx), the same gate shape. */
  onManageProducts: (() => void) | null;
  /** THE PAYMENTS GROUP (the shifts unit, commit 3): the shifts switch, the branch's
   *  methods, the shop's own channels. NULL for a principal without
   *  shop.settings.write (mayShowDrawerSettings, decided in App.tsx) — the group is
   *  not drawn at all, the entry-gate shape of the two rows above. */
  payments: PaymentsSettings | null;
}

/** What the payments group draws from and writes through. Every write is the app's
 *  (a PATCH/PUT/POST, then a re-read); this group owns only the add-form buffer and
 *  the pending switch value while a write is in flight. */
export interface PaymentsSettings {
  /** null while the two reads are in flight. */
  screen: DrawerSettingsScreen | null;
  refusal: string | null;
  busy: boolean;
  onRetry: () => void;
  onToggleShifts: (on: boolean) => void;
  onToggleMethod: (method: PaymentMethod, on: boolean) => void;
  onAddChannel: (body: ChannelCreateBody) => void;
  onDeactivateChannel: (channelId: string) => void;
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
  onManageUsers,
  onManageProducts,
  payments,
}: Props) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  /*
   * ONE SCROLL REGION, AND EVERY CONTROL IS INSIDE IT (2026-09-06, the first thing a
   * person saw on this screen since phase E). Until then the device section, the
   * server line and the two entry rows were FIXED children of this View, stacked
   * ABOVE the form's own ScrollView, which received only what height was left —
   * on a 1080x2400 emulator about four-tenths of the screen. The shop form, its
   * save control and the whole tier admin scrolled inside that short window, whose
   * top edge sat flush under the จัดการสินค้า row (that row has a top margin and no
   * bottom one), so content clipped at the row's edge and read as sliding BEHIND it,
   * and บันทึก sat mid-screen beside the tier list. Nothing was absolute and nothing
   * was sticky: the header block simply consumed the screen.
   *
   * The decision: the save control SCROLLS WITH THE FORM, as every other form
   * screen's does (AccountScreen, AddSellerSheet, UsersScreen, the ProductsScreen
   * forms). A pinned bar is reserved for a screen's single primary action over a
   * scroll body padded to clear it — CartScreen's บันทึกบิล — and a settings sheet
   * has no such action: its save applies to one of four sections. So the header,
   * the device section, the entry rows, the form and the tier admin are the
   * children of ONE ScrollView, in that order, and the body is padded by the scroll
   * gutter so the last control clears the home indicator. `npm run prove:settings`
   * S7 reads this file and reddens on a second ScrollView, a control outside it,
   * or an absolute position. The rendered result stays the eye's.
   */
  return (
    <View style={styles.fill}>
      <SheetHeader title="ตั้งค่าร้าน" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.deviceHead}>เครื่องนี้</Text>
        <ThemeControl />
        <ServerDiagnostics />

        {/* USER MANAGEMENT (P3.7). Admin-only: onManageUsers is null for a staff
            session, so the row is not drawn at all — a staff account does not learn
            the screen exists, the P1.9 entry-gate shape. Above the shop form and
            independent of its read, so it is reachable whatever state that read is in. */}
        {onManageUsers !== null ? (
          <Touchable
            style={styles.entryRow}
            onPress={onManageUsers}
            accessibilityLabel="จัดการผู้ใช้งาน"
          >
            <Icon name="account" size={20} color={t.color.primary} />
            <Text style={styles.entryLabel}>จัดการผู้ใช้งาน</Text>
            <Icon name="chevron" size={18} color={t.color.textSubtle} />
          </Touchable>
        ) : null}

        {/* PRODUCT MASTER DATA (P1.15). Admin-only, the same shape: onManageProducts
            is null for a staff session, so the row is not drawn at all. */}
        {onManageProducts !== null ? (
          <Touchable
            style={styles.entryRow}
            onPress={onManageProducts}
            accessibilityLabel="จัดการสินค้า"
          >
            <Icon name="products" size={20} color={t.color.primary} />
            <Text style={styles.entryLabel}>จัดการสินค้า</Text>
            <Icon name="chevron" size={18} color={t.color.textSubtle} />
          </Touchable>
        ) : null}

        {screen === null ? (
          <View style={styles.loadingBox}>
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

        {/* THE PAYMENTS GROUP (the shifts unit, commit 3), below the shop form and the
            tiers, INSIDE the one scroll region (S7). Its own two reads, so it is drawn
            whatever state the /shop read is in; null for a principal without
            shop.settings.write, so the group is not drawn at all. */}
        {payments !== null ? <PaymentsGroup payments={payments} /> : null}
      </ScrollView>
    </View>
  );
}

/* -------------------------------------------------------- payments group ---- */

type PendingSwitch = { key: string; value: boolean } | null;

const PROXY_TYPES: readonly ProxyType[] = ["phone", "national_id", "ewallet"];
const CHANNEL_KINDS: readonly ChannelKind[] = ["promptpay", "bank_account"];
const EMPTY_DRAFT: ChannelDraft = {
  kind: "promptpay",
  label: "",
  proxyType: "phone",
  proxy: "",
  bankCode: "",
  accountNo: "",
  accountName: "",
};

/**
 * THE PAYMENTS GROUP — the shifts switch, the branch's methods as switches, and the
 * shop's own channels (list, add, deactivate). Presentation only: the gate, the
 * wording and the add-form check are drawerView's. The switches are the platform's
 * own control (a settings toggle is used a hundred times and is never animated here).
 *
 * WHILE A WRITE IS IN FLIGHT the switch shows the value it was moved to, beside a
 * spinner, so the tap answers at once; when the re-read lands the SERVER's value is
 * drawn — after a save this screen shows what was witnessed, never what was sent.
 */
function PaymentsGroup({ payments }: { payments: PaymentsSettings }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { screen, refusal, busy } = payments;
  const [pending, setPending] = useState<PendingSwitch>(null);
  const [draft, setDraft] = useState<ChannelDraft>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);

  // A new screen (the re-read) or the end of a write retires the pending value.
  useEffect(() => {
    setPending(null);
  }, [screen]);
  useEffect(() => {
    if (!busy) setPending(null);
  }, [busy]);

  if (screen === null) {
    return (
      <View style={styles.body}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }
  if (screen.kind === "message") {
    return (
      <View style={styles.body}>
        <View style={[styles.messageCard, { backgroundColor: t.color.neutralBg }]}>
          <Text style={[styles.messageBadge, { backgroundColor: t.color.textSubtle }]}>{screen.badge}</Text>
          <Text style={[styles.messageLead, { color: t.color.neutralFg }]}>{screen.line}</Text>
          {screen.retry ? (
            <Touchable style={styles.messageBtn} onPress={payments.onRetry} haptic="light" accessibilityLabel="ลองอีกครั้ง">
              <Text style={styles.messageBtnText}>ลองอีกครั้ง</Text>
            </Touchable>
          ) : null}
        </View>
      </View>
    );
  }

  const shown = (key: string, server: boolean): boolean =>
    pending !== null && pending.key === key ? pending.value : server;
  const flip = (key: string, value: boolean, write: () => void): void => {
    setPending({ key, value });
    write();
  };
  const submitAdd = (): void => {
    const c = checkChannelDraft(draft);
    if (!c.ok) {
      setDraftError(c.message);
      return;
    }
    setDraftError(null);
    setDraft(EMPTY_DRAFT);
    payments.onAddChannel(c.body);
  };
  const track = { false: t.color.border, true: t.color.primary };

  return (
    <View style={styles.body}>
      <Text style={styles.formHead}>{screen.heading}</Text>
      {/* Ruling R1: anyone but the owner reads these two switches; the note says whose they are. */}
      <Text style={styles.note} testID="payments-owner-note">{screen.ownerNote}</Text>

      {/* THE SHIFTS SWITCH — the declared display rule the counter's pay-gate reads. */}
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{screen.shifts.label}</Text>
          {busy && pending?.key === "shifts" ? <ActivityIndicator /> : null}
          <Switch
            value={shown("shifts", screen.shifts.value)}
            onValueChange={(v) => flip("shifts", v, () => payments.onToggleShifts(v))}
            disabled={busy || !screen.switchesEditable}
            trackColor={track}
            accessibilityLabel={screen.shifts.label}
          />
        </View>
        <Text style={styles.note}>{screen.shifts.note}</Text>
      </View>

      {/* THE METHODS — what the counter's payment form offers (R7). */}
      <View style={styles.card}>
        <Text style={styles.label}>{screen.methodsHeading}</Text>
        {screen.methods.map((m) => (
          <View key={m.method} style={styles.switchRow}>
            <Text style={styles.switchLabel}>{m.label}</Text>
            {busy && pending?.key === m.method ? <ActivityIndicator /> : null}
            <Switch
              value={shown(m.method, m.value)}
              onValueChange={(v) => flip(m.method, v, () => payments.onToggleMethod(m.method, v))}
              disabled={busy || !screen.switchesEditable}
              trackColor={track}
              accessibilityLabel={m.label}
            />
          </View>
        ))}
        <Text style={styles.note}>{screen.methodsNote}</Text>
      </View>

      {/* THE SHOP'S OWN CHANNELS — list, deactivate, add. */}
      <View style={styles.tierCard}>
        <Text style={styles.tierTitle}>{screen.channelsHeading}</Text>
        {screen.channels.length === 0 ? <Text style={styles.empty}>{screen.emptyLine}</Text> : null}
        {screen.channels.map((c) => (
          <View key={c.id} style={styles.tierRow}>
            <View style={styles.tierRowMain}>
              <Text style={[styles.tierName, !c.isActive && styles.tierNameOff]}>{c.line}</Text>
              <Text style={styles.tierCode}>{c.kindLabel}</Text>
            </View>
            {!c.isActive ? <Text style={styles.tierOffBadge}>{screen.inactiveBadge}</Text> : null}
            {c.isActive && confirmOff !== c.id ? (
              <Touchable
                style={styles.tierBtn}
                disabled={busy}
                onPress={() => setConfirmOff(c.id)}
                accessibilityLabel={screen.deactivateLabel}
              >
                <Text style={styles.tierBtnText}>{screen.deactivateLabel}</Text>
              </Touchable>
            ) : null}
            {c.isActive && confirmOff === c.id ? (
              <View style={styles.confirmRow}>
                <Touchable
                  style={[styles.saveBtn, styles.confirmYes]}
                  disabled={busy}
                  haptic="medium"
                  accessibilityLabel="ยืนยันปิดใช้งาน"
                  onPress={() => {
                    setConfirmOff(null);
                    payments.onDeactivateChannel(c.id);
                  }}
                >
                  <Text style={styles.saveText}>ยืนยันปิดใช้งาน</Text>
                </Touchable>
                <Touchable style={styles.cancelBtn} disabled={busy} onPress={() => setConfirmOff(null)} accessibilityLabel="ยกเลิก">
                  <Text style={styles.cancelText}>ยกเลิก</Text>
                </Touchable>
              </View>
            ) : null}
          </View>
        ))}
        <Text style={styles.note}>{screen.immutableNote}</Text>

        {refusal !== null ? <Text style={styles.tierRefusal}>{refusal}</Text> : null}

        <View style={styles.tierAddBox}>
          <Text style={styles.label}>{ADD_CHANNEL_HEADING}</Text>
          <View style={styles.chips}>
            {CHANNEL_KINDS.map((k) => {
              const on = draft.kind === k;
              return (
                <Touchable
                  key={k}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setDraft({ ...draft, kind: k })}
                  haptic="light"
                  accessibilityLabel={CHANNEL_KIND_LABEL[k]}
                  selected={on}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{CHANNEL_KIND_LABEL[k]}</Text>
                </Touchable>
              );
            })}
          </View>
          <TextInput
            style={styles.input}
            value={draft.label}
            onChangeText={(v) => setDraft({ ...draft, label: v })}
            maxLength={CHANNEL_MAX.label}
            placeholder={CHANNEL_FIELD_LABEL.label}
            placeholderTextColor={t.color.placeholder}
          />
          {draft.kind === "promptpay" ? (
            <>
              <View style={styles.chips}>
                {PROXY_TYPES.map((p) => {
                  const on = draft.proxyType === p;
                  return (
                    <Touchable
                      key={p}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => setDraft({ ...draft, proxyType: p })}
                      haptic="light"
                      accessibilityLabel={PROXY_TYPE_LABEL[p]}
                      selected={on}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{PROXY_TYPE_LABEL[p]}</Text>
                    </Touchable>
                  );
                })}
              </View>
              <TextInput
                style={styles.input}
                value={draft.proxy}
                onChangeText={(v) => setDraft({ ...draft, proxy: v })}
                maxLength={CHANNEL_MAX.proxy}
                keyboardType={draft.proxyType === "ewallet" ? "default" : "number-pad"}
                placeholder={CHANNEL_FIELD_LABEL.proxy}
                placeholderTextColor={t.color.placeholder}
              />
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={draft.bankCode}
                onChangeText={(v) => setDraft({ ...draft, bankCode: v })}
                maxLength={CHANNEL_MAX.bankCode}
                autoCapitalize="characters"
                placeholder={CHANNEL_FIELD_LABEL.bankCode + " (" + BANK_CODE_HINT + ")"}
                placeholderTextColor={t.color.placeholder}
              />
              <TextInput
                style={styles.input}
                value={draft.accountNo}
                onChangeText={(v) => setDraft({ ...draft, accountNo: v })}
                maxLength={CHANNEL_MAX.accountNo}
                keyboardType="number-pad"
                placeholder={CHANNEL_FIELD_LABEL.accountNo}
                placeholderTextColor={t.color.placeholder}
              />
              <TextInput
                style={styles.input}
                value={draft.accountName}
                onChangeText={(v) => setDraft({ ...draft, accountName: v })}
                maxLength={CHANNEL_MAX.accountName}
                placeholder={CHANNEL_FIELD_LABEL.accountName}
                placeholderTextColor={t.color.placeholder}
              />
            </>
          )}
          {draftError !== null ? <Text style={styles.tierError}>{draftError}</Text> : null}
          <Touchable
            style={[styles.saveBtn, busy && styles.saveBusy]}
            disabled={busy}
            haptic="light"
            accessibilityLabel={ADD_CHANNEL_LABEL}
            onPress={submitAdd}
          >
            <Text style={styles.saveText}>{busy ? "กำลังบันทึก…" : ADD_CHANNEL_LABEL}</Text>
          </Touchable>
        </View>
      </View>
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
    <View style={styles.body}>
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
          <Touchable style={styles.messageBtn} onPress={handler} haptic="light" accessibilityLabel={screen.action.label}>
            <Text style={styles.messageBtnText}>{screen.action.label}</Text>
          </Touchable>
        ) : null}
      </View>
    </View>
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
  // THE MONEY RULES' edit buffer (0027), re-seeded from the server's row like the fields above.
  const [money, setMoney] = useState<ShopMoneyRules | null>(moneyOf(form));

  useEffect(() => {
    setGrade(form.grade);
    setAddress(form.address ?? "");
    setPhone(form.phone ?? "");
    setMoney(moneyOf(form));
    setPending(null);
  }, [form.grade, form.address, form.phone, form.money?.rounding, form.money?.deduction, form.money?.reasonRequired]);

  const readOnly = form.readOnly;

  const attemptSave = (): void => {
    if (shop === null) return;
    const edits: ShopEdits = { default_grade: grade, address, phone, ...(money !== null ? { money } : {}) };
    const patch = shopPatchBody(shop, edits);
    if (patchIsEmpty(patch)) return; // nothing changed — the server has no empty SET
    if (patchChangesMoney(patch)) {
      setPending({ patch, confirm: MONEY_CHANGE_CONFIRMATION });
      return;
    }
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
    <View style={styles.body}>
      <Text style={styles.formHead}>ข้อมูลร้าน</Text>
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
          {readOnly || form.gradeReadOnly ? (
            <Text style={styles.readValue}>
              {form.gradeOptions.find((o) => o.value === form.grade)?.label ?? form.grade}
            </Text>
          ) : (
            <View style={styles.chips}>
              {form.gradeOptions.map((opt) => {
                const on = opt.value === grade;
                return (
                  <Touchable
                    key={opt.value ?? "__none__"}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setGrade(opt.value)}
                    haptic="light"
                    accessibilityLabel={opt.label}
                    selected={on}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt.label}</Text>
                  </Touchable>
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

      {/* THE MONEY RULES (server migration 0027). The owner chooses with chips, the vocabulary the
          default grade already uses; everyone else reads the values and whose they are. */}
      {form.money !== null && money !== null ? (
        <View style={styles.card}>
          <Text style={styles.formHead}>{form.money.title}</Text>
          <Text style={styles.note}>{form.money.ownerNote}</Text>
          <MoneyChoice
            label={form.money.roundingLabel}
            value={money.rounding_rule}
            options={form.money.roundingOptions}
            readOnly={form.money.readOnly}
            onPick={(v) => setMoney({ ...money, rounding_rule: v })}
          />
          <MoneyChoice
            label={form.money.deductionLabel}
            value={money.deduction_mode}
            options={form.money.deductionOptions}
            readOnly={form.money.readOnly}
            onPick={(v) => setMoney({ ...money, deduction_mode: v })}
          />
          <MoneyChoice
            label={form.money.reasonLabel}
            value={money.deduction_reason_required ? "yes" : "no"}
            options={[{ value: "no", label: "ไม่บังคับ" }, { value: "yes", label: "บังคับ" }]}
            readOnly={form.money.readOnly}
            onPick={(v) => setMoney({ ...money, deduction_reason_required: v === "yes" })}
          />
        </View>
      ) : null}

      {/* THE SAVE CONTROL — drawn only when the screen is editable (admin). A staff
          session has saveLabel === null and no control is drawn at all. */}
      {form.saveLabel !== null ? (
        pending !== null ? (
          <View style={styles.confirmCard}>
            <Text style={styles.confirmText}>{pending.confirm}</Text>
            <View style={styles.confirmRow}>
              <Touchable
                style={[styles.saveBtn, styles.confirmYes]}
                disabled={saving}
                haptic="success"
                accessibilityLabel="ยืนยันบันทึก"
                onPress={() => {
                  const p = pending.patch;
                  setPending(null);
                  onSave(p);
                }}
              >
                <Text style={styles.saveText}>ยืนยันบันทึก</Text>
              </Touchable>
              <Touchable style={styles.cancelBtn} disabled={saving} onPress={() => setPending(null)} accessibilityLabel="ยกเลิก">
                <Text style={styles.cancelText}>ยกเลิก</Text>
              </Touchable>
            </View>
          </View>
        ) : (
          <Touchable
            style={[styles.saveBtn, saving && styles.saveBusy]}
            disabled={saving}
            haptic="light"
            accessibilityLabel={form.saveLabel}
            onPress={attemptSave}
          >
            <Text style={styles.saveText}>{saving ? "กำลังบันทึก…" : form.saveLabel}</Text>
          </Touchable>
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
    </View>
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
                <Touchable style={styles.tierBtn} disabled={busy} onPress={() => move(row, "up")} accessibilityLabel={row.name}>
                  <Icon name="up" size={18} color={t.color.neutralFg} />
                </Touchable>
              ) : null}
              {row.canMoveDown ? (
                <Touchable style={styles.tierBtn} disabled={busy} onPress={() => move(row, "down")} accessibilityLabel={row.name}>
                  <Icon name="down" size={18} color={t.color.neutralFg} />
                </Touchable>
              ) : null}
              {/* The ... menu (P1.23 item 3 phase D): rename and the destructive deactivate
                  leave the row into a sheet, so a wet thumb cannot hit retire beside the
                  arrows. A real tap target >= TAP_MIN; its accessibilityLabel names the tier
                  it acts on (ruling 3). */}
              <Touchable
                style={styles.tierBtn}
                disabled={busy}
                onPress={() => onTierMenu(row)}
                accessibilityLabel={row.name}
              >
                <Icon name="more" size={18} color={t.color.neutralFg} />
              </Touchable>
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
          <Touchable
            style={[styles.saveBtn, busy && styles.saveBusy]}
            disabled={busy}
            haptic="light"
            accessibilityLabel="เพิ่มเกรด"
            onPress={submitAdd}
          >
            <Text style={styles.saveText}>{busy ? "กำลังบันทึก…" : "เพิ่มเกรด"}</Text>
          </Touchable>
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
            <Touchable
              key={opt.pref}
              style={[styles.segment, on && styles.segmentOn]}
              onPress={() => setPref(opt.pref)}
              haptic="light"
              accessibilityLabel={opt.label}
              selected={on}
            >
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{opt.label}</Text>
            </Touchable>
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

/** The money group's buffer, from the form the server's row produced (null: no group). */
function moneyOf(form: ShopFormScreen): ShopMoneyRules | null {
  return form.money === null
    ? null
    : { rounding_rule: form.money.rounding, deduction_mode: form.money.deduction, deduction_reason_required: form.money.reasonRequired };
}

/** One money rule: chips for the owner, the chosen label for everyone else. */
function MoneyChoice<T extends string>({
  label,
  value,
  options,
  readOnly,
  onPick,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  readOnly: boolean;
  onPick: (v: T) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.moneyRow}>
      <Text style={styles.label}>{label}</Text>
      {readOnly ? (
        <Text style={styles.readValue}>{options.find((o) => o.value === value)?.label ?? value}</Text>
      ) : (
        <View style={styles.chips}>
          {options.map((opt) => {
            const on = opt.value === value;
            return (
              <Touchable
                key={opt.value}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => onPick(opt.value)}
                haptic="light"
                accessibilityLabel={opt.label}
                selected={on}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt.label}</Text>
              </Touchable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    moneyRow: { marginTop: 16 },
    fill: { flex: 1, backgroundColor: t.color.background },
    // THE ONE SCROLL REGION. Its bottom gutter is what keeps the last control (the
    // add-grade button, or the read-only note) clear of the home indicator.
    scroll: { paddingBottom: t.layout.scrollGutter },
    body: { padding: t.space.x3 },
    loadingBox: { alignItems: "center", paddingVertical: t.space.x5, gap: t.space.xl },
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
    // The payments group's switch rows: label left, the platform switch right, at the
    // tap floor so the whole row reads as one control.
    switchRow: { flexDirection: "row", alignItems: "center", gap: t.space.md, minHeight: t.tapMin, marginTop: t.space.sm },
    switchLabel: { flex: 1, fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.text },
    deviceHead: {
      fontSize: t.type.body, fontWeight: "800", color: t.color.textSubtle, letterSpacing: 0.3,
      marginHorizontal: t.space.x3, marginTop: t.space.x3, marginBottom: t.space.xs,
    },
    entryRow: {
      flexDirection: "row", alignItems: "center", gap: t.space.xl, minHeight: t.tapMin,
      backgroundColor: t.color.surface, borderRadius: t.radius.card, borderWidth: 1,
      borderColor: t.color.borderSoft, paddingHorizontal: t.space.xxl, paddingVertical: t.space.lg,
      marginHorizontal: t.space.x3, marginTop: t.space.x3,
    },
    entryLabel: { flex: 1, fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.text },
    formHead: {
      fontSize: t.type.body, fontWeight: "800", color: t.color.textSubtle, letterSpacing: 0.3,
      marginBottom: t.space.md,
    },
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
      backgroundColor: t.color.surfaceAlt, padding: t.space.xs, gap: t.space.xs,
    },
    segment: {
      flex: 1, minHeight: t.tapMin, borderRadius: t.radius.md,
      alignItems: "center", justifyContent: "center", paddingHorizontal: t.space.md,
    },
    segmentOn: {
      backgroundColor: t.color.surface,
      shadowColor: t.elevation.shadowColor, shadowOpacity: t.elevation.shadowOpacity,
      shadowRadius: t.elevation.shadowRadius, shadowOffset: t.elevation.shadowOffset, elevation: t.elevation.elevation,
    },
    segmentText: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.textMuted },
    segmentTextOn: { color: t.color.text },
    // The server-address diagnostic, moved off the operator's main screen.
    diagCard: { marginHorizontal: t.space.x3, marginTop: t.space.md, paddingHorizontal: t.space.xxl, paddingVertical: t.space.md },
    diagText: { fontSize: t.type.body, color: t.color.textSubtle, fontWeight: "600" },

    saveBtn: {
      minHeight: t.tapMin, borderRadius: t.radius.xl, backgroundColor: t.color.primaryFill,
      borderWidth: 1, borderColor: t.color.primary, alignItems: "center", justifyContent: "center",
    },
    saveBusy: { opacity: 0.6 },
    saveText: { color: t.color.onPrimaryFill, fontSize: t.type.subhead, fontWeight: "900" },
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
      backgroundColor: t.color.primaryFill, borderWidth: 1, borderColor: t.color.primary,
      alignItems: "center", justifyContent: "center", alignSelf: "stretch",
    },
    messageBtnText: { color: t.color.onPrimaryFill, fontSize: t.type.bodyLg, fontWeight: "800" },

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
