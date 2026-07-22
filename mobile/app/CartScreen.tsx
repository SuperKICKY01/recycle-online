/**
 * The cart: many line items on ONE bill, with the draft persisted as it is
 * edited.
 *
 * Designed for the yard, not for a desk — outdoors, one-handed, dirty hands.
 * Concretely that means: every tappable thing is at least TAP_MIN tall, the
 * numbers that carry money are large, and the running total plus the line count
 * live in a bar pinned to the bottom of the screen so they are readable without
 * scrolling, whatever is on screen above.
 *
 * DELETE IS UNDOABLE, CLEAR-ALL IS CONFIRMED. Deliberately not the same:
 * a confirm dialog on every line delete is tapped through reflexively within a
 * day — it trains the habit that defeats it, and costs an extra tap on every
 * legitimate delete. Undo costs nothing in the normal case and still recovers
 * the accident. Clearing the whole cart is rare, and losing ten lines is not
 * something an undo banner should be the only guard for, so that one asks.
 *
 * Money is never a JS number here; every value is a decimal string from
 * src/money via src/cart.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  addLine,
  buildLine,
  cartTotal,
  orderedLines,
  removeLine,
  replaceLine,
  restoreLine,
  clearLines,
} from "../src/cart/cart";
import type { LineField } from "../src/cart/cart";
import type { Draft, DraftLine } from "../src/cart/types";
import { emptyForm } from "../src/cart/types";
import type { Product, Seller } from "./api";
import { listPriceFor } from "./api";
import { messageFor } from "./messages";
import type { LineErrorCode } from "./messages";

const TAP_MIN = 56;
const UNDO_MS = 8000;

interface Props {
  products: Product[];
  seller: Seller;
  draft: Draft;
  busy: boolean;
  newLineId: () => string;
  nowIso: () => string;
  /** `immediate` writes through at once; otherwise the caller may debounce. */
  onDraftChange: (next: Draft, immediate: boolean) => void;
  onSubmit: () => void;
}

