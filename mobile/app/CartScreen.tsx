/**
 * The cart: many line items on ONE bill, with the draft persisted as it is
 * edited, and (Phase 2c-4) entry-screen safety around the fields themselves.
 *
 * Designed for the yard, not for a desk — outdoors, one-handed, dirty hands.
 * Every tappable thing is at least TAP_MIN tall, the numbers that carry money
 * are large, and the running total plus the line count live in a bar pinned to
 * the bottom so they are readable without scrolling.
 *
 * DELETE IS UNDOABLE, CLEAR-ALL IS CONFIRMED. Deliberately not the same:
 * a confirm dialog on every line delete is tapped through reflexively within a
 * day — it trains the habit that defeats it, and costs an extra tap on every
 * legitimate delete. Undo costs nothing in the normal case and still recovers
 * the accident. Clearing the whole cart is rare, and losing ten lines is not
 * something an undo banner should be the only guard for, so that one asks.
 *
 * ENTRY SAFETY (2c-4): changing product clears the stale weights, tare and
 * price can be locked to survive that, gross can never be, and all numeric
 * entry goes through the in-app pad rather than the OS keyboard. The rules
 * themselves live in src/cart/entry.ts and are proven headless.
 *
 * Money is never a JS number here; every value is a decimal string.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  addLine,
  buildLine,
  cartTotal,
  clearLines,
  orderedLines,
  removeLine,
  replaceLine,
  restoreLine,
} from "../src/cart/cart";
import type { LineField } from "../src/cart/cart";
import {
  afterLineCommitted,
  applyKey,
  onProductChange,
  priceIsOffTier,
  releaseOnClear,
  toggleLock,
} from "../src/cart/entry";
import type { LockableField, Locks, NumKey } from "../src/cart/entry";
import type { Draft, DraftLine } from "../src/cart/types";
import {
  MONEY_DP,
  MONEY_MAX_INT_DIGITS,
  WEIGHT_DP,
  WEIGHT_MAX_INT_DIGITS,
} from "../src/money/money";
import type { Product, Seller } from "./api";
import { listPriceFor } from "./api";
import { messageFor } from "./messages";
import type { LineErrorCode } from "./messages";
import { Numpad } from "./Numpad";

const TAP_MIN = 56;
const UNDO_MS = 8000;

/** The three numeric fields. Only two of them appear in LockableField. */
type NumField = "gross" | "tare" | "price";

const FIELD_LABEL: Record<NumField, string> = {
  gross: "น้ำหนักรวม",
  tare: "น้ำหนักภาชนะ",
  price: "ราคา/หน่วย",
};

const FIELD_SCALE: Record<NumField, { dp: number; maxInt: number }> = {
  gross: { dp: WEIGHT_DP, maxInt: WEIGHT_MAX_INT_DIGITS },
  tare: { dp: WEIGHT_DP, maxInt: WEIGHT_MAX_INT_DIGITS },
  price: { dp: MONEY_DP, maxInt: MONEY_MAX_INT_DIGITS },
};

interface Props {
  products: Product[];
  seller: Seller;
  draft: Draft;
  locks: Locks;
  busy: boolean;
  newLineId: () => string;
  nowIso: () => string;
  onDraftChange: (next: Draft, immediate: boolean) => void;
  onLocksChange: (next: Locks) => void;
  onSubmit: () => void;
}

