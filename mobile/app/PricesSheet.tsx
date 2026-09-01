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
import { useMemo, useState } from "react";
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
import { useTheme, type ThemeTokens } from "./theme";
import { SheetHeader } from "./SheetHeader";

function makeTone(t: ThemeTokens): Record<PriceTone, { bg: string; fg: string; badge: string }> {
  return {
    // Only two of these are about a fault, and neither is coloured like an alarm.
    ready: { bg: t.color.infoAltBg, fg: t.color.infoAltFg, badge: t.color.infoStrong },
    readonly: { bg: t.color.neutralBg, fg: t.color.neutralFg, badge: t.color.textSubtle },
    empty: { bg: t.color.neutralBg, fg: t.color.neutralFg, badge: t.color.textSubtle },
    session: { bg: t.color.warningBg, fg: t.color.warningFg, badge: t.color.warning },
    forbidden: { bg: t.color.neutralBg, fg: t.color.neutralFg, badge: t.color.textSubtle },
    offline: { bg: t.color.neutralBg, fg: t.color.neutralFg, badge: t.color.textSubtle },
    server: { bg: t.color.neutralBg, fg: t.color.neutralFg, badge: t.color.textSubtle },
    saved: { bg: t.color.successAltBg, fg: t.color.successAltFg, badge: t.color.successStrong },
    /*
     * AMBER, AND NOT GREEN. `stale` is "saved on the server, old on this phone",
     * which is the one outcome on this screen that can still cost money — the
     * next bill written here would be priced from the old number and stamped with
     * the new one. Colouring it like `saved` is exactly the collapse
     * lessons/correct-classification-can-still-render-as-an-error.md is about.
     */
    stale: { bg: t.color.warningBg, fg: t.color.warningFg, badge: t.color.warning },
  };
}

/** Which tier is open in the editor. Null means the list is on screen. */
interface Editing {
  readonly productId: string;
  /** The tier CODE — the write's path parameter (PUT /products/{id}/prices/{grade}). */
  readonly grade: string;
  /** The tier NAME — display only (F3). What the operator reads in the editor. */
  readonly name: string;
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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [editing, setEditing] = useState<Editing | null>(null);

  const tone = makeTone(t)[screen.tone];

  return (
    <View style={styles.fill}>
      <SheetHeader title="ราคารับซื้อ" onClose={onClose} />

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
                  name: tier.name,
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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.product}>
      <Text style={styles.code}>{product.code}</Text>
      <Text style={styles.name}>{product.name}</Text>
      {product.tiers.map((t) => (
        <View key={t.grade} style={styles.tier}>
          {/* The tier NAME (F3), not its code — the shop reads its own names. */}
          <Text style={styles.grade}>{t.name}</Text>
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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
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
      <Text style={styles.editorGrade}>เกรด {editing.name}</Text>
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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <Pressable style={styles.actionBtn} onPress={onPress}>
      <Text style={styles.actionText}>{action.label}</Text>
    </Pressable>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.color.surface },
    notice: { paddingHorizontal: t.space.x3, paddingVertical: t.space.xl, gap: t.space.xs },
    badge: { fontSize: t.type.bodyLg, fontWeight: "700" },
    noticeLine: { fontSize: t.type.bodyLg, lineHeight: 20 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.xl },
    loading: { fontSize: t.type.bodyLg, color: t.color.neutralFg },
    list: { padding: t.space.x3, gap: t.space.x3 },
    product: { gap: t.space.xs, borderBottomWidth: 1, borderBottomColor: t.color.divider, paddingBottom: t.space.xl },
    code: { fontSize: t.type.body, color: t.color.textSubtle },
    name: { fontSize: t.type.subhead, fontWeight: "600", color: t.color.text },
    tier: { flexDirection: "row", alignItems: "center", gap: t.space.xl, paddingVertical: t.space.xs },
    // A tier NAME is the shop's own text (F3), up to 100 chars of Thai — NOT the
    // one glyph the fixed `width: 24` assumed (that truncated the moment a shop used
    // a real name). It sizes to its content and is allowed to shrink and wrap
    // (flexShrink, which RN defaults to 0) so the price beside it is never pushed
    // off-screen — no raw min-size, which prove:tapaudit forbids in the screens. P1.24.
    grade: { fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.neutralFg, flexShrink: 1 },
    price: { fontSize: t.type.subhead, color: t.color.text, flex: 1 },
    unpriced: { fontSize: t.type.bodyLg, color: t.color.warning, flex: 1 },
    editBtn: { paddingHorizontal: t.space.lg, paddingVertical: t.space.sm, backgroundColor: t.color.surface, borderWidth: 1, borderColor: t.color.borderSoft, borderRadius: t.radius.sm },
    editText: { fontSize: t.type.bodyLg, color: t.color.primary },
    editor: { flex: 1, padding: t.space.x3, gap: t.space.xl },
    editorGrade: { fontSize: t.type.subhead, fontWeight: "700", color: t.color.text },
    input: {
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space.xl,
      paddingVertical: t.space.lg,
      fontSize: t.type.titleLg,
    },
    error: { fontSize: t.type.bodyLg, color: t.color.danger },
    editorActions: { flexDirection: "row", gap: t.space.xl },
    cancelBtn: { paddingHorizontal: t.space.x3, paddingVertical: t.space.xl },
    cancelText: { fontSize: t.type.subhead, color: t.color.neutralFg },
    // A1 (P1.23 item 3 phase D): the primary action is the app's ONE accent (teal),
    // not info-blue — the same save button the other screens use.
    saveBtn: {
      paddingHorizontal: t.space.x3,
      paddingVertical: t.space.xl,
      backgroundColor: t.color.primary,
      borderRadius: t.radius.md,
    },
    saveBtnOff: { backgroundColor: t.color.placeholder },
    saveText: { fontSize: t.type.subhead, color: t.color.onPrimary, fontWeight: "700" },
    actions: {
      flexDirection: "row",
      gap: t.space.xl,
      padding: t.space.x3,
      borderTopWidth: 1,
      borderTopColor: t.color.borderSoft,
    },
    actionBtn: {
      paddingHorizontal: t.space.x3,
      paddingVertical: t.space.xl,
      backgroundColor: t.color.borderSoft,
      borderRadius: t.radius.md,
    },
    actionText: { fontSize: t.type.subhead, color: t.color.text },
  });
}
