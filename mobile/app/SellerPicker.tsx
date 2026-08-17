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

import { searchSellers } from "../src/cart/sellers";
import type { SellerMatch } from "../src/cart/sellers";
import type { Seller } from "./api";

const TAP_MIN = 56;

/**
 * NO MODAL ELEMENT AND NO `visible` PROP. This app has one Modal — app/SheetHost
 * — and the sheet stack decides which sheet is inside it. A second one anywhere
 * reintroduces the presentation defect SheetHost's header describes, and
 * `npm run prove:sheets` goes red the moment one appears in this directory.
 */
interface Props {
  sellers: Seller[];
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
  platesBySeller,
  currentSellerId,
  changing,
  neverFetched,
  onAddSeller,
  onClose,
  onPick,
}: Props) {
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
      <View style={styles.head}>
        <Text style={styles.title}>{changing ? "เปลี่ยนผู้ขาย" : "เลือกผู้ขาย"}</Text>
        <View style={styles.headActions}>
          <Pressable style={styles.addBtn} onPress={onAddSeller}>
            <Text style={styles.addText}>+ เพิ่มผู้ขาย</Text>
          </Pressable>
          <Pressable style={styles.closeBtn} onPress={close}>
            <Text style={styles.closeText}>ปิด</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="ค้นหา: ชื่อ / รหัส / ทะเบียนรถ"
          placeholderTextColor="#94a3b8"
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
                  {noGrade ? "ไม่มีเกรด" : `เกรด ${s.grade}`}
                </Text>
              </View>
              <Text style={styles.meta} numberOfLines={1}>
                {s.code}
                {item.plates.length > 0 ? ` · ทะเบียน ${item.plates.join(", ")}` : ""}
              </Text>
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

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#f8fafc" },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  title: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  headActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  // Teal, so it reads as the one thing on this screen that CREATES something,
  // beside a neutral ปิด. Same 48pt floor as every other control here.
  addBtn: {
    minHeight: 48, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center",
  },
  addText: { fontSize: 15, fontWeight: "800", color: "#fff" },
  closeBtn: {
    minHeight: 48, paddingHorizontal: 20, borderRadius: 10,
    backgroundColor: "#e2e8f0", alignItems: "center", justifyContent: "center",
  },
  closeText: { fontSize: 16, fontWeight: "800", color: "#334155" },

  searchWrap: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: "#fff",
    borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  search: {
    borderWidth: 2, borderColor: "#0f766e", borderRadius: 12, paddingHorizontal: 14,
    minHeight: TAP_MIN, fontSize: 20, fontWeight: "700", color: "#0f172a",
    backgroundColor: "#fff",
  },
  searchHint: { fontSize: 12, color: "#64748b", marginTop: 6, fontWeight: "600" },

  body: { padding: 16, paddingBottom: 48 },
  empty: { textAlign: "center", color: "#64748b", marginTop: 40, fontSize: 15 },

  row: {
    backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: "#e2e8f0", minHeight: TAP_MIN, justifyContent: "center",
  },
  rowCurrent: { borderColor: "#0f766e", borderWidth: 2, backgroundColor: "#f0fdfa" },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { flex: 1, fontSize: 18, fontWeight: "800", color: "#0f172a" },
  grade: {
    fontSize: 12, fontWeight: "900", color: "#fff", backgroundColor: "#0f766e",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden",
  },
  gradeNone: { backgroundColor: "#b91c1c" },
  meta: { fontSize: 13, color: "#64748b", marginTop: 4 },
  warn: { fontSize: 12, color: "#7f1d1d", backgroundColor: "#fee2e2", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6, marginTop: 8, fontWeight: "700" },
  current: { fontSize: 12, color: "#0f766e", fontWeight: "800", marginTop: 6 },
});
