/**
 * ขายสินค้า (M2) -- the yard's sell flow. Pick a buyer, add lines, save: the sale is written to THIS DEVICE first
 * and sent by the `sale_send` outbox kind (hard rule 8), so it is never lost to a dead spot; the device's own sales
 * are listed below with each one's sync state, and a sale with no number yet SAYS so (hard rule 3).
 *
 * The screen draws and nothing more: every figure is `src/sell/sellView.ts`'s (the shared line rule, the golden
 * vectors both suites run). The same kit as every other sheet -- Card, Field, Figure, Badge, Button -- so selling
 * reads as the app the yard already knows (impeccable · operate.md: consistency outranks expression).
 */
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { display } from "../src/money/format";
import { receivedProblem, saleStateLine, sellLine, sellTotal } from "../src/sell/sellView";
import type { SellDraftLine, SellLineFigures, SellProduct } from "../src/sell/sellView";
import { saleDocLabel } from "../src/sync/localSale";
import type { CachedBuyer, LocalSale } from "../src/sync/localSale";
import { Badge, Button, Card, EmptyState, Field, Figure, GroupCard, Row, SectionHeading } from "./Kit";
import { SheetHeader } from "./SheetHeader";
import { useTheme, type ThemeTokens } from "./theme";

export interface SellSave {
  readonly buyer: CachedBuyer;
  readonly lines: readonly { readonly draft: SellDraftLine; readonly product: SellProduct; readonly figures: SellLineFigures }[];
  readonly total: string;
  readonly received: string;
}

const EMPTY: SellDraftLine = { productId: "", gross: "", tare: "", pieces: "", price: "" };
const TONE = { positive: "success", neutral: "neutral", warning: "warning", danger: "danger" } as const;