export function CartScreen({
  products,
  seller,
  draft,
  busy,
  newLineId,
  nowIso,
  onDraftChange,
  onSubmit,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [undo, setUndo] = useState<DraftLine | null>(null);
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

  const setForm = (patch: Partial<typeof form>): void => {
    onDraftChange({ ...draft, form: { ...form, ...patch }, updated_at: nowIso() }, false);
  };

  const selectProduct = (p: Product): void => {
    // Price defaults from the seller's grade tier but stays editable.
    setForm({ product_id: p.id, price: listPriceFor(p, seller.grade) ?? "" });
  };

  /** The single source of truth for "is this line valid" — same code the proof runs. */
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

  const commitLine = (): void => {
    setTouched(true);
    if (!candidate.ok) return;
    const next =
      editingId === null
        ? addLine(draft, { ...candidate.line, id: newLineId() }, nowIso())
        : replaceLine(draft, editingId, candidate.line, nowIso());
    onDraftChange({ ...next, form: emptyForm() }, true);
    setEditingId(null);
    setTouched(false);
  };

  const startEdit = (l: DraftLine): void => {
    setEditingId(l.id);
    setTouched(false);
    onDraftChange(
      {
        ...draft,
        form: {
          product_id: l.product_id,
          gross: l.gross_weight,
          tare: l.tare_weight,
          price: l.unit_price,
        },
        updated_at: nowIso(),
      },
      true,
    );
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setTouched(false);
    onDraftChange({ ...draft, form: emptyForm(), updated_at: nowIso() }, true);
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
    // restoreLine puts it back at its original seq, so the order is unchanged.
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
            setEditingId(null);
            setUndo(null);
          },
        },
      ],
    );
  };

  const canSave = lines.length > 0 && !busy;

  return (
    <View style={styles.fill}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollBody}
        keyboardShouldPersistTaps="handled"
      >
        {/* ------------------------------------------------- entry form -- */}
        <Text style={styles.section}>
          {editingId === null ? "เพิ่มรายการ" : "แก้ไขรายการ"}
        </Text>

        <Text style={styles.label}>สินค้า</Text>
        {products.map((p) => {
          const active = p.id === form.product_id;
          return (
            <Pressable
              key={p.id}
              style={[styles.product, active && styles.productActive]}
              onPress={() => selectProduct(p)}
              disabled={busy}
            >
              <Text style={[styles.productName, active && styles.onDark]}>{p.name}</Text>
              <Text style={[styles.productMeta, active && styles.onDark]}>
                {p.code} · {listPriceFor(p, seller.grade) ?? "-"} บาท/{p.uom_code}
              </Text>
            </Pressable>
          );
        })}
        {errorFor("product") ? <Text style={styles.err}>{errorFor("product")}</Text> : null}

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>น้ำหนักรวม</Text>
            <TextInput
              style={styles.input}
              value={form.gross}
              onChangeText={(v) => setForm({ gross: v })}
              keyboardType="decimal-pad"
              placeholder="0.000"
              editable={!busy}
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>น้ำหนักภาชนะ</Text>
            <TextInput
              style={styles.input}
              value={form.tare}
              onChangeText={(v) => setForm({ tare: v })}
              keyboardType="decimal-pad"
              placeholder="0.000"
              editable={!busy}
            />
          </View>
        </View>
        {errorFor("gross") ? <Text style={styles.err}>{errorFor("gross")}</Text> : null}
        {errorFor("tare") ? <Text style={styles.err}>{errorFor("tare")}</Text> : null}

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>น้ำหนักสุทธิ</Text>
            <Text style={styles.computed}>
              {candidate.ok ? candidate.line.net_weight : "—"}
            </Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>ราคา/หน่วย</Text>
            <TextInput
              style={styles.input}
              value={form.price}
              onChangeText={(v) => setForm({ price: v })}
              keyboardType="decimal-pad"
              placeholder="0.00"
              editable={!busy}
            />
          </View>
        </View>
        {errorFor("price") ? <Text style={styles.err}>{errorFor("price")}</Text> : null}
        {listPrice !== null && form.price !== "" && form.price !== listPrice ? (
          <Text style={styles.note}>ราคาถูกแก้จากราคาตามเกรด ({listPrice})</Text>
        ) : null}

        <Text style={styles.label}>เป็นเงิน</Text>
        <Text style={styles.lineAmount}>{candidate.ok ? candidate.line.amount : "—"}</Text>

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

        {/* ----------------------------------------------------- lines -- */}
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

      {/* ------------------------------------------------ undo banner -- */}
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

      {/* --------- pinned summary: never scrolls out of sight ---------- */}
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollBody: { padding: 16, paddingBottom: 32 },

  section: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginTop: 8 },
  label: { marginTop: 12, fontSize: 13, fontWeight: "700", color: "#475569" },
  row: { flexDirection: "row", gap: 12 },
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

  input: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, paddingHorizontal: 14,
    height: TAP_MIN, fontSize: 26, fontWeight: "700", backgroundColor: "#fff",
    marginTop: 6, color: "#0f172a",
  },
  computed: {
    height: TAP_MIN, marginTop: 6, fontSize: 26, fontWeight: "800",
    color: "#0f172a", textAlignVertical: "center", lineHeight: TAP_MIN,
  },
  lineAmount: { fontSize: 34, fontWeight: "900", color: "#0f766e", marginTop: 4 },

  err: { color: "#b91c1c", fontSize: 13, marginTop: 6, fontWeight: "600" },
  note: { color: "#b45309", fontSize: 13, marginTop: 6 },
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
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff",
    borderTopWidth: 1, borderTopColor: "#e2e8f0",
  },
  totalLabel: { fontSize: 13, color: "#64748b", fontWeight: "700" },
  totalValue: { fontSize: 34, fontWeight: "900", color: "#0f172a" },
  saveBtn: {
    minHeight: TAP_MIN, paddingHorizontal: 28, borderRadius: 12,
    backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center",
  },
  saveText: { color: "#fff", fontWeight: "900", fontSize: 18 },
});
