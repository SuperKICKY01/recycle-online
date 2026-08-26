/**
 * THE SHOP'S OWN PRICE LIST — and the only screen in this app that MOVES it.
 *
 * P1.9. Presentation only. This file decides NOTHING: what is shown, in what
 * order, with what wording, whether a tier may be edited at all, and what a
 * failed save is called all come from `src/master/priceEdit.ts`, where a
 * headless proof can reach them. Same move and same reason as DailyScreen,
 * StatusStrip and BillsPanel — every operator-facing sentence that ever shipped
 * wrong on this project was one that lived under `app/` and no proof could see
 * (lessons/correct-classification-can-still-render-as-an-error.md).
 *
 * THE LAYOUT IS AN ARGUMENT ABOUT WHAT MUST NOT BE MISREAD:
 *
 *   1. THE PRODUCT AND ITS FOUR TIERS TOGETHER, on one row group. A price is
 *      meaningless without the grade it belongs to, and a screen that lets the
 *      eye slide from one product's A to another's B is a screen that sets the
 *      wrong number.
 *   2. AN UNPRICED TIER SAYS SO IN WORDS, never with a dash and never with a
 *      zero. `ยังไม่ได้ตั้งราคา` is longer than "—" on purpose: a dash reads as
 *      a formatting choice, and this is a fact about the shop.
 *   3. THE EDITOR IS ONE TIER AT A TIME, matching the route
 *      (PUT /products/{id}/prices/{grade}). Four boxes and one save button
 *      would present four independent writes as one act, and a partial failure
 *      would then have nowhere honest to land.
 *   4. THE OUTCOME REPLACES THE LIST rather than sitting under it. After a save
 *      the one thing that matters is whether THIS DEVICE now holds the new
 *      number, and that sentence must not be scrolled to.
 *
 * NO MODAL ELEMENT AND NO `visible` PROP. This app has one Modal —
 * app/SheetHost — and the sheet stack decides which sheet is inside it. A
 * second one anywhere reintroduces the presentation defect SheetHost's header
 * describes, and `npm run prove:sheets` goes red the moment one appears in this
 * directory.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { messageFor } from "./messages";
import {
  EDIT_TIER_LABEL,
  editableValue,
  parseTierPrice,
  SAVE_TIER_LABEL,
} from "../src/master/priceEdit";
import type {
  PriceAction,
  PriceProduct,
  PriceScreen,
  PriceTone,
  TierPrice,
} from "../src/master/priceEdit";
import type { FieldError } from "../src/money/money";

const TONE: Record<PriceTone, { bg: string; fg: string; badge: string }> = {
  // Only two of these are about a fault, and neither is coloured like an alarm.
  ready: { bg: "#eff6ff", fg: "#1e3a5f", badge: "#1d4ed8" },
  readonly: { bg: "#f1f5f9", fg: "#334155", badge: "#64748b" },
  empty: { bg: "#f1f5f9", fg: "#334155", badge: "#64748b" },
  session: { bg: "#fef3c7", fg: "#78350f", badge: "#b45309" },
  forbidden: { bg: "#f1f5f9", fg: "#334155", badge: "#64748b" },
  offline: { bg: "#f1f5f9", fg: "#334155", badge: "#64748b" },
  server: { bg: "#f1f5f9", fg: "#334155", badge: "#64748b" },
  saved: { bg: "#ecfdf5", fg: "#065f46", badge: "#047857" },
  /*
   * AMBER, AND NOT GREEN. `stale` is "saved on the server, old on this phone",
   * which is the one outcome on this screen that can still cost money — the
   * next bill written here would be priced from the old number and stamped with
   * the new one. Colouring it like `saved` is exactly the collapse
   * lessons/correct-classification-can-still-render-as-an-error.md is about.
   */
  stale: { bg: "#fef3c7", fg: "#78350f", badge: "#b45309" },
};

/** Which tier is open in the editor. Null means the list is on screen. */
interface Editing {
  readonly productId: string;
  readonly grade: string;
  readonly value: string;
}

