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
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
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
import { gradePrice, tierName } from "../src/cart/sellers";
import type { NamedTier } from "../src/cart/sellers";
import type { Draft, DraftLine } from "../src/cart/types";
import { defaultUnitPrice, stalePriceHint } from "../src/master/freshness";
import type { Freshness } from "../src/master/freshness";
import {
  MONEY_DP,
  MONEY_MAX_INT_DIGITS,
  WEIGHT_DP,
  WEIGHT_MAX_INT_DIGITS,
} from "../src/money/money";
import type { Product, Seller } from "./api";
import { messageFor } from "./messages";
import type { LineErrorCode } from "./messages";
import { Numpad } from "./Numpad";
import { useTheme, type ThemeTokens } from "./theme";
import { Icon } from "./Icon";
import { Touchable } from "./Press";
import { display } from "../src/money/format";
import {
  ALL_CATEGORIES,
  categoryChips,
  emptyListLine,
  FALLBACK_HEADING,
  filterProducts,
  FREQUENT_HEADING,
  type FrequentRow,
  SEARCH_PLACEHOLDER,
} from "../src/cart/productPicker";

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
  /**
   * Rendered at the TOP OF THE SCROLL, above the seller (A3 item 5): the last-bill card,
   * which while a bill is open scrolls away with it instead of staying pinned.
   */
  topSlot?: ReactNode;
  /** The frequent row for today, frozen in App.tsx (src/cart/productPicker.ts frequentForDay). */
  frequent?: FrequentRow | null;
  products: Product[];
  /** The shop's cached grade tiers, to show the seller's grade by its NAME (S16, F3). */
  tiers: readonly NamedTier[];
  /**
   * The bill's seller, resolved from draft.seller_id against the fetched list.
   *
   * NULLABLE (Phase 2c-6): the draft always carries a seller_id, but the id may
   * not resolve — a draft restored from before the list was fetched, or a seller
   * this token cannot see. Rendering "-" and carrying on would let the operator
   * confirm a bill without being able to check WHO it is for, so that state
   * disables entry and asks for the seller again.
   */
  seller: Seller | null;
  draft: Draft;
  locks: Locks;
  busy: boolean;
  /**
   * How old the cached master data is, and therefore whether a tier price may
   * be written into the money field at all. See src/master/freshness.ts.
   */
  freshness: Freshness;
  newLineId: () => string;
  nowIso: () => string;
  onDraftChange: (next: Draft, immediate: boolean) => void;
  onLocksChange: (next: Locks) => void;
  onPickSeller: () => void;
  onViewHistory: () => void;
  onVehicleChange: (raw: string) => void;
  onVehicleBlur: () => void;
  onSubmit: () => void;
}