export function CartScreen({
  products,
  seller,
  draft,
  locks,
  busy,
  newLineId,
  nowIso,
  onDraftChange,
  onLocksChange,
  onSubmit,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [undo, setUndo] = useState<DraftLine | null>(null);
  const [active, setActive] = useState<NumField | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = draft.form;
  const lines = orderedLines(draft);
  const total = cartTotal(draft);

  const product = products.find((p) => p.id === form.product_id) ?? null;
  const listPrice = product ? listPriceFor(product, seller.grade) : null;

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const putForm = (next: typeof form, immediate = false): void => {
    onDraftChange({ ...draft, form: next, updated_at: nowIso() }, immediate);
  };

  /**
   * Product changed. The stale-weight rule lives in entry.onProductChange —
   * gross always clears, tare survives only if locked, price re-defaults to the
   * new tier unless locked.
   */
  const selectProduct = (p: Product): void => {
    putForm(
      onProductChange(form, locks, {
        productId: p.id,
        listPrice: listPriceFor(p, seller.grade) ?? "",
      }),
      true,
    );
  };

  const candidate = useMemo(
    () =>
      buildLine({
        id: editingId ?? "pending",
        product_id: form.product_id ?? "",
        product_code: product?.code ?? "",
        product_name: product?.name ?? "",
        uom_code: product?.uom_code ?? "",
        gross: form.gross,
        tare: form.tare,
        price: form.price,
        list_price: listPrice ?? form.price,
      }),
    [editingId, form, product, listPrice],
  );

  const errorFor = (field: LineField): string | null => {
    if (!touched) return null;
    if (candidate.ok || candidate.field !== field) return null;
    return messageFor(candidate.error as LineErrorCode);
  };

  const pressKey = (key: NumKey): void => {
    if (active === null) return;
    const { dp, maxInt } = FIELD_SCALE[active];
    putForm({ ...form, [active]: applyKey(form[active], key, dp, maxInt) });
  };

  const commitLine = (): void => {
    setTouched(true);
    if (!candidate.ok) return;
    const next =
      editingId === null
        ? addLine(draft, { ...candidate.line, id: newLineId() }, nowIso())
        : replaceLine(draft, editingId, candidate.line, nowIso());
    // Locked fields carry to the next line; everything else resets.
    onDraftChange({ ...next, form: afterLineCommitted(form, locks) }, true);
    setEditingId(null);
    setTouched(false);
    setActive(null);
  };

  const startEdit = (l: DraftLine): void => {
    setEditingId(l.id);
    setTouched(false);
    setActive(null);
    putForm(
      {
        product_id: l.product_id,
        gross: l.gross_weight,
        tare: l.tare_weight,
        price: l.unit_price,
      },
      true,
    );
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setTouched(false);
    setActive(null);
    putForm(afterLineCommitted(form, locks), true);
  };

  const deleteLine = (l: DraftLine): void => {
    if (editingId === l.id) cancelEdit();
    onDraftChange(removeLine(draft, l.id, nowIso()), true);
    setUndo(l);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };

  const undoDelete = (): void => {
    if (undo === null) return;
    onDraftChange(restoreLine(draft, undo, nowIso()), true);
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  };

  const confirmClear = (): void => {
    Alert.alert(
      "ล้างรายการทั้งหมด",
      `ลบทั้ง ${String(lines.length)} รายการออกจากบิลนี้? ย้อนกลับไม่ได้`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ล้างทั้งหมด",
          style: "destructive",
          onPress: () => {
            onDraftChange(clearLines(draft, nowIso()), true);
            onLocksChange(releaseOnClear()); // locks end with the bill
            setEditingId(null);
            setUndo(null);
            setActive(null);
          },
        },
      ],
    );
  };

  const canSave = lines.length > 0 && !busy;
  const offTier = priceIsOffTier(form.price, listPrice);

  return (
    <View style={styles.fill}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollBody}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.section}>
          {editingId === null ? "เพิ่มรายการ" : "แก้ไขรายการ"}
        </Text>

        <Text style={styles.label}>สินค้า</Text>
        {products.map((p) => {
          const isOn = p.id === form.product_id;
          return (
            <Pressable
              key={p.id}
              style={[styles.product, isOn && styles.productActive]}
              onPress={() => selectProduct(p)}
              disabled={busy}
            >
              <Text style={[styles.productName, isOn && styles.onDark]}>{p.name}</Text>
              <Text style={[styles.productMeta, isOn && styles.onDark]}>
                {p.code} · {listPriceFor(p, seller.grade) ?? "-"} บาท/{p.uom_code}
              </Text>
            </Pressable>
          );
        })}
        {errorFor("product") ? <Text style={styles.err}>{errorFor("product")}</Text> : null}

        {/*
          gross passes NO `lockable` prop, so no lock control is rendered for it
          — the UI mirrors the type, where LockableField has no "gross" member.
        */}
        <NumericField
          field="gross"
          value={form.gross}
          active={active === "gross"}
          onPress={() => setActive("gross")}
          disabled={busy}
        />
        {errorFor("gross") ? <Text style={styles.err}>{errorFor("gross")}</Text> : null}

        <NumericField
          field="tare"
          value={form.tare}
          active={active === "tare"}
          lockable="tare"
          locked={locks.tare}
          onToggleLock={() => onLocksChange(toggleLock(locks, "tare"))}
          onPress={() => setActive("tare")}
          disabled={busy}
        />
        {errorFor("tare") ? <Text style={styles.err}>{errorFor("tare")}</Text> : null}

        <NumericField
          field="price"
          value={form.price}
          active={active === "price"}
          lockable="price"
          locked={locks.price}
          onToggleLock={() => onLocksChange(toggleLock(locks, "price"))}
          onPress={() => setActive("price")}
          disabled={busy}
        />
        {errorFor("price") ? <Text style={styles.err}>{errorFor("price")}</Text> : null}
        {offTier ? (
          <Text style={styles.note}>
            ราคาถูกแก้จากราคาตามเกรด ({listPrice})
            {locks.price ? " — ราคานี้ค้างไว้จากสินค้าก่อนหน้า ตรวจสอบก่อนบันทึก" : ""}
          </Text>
        ) : null}

        <View style={styles.readRow}>
          <View style={styles.col}>
            <Text style={styles.label}>น้ำหนักสุทธิ</Text>
            <Text style={styles.computed}>
              {candidate.ok ? candidate.line.net_weight : "—"}
            </Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>เป็นเงิน</Text>
            <Text style={styles.lineAmount}>
              {candidate.ok ? candidate.line.amount : "—"}
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <Pressable
            style={[styles.addBtn, styles.grow, !candidate.ok && styles.dim]}
            onPress={commitLine}
            disabled={busy}
          >
            <Text style={styles.addText}>
              {editingId === null ? "เพิ่มลงบิล" : "อัปเดตรายการ"}
            </Text>
          </Pressable>
          {editingId !== null ? (
            <Pressable style={styles.cancelBtn} onPress={cancelEdit}>
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </Pressable>
          ) : null}
        </View>

        {lines.length > 0 ? (
          <View style={styles.linesHead}>
            <Text style={styles.section}>รายการในบิล ({lines.length})</Text>
            <Pressable onPress={confirmClear} style={styles.clearBtn} disabled={busy}>
              <Text style={styles.clearText}>ล้างทั้งหมด</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.empty}>ยังไม่มีรายการในบิลนี้</Text>
        )}

        {lines.map((l, i) => (
          <View key={l.id} style={[styles.line, editingId === l.id && styles.lineEditing]}>
            <View style={styles.lineTop}>
              <Text style={styles.lineNo}>{i + 1}</Text>
              <Text style={styles.lineName} numberOfLines={1}>
                {l.product_name}
              </Text>
              <Text style={styles.lineAmt}>{l.amount}</Text>
            </View>
            <Text style={styles.lineMeta}>
              {l.product_code} · สุทธิ {l.net_weight} {l.uom_code} × {l.unit_price}
              {l.unit_price !== l.list_price ? `  (เกรด ${l.list_price})` : ""}
            </Text>
            <View style={styles.lineBtns}>
              <Pressable style={styles.lineBtn} onPress={() => startEdit(l)} disabled={busy}>
                <Text style={styles.lineBtnText}>แก้ไข</Text>
              </Pressable>
              <Pressable
                style={[styles.lineBtn, styles.lineBtnDanger]}
                onPress={() => deleteLine(l)}
                disabled={busy}
              >
                <Text style={[styles.lineBtnText, styles.lineBtnDangerText]}>ลบ</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      {undo !== null ? (
        <View style={styles.undoBar}>
          <Text style={styles.undoText} numberOfLines={1}>
            ลบ {undo.product_name} ({undo.amount} บาท)
          </Text>
          <Pressable style={styles.undoBtn} onPress={undoDelete}>
            <Text style={styles.undoBtnText}>เลิกทำ</Text>
          </Pressable>
        </View>
      ) : null}

      {active !== null ? (
        <Numpad
          fieldLabel={FIELD_LABEL[active]}
          value={form[active]}
          net={candidate.ok ? candidate.line.net_weight : "—"}
          amount={candidate.ok ? candidate.line.amount : "—"}
          onKey={pressKey}
          onDone={() => setActive(null)}
        />
      ) : null}

      <View style={styles.totalBar}>
        <View>
          <Text style={styles.totalLabel}>{lines.length} รายการ</Text>
          <Text style={styles.totalValue}>{total}</Text>
        </View>
        <Pressable
          style={[styles.saveBtn, !canSave && styles.dim]}
          onPress={onSubmit}
          disabled={!canSave}
        >
          <Text style={styles.saveText}>บันทึกบิล</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * One numeric field. Rendered as Text inside a Pressable, never a TextInput —
 * that is what removes the OS keyboard and, with it, paste.
 *
 * `lockable` is typed LockableField, so a caller cannot pass "gross": the lock
 * control is unreachable for it by the same type that makes the lock state
 * unrepresentable.
 */
function NumericField({
  field,
  value,
  active,
  lockable,
  locked = false,
  onToggleLock,
  onPress,
  disabled,
}: {
  field: NumField;
  value: string;
  active: boolean;
  lockable?: LockableField;
  locked?: boolean;
  onToggleLock?: () => void;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldHead}>
        <Text style={styles.label}>{FIELD_LABEL[field]}</Text>
        {lockable !== undefined ? (
          <Pressable
            style={[styles.lockBtn, locked && styles.lockBtnOn]}
            onPress={onToggleLock}
            disabled={disabled}
          >
            <Text style={[styles.lockBtnText, locked && styles.lockBtnTextOn]}>
              {locked ? "ปลดล็อก" : "ค้างค่า"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        style={[
          styles.fieldBox,
          active && styles.fieldBoxActive,
          locked && styles.fieldBoxLocked,
        ]}
        onPress={onPress}
        disabled={disabled}
      >
        <Text style={[styles.fieldValue, value === "" && styles.fieldPlaceholder]}>
          {value === "" ? "แตะเพื่อกรอก" : value}
        </Text>
      </Pressable>

      {locked ? (
        <Text style={styles.lockHint}>
          ค้างค่าไว้ — ค่านี้จะคงอยู่เมื่อเปลี่ยนสินค้าและเมื่อเพิ่มรายการ
          แตะปุ่ม “ปลดล็อก” เพื่อยกเลิก
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollBody: { padding: 16, paddingBottom: 24 },

  section: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginTop: 8 },
  label: { fontSize: 13, fontWeight: "700", color: "#475569" },
  row: { flexDirection: "row", gap: 12 },
  readRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  col: { flex: 1 },
  grow: { flex: 1 },

  product: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 12,
    marginTop: 8, backgroundColor: "#fff", minHeight: TAP_MIN, justifyContent: "center",
  },
  productActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  productName: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  productMeta: { fontSize: 13, color: "#64748b", marginTop: 2 },
  onDark: { color: "#fff" },

  fieldBlock: { marginTop: 14 },
  fieldHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 6,
  },
  fieldBox: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, paddingHorizontal: 14,
    minHeight: TAP_MIN, backgroundColor: "#fff", justifyContent: "center",
  },
  fieldBoxActive: { borderColor: "#0f172a", borderWidth: 3 },
  // Locked: background AND border both change, so it reads at a glance in
  // daylight rather than depending on a small icon.
  fieldBoxLocked: { backgroundColor: "#fef3c7", borderColor: "#b45309", borderWidth: 3 },
  fieldValue: { fontSize: 26, fontWeight: "800", color: "#0f172a" },
  fieldPlaceholder: { color: "#94a3b8", fontSize: 18, fontWeight: "600" },

  lockBtn: {
    minHeight: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#e2e8f0",
    alignItems: "center", justifyContent: "center",
  },
  lockBtnOn: { backgroundColor: "#b45309" },
  lockBtnText: { fontSize: 14, fontWeight: "800", color: "#334155" },
  lockBtnTextOn: { color: "#fff" },
  lockHint: { fontSize: 12, color: "#78350f", marginTop: 6, fontWeight: "600" },

  computed: { fontSize: 26, fontWeight: "800", color: "#0f172a", marginTop: 4 },
  lineAmount: { fontSize: 30, fontWeight: "900", color: "#0f766e", marginTop: 4 },

  err: { color: "#b91c1c", fontSize: 13, marginTop: 6, fontWeight: "600" },
  note: { color: "#b45309", fontSize: 13, marginTop: 6, fontWeight: "600" },
  empty: { color: "#64748b", fontSize: 15, marginTop: 20, textAlign: "center" },

  addBtn: {
    marginTop: 18, minHeight: TAP_MIN, borderRadius: 12, backgroundColor: "#0f766e",
    alignItems: "center", justifyContent: "center",
  },
  addText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  cancelBtn: {
    marginTop: 18, minHeight: TAP_MIN, borderRadius: 12, paddingHorizontal: 20,
    backgroundColor: "#e2e8f0", alignItems: "center", justifyContent: "center",
  },
  cancelText: { color: "#334155", fontWeight: "700", fontSize: 16 },
  dim: { opacity: 0.4 },

  linesHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 28,
  },
  clearBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
  clearText: { color: "#b91c1c", fontWeight: "700", fontSize: 14 },

  line: {
    backgroundColor: "#fff", borderRadius: 12, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  lineEditing: { borderColor: "#0f766e", borderWidth: 2 },
  lineTop: { flexDirection: "row", alignItems: "center" },
  lineNo: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: "#0f172a", color: "#fff",
    textAlign: "center", lineHeight: 28, fontWeight: "800", fontSize: 14, overflow: "hidden",
  },
  lineName: { flex: 1, marginLeft: 10, fontSize: 17, fontWeight: "700", color: "#0f172a" },
  lineAmt: { fontSize: 22, fontWeight: "900", color: "#0f766e" },
  lineMeta: { fontSize: 13, color: "#64748b", marginTop: 6 },
  lineBtns: { flexDirection: "row", gap: 10, marginTop: 10 },
  lineBtn: {
    flex: 1, minHeight: 48, borderRadius: 10, backgroundColor: "#f1f5f9",
    alignItems: "center", justifyContent: "center",
  },
  lineBtnText: { fontWeight: "700", color: "#334155", fontSize: 15 },
  lineBtnDanger: { backgroundColor: "#fee2e2" },
  lineBtnDangerText: { color: "#b91c1c" },

  undoBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#0f172a", paddingHorizontal: 16, paddingVertical: 10,
  },
  undoText: { color: "#e2e8f0", flex: 1, fontSize: 14 },
  undoBtn: { minHeight: 44, paddingHorizontal: 16, justifyContent: "center" },
  undoBtnText: { color: "#5eead4", fontWeight: "800", fontSize: 16 },

  totalBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#fff",
    borderTopWidth: 1, borderTopColor: "#e2e8f0",
  },
  totalLabel: { fontSize: 13, color: "#64748b", fontWeight: "700" },
  totalValue: { fontSize: 30, fontWeight: "900", color: "#0f172a" },
  saveBtn: {
    minHeight: TAP_MIN, paddingHorizontal: 28, borderRadius: 12,
    backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center",
  },
  saveText: { color: "#fff", fontWeight: "900", fontSize: 18 },
});