interface Props {
  /** The list, or the outcome of the save just made. Never both. */
  screen: PriceScreen;
  /** True while a write is in flight, so a spinner is a state and not a guess. */
  busy: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  /** Drop the outcome and show the LIST again, so four tiers are four taps. */
  onBack: () => void;
  /** The one write. The price is a STRING and stays one, all the way down. */
  onSave: (productId: string, grade: string, price: string) => void;
}

export function PricesSheet({
  screen,
  busy,
  onClose,
  onRetry,
  onSignIn,
  onBack,
  onSave,
}: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);

  const tone = TONE[screen.tone];

  return (
    <View style={styles.fill}>
      <View style={styles.head}>
        <Text style={styles.title}>ราคารับซื้อ</Text>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>ปิด</Text>
        </Pressable>
      </View>

      <View style={[styles.notice, { backgroundColor: tone.bg }]}>
        <Text style={[styles.badge, { color: tone.badge }]}>{screen.badge}</Text>
        {screen.lines.map((line, i) => (
          <Text key={`${String(i)}:${line}`} style={[styles.noticeLine, { color: tone.fg }]}>
            {line}
          </Text>
        ))}
      </View>

      {busy ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loading}>กำลังบันทึกราคา…</Text>
        </View>
      ) : editing !== null ? (
        <TierEditor
          editing={editing}
          onChange={(value) => setEditing({ ...editing, value })}
          onCancel={() => setEditing(null)}
          onSave={(price) => {
            setEditing(null);
            onSave(editing.productId, editing.grade, price);
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {screen.products.map((p) => (
            <ProductRows
              key={p.id}
              product={p}
              editable={screen.editable}
              onEdit={(tier) =>
                setEditing({
                  productId: p.id,
                  grade: tier.grade,
                  // NEVER a default: the current value, or empty. See editableValue.
                  value: editableValue(tier),
                })
              }
            />
          ))}
        </ScrollView>
      )}

      <View style={styles.actions}>
        {screen.actions.map((a) => (
          <ActionButton
            key={a.kind}
            action={a}
            onPress={() => {
              if (a.kind === "close") onClose();
              else if (a.kind === "retry") onRetry();
              else if (a.kind === "sign_in") onSignIn();
              else onBack();
            }}
          />
        ))}
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- rows ---- */

/**
 * ONE PRODUCT AND ITS TIERS.
 *
 * `editable` gates the per-tier control and nothing else — the prices are shown
 * either way, because the yard already sees them at every weighing and hiding a
 * list somebody can read on the cart screen would buy nothing. What a staff
 * session does not get is the ACTION, which is the distinction
 * src/session/deviceRole.ts argues at `mayEditPrices`.
 */
function ProductRows({
  product,
  editable,
  onEdit,
}: {
  product: PriceProduct;
  editable: boolean;
  onEdit: (tier: TierPrice) => void;
}) {
  return (
    <View style={styles.product}>
      <Text style={styles.code}>{product.code}</Text>
      <Text style={styles.name}>{product.name}</Text>
      {product.tiers.map((t) => (
        <View key={t.grade} style={styles.tier}>
          <Text style={styles.grade}>{t.grade}</Text>
          {/*
            THE PRICE, OR THE ABSENCE OF ONE — as a sentence, never as a dash and
            never as a zero. `t.price` is rendered in a Text node with no
            formatter, no separator and no toFixed: the string the server sent.
            Hard rule 1, and the same discipline DailyScreen states for the total.
          */}
          {t.price === null ? (
            <Text style={styles.unpriced}>ยังไม่ได้ตั้งราคา</Text>
          ) : (
            <Text style={styles.price}>{t.price}</Text>
          )}
          {editable ? (
            <Pressable style={styles.editBtn} onPress={() => onEdit(t)}>
              <Text style={styles.editText}>{EDIT_TIER_LABEL}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------- editor ---- */

/**
 * ONE TIER, ONE BOX, ONE WRITE.
 *
 * THE SAVE CONTROL IS DISABLED UNTIL THE VALUE PARSES, and the reason it is
 * disabled rather than validated on press is the column: `numeric(14,2)` ROUNDS
 * an over-scale value instead of refusing it
 * (lessons/edge-must-reject-what-the-column-rounds.md), so `1.005` typed here
 * and sent would come back as `1.01` — a price nobody chose, on every bill from
 * then on. `parseTierPrice` carries the column's own bound, and the server
 * declares the same one, so a value this box refuses is a value that could
 * never have been stored as typed.
 *
 * The error text is `messages.ts`, which already maps every `FieldError` the
 * money module produces — the numpad and this box therefore say the same thing
 * about the same value, and neither writes a sentence of its own.
 */
function TierEditor({
  editing,
  onChange,
  onCancel,
  onSave,
}: {
  editing: Editing;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: (price: string) => void;
}) {
  const parsed = parseTierPrice(editing.value);
  /*
   * `empty` is not shown as an error. An empty box is where the operator STARTS
   * on an unpriced tier, and telling them off for not having typed yet reads as
   * a fault in the screen. It still blocks the save, because `parsed.ok` is
   * false — the refusal is real, only the accusation is withheld.
   */
  const complaint: FieldError | null =
    parsed.ok || editing.value.trim() === "" ? null : parsed.error;

  return (
    <View style={styles.editor}>
      <Text style={styles.editorGrade}>เกรด {editing.grade}</Text>
      <TextInput
        style={styles.input}
        value={editing.value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        autoFocus
        placeholder="ราคาต่อหน่วย"
      />
      {complaint === null ? null : <Text style={styles.error}>{messageFor(complaint)}</Text>}
      <View style={styles.editorActions}>
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>ยกเลิก</Text>
        </Pressable>
        <Pressable
          style={[styles.saveBtn, parsed.ok ? null : styles.saveBtnOff]}
          disabled={!parsed.ok}
          /*
            THE NORMALISED VALUE, not the raw text. `parseTierPrice` returns the
            string at fixed scale, so "15.5" and "15.50" leave this screen as one
            value and the wire never carries a shape the column has to decide
            about.
          */
          onPress={() => {
            if (parsed.ok) onSave(parsed.value);
          }}
        >
          <Text style={styles.saveText}>{SAVE_TIER_LABEL}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The button's LABEL arrives with its KIND, exactly like DailyScreen's and
 * StatusStrip's, so "ลองอีกครั้ง" cannot end up wired to the sign-in.
 */
function ActionButton({ action, onPress }: { action: PriceAction; onPress: () => void }) {
  return (
    <Pressable style={styles.actionBtn} onPress={onPress}>
      <Text style={styles.actionText}>{action.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#fff" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  title: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  closeBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  closeText: { fontSize: 16, color: "#1d4ed8" },
  notice: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  badge: { fontSize: 15, fontWeight: "700" },
  noticeLine: { fontSize: 14, lineHeight: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loading: { fontSize: 15, color: "#334155" },
  list: { padding: 16, gap: 16 },
  product: { gap: 4, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", paddingBottom: 12 },
  code: { fontSize: 13, color: "#64748b" },
  name: { fontSize: 17, fontWeight: "600", color: "#0f172a" },
  tier: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  grade: { fontSize: 15, fontWeight: "700", color: "#334155", width: 24 },
  price: { fontSize: 17, color: "#0f172a", flex: 1 },
  unpriced: { fontSize: 14, color: "#b45309", flex: 1 },
  editBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#eff6ff", borderRadius: 6 },
  editText: { fontSize: 14, color: "#1d4ed8" },
  editor: { flex: 1, padding: 16, gap: 12 },
  editorGrade: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 22,
  },
  error: { fontSize: 14, color: "#b91c1c" },
  editorActions: { flexDirection: "row", gap: 12 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 12 },
  cancelText: { fontSize: 16, color: "#334155" },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
  },
  saveBtnOff: { backgroundColor: "#94a3b8" },
  saveText: { fontSize: 16, color: "#fff", fontWeight: "700" },
  actions: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#e2e8f0",
    borderRadius: 8,
  },
  actionText: { fontSize: 16, color: "#0f172a" },
});
