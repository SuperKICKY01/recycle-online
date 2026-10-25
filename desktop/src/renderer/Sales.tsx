/**
 * SALES (M2, SRS 2.2 การขายประจำวัน): the shop's sell bills for a shop-day range and optionally one buyer, a detail
 * beside the list with money received, receive more, void with a reason, and print the sale slip; and a new sale.
 *
 * The bills screen's shape (impeccable · operate.md · "Consistency ... outrank[s] expression"): filters, a list, a
 * sticky panel. A new sale is QUOTED by the server before it is saved -- POST /sales/quote computes every line
 * with the shop's own rules and writes nothing -- so the total on screen is the server's, never this program's
 * arithmetic. Cost and กำไรขั้นต้น appear only when the server sends them (money.view_shop).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shopDateTime } from "@recycle/shop-time";

import type { ApiOutcome } from "../shared/api";
import { display } from "../shared/money";
import { readShopMoney } from "../shared/moneyRules";
import { presetRange, PRESETS, shopDayLabel, shopToday, type PresetId } from "../shared/period";
import {
  GROSS_PROFIT,
  lineBody,
  lineProblem,
  readBuyers,
  readProductChoices,
  readQuote,
  readSale,
  readSales,
  RECEIPT_STATUS_TEXT,
  receivedProblem,
  saleSlipLines,
  saleSlipRefusal,
  salesQuery,
  voidReasonProblem,
  type Buyer,
  type DraftLine,
  type ProductChoice,
  type Quote,
  type Sale,
  type SalesFilter,
} from "../shared/sales";
import { noticeFor, type Session } from "../shared/session";
import { COLUMNS, DEFAULT_THAI_CODE_PAGE, escposBytes, sendText, type PaperWidth, type ShopHeader } from "../shared/slip";
import { DateField } from "./DateField";
import { Paper, readShop } from "./Slip";

interface Props {
  readonly session: Session;
  readonly onSettle: (kind: ApiOutcome<unknown>["kind"]) => void;
}

const uuid = (): string => crypto.randomUUID();

export function SalesScreen(props: Props) {
  const perms = props.session.me?.permissions ?? [];
  const canCreate = perms.includes("sales.create");
  const [tab, setTab] = useState<"list" | "new">("list");
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <div className="bills" data-screen="sales">
      <h1 className="page-title">บิลขาย</h1>
      <div className="tabs" role="tablist" aria-label="บิลขาย">
        <button type="button" role="tab" className="tab" data-tab="sales-list" aria-selected={tab === "list"} onClick={() => setTab("list")}>รายการบิลขาย</button>
        {canCreate ? (
          <button type="button" role="tab" className="tab" data-tab="sales-new" aria-selected={tab === "new"} onClick={() => setTab("new")}>ขายใหม่</button>
        ) : null}
      </div>
      {tab === "list" ? <SalesList {...props} openId={opened} /> : (
        <NewSale {...props} onSaved={(id) => { setOpened(id); setTab("list"); }} />
      )}
    </div>
  );
}

// --- the list -------------------------------------------------------------------------------------

function SalesList(props: Props & { openId: string | null }) {
  const { session, onSettle } = props;
  const init = presetRange("today", new Date());
  const [filter, setFilter] = useState<SalesFilter>({ from: init.from, to: init.to, buyerId: null, includeVoided: false });
  const [preset, setPreset] = useState<PresetId | null>("today");
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [listed, setListed] = useState<{ key: string; rows: Sale[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [printing, setPrinting] = useState(false);
  const asked = useRef<string | null>(null);

  const load = useCallback(async (f: SalesFilter) => {
    if (f.from > f.to) { asked.current = null; setNotice("วันเริ่มต้องไม่หลังวันสิ้นสุด"); return; }
    const key = salesQuery(f);
    asked.current = key;
    const out = await session.authed((t) => session.api.get(t, key, readSales));
    onSettle(out.kind);
    if (asked.current !== key) return;
    if (out.kind === "ok") { setListed({ key, rows: out.value }); setNotice(null); } else setNotice(noticeFor(out, "session"));
  }, [session, onSettle]);

  const open = useCallback(async (id: string) => {
    const out = await session.authed((t) => session.api.get(t, `/sales/${id}`, readSale));
    onSettle(out.kind);
    if (out.kind === "ok") { setSelected(out.value); setPrinting(false); } else setNotice(noticeFor(out, "session"));
  }, [session, onSettle]);

  useEffect(() => {
    void (async () => {
      const out = await session.authed((t) => session.api.get(t, "/buyers?include_inactive=true", readBuyers));
      onSettle(out.kind);
      if (out.kind === "ok") setBuyers(out.value);
    })();
  }, [session, onSettle]);
  useEffect(() => { void load(filter); }, [filter, load]);
  useEffect(() => { if (props.openId !== null) void open(props.openId); }, [props.openId, open]);

  const rows = listed !== null && listed.key === salesQuery(filter) ? listed.rows : null;
  const choosePreset = (id: PresetId) => {
    const r = presetRange(id, new Date());
    setPreset(id);
    setFilter((f) => ({ ...f, from: r.from, to: r.to }));
  };
  return (
    <>
      <div className="filters" role="search" aria-label="ตัวกรองบิลขาย">
        <div className="chips" role="group" aria-label="ช่วงวันที่">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={preset === p.id} onClick={() => choosePreset(p.id)}>{p.label}</button>
          ))}
        </div>
        <DateField name="from" label="ตั้งแต่" value={filter.from} today={shopToday(new Date())}
          onChange={(w) => { setPreset(null); setFilter((f) => ({ ...f, from: w })); }} />
        <DateField name="to" label="ถึง" value={filter.to} today={shopToday(new Date())}
          onChange={(w) => { setPreset(null); setFilter((f) => ({ ...f, to: w })); }} />
        <label className="field field-inline">
          <span className="field-label">ผู้ซื้อ</span>
          <select name="buyer" value={filter.buyerId ?? ""} onChange={(e) => setFilter((f) => ({ ...f, buyerId: e.target.value === "" ? null : e.target.value }))}>
            <option value="">ทุกราย</option>
            {buyers.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" name="includeVoided" checked={filter.includeVoided} onChange={(e) => setFilter((f) => ({ ...f, includeVoided: e.target.checked }))} />
          แสดงบิลที่ยกเลิกแล้ว
        </label>
      </div>
      <p className="range-label">{filter.from === filter.to ? `วันที่ ${shopDayLabel(filter.from)}` : `${shopDayLabel(filter.from)} – ${shopDayLabel(filter.to)}`}
        {rows !== null ? ` · ${rows.length.toLocaleString("en-US")} บิล` : ""}</p>
      {notice !== null ? <p className="notice notice-warn" role="alert">{notice}</p> : null}
      <div className={selected !== null ? "bills-split has-panel" : "bills-split"}>
        {rows === null ? <div className="table-empty" aria-busy="true">กำลังโหลด…</div>
          : rows.length === 0 ? <div className="table-empty" data-list-state="empty">ไม่มีบิลขายในช่วงนี้</div> : (
            <table className="grid" data-sales>
              <thead><tr><th>เลขที่</th><th>วันที่ เวลา</th><th>ผู้ซื้อ</th><th className="num">ยอดขาย</th><th className="num">ค้างรับ</th><th>การรับเงิน</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} data-sale={s.doc_no} aria-selected={selected?.id === s.id} className={s.status === "voided" ? "row-voided" : undefined}
                    onClick={() => void open(s.id)}>
                    <td className="nowrap"><button type="button" className="link" onClick={() => void open(s.id)}>{s.doc_no}</button>
                      {s.status === "voided" ? <span className="badge badge-danger">ยกเลิกแล้ว</span> : null}</td>
                    <td className="nowrap">{shopDateTime(s.server_received_at)}</td>
                    <td>{s.buyer_code ?? ""} {s.buyer_name ?? ""}</td>
                    <td className="num">{display(s.total_amount)}</td>
                    <td className="num">{s.status === "voided" ? "—" : display(s.outstanding_amount)}</td>
                    <td>{s.status === "voided" ? "—" : RECEIPT_STATUS_TEXT[s.receipt_status] ?? s.receipt_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        {selected !== null && printing ? (
          <SaleSlip sale={selected} {...props} onClose={() => setPrinting(false)} />
        ) : null}
        {selected !== null && !printing ? (
          <SalePanel sale={selected} {...props} onPrint={() => setPrinting(true)} onChanged={(s) => { setSelected(s); void load(filter); }}
            onClose={() => setSelected(null)} />
        ) : null}
      </div>
    </>
  );
}

function SalePanel(props: Props & { sale: Sale; onPrint: () => void; onChanged: (s: Sale) => void; onClose: () => void }) {
  const { sale, session, onSettle } = props;
  const perms = session.me?.permissions ?? [];
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer" | "promptpay">("cash");
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const live = sale.status === "active";

  const doVoid = async () => {
    const p = voidReasonProblem(reason);
    if (p !== null) { setNotice({ text: p, ok: false }); return; }
    setBusy(true);
    try {
      const out = await session.authed((t) => session.api.post(t, `/sales/${sale.id}/void`, { reason: reason.trim(), idempotency_key: `void-${sale.id}` }, readSale));
      onSettle(out.kind);
      if (out.kind === "ok") { props.onChanged(out.value); setConfirming(false); setNotice({ text: "ยกเลิกบิลขายแล้ว — บิลยังอยู่ในประวัติพร้อมเหตุผล และสต็อกถูกคืนแล้ว", ok: true }); }
      else setNotice({ text: noticeFor(out, "session"), ok: false });
    } finally { setBusy(false); }
  };

  const doReceive = async () => {
    const p = amount.trim() === "" ? "กรอกยอดรับเงิน" : receivedProblem(amount, sale.outstanding_amount);
    if (p !== null) { setNotice({ text: p === "ยอดรับเงินมากกว่ายอดขาย" ? "ยอดรับเงินมากกว่ายอดค้างรับ" : p, ok: false }); return; }
    setBusy(true);
    try {
      const out = await session.authed((t) => session.api.post(t, "/sale-receipts", {
        id: uuid(), buyer_id: sale.buyer_id, method, amount: amount.trim(), idempotency_key: `rcpt-${uuid()}`,
        device_created_at: new Date().toISOString(), allocations: [{ bill_id: sale.id, amount: amount.trim() }],
      }, () => true as const));
      onSettle(out.kind);
      if (out.kind !== "ok") { setNotice({ text: noticeFor(out, "session"), ok: false }); return; }
      const again = await session.authed((t) => session.api.get(t, `/sales/${sale.id}`, readSale));
      onSettle(again.kind);
      if (again.kind === "ok") { props.onChanged(again.value); setAmount(""); setNotice({ text: "บันทึกการรับเงินแล้ว", ok: true }); }
    } finally { setBusy(false); }
  };

  return (
    <aside className="panel" aria-label={`บิลขาย ${sale.doc_no}`} data-sale-detail={sale.doc_no}>
      <div className="panel-head">
        <h2 className="panel-title">{sale.doc_no}</h2>
        <button type="button" className="btn btn-quiet btn-small" onClick={props.onClose}>ปิด</button>
      </div>
      <p className="panel-sub">{shopDateTime(sale.server_received_at)} · {sale.buyer_code ?? ""} {sale.buyer_name ?? ""}</p>
      {sale.status === "voided" ? <p className="notice notice-error" data-voided>ยกเลิกแล้ว — {sale.void_reason ?? ""}</p> : null}
      <table className="grid grid-compact" data-sale-lines>
        <thead><tr><th>สินค้า</th><th className="num">ปริมาณ</th><th className="num">ราคา</th><th className="num">ยอดเงิน</th></tr></thead>
        <tbody>
          {(sale.items ?? []).map((l) => (
            <tr key={l.id}>
              <td>{l.product_code ?? ""} {l.product_name ?? ""}
                {l.deduction_weight !== "0.000" ? <div className="line-calc">หักสิ่งเจือปน {display(l.deduction_weight)} {l.unit_name}{l.deduction_reason !== null ? ` · ${l.deduction_reason}` : ""}</div> : null}
                {/* Under the product, not a fifth column: the panel is too narrow for five (measured, f3 shot). */}
                {l.gross_profit !== undefined ? <div className="line-calc" data-line-gross-profit>{GROSS_PROFIT} {display(l.gross_profit)}</div> : null}</td>
              <td className="num nowrap">{l.pricing_basis === "lump" ? "เหมา" : `${display(l.quantity)} ${l.unit_name}`}</td>
              <td className="num">{display(l.unit_price)}</td>
              <td className="num">{display(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="figures" data-sale-figures>
        <div><dt>ยอดขาย</dt><dd className="num">{display(sale.total_amount)}</dd></div>
        {sale.cost_amount !== undefined ? <div><dt>ต้นทุน</dt><dd className="num">{display(sale.cost_amount)}</dd></div> : null}
        {sale.gross_profit !== undefined ? <div><dt>{GROSS_PROFIT}</dt><dd className="num" data-gross-profit>{display(sale.gross_profit)}</dd></div> : null}
        <div><dt>รับเงินแล้ว</dt><dd className="num">{display(sale.received_amount)}</dd></div>
        <div><dt>ค้างรับ</dt><dd className="num" data-outstanding>{display(sale.outstanding_amount)}</dd></div>
      </dl>
      {sale.gross_profit !== undefined ? <p className="field-hint">{GROSS_PROFIT} = ยอดขาย − ต้นทุนเฉลี่ยของสินค้าที่ขาย ยังไม่หักค่าใช้จ่ายอื่น</p> : null}
      {notice !== null ? <p className={notice.ok ? "notice notice-ok" : "notice notice-error"} role="status" data-panel-notice>{notice.text}</p> : null}
      {live && perms.includes("sales.receive") && sale.outstanding_amount !== "0.00" ? (
        <fieldset className="policy" data-receive>
          <legend className="section-title">รับเงินจากผู้ซื้อ</legend>
          <div className="row-inline">
            <label className="field field-narrow"><span className="field-label">ยอดรับ (บาท)</span>
              <input name="receiveAmount" inputMode="decimal" value={amount} placeholder={sale.outstanding_amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="field field-narrow"><span className="field-label">วิธีรับ</span>
              <select name="receiveMethod" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                <option value="cash">เงินสด</option><option value="transfer">โอน</option><option value="promptpay">พร้อมเพย์</option>
              </select></label>
          </div>
          <button type="button" className="btn btn-primary" data-receive-save disabled={busy} onClick={() => void doReceive()}>บันทึกการรับเงิน</button>
        </fieldset>
      ) : null}
      <div className="void-actions">
        {live ? <button type="button" className="btn btn-quiet" data-print onClick={props.onPrint}>พิมพ์สลิป</button> : null}
        {live && perms.includes("sales.void") && !confirming ? (
          <button type="button" className="btn btn-danger-quiet" data-void-start onClick={() => setConfirming(true)}>ยกเลิกบิลขาย</button>
        ) : null}
      </div>
      {confirming ? (
        <div className="void-confirm" data-void-confirm>
          <label className="field"><span className="field-label">เหตุผลที่ยกเลิก (บันทึกไว้ในประวัติ)</span>
            <textarea name="voidReason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="void-actions">
            <button type="button" className="btn btn-danger" data-void-confirm-yes disabled={busy} onClick={() => void doVoid()}>ยืนยันยกเลิก</button>
            <button type="button" className="btn btn-quiet" onClick={() => setConfirming(false)}>ไม่ยกเลิก</button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function SaleSlip(props: Props & { sale: Sale; onClose: () => void }) {
  const { sale, session, onSettle } = props;
  const [shop, setShop] = useState<ShopHeader | null>(null);
  const [settings, setSettings] = useState<{ width: PaperWidth; codePage: number } | null | undefined>(undefined);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const printedAt = useMemo(() => new Date().toISOString(), [sale.id]);
  useEffect(() => {
    void (async () => {
      const out = await session.authed((t) => session.api.get(t, "/shop", readShop));
      onSettle(out.kind);
      if (out.kind === "ok") setShop(out.value); else setNotice({ text: noticeFor(out, "session"), ok: false });
    })();
    window.recycle.printer.load().then((s) => setSettings(s === null ? null : { width: s.width, codePage: s.codePage }), () => setSettings(null));
  }, [session, onSettle]);
  const refusal = saleSlipRefusal(sale);
  const width: PaperWidth = settings?.width ?? 58;
  const lines = shop !== null ? saleSlipLines(shop, sale, printedAt) : [];
  const encoded = shop !== null ? escposBytes(lines, width, settings?.codePage ?? DEFAULT_THAI_CODE_PAGE) : null;
  const send = async () => {
    if (encoded === null) return;
    try {
      const out = await window.recycle.printer.send(encoded.bytes);
      setNotice({ text: sendText(out.kind), ok: out.kind === "sent" });
    } catch { setNotice({ text: sendText("failed"), ok: false }); }
  };
  return (
    <aside className="panel" aria-label={`สลิป ${sale.doc_no}`} data-sale-slip={sale.doc_no}>
      <div className="panel-head"><h2 className="panel-title">พิมพ์สลิปขาย</h2>
        <button type="button" className="btn btn-quiet btn-small" onClick={props.onClose}>กลับ</button></div>
      {refusal !== null ? <p className="notice notice-error" role="alert">{refusal}</p> : (
        <>
          {settings === null ? <p className="notice notice-warn">{sendText("not_configured")}</p> : null}
          {shop !== null ? <Paper lines={lines} width={width} /> : <p className="table-empty" aria-busy="true">กำลังเตรียมสลิป…</p>}
          <p className="slip-meta">กระดาษ {width} มม. · {COLUMNS[width]} ตัวอักษรต่อบรรทัด</p>
          {notice !== null ? <p className={notice.ok ? "notice notice-ok" : "notice notice-error"} role="status">{notice.text}</p> : null}
          <button type="button" className="btn btn-primary" disabled={encoded === null || settings == null} onClick={() => void send()}>ส่งไปเครื่องพิมพ์</button>
        </>
      )}
    </aside>
  );
}

// --- the new sale ---------------------------------------------------------------------------------

const EMPTY_LINE: DraftLine = { productId: "", gross: "", tare: "", price: "", pieces: "", basis: "weight" };

function NewSale(props: Props & { onSaved: (id: string) => void }) {
  const { session, onSettle } = props;
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [products, setProducts] = useState<ProductChoice[]>([]);
  const [buyerId, setBuyerId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([EMPTY_LINE]);
  const [received, setReceived] = useState("");
  const [quote, setQuote] = useState<{ key: string; q: Quote } | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // The shop's rounding rule, declared on every line (lineBody). Null until GET /shop answers.
  const [rule, setRule] = useState<string | null>(null);
  // One id per form: a second press of บันทึก replays the SAME sale (hard rule 4), never a second bill.
  const [saleId] = useState(uuid);
  const [lineIds] = useState(() => Array.from({ length: 50 }, uuid));

  useEffect(() => {
    void (async () => {
      const [b, p, s] = await Promise.all([
        session.authed((t) => session.api.get(t, "/buyers", readBuyers)),
        session.authed((t) => session.api.get(t, "/products", readProductChoices)),
        session.authed((t) => session.api.get(t, "/shop", (j) =>
          j !== null && typeof j === "object" ? readShopMoney(j as Record<string, unknown>) : null)),
      ]);
      onSettle(b.kind);
      if (b.kind === "ok") setBuyers(b.value);
      if (p.kind === "ok") setProducts(p.value);
      if (s.kind === "ok") setRule(s.value.rounding_rule);
    })();
  }, [session, onSettle]);

  const key = JSON.stringify({ buyerId, lines });
  const current = quote !== null && quote.key === key ? quote.q : null;
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    setLine(i, { productId, basis: p?.pricing_basis ?? "weight", price: p?.sell_price ?? "" });
  };
  const problem = (): string | null => {
    if (rule === null) return "ยังอ่านกติกาการปัดเศษของร้านไม่ได้ — ลองเปิดหน้านี้ใหม่";
    if (buyerId === "") return "เลือกผู้ซื้อ";
    for (const [i, l] of lines.entries()) {
      const p = lineProblem(l);
      if (p !== null) return `รายการที่ ${String(i + 1)}: ${p}`;
    }
    return null;
  };
  const body = (q: Quote | null) => ({
    id: saleId, buyer_id: buyerId, device_created_at: new Date().toISOString(), idempotency_key: `sale-${saleId}`,
    items: lines.map((l, i) => lineBody(l, i + 1, lineIds[i] ?? uuid(), q?.items.find((x) => x.line_no === i + 1)?.net_weight ?? null,
      rule ?? "")),
    ...(q !== null ? { total_amount: q.total_amount } : {}),
  });

  const doQuote = async () => {
    const p = problem();
    if (p !== null) { setNotice({ text: p, ok: false }); return; }
    setBusy(true);
    try {
      const out = await session.authed((t) => session.api.post(t, "/sales/quote", body(null), readQuote));
      onSettle(out.kind);
      if (out.kind === "ok") { setQuote({ key, q: out.value }); setNotice(null); } else setNotice({ text: noticeFor(out, "session"), ok: false });
    } finally { setBusy(false); }
  };

  const doSave = async () => {
    if (current === null) return;
    const rp = receivedProblem(received, current.total_amount);
    if (rp !== null) { setNotice({ text: rp, ok: false }); return; }
    setBusy(true);
    try {
      const b = { ...body(current), ...(received.trim() !== "" ? { received_amount: received.trim() } : {}) };
      const out = await session.authed((t) => session.api.post(t, "/sales", b, readSale));
      onSettle(out.kind);
      if (out.kind === "ok") props.onSaved(out.value.id); else setNotice({ text: noticeFor(out, "session"), ok: false });
    } finally { setBusy(false); }
  };

  const offered = products;
  return (
    <div className="form-stack sale-form" data-new-sale>
      <label className="field field-narrow">
        <span className="field-label">ผู้ซื้อ</span>
        <select name="saleBuyer" value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
          <option value="">— เลือกผู้ซื้อ —</option>
          {buyers.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
        </select>
        {buyers.length === 0 ? <span className="field-hint">ยังไม่มีผู้ซื้อ — เพิ่มที่ ข้อมูลหลัก › ผู้ซื้อ</span> : null}
      </label>
      <table className="grid" data-sale-form-lines>
        <thead><tr><th>สินค้า</th><th className="num">น้ำหนักรวม / จำนวน</th><th className="num">ภาชนะ</th><th className="num">ราคาต่อหน่วย</th>
          <th className="num">สุทธิ</th><th className="num">ยอดเงิน</th><th /></tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const p = offered.find((x) => x.id === l.productId);
            const q = current?.items.find((x) => x.line_no === i + 1);
            return (
              <tr key={i} data-sale-form-line={i + 1}>
                <td><select name={`product-${String(i + 1)}`} value={l.productId} onChange={(e) => pick(i, e.target.value)}>
                  <option value="">— เลือก —</option>
                  {offered.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
                </select></td>
                <td className="num">{l.basis === "lump" ? "เหมา" : l.basis === "piece"
                  ? <input name={`pieces-${String(i + 1)}`} inputMode="numeric" value={l.pieces} onChange={(e) => setLine(i, { pieces: e.target.value })} aria-label="จำนวนชิ้น" />
                  : <input name={`gross-${String(i + 1)}`} inputMode="decimal" value={l.gross} onChange={(e) => setLine(i, { gross: e.target.value })} aria-label="น้ำหนักรวม" />}
                  {p !== undefined && l.basis !== "lump" ? <span className="unit"> {p.unit_name}</span> : null}</td>
                <td className="num">{l.basis === "weight" ? <input name={`tare-${String(i + 1)}`} inputMode="decimal" value={l.tare} onChange={(e) => setLine(i, { tare: e.target.value })} aria-label="ภาชนะ" /> : "—"}</td>
                <td className="num"><input name={`price-${String(i + 1)}`} inputMode="decimal" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} aria-label="ราคาต่อหน่วย" /></td>
                <td className="num" data-quote-net>{q !== undefined ? display(q.quantity) : "—"}</td>
                <td className="num" data-quote-amount>{q !== undefined ? display(q.amount) : "—"}</td>
                <td>{lines.length > 1 ? <button type="button" className="btn btn-quiet btn-small" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>ลบ</button> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {lines.length < 50 ? <button type="button" className="btn btn-quiet" data-add-line onClick={() => setLines((ls) => [...ls, EMPTY_LINE])}>เพิ่มรายการ</button> : null}
      <div className="sale-total">
        <span>ยอดรวม</span><span className="num" data-quote-total>{current !== null ? display(current.total_amount) : "กด คำนวณยอด"}</span>
      </div>
      <label className="field field-narrow"><span className="field-label">รับเงินแล้ว (บาท) — เว้นว่างถ้ายังไม่รับ</span>
        <input name="received" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} /></label>
      {notice !== null ? <p className={notice.ok ? "notice notice-ok" : "notice notice-error"} role="alert" data-sale-notice>{notice.text}</p> : null}
      <div className="void-actions">
        <button type="button" className="btn btn-quiet" data-quote disabled={busy} onClick={() => void doQuote()}>คำนวณยอด</button>
        <button type="button" className="btn btn-primary" data-save-sale disabled={busy || current === null} onClick={() => void doSave()}>
          {busy ? "กำลังบันทึก…" : "บันทึกบิลขาย"}
        </button>
      </div>
      {current === null && quote !== null ? <p className="field-hint">แก้รายการแล้ว — กด คำนวณยอด อีกครั้งก่อนบันทึก</p> : null}
    </div>
  );
}