export function SellScreen({
  products,
  buyers,
  buyersNote,
  roundingRule,
  sales,
  busy,
  notice,
  onSave,
  onClose,
}: {
  readonly products: readonly SellProduct[];
  /** The cached buyers, or null while the first read is in flight. */
  readonly buyers: readonly CachedBuyer[] | null;
  /** Why the list may be stale (offline, never fetched), or null. */
  readonly buyersNote: string | null;
  readonly roundingRule: string;
  readonly sales: readonly LocalSale[];
  readonly busy: boolean;
  readonly notice: { readonly text: string; readonly ok: boolean } | null;
  /** App mints the ids, writes the row FIRST, then asks the outbox to send. */
  readonly onSave: (save: SellSave) => void;
  readonly onClose: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [lines, setLines] = useState<SellDraftLine[]>([EMPTY]);
  const [picking, setPicking] = useState<number | null>(0);
  const [received, setReceived] = useState("");
  const [tried, setTried] = useState(false);

  const productOf = (id: string) => products.find((p) => p.id === id);
  const results = lines.map((l) => sellLine(l, productOf(l.productId), roundingRule));
  const total = sellTotal(results);
  const rp = receivedProblem(received, total);
  const buyer = buyers?.find((b) => b.id === buyerId) ?? null;
  const setLine = (i: number, patch: Partial<SellDraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = () => {
    setTried(true);
    if (buyer === null || total === null || rp !== null) return;
    onSave({
      buyer,
      lines: lines.map((draft, i) => {
        const r = results[i];
        const product = productOf(draft.productId);
        if (r === undefined || !r.ok || product === undefined) throw new Error("SellScreen: a line was saved unvalidated");
        return { draft, product, figures: r.figures };
      }),
      total,
      received,
    });
    setLines([EMPTY]);
    setReceived("");
    setPicking(0);
    setTried(false);
  };

  return (
    <View style={styles.fill}>
      <SheetHeader title="ขายสินค้า" onClose={onClose} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <SectionHeading>ผู้ซื้อ</SectionHeading>
        {buyers === null ? (
          <Card><Text style={styles.muted}>กำลังอ่านรายชื่อผู้ซื้อ…</Text></Card>
        ) : buyers.length === 0 ? (
          <EmptyState icon="seller">ยังไม่มีผู้ซื้อในเครื่องนี้ — เพิ่มผู้ซื้อที่สำนักงาน แล้วเปิดหน้านี้ตอนมีสัญญาณ</EmptyState>
        ) : (
          <GroupCard>
            {buyers.map((b) => (
              <Row key={b.id} label={`${b.code} · ${b.name}`} {...(b.id === buyerId ? { value: "เลือกแล้ว" } : {})}
                onPress={() => setBuyerId(b.id)} />
            ))}
          </GroupCard>
        )}
        {buyersNote !== null ? <Text style={styles.note}>{buyersNote}</Text> : null}
        {tried && buyer === null ? <Text style={styles.error}>เลือกผู้ซื้อก่อนบันทึก</Text> : null}

        <SectionHeading>รายการ</SectionHeading>
        {lines.map((l, i) => {
          const p = productOf(l.productId);
          const r = results[i];
          const basis = p?.pricing_basis ?? "weight";
          return (
            <Card key={i}>
              <Row label={p === undefined ? "เลือกสินค้า" : `${p.code} · ${p.name}`} chevron
                onPress={() => setPicking(picking === i ? null : i)} />
              {picking === i ? (
                <GroupCard>
                  {products.map((x) => (
                    <Row key={x.id} label={`${x.code} · ${x.name}`} hint={x.uom_name}
                      onPress={() => { setLine(i, { productId: x.id }); setPicking(null); }} />
                  ))}
                </GroupCard>
              ) : null}
              {p !== undefined && basis === "weight" ? (
                <View style={styles.pair}>
                  <Field style={styles.half} label={`น้ำหนักรวม (${p.uom_name})`} keyboardType="decimal-pad" value={l.gross}
                    onChangeText={(v) => setLine(i, { gross: v })} />
                  <Field style={styles.half} label="ภาชนะ" keyboardType="decimal-pad" value={l.tare}
                    onChangeText={(v) => setLine(i, { tare: v })} placeholder="0" />
                </View>
              ) : null}
              {p !== undefined && basis === "piece" ? (
                <Field label={`จำนวน (${p.uom_name})`} keyboardType="number-pad" value={l.pieces}
                  onChangeText={(v) => setLine(i, { pieces: v })} />
              ) : null}
              {p !== undefined ? (
                <Field label={basis === "lump" ? "ราคาเหมา (บาท)" : `ราคาขายต่อ${p.uom_name} (บาท)`} keyboardType="decimal-pad"
                  value={l.price} onChangeText={(v) => setLine(i, { price: v })} />
              ) : null}
              {r !== undefined && r.ok ? (
                <View style={styles.lineFigures}>
                  {basis === "weight" && p !== undefined ? <Figure label="สุทธิ" value={display(r.figures.netWeight)} unit={p.uom_name} /> : null}
                  <Figure label="ยอดเงิน" value={display(r.figures.amount)} unit="บาท" />
                </View>
              ) : tried && r !== undefined && !r.ok ? (
                <Text style={styles.error}>{r.problem}</Text>
              ) : null}
              {lines.length > 1 ? (
                <Button kind="ghost" label="ลบรายการนี้" onPress={() => setLines((ls) => ls.filter((_, j) => j !== i))} />
              ) : null}
            </Card>
          );
        })}
        <Button kind="secondary" icon="plus" label="เพิ่มรายการ" onPress={() => { setLines((ls) => [...ls, EMPTY]); setPicking(lines.length); }} />

        <Card style={styles.totalCard}>
          <Figure hero label="ยอดรวม" value={total === null ? "—" : display(total)} {...(total === null ? {} : { unit: "บาท" })} />
          <Field label="รับเงินแล้ว (บาท) — เว้นว่างถ้ายังไม่รับ" keyboardType="decimal-pad" value={received}
            onChangeText={setReceived} {...(rp === null ? {} : { error: rp })} />
          {notice !== null ? <Text style={notice.ok ? styles.ok : styles.error}>{notice.text}</Text> : null}
          <Button label="บันทึกบิลขาย" busy={busy} onPress={save} />
          <Text style={styles.note}>บันทึกลงเครื่องก่อน แล้วส่งเมื่อมีสัญญาณ — เลขที่บิลมาจากระบบตอนส่งสำเร็จ</Text>
        </Card>

        <SectionHeading>บิลขายในเครื่องนี้</SectionHeading>
        {sales.length === 0 ? (
          <EmptyState icon="bills">ยังไม่มีบิลขายที่บันทึกจากเครื่องนี้</EmptyState>
        ) : (
          <GroupCard>
            {sales.map((s) => {
              const st = saleStateLine(s);
              return (
                <View key={s.id} style={styles.saleRow}>
                  <View style={styles.saleMain}>
                    <Text style={styles.saleDoc}>{saleDocLabel(s)}</Text>
                    <Text style={styles.muted}>{s.buyer_label} · {display(s.payload.total_amount)} บาท</Text>
                  </View>
                  <Badge tone={TONE[st.tone]}>{st.text}</Badge>
                </View>
              );
            })}
          </GroupCard>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  const c = t.color;
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.background },
    body: { padding: t.layout.screenPad, paddingBottom: 48, gap: 8 },
    pair: { flexDirection: "row", gap: 12 },
    half: { flex: 1 },
    lineFigures: { marginTop: 8 },
    totalCard: { marginTop: 12 },
    muted: { color: c.textMuted, fontSize: 14 },
    note: { color: c.textMuted, fontSize: 13, marginTop: 6 },
    error: { color: c.danger, fontSize: 14, marginTop: 6 },
    ok: { color: c.success, fontSize: 14, marginTop: 6 },
    saleRow: { paddingVertical: 12, paddingHorizontal: 4, gap: 6 },
    saleMain: { gap: 2 },
    saleDoc: { color: c.text, fontSize: 16, fontWeight: "600" },
  });
}