export function CartScreen({
  topSlot,
  frequent = null,
  products,
  tiers,
  seller,
  draft,
  locks,
  busy,
  freshness,
  newLineId,
  nowIso,
  onDraftChange,
  onLocksChange,
  onPickSeller,
  onViewHistory,
  onVehicleChange,
  onVehicleBlur,
  onSubmit,
}: Props) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [undo, setUndo] = useState<DraftLine | null>(null);
  const [active, setActive] = useState<NumField | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A3 item 5: where the weight entry starts in the scroll, so choosing a product can
  // bring it into view (it sat below the fold, under the product list).
  const scrollRef = useRef<ScrollView>(null);
  const grossY = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  // The picker's state (cart milestone): which category chip, what is typed. View state only —
  // never part of the draft, so a restart opens on ทั้งหมด with an empty search.
  const [categoryId, setCategoryId] = useState<string>(ALL_CATEGORIES);
  const [query, setQuery] = useState("");
  const chips = useMemo(() => categoryChips(products), [products]);
  const listed = useMemo(() => filterProducts(products, categoryId, query), [products, categoryId, query]);
  // The frozen row holds IDS; a product retired since it was computed simply has no tile.
  const frequentTiles = useMemo(() => {
    const byId = new Map(products.filter((p) => p.is_active !== false).map((p) => [p.id, p]));
    return (frequent?.productIds ?? []).flatMap((id) => {
      const p = byId.get(id);
      return p ? [p] : [];
    });
  }, [products, frequent]);

  const form = draft.form;
  const lines = orderedLines(draft);
  const total = cartTotal(draft);

  const product = products.find((p) => p.id === form.product_id) ?? null;
  // No seller, or a seller with no grade, means NO default price — the field
  // stays blank and the operator types what was agreed. See src/cart/sellers.ts.
  //
  // F2 AND WHY A ONE-TIER SHOP IS NOT PRICED HERE OFFLINE (S16 / P1.24). A seller
  // created offline in a one-tier shop carries a NULL grade until it syncs; the
  // SERVER seats it in the sole active tier (master._seat_seller_grade) — that
  // seating is the server's, not this device's. Pricing this seller from the one
  // cached tier would be the phone DECIDING a tier the seating has not yet made,
  // and a price invented from a seating that has not happened is a claim about
  // master data this device does not own (lessons/cached-master-data-is-a-price-
  // claim.md). So it stays blank offline, exactly as any ungraded seller, and the
  // one-tier default arrives with the seated grade on the next refresh.
  const grade = seller?.grade ?? null;

  /*
   * TWO PRICES, AND THEY ARE NOT THE SAME QUESTION (Phase 2c-8).
   *
   * listPrice is the grade REFERENCE: what the device last heard this grade's
   * list price to be. It still comes straight from the cache however old that
   * is, because it is a comparison value shown as information — the off-tier
   * badge, line.list_price — and the server discards the client's list_price and
   * stamps its own from the current list anyway.
   *
   * priceDefault is what may be written INTO the money field with nobody
   * deciding. Past the staleness cutoff it is null and the box stays empty. The
   * yard pays cash against whatever is in that box, so it is the one of the two
   * that has to be withheld when the app cannot stand behind it.
   */
  const listPrice = product ? gradePrice(product.prices, grade) : null;
  const stale = !freshness.mayDefaultPrice;

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
        // The DEFAULT, not the reference. With a stale cache this is null and
        // the price box is left empty for the operator to fill in deliberately.
        listPrice: defaultUnitPrice(gradePrice(p.prices, grade), freshness) ?? "",
      }),
      true,
    );
    /*
     * A3 item 5: the next thing the operator does is type the gross weight, so the
     * weight entry is scrolled into view and gross becomes the active field. Before this
     * the selection changed nothing on screen — the fields stayed below the fold.
     */
    setActive("gross");
    if (grossY.current !== null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, grossY.current - t.space.x3), animated: !reducedMotion });
    }
  };

  const candidate = useMemo(
    () =>
      buildLine({
        id: editingId ?? "pending",
        /*
         * THE RESOLVED product's id, not the raw form value (Phase 2c-8).
         *
         * They differ in one reachable case and it costs money: a draft is open,
         * the office deletes that product, a refresh replaces the cache, and
         * form.product_id now names a product this device no longer has. The old
         * expression passed the phantom id straight through — buildLine only
         * checks that it is non-empty — so the line committed with a BLANK code
         * and name, at whatever price was typed, and the server refused the
         * whole bill (422 product does not exist) after the cash was paid.
         *
         * Resolving first turns that into "no product chosen", which the form
         * already refuses to commit and already explains. A cached row that has
         * gone away must fail closed, not price something wrong.
         */
        product_id: product?.id ?? "",
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

  // An unresolvable seller blocks entry AND saving: a bill nobody can identify
  // must not be committed, and every price on it would be blank anyway.
  const sellerKnown = seller !== null;
  const canSave = lines.length > 0 && !busy && sellerKnown;
  const offTier = priceIsOffTier(form.price, listPrice);

  return (
    <View style={styles.fill}>
      <ScrollView
        ref={scrollRef}
        style={styles.fill}
        contentContainerStyle={styles.scrollBody}
        keyboardShouldPersistTaps="handled"
      >
        {topSlot ? <View style={styles.topSlot}>{topSlot}</View> : null}
        {/* ---------------------------------------------- who and which truck */}
        <Pressable
          style={[styles.sellerBox, !sellerKnown && styles.sellerBoxBad]}
          onPress={onPickSeller}
          disabled={busy}
        >
          <View style={styles.sellerTop}>
            <Text style={styles.label}>ผู้ขาย</Text>
            <View style={styles.changeBtnWrap}>
              <Text style={styles.changeBtn}>{sellerKnown ? "เปลี่ยน" : "เลือก"}</Text>
              <Icon name="chevron" size={16} color={t.color.primary} />
            </View>
          </View>
          {seller !== null ? (
            <>
              <Text style={styles.sellerName} numberOfLines={1}>
                {seller.name}
              </Text>
              <Text style={styles.sellerMeta}>
                {seller.code} ·{" "}
                {seller.grade === null ? (
                  <Text style={styles.noGrade}>ยังไม่ได้จัดเกรด</Text>
                ) : (
                  `เกรด ${tierName(tiers, seller.grade)}`
                )}
              </Text>
              {seller.grade === null ? (
                <Text style={styles.sellerWarn}>
                  ไม่มีราคาตั้งต้นให้ และบิลจะค้างรอสำนักงานกำหนดเกรดก่อนจึงจะส่งได้
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.sellerWarn}>
              ไม่พบข้อมูลผู้ขายของบิลนี้ในรายชื่อ — แตะเพื่อเลือกผู้ขายอีกครั้ง
              (บันทึกบิลไม่ได้จนกว่าจะเลือก)
            </Text>
          )}
        </Pressable>

        {/* P1.21: what this seller last sold. A SEPARATE control (not nested in the
            seller box's own Pressable), drawn only once a seller is chosen. */}
        {seller !== null ? (
          <Pressable style={styles.historyBtn} onPress={onViewHistory} disabled={busy}>
            <View style={styles.historyBtnRow}>
              <Text style={styles.historyBtnText}>ดูประวัติการซื้อขายของผู้ขายรายนี้</Text>
              <Icon name="chevron" size={16} color={t.color.primary} />
            </View>
          </Pressable>
        ) : null}

        {/*
          vehicle_no. FREE TEXT, so the OS keyboard is correct here — the same
          exception the void reason takes. The Phase 2c-4 numpad rule exists
          because a pasted or auto-corrected value in a MONEY field becomes
          money; a plate is an identifier and is never computed with.

          Written through the debounced draft save like the other form fields,
          and flushed on blur so the last keystrokes are on disk before the
          operator's attention moves on.
        */}
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>ทะเบียนรถ (ถ้ามี)</Text>
          <TextInput
            style={styles.vehicleInput}
            value={draft.vehicle_no ?? ""}
            onChangeText={onVehicleChange}
            onBlur={onVehicleBlur}
            onEndEditing={onVehicleBlur}
            placeholder="เช่น 70-1234 หรือ 1กก 5678"
            placeholderTextColor={t.color.placeholder}
            autoCorrect={false}
            autoCapitalize="characters"
            maxLength={20}
            editable={!busy}
          />
        </View>

        <Text style={styles.section}>
          {editingId === null ? "เพิ่มรายการ" : "แก้ไขรายการ"}
        </Text>

        {/*
          CART MILESTONE (2026-10-12): the product is reached through the FREQUENT row (derived in
          App.tsx from this device's bills — src/cart/productPicker.ts frequentProducts, frozen for
          the shop day), the CATEGORY chips (SRS 2.1 เลือกกลุ่มสินค้า), or SEARCH (name, code,
          category name). The decisions are productPicker.ts's; this only lays them out.
        */}
        {frequentTiles.length > 0 ? (
          <View style={styles.freqBlock}>
            <Text style={styles.label}>
              {frequent?.source === "history" ? FREQUENT_HEADING : FALLBACK_HEADING}
            </Text>
            <View style={styles.freqGrid}>
              {frequentTiles.map((p) => {
                const isOn = p.id === form.product_id;
                return (
                  <Touchable
                    key={p.id}
                    style={[styles.freqTile, isOn && styles.freqTileOn]}
                    onPress={() => selectProduct(p)}
                    disabled={busy || !sellerKnown}
                    accessibilityLabel={p.name}
                    selected={isOn}
                  >
                    <Text style={[styles.freqTileText, isOn && styles.onDark]} numberOfLines={2}>
                      {p.name}
                    </Text>
                  </Touchable>
                );
              })}
            </View>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          {chips.map((c) => {
            const on = c.id === categoryId;
            return (
              <Touchable
                key={c.id}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setCategoryId(c.id)}
                accessibilityLabel={c.label}
                selected={on}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
              </Touchable>
            );
          })}
        </ScrollView>

        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={SEARCH_PLACEHOLDER}
          placeholderTextColor={t.color.placeholder}
          autoCorrect={false}
          clearButtonMode="while-editing"
          editable={!busy}
        />

        {listed.length === 0 ? (
          <Text style={styles.emptyLine}>{emptyListLine(categoryId, query)}</Text>
        ) : null}
        {listed.map((p) => {
          const isOn = p.id === form.product_id;
          const gp = gradePrice(p.prices, grade);
          return (
            <Pressable
              key={p.id}
              style={[styles.product, isOn && styles.productActive]}
              onPress={() => selectProduct(p)}
              disabled={busy || !sellerKnown}
              accessibilityRole="button"
              accessibilityState={{ selected: isOn, disabled: busy || !sellerKnown }}
            >
              <Text style={[styles.productName, isOn && styles.onDark]}>{p.name}</Text>
              {/*
                The cached tier is still SHOWN when it is stale, marked as old.
                Hiding it would not make anyone safer — the operator would type
                a remembered number with no idea it differs from what the shop
                last published — and it is the only price information the device
                holds. Next to a price box the app has refused to fill in, it
                reads as evidence; inside that box it would be an assertion.
              */}
              <Text style={[styles.productMeta, isOn && styles.onDark]}>
                {p.code} · {gp !== null ? display(gp) : "ไม่มีราคาตามเกรด"} บาท/{p.uom_code}
                {stale && gp !== null ? " (ราคาเก่า)" : ""}
              </Text>
            </Pressable>
          );
        })}
        {errorFor("product") ? <Text style={styles.err}>{errorFor("product")}</Text> : null}

        {/*
          gross passes NO `lockable` prop, so no lock control is rendered for it
          — the UI mirrors the type, where LockableField has no "gross" member.
        */}
        <View
          onLayout={(e) => {
            grossY.current = e.nativeEvent.layout.y;
          }}
        >
          <NumericField
            field="gross"
            value={form.gross}
            active={active === "gross"}
            onPress={() => setActive("gross")}
            disabled={busy}
          />
        </View>
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
        {/*
          WHICH note appears is decided by whether the app was willing to default
          at all, and the two are mutually exclusive on purpose.

          Stale: the box was left empty BY THE APP, so "the price was changed
          from the grade price" would be an accusation about something the
          operator had no choice about — and it would fire on every single line.
          What is true instead is why it is empty and what the device last knew,
          which is what stalePriceHint says.

          Current: the reference is trustworthy, so a difference really is an
          override and is worth flagging — especially a LOCKED price carried
          across a product change, where nothing was retyped.
        */}
        {stale && product !== null ? (
          <Text style={styles.note}>{stalePriceHint(listPrice, freshness)}</Text>
        ) : offTier ? (
          <Text style={styles.note}>
            ราคาถูกแก้จากราคาตามเกรด ({listPrice !== null ? display(listPrice) : ""})
            {locks.price ? " — ราคานี้ค้างไว้จากสินค้าก่อนหน้า ตรวจสอบก่อนบันทึก" : ""}
          </Text>
        ) : null}

        <View style={styles.readRow}>
          <View style={styles.col}>
            <Text style={styles.label}>น้ำหนักสุทธิ</Text>
            <Text style={styles.computed}>
              {candidate.ok ? display(candidate.line.net_weight) : "—"}
            </Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>เป็นเงิน</Text>
            <Text style={styles.lineAmount}>
              {candidate.ok ? display(candidate.line.amount) : "—"}
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <Pressable
            style={[styles.addBtn, styles.grow, (!candidate.ok || !sellerKnown) && styles.dim]}
            onPress={commitLine}
            disabled={busy || !sellerKnown}
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
              <Text style={styles.lineAmt}>{display(l.amount)}</Text>
            </View>
            <Text style={styles.lineMeta}>
              {l.product_code} · สุทธิ {display(l.net_weight)} {l.uom_code} × {display(l.unit_price)}
              {l.unit_price !== l.list_price ? `  (เกรด ${display(l.list_price)})` : ""}
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
            ลบ {undo.product_name} ({display(undo.amount)} บาท)
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
          net={candidate.ok ? display(candidate.line.net_weight) : "—"}
          amount={candidate.ok ? display(candidate.line.amount) : "—"}
          onKey={pressKey}
          onDone={() => setActive(null)}
        />
      ) : null}

      <View style={styles.totalBar}>
        <View>
          <Text style={styles.totalLabel}>{lines.length} รายการ</Text>
          <Text style={styles.totalValue}>{display(total)}</Text>
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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldHead}>
        <Text style={styles.label}>{FIELD_LABEL[field]}</Text>
        {lockable !== undefined ? (
          <Pressable
            style={[styles.lockBtn, locked && styles.lockBtnOn]}
            onPress={onToggleLock}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: locked === true, disabled: disabled === true }}
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
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled: disabled === true }}
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

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    fill: { flex: 1 },
    scrollBody: { padding: t.space.x3, paddingBottom: t.space.x4 },
    topSlot: { marginBottom: t.space.xl },

    section: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.text, marginTop: t.space.md },
    label: { fontSize: t.type.body, fontWeight: "700", color: t.color.textMuted },
    row: { flexDirection: "row", gap: t.space.xl },
    readRow: { flexDirection: "row", gap: t.space.xl, marginTop: t.space.xxl },
    col: { flex: 1 },
    grow: { flex: 1 },

    // A1 (P1.23 item 3 phase D): the permanent teal border was decoration, not an
    // action or a selection — a neutral hairline card now, teal reserved for the save
    // button and the selected product. sellerBoxBad still turns it danger (a real state).
    sellerBox: {
      backgroundColor: t.color.surface, borderRadius: t.radius.card, padding: t.space.xl, borderWidth: 1,
      borderColor: t.color.borderSoft, minHeight: t.tapMin, justifyContent: "center",
    },
    sellerBoxBad: { borderColor: t.color.danger, backgroundColor: t.color.dangerSoftBg },
    sellerTop: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    sellerName: { fontSize: t.type.title, fontWeight: "900", color: t.color.text, marginTop: t.space.xs },
    sellerMeta: { fontSize: t.type.body, color: t.color.textSubtle, marginTop: t.space.xs, fontWeight: "600" },
    noGrade: { color: t.color.danger, fontWeight: "800" },
    sellerWarn: {
      fontSize: t.type.body, color: t.color.dangerFg, backgroundColor: t.color.dangerBg, borderRadius: t.radius.md,
      paddingHorizontal: t.space.md, paddingVertical: t.space.sm, marginTop: t.space.md, fontWeight: "700",
    },
    changeBtn: { fontSize: t.type.bodyLg, fontWeight: "900", color: t.color.primary },
    changeBtnWrap: { flexDirection: "row", alignItems: "center", gap: t.space.xs },
    historyBtn: {
      minHeight: t.tapMin, marginTop: t.space.md, borderRadius: t.radius.lg, borderWidth: 1,
      borderColor: t.color.border, backgroundColor: t.color.surface,
      alignItems: "center", justifyContent: "center", paddingHorizontal: t.space.x3,
    },
    historyBtnText: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.primary },
    historyBtnRow: { flexDirection: "row", alignItems: "center", gap: t.space.xs },

    vehicleInput: {
      borderWidth: 1, borderColor: t.color.border, borderRadius: t.radius.lg, paddingHorizontal: t.space.xxl,
      minHeight: t.tapMin, fontSize: t.type.titleLg, fontWeight: "800", color: t.color.text,
      backgroundColor: t.color.surface, marginTop: t.space.sm,
    },

    product: {
      borderWidth: 1, borderColor: t.color.border, borderRadius: t.radius.card, padding: t.space.xl,
      marginTop: t.space.md, backgroundColor: t.color.surface, minHeight: t.tapMin, justifyContent: "center",
    },
    productActive: { backgroundColor: t.color.primary, borderColor: t.color.primary },
    productName: { fontSize: t.type.subhead, fontWeight: "700", color: t.color.text },
    productMeta: { fontSize: t.type.body, color: t.color.textSubtle, marginTop: t.space.xs },
    onDark: { color: t.color.onPrimary },

    // Cart milestone: the frequent row, the category chips and the search field.
    freqBlock: { marginTop: t.space.md, gap: t.space.sm },
    freqGrid: { flexDirection: "row", flexWrap: "wrap", gap: t.space.md },
    freqTile: {
      flexBasis: "31%", flexGrow: 1, minHeight: t.tapMin, paddingHorizontal: t.space.lg, paddingVertical: t.space.md,
      borderWidth: 1, borderColor: t.color.border, borderRadius: t.radius.card, backgroundColor: t.color.surface,
      justifyContent: "center",
    },
    freqTileOn: { backgroundColor: t.color.primary, borderColor: t.color.primary },
    freqTileText: { fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.text },
    chipRow: { gap: t.space.md, paddingVertical: t.space.md },
    chip: {
      minHeight: t.tapMin, paddingHorizontal: t.space.xl, justifyContent: "center", borderRadius: t.radius.pill,
      borderWidth: 1, borderColor: t.color.border, backgroundColor: t.color.surface,
    },
    chipOn: { backgroundColor: t.color.primary, borderColor: t.color.primary },
    chipText: { fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.text },
    chipTextOn: { color: t.color.onPrimary },
    searchInput: {
      minHeight: t.tapMin, borderWidth: 1, borderColor: t.color.border, borderRadius: t.radius.lg,
      paddingHorizontal: t.space.xl, fontSize: t.type.subhead, color: t.color.text, backgroundColor: t.color.surface,
    },
    emptyLine: { fontSize: t.type.bodyLg, color: t.color.textMuted, marginTop: t.space.xl },

    fieldBlock: { marginTop: t.space.xxl },
    fieldHead: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      marginBottom: t.space.sm,
    },
    fieldBox: {
      borderWidth: 1, borderColor: t.color.border, borderRadius: t.radius.lg, paddingHorizontal: t.space.xxl,
      minHeight: t.tapMin, backgroundColor: t.color.surface, justifyContent: "center",
    },
    fieldBoxActive: { borderColor: t.color.text, borderWidth: 3 },
    // Locked: background AND border both change, so it reads at a glance in
    // daylight rather than depending on a small icon.
    fieldBoxLocked: { backgroundColor: t.color.warningBg, borderColor: t.color.warning, borderWidth: 3 },
    fieldValue: { fontSize: t.type.headline, fontWeight: "800", color: t.color.text },
    fieldPlaceholder: { color: t.color.placeholder, fontSize: t.type.subhead, fontWeight: "600" },

    lockBtn: {
      minHeight: t.tapMin, paddingHorizontal: t.space.x3, borderRadius: t.radius.lg, backgroundColor: t.color.borderSoft,
      alignItems: "center", justifyContent: "center",
    },
    lockBtnOn: { backgroundColor: t.color.warning },
    lockBtnText: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.neutralFg },
    lockBtnTextOn: { color: t.color.onPrimary },
    lockHint: { fontSize: t.type.body, color: t.color.warningFg, marginTop: t.space.sm, fontWeight: "600" },

    computed: { fontSize: t.type.headline, fontWeight: "800", color: t.color.text, marginTop: t.space.xs },
    // A1: money is data, not an accent — neutral text, prominence from size + weight.
    lineAmount: { fontSize: t.type.display, fontWeight: "900", color: t.color.text, marginTop: t.space.xs },

    err: { color: t.color.danger, fontSize: t.type.body, marginTop: t.space.sm, fontWeight: "600" },
    note: { color: t.color.warning, fontSize: t.type.body, marginTop: t.space.sm, fontWeight: "600" },
    empty: { color: t.color.textSubtle, fontSize: t.type.bodyLg, marginTop: t.space.x4, textAlign: "center" },

    addBtn: {
      marginTop: t.space.x4, minHeight: t.tapMin, borderRadius: t.radius.xl, backgroundColor: t.color.primaryFill,
      borderWidth: 1, borderColor: t.color.primary, alignItems: "center", justifyContent: "center",
    },
    addText: { color: t.color.onPrimaryFill, fontWeight: "800", fontSize: t.type.subhead },
    cancelBtn: {
      marginTop: t.space.x4, minHeight: t.tapMin, borderRadius: t.radius.xl, paddingHorizontal: t.space.x4,
      backgroundColor: t.color.borderSoft, alignItems: "center", justifyContent: "center",
    },
    cancelText: { color: t.color.neutralFg, fontWeight: "700", fontSize: t.type.subhead },
    dim: { opacity: 0.4 },

    linesHead: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      marginTop: t.space.x5,
    },
    clearBtn: { minHeight: t.tapMin, paddingHorizontal: t.space.xl, justifyContent: "center" },
    clearText: { color: t.color.danger, fontWeight: "700", fontSize: t.type.bodyLg },

    line: {
      backgroundColor: t.color.surface, borderRadius: t.radius.card, padding: t.space.xl, marginTop: t.space.lg,
      borderWidth: 1, borderColor: t.color.borderSoft,
    },
    lineEditing: { borderColor: t.color.primary, borderWidth: 2 },
    lineTop: { flexDirection: "row", alignItems: "center" },
    lineNo: {
      width: 28, height: 28, borderRadius: t.radius.pill, backgroundColor: t.color.text, color: t.color.onPrimary,
      textAlign: "center", lineHeight: 28, fontWeight: "800", fontSize: t.type.bodyLg, overflow: "hidden",
    },
    lineName: { flex: 1, marginLeft: t.space.lg, fontSize: t.type.subhead, fontWeight: "700", color: t.color.text },
    lineAmt: { fontSize: t.type.titleLg, fontWeight: "900", color: t.color.text },
    lineMeta: { fontSize: t.type.body, color: t.color.textSubtle, marginTop: t.space.sm },
    lineBtns: { flexDirection: "row", gap: t.space.lg, marginTop: t.space.lg },
    lineBtn: {
      flex: 1, minHeight: t.tapMin, borderRadius: t.radius.lg, backgroundColor: t.color.surfaceAlt,
      alignItems: "center", justifyContent: "center",
    },
    lineBtnText: { fontWeight: "700", color: t.color.neutralFg, fontSize: t.type.bodyLg },
    lineBtnDanger: { backgroundColor: t.color.dangerBg },
    lineBtnDangerText: { color: t.color.danger },

    undoBar: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      backgroundColor: t.color.text, paddingHorizontal: t.space.x3, paddingVertical: t.space.lg,
    },
    undoText: { color: t.color.borderSoft, flex: 1, fontSize: t.type.bodyLg },
    undoBtn: { minHeight: t.tapMin, paddingHorizontal: t.space.x3, justifyContent: "center" },
    undoBtnText: { color: t.color.tealSoft, fontWeight: "800", fontSize: t.type.subhead },

    totalBar: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: t.space.x3, paddingVertical: t.space.lg, backgroundColor: t.color.surface,
      borderTopWidth: 1, borderTopColor: t.color.borderSoft,
    },
    totalLabel: { fontSize: t.type.body, color: t.color.textSubtle, fontWeight: "700" },
    totalValue: { fontSize: t.type.display, fontWeight: "900", color: t.color.text },
    saveBtn: {
      minHeight: t.tapMin, paddingHorizontal: t.space.x5, borderRadius: t.radius.xl,
      backgroundColor: t.color.primaryFill, borderWidth: 1, borderColor: t.color.primary,
      alignItems: "center", justifyContent: "center",
    },
    saveText: { color: t.color.onPrimaryFill, fontWeight: "900", fontSize: t.type.subhead },
  });
}
