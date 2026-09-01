/**
 * Who is this bill for? (Phase 2c-6)
 *
 * A yard has hundreds of sellers and the operator has one free hand, so this is
 * a SEARCH screen with a list under it, not a list to scroll. The box is
 * focused on open and every row is TAP_MIN tall.
 *
 * SEARCHING BY PLATE, AND WHAT IT ACTUALLY SEARCHES. Sellers carry no plate:
 * the plate belongs to the BILL (SRS 1.6), because the same customer arrives in
 * different trucks. So plate search matches the plates THIS DEVICE has recorded
 * for that seller on previous bills — a memory, not master data. A device that
 * has not written a bill yet knows none, and the screen says so rather than
 * looking broken.
 *
 * The search box is FREE TEXT and uses the OS keyboard. That is not a
 * regression against the Phase 2c-4 numpad rule: the rule is about the numeric
 * entry path, where a pasted or auto-corrected value becomes money. Nothing
 * typed here is stored on anything — it only filters a list.
 */
import { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { searchSellers, tierName } from "../src/cart/sellers";
import type { NamedTier, SellerMatch } from "../src/cart/sellers";
import type { Seller } from "./api";
import { useTheme, type ThemeTokens } from "./theme";
import { SheetHeader } from "./SheetHeader";

/**
 * NO MODAL ELEMENT AND NO `visible` PROP. This app has one Modal — app/SheetHost
 * — and the sheet stack decides which sheet is inside it. A second one anywhere
 * reintroduces the presentation defect SheetHost's header describes, and
 * `npm run prove:sheets` goes red the moment one appears in this directory.
 */
interface Props {
  sellers: Seller[];
  /** The shop's cached grade tiers, to show a seller's grade by its NAME (S16, F3). */
  tiers: readonly NamedTier[];
  /**
   * Which of `sellers` are local rows this device created that the server has
   * not sent back yet — the union's origin marker (`src/cart/pickerSellers.ts`).
   * A fact about this read, not a column on the row: a seller once created is a
   * shop entity, and once its server row arrives it drops out of the union and
   * out of this set in the same pass.
   */
  localIds: ReadonlySet<string>;
  /** Plates this device has seen per seller, newest first. */
  platesBySeller: ReadonlyMap<string, readonly string[]>;
  /** The bill's current seller, so the row can be marked. Null before the pick. */
  currentSellerId: string | null;
  /** True when the cart has lines — changes the wording from "choose" to "change". */
  changing: boolean;
  /**
   * This device has NEVER fetched the seller list, as opposed to having fetched
   * it and found nobody.
   *
   * Both produce an empty list and they need opposite sentences: "the office has
   * not added anyone" sends someone to the office over a network problem, and it
   * is an alarming thing to tell a shop with hundreds of customers.
   */
  neverFetched: boolean;
  /**
   * Open the add-seller form (P1.8a phase 3).
   *
   * ITS CONTROL IS IN THE HEADER AND NOT IN THE EMPTY STATE, and that placement
   * is the whole feature. A shop has no sellers on day one and never again; the
   * case this exists for is a walk-in arriving at a yard with five hundred
   * sellers on file, where the list is emphatically NOT empty and the search has
   * just come back with nothing. A control reachable only from the empty state
   * would be a control nobody could reach on the day they needed it.
   */
  onAddSeller: () => void;
  onClose: () => void;
  onPick: (seller: Seller) => void;
}

export function SellerPicker({
  sellers,
  tiers,
  localIds,
  platesBySeller,
  currentSellerId,
  changing,
  neverFetched,
  onAddSeller,
  onClose,
  onPick,
}: Props) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const [query, setQuery] = useState("");

  const matches = useMemo(
    () => searchSellers(sellers, query, platesBySeller),
    [sellers, query, platesBySeller],
  );

  const anyPlatesKnown = platesBySeller.size > 0;

  const close = (): void => {
    setQuery("");
    onClose();
  };

  const pick = (m: SellerMatch): void => {
    const full = sellers.find((s) => s.id === m.seller.id);
    if (full === undefined) return;
    setQuery("");
    onPick(full);
  };

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SheetHeader
        title={changing ? "เปลี่ยนผู้ขาย" : "เลือกผู้ขาย"}
        onClose={close}
        actions={
          <Pressable style={styles.addBtn} onPress={onAddSeller}>
            <Text style={styles.addText}>+ เพิ่มผู้ขาย</Text>
          </Pressable>
        }
      />

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="ค้นหา: ชื่อ / รหัส / ทะเบียนรถ"
          placeholderTextColor={t.color.placeholder}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <Text style={styles.searchHint}>
          {anyPlatesKnown
            ? "ค้นทะเบียนได้จากบิลที่เคยบันทึกในเครื่องนี้"
            : "เครื่องนี้ยังไม่มีบิล จึงยังค้นด้วยทะเบียนรถไม่ได้"}
        </Text>
      </View>

      <FlatList
        data={matches}
        keyExtractor={(m) => m.seller.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {sellers.length > 0
              ? `ไม่พบผู้ขายที่ตรงกับ “${query}”`
              : neverFetched
                ? "เครื่องนี้ยังไม่เคยดึงรายชื่อผู้ขายมาเก็บไว้ — ต้องต่อเน็ตและเข้าสู่ระบบสักครั้งก่อน"
                : /*
                     CHANGED IN P1.8a phase 3. This read "ยังไม่มีผู้ขายในระบบ —
                     ต้องเพิ่มที่สำนักงานก่อน", which became FALSE the moment
                     staff could add one from the phone: it sent the yard to the
                     office over something the button in this header now does.
                     The grade warning further down is NOT changed and stays
                     true — grades remain admin-only and the add form offers no
                     grade field.
                  */
                  "ยังไม่มีผู้ขายในระบบ — กดปุ่ม เพิ่มผู้ขาย ด้านบนเพื่อเพิ่มจากหน้าลานได้เลย"}
          </Text>
        }
        renderItem={({ item }) => {
          const s = item.seller;
          const isCurrent = s.id === currentSellerId;
          const noGrade = s.grade === null;
          return (
            <Pressable
              style={[styles.row, isCurrent && styles.rowCurrent]}
              onPress={() => pick(item)}
            >
              <View style={styles.rowTop}>
                <Text style={styles.name} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={[styles.grade, noGrade && styles.gradeNone]}>
                  {s.grade === null ? "ไม่มีเกรด" : `เกรด ${tierName(tiers, s.grade)}`}
                </Text>
              </View>
              <Text style={styles.meta} numberOfLines={1}>
                {s.code}
                {item.plates.length > 0 ? ` · ทะเบียน ${item.plates.join(", ")}` : ""}
              </Text>
              {/*
                Created on THIS device and not yet confirmed by the server. The
                bill still saves and still sends — it carries the local id and the
                send path swaps in the server id once the seller settles — but the
                operator should know the row is not on the system yet.
              */}
              {localIds.has(s.id) ? (
                <Text style={styles.local}>เพิ่มจากเครื่องนี้ — ยังไม่ขึ้นระบบ</Text>
              ) : null}
              {/*
                Said HERE, before the pick, not after the bill is refused: a
                seller with no grade has no price tier, so the server parks the
                bill (424 seller_grade_unset) until the office sets one. The
                purchase can still be recorded — that is the whole point of
                parking — but the operator should know before typing weights.
              */}
              {noGrade ? (
                <Text style={styles.warn}>
                  ยังไม่ได้จัดเกรด — ไม่มีราคาตั้งต้น และบิลจะค้างรอสำนักงานกำหนดเกรดก่อนจึงจะส่งได้
                </Text>
              ) : null}
              {isCurrent ? <Text style={styles.current}>ผู้ขายของบิลนี้</Text> : null}
            </Pressable>
          );
        }}
      />
    </KeyboardAvoidingView>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.color.background },
    // Teal, so it reads as the one thing on this screen that CREATES something,
    // beside a neutral ปิด. Same TAP_MIN floor as every other control here.
    addBtn: {
      minHeight: t.tapMin, paddingHorizontal: t.space.xxl, borderRadius: t.radius.lg,
      backgroundColor: t.color.primary, alignItems: "center", justifyContent: "center",
    },
    addText: { fontSize: t.type.bodyLg, fontWeight: "800", color: t.color.onPrimary },

    searchWrap: {
      paddingHorizontal: t.space.x3, paddingTop: t.space.xl, paddingBottom: t.space.md, backgroundColor: t.color.surface,
      borderBottomWidth: 1, borderBottomColor: t.color.borderSoft,
    },
    search: {
      borderWidth: 2, borderColor: t.color.primary, borderRadius: t.radius.xl, paddingHorizontal: t.space.xxl,
      minHeight: t.tapMin, fontSize: t.type.title, fontWeight: "700", color: t.color.text,
      backgroundColor: t.color.surface,
    },
    searchHint: { fontSize: t.type.body, color: t.color.textSubtle, marginTop: t.space.sm, fontWeight: "600" },

    body: { padding: t.space.x3, paddingBottom: t.space.x5 },
    empty: { textAlign: "center", color: t.color.textSubtle, marginTop: t.space.x5, fontSize: t.type.bodyLg },

    row: {
      backgroundColor: t.color.surface, borderRadius: t.radius.xl, padding: t.space.xl, marginBottom: t.space.lg,
      borderWidth: 1, borderColor: t.color.borderSoft, minHeight: t.tapMin, justifyContent: "center",
    },
    rowCurrent: { borderColor: t.color.primary, borderWidth: 2, backgroundColor: t.color.tealBg },
    rowTop: { flexDirection: "row", alignItems: "center", gap: t.space.lg },
    name: { flex: 1, fontSize: t.type.subhead, fontWeight: "800", color: t.color.text },
    grade: {
      fontSize: t.type.body, fontWeight: "900", color: t.color.onPrimary, backgroundColor: t.color.primary,
      paddingHorizontal: t.space.md, paddingVertical: t.space.xs, borderRadius: t.radius.sm, overflow: "hidden",
    },
    gradeNone: { backgroundColor: t.color.danger },
    meta: { fontSize: t.type.body, color: t.color.textSubtle, marginTop: t.space.xs },
    warn: { fontSize: t.type.body, color: t.color.dangerFg, backgroundColor: t.color.dangerBg, borderRadius: t.radius.md,
      paddingHorizontal: t.space.md, paddingVertical: t.space.sm, marginTop: t.space.md, fontWeight: "700" },
    current: { fontSize: t.type.body, color: t.color.primary, fontWeight: "800", marginTop: t.space.sm },
    // Slate, not red: a local seller not yet on the server is a self-resolving
    // state — it uploads when the device reaches the network — so it is
    // informational and must not read as the grade warning above it does.
    local: { fontSize: t.type.body, color: t.color.neutralFg, backgroundColor: t.color.borderSoft, borderRadius: t.radius.md,
      paddingHorizontal: t.space.md, paddingVertical: t.space.sm, marginTop: t.space.md, fontWeight: "700" },
  });
}
