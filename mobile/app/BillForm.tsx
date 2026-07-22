/**
 * One purchase line, entered by hand. NO cart — a single item this phase.
 *
 * Every number on this screen is a string from the moment it is typed to the
 * moment it is stored. The live net and amount are computed by src/money, the
 * same module the headless proof exercises and the same arithmetic the server
 * uses, so what the yard sees is what the server will agree to.
 */
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { lineAmount, netWeight, parsePrice, parseWeight } from "../src/money/money";
import type { Product, Seller } from "./api";
import { listPriceFor } from "./api";
import { messageFor } from "./messages";

export interface BillDraftOut {
  product: Product;
  grossWeight: string;
  tareWeight: string;
  netWeight: string;
  unitPrice: string;
  listPrice: string;
  amount: string;
}

interface Props {
  products: Product[];
  seller: Seller;
  busy: boolean;
  onSave: (draft: BillDraftOut) => void;
}

export function BillForm({ products, seller, busy, onSave }: Props) {
  const [productId, setProductId] = useState<string | null>(null);
  const [gross, setGross] = useState("");
  const [tare, setTare] = useState("");
  const [price, setPrice] = useState("");

  const product = products.find((p) => p.id === productId) ?? null;
  const listPrice = product ? listPriceFor(product, seller.grade) : null;

  const selectProduct = (p: Product): void => {
    setProductId(p.id);
    // unit_price defaults from the tier but stays editable — staff override at
    // the yard is expected, so list_price and unit_price are both kept.
    setPrice(listPriceFor(p, seller.grade) ?? "");
  };

  const calc = useMemo(() => {
    const g = parseWeight(gross);
    const t = parseWeight(tare);
    const p = parsePrice(price);
    const grossErr = gross === "" ? null : g.ok ? null : messageFor(g.error);
    const tareErr = tare === "" ? null : t.ok ? null : messageFor(t.error);
    const priceErr = price === "" ? null : p.ok ? null : messageFor(p.error);

    if (!g.ok || !t.ok) {
      return { net: null, amount: null, grossErr, tareErr, priceErr, netErr: null };
    }
    const n = netWeight(g.value, t.value);
    if (!n.ok) {
      return {
        net: null, amount: null, grossErr, tareErr, priceErr,
        netErr: messageFor(n.error),
      };
    }
    if (!p.ok) {
      return { net: n.value, amount: null, grossErr, tareErr, priceErr, netErr: null };
    }
    return {
      net: n.value,
      amount: lineAmount(n.value, p.value),
      grossErr, tareErr, priceErr, netErr: null,
    };
  }, [gross, tare, price]);

  const canSave =
    product !== null && calc.net !== null && calc.amount !== null && !busy;

  const save = (): void => {
    // Re-validate at submit rather than trusting the render-time state: the
    // bill must never leave the device in an invalid shape.
    const g = parseWeight(gross);
    const t = parseWeight(tare);
    const p = parsePrice(price);
    if (product === null || !g.ok || !t.ok || !p.ok) return;
    const n = netWeight(g.value, t.value);
    if (!n.ok) return;
    onSave({
      product,
      grossWeight: g.value,
      tareWeight: t.value,
      netWeight: n.value,
      unitPrice: p.value,
      listPrice: listPrice ?? p.value,
      amount: lineAmount(n.value, p.value),
    });
    setGross("");
    setTare("");
  };

  return (
    <View>
      <Text style={styles.label}>สินค้า</Text>
      {products.map((p) => {
        const active = p.id === productId;
        return (
          <Pressable
            key={p.id}
            style={[styles.product, active ? styles.productActive : null]}
            onPress={() => selectProduct(p)}
          >
            <Text style={[styles.productName, active ? styles.productNameActive : null]}>
              {p.name}
            </Text>
            <Text style={[styles.productMeta, active ? styles.productNameActive : null]}>
              {p.code} · {listPriceFor(p, seller.grade) ?? "-"} บาท/{p.uom_code}
            </Text>
          </Pressable>
        );
      })}
      {productId === null ? <Text style={styles.err}>ยังไม่ได้เลือกสินค้า</Text> : null}

      <Text style={styles.label}>ผู้ขาย</Text>
      <Text style={styles.readonly}>
        {seller.name} ({seller.code}) · เกรด {seller.grade ?? "-"}
      </Text>

      <Text style={styles.label}>น้ำหนักรวม (กก.)</Text>
      <TextInput
        style={styles.input}
        value={gross}
        onChangeText={setGross}
        keyboardType="decimal-pad"
        placeholder="0.000"
        editable={!busy}
      />
      {calc.grossErr ? <Text style={styles.err}>{calc.grossErr}</Text> : null}

      <Text style={styles.label}>น้ำหนักภาชนะ (กก.)</Text>
      <TextInput
        style={styles.input}
        value={tare}
        onChangeText={setTare}
        keyboardType="decimal-pad"
        placeholder="0.000"
        editable={!busy}
      />
      {calc.tareErr ? <Text style={styles.err}>{calc.tareErr}</Text> : null}

      <Text style={styles.label}>น้ำหนักสุทธิ (กก.)</Text>
      <Text style={styles.computed}>{calc.net ?? "-"}</Text>
      {calc.netErr ? <Text style={styles.err}>{calc.netErr}</Text> : null}

      <Text style={styles.label}>ราคาตามเกรด (บาท)</Text>
      <Text style={styles.readonly}>{listPrice ?? "-"}</Text>

      <Text style={styles.label}>ราคาที่ใช้จริง (บาท)</Text>
      <TextInput
        style={styles.input}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        placeholder="0.00"
        editable={!busy}
      />
      {calc.priceErr ? <Text style={styles.err}>{calc.priceErr}</Text> : null}
      {listPrice !== null && calc.amount !== null && price !== listPrice ? (
        <Text style={styles.note}>ราคาถูกแก้จากราคาตามเกรด ({listPrice})</Text>
      ) : null}

      <Text style={styles.label}>เป็นเงิน (บาท)</Text>
      <Text style={styles.amount}>{calc.amount ?? "-"}</Text>

      <Pressable
        style={[styles.save, canSave ? null : styles.saveOff]}
        disabled={!canSave}
        onPress={save}
      >
        <Text style={styles.saveText}>บันทึกบิล</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 14, fontSize: 13, fontWeight: "600", color: "#334155" },
  product: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8,
    padding: 10, marginTop: 6, backgroundColor: "#fff",
  },
  productActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  productName: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  productNameActive: { color: "#fff" },
  productMeta: { fontSize: 12, color: "#64748b", marginTop: 2 },
  input: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12,
    fontSize: 18, backgroundColor: "#fff", marginTop: 4, color: "#0f172a",
  },
  readonly: { fontSize: 15, color: "#0f172a", marginTop: 4 },
  computed: { fontSize: 20, fontWeight: "700", color: "#0f172a", marginTop: 4 },
  amount: { fontSize: 26, fontWeight: "800", color: "#0f766e", marginTop: 4 },
  err: { color: "#b91c1c", fontSize: 12, marginTop: 4 },
  note: { color: "#b45309", fontSize: 12, marginTop: 4 },
  save: {
    marginTop: 22, padding: 16, borderRadius: 10, backgroundColor: "#0f766e",
  },
  saveOff: { opacity: 0.4 },
  saveText: { color: "#fff", fontWeight: "700", textAlign: "center", fontSize: 16 },
});
