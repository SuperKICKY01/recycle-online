/**
 * REPORTS (B7, SRS 3.1, 3.2): the transaction report with its filters and its Excel file, and the
 * master-data lists printed or saved as PDF.
 *
 * The report reads EVERY page of GET /bills (keyset cursor) before it shows a total, says how many
 * pages it read, and refuses to export what it could not finish. Money is the server's string
 * throughout: shown grouped, summed exactly (BigInt, never a float), written to the file verbatim.
 * Printing uses Chromium's own print path: "พิมพ์" opens the system dialog with the print layout;
 * "บันทึกเป็น PDF" saves the SAME layout (impeccable · operate.md · one action, one result -- the
 * PDF is what the paper would have been).
 */
import { useCallback, useEffect, useState } from "react";
import { shopDateTime } from "@recycle/shop-time";

import type { ApiOutcome } from "../shared/api";
import { pageQuery, PAYMENT_STATUS_TEXT, rangeProblem, readBillPage, readSellers, type BillFilter, type BillRow, type SellerChoice } from "../shared/bills";
import { readCodeNames, readProducts, readSellers as readSellerRows, readTiers, type CodeName, type Product, type Seller, type Tier } from "../shared/master";
import { display } from "../shared/money";
import { presetRange, shopDayLabel, shopToday } from "../shared/period";
import { MAX_REPORT_ROWS, REPORT_TEXT, reportFileName, reportSheet, reportTotals } from "../shared/report";
import {
  GROSS_PROFIT,
  readSale,
  readSales,
  readSalesReport,
  readStock,
  REPORT_BY_TEXT,
  salesByCategorySheets,
  salesReportSheet,
  stockSheet,
  type SalesReport,
  type StockItem,
} from "../shared/sales";
import { noticeFor, type Session } from "../shared/session";
import { buildXlsx } from "../shared/xlsx";
import { DateField } from "./DateField";

interface Props {
  readonly session: Session;
  readonly onSettle: (kind: ApiOutcome<unknown>["kind"]) => void;
}

const SAVE_TEXT: Readonly<Record<string, string>> = {
  cancelled: "ยกเลิกการบันทึกไฟล์",
  refused: "ชื่อไฟล์ไม่ถูกต้อง",
  failed: "บันทึกไฟล์ไม่สำเร็จ — ตรวจว่าโฟลเดอร์นั้นบันทึกได้",
};

export function ReportsScreen(props: Props) {
  const perms = props.session.me?.permissions ?? [];
  // M2: the sales and gross-profit report is money for the whole shop (money.view_shop); the stock report reads
  // quantities for anyone and its value only when the server sends it.
  const money = perms.includes("money.view_shop");
  const [tab, setTab] = useState<"bills" | "sales" | "stock" | "print">("bills");
  return (
    <div className="reports" data-screen="reports">
      <h1 className="page-title no-print">รายงาน</h1>
      <div className="tabs no-print" role="tablist" aria-label="รายงาน">
        <button type="button" role="tab" className="tab" data-tab="bills" aria-selected={tab === "bills"} onClick={() => setTab("bills")}>รายการรับซื้อ</button>
        {money ? <button type="button" role="tab" className="tab" data-tab="sales-report" aria-selected={tab === "sales"} onClick={() => setTab("sales")}>ขายและ{GROSS_PROFIT}</button> : null}
        <button type="button" role="tab" className="tab" data-tab="stock-report" aria-selected={tab === "stock"} onClick={() => setTab("stock")}>สินค้าคงเหลือ</button>
        <button type="button" role="tab" className="tab" data-tab="print" aria-selected={tab === "print"} onClick={() => setTab("print")}>พิมพ์รายการข้อมูลหลัก</button>
      </div>
      {tab === "bills" ? <TransactionReport {...props} /> : tab === "sales" ? <SalesReportTab {...props} />
        : tab === "stock" ? <StockReportTab {...props} /> : <MasterPrint {...props} />}
    </div>
  );
}

// --- M2: sales and gross profit -------------------------------------------------------------------

async function shopName(session: Session, onSettle: Props["onSettle"]): Promise<string> {
  const out = await session.authed((t) => session.api.get(t, "/shop", (j) => (typeof (j as { name?: unknown }).name === "string" ? (j as { name: string }).name : null)));
  onSettle(out.kind);
  return out.kind === "ok" ? out.value : "";
}

function SalesReportTab({ session, onSettle }: Props) {
  const init = presetRange("week", new Date());
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [by, setBy] = useState<"day" | "product" | "buyer">("day");
  const [report, setReport] = useState<{ key: string; r: SalesReport } | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = `${from}|${to}|${by}`;
  const current = report !== null && report.key === key ? report.r : null;
  const range = from === to ? shopDayLabel(from) : `${shopDayLabel(from)} ถึง ${shopDayLabel(to)}`;

  const run = async () => {
    if (from > to) { setNotice({ text: "วันเริ่มต้องไม่หลังวันสิ้นสุด", ok: false }); return; }
    setBusy(true);
    try {
      const out = await session.authed((t) => session.api.get(t, `/reports/sales?from_date=${from}&to_date=${to}&by=${by}`, readSalesReport));
      onSettle(out.kind);
      if (out.kind === "ok") { setReport({ key, r: out.value }); setNotice(null); } else setNotice({ text: noticeFor(out, "session"), ok: false });
    } finally { setBusy(false); }
  };

  const save = async (bytes: Uint8Array, name: string) => {
    try {
      const out = await window.recycle.files.save(bytes, name);
      setNotice(out.kind === "saved" ? { text: `บันทึกไฟล์แล้ว: ${out.path}`, ok: true } : { text: SAVE_TEXT[out.kind] ?? SAVE_TEXT["failed"] ?? "", ok: false });
    } catch { setNotice({ text: SAVE_TEXT["failed"] ?? "", ok: false }); }
  };
  const fileRange = (from === to ? shopDayLabel(from) : `${shopDayLabel(from)} ถึง ${shopDayLabel(to)}`).replace(/\//g, "-");

  const exportSummary = async () => {
    if (current === null) return;
    const shop = await shopName(session, onSettle);
    await save(buildXlsx(salesReportSheet(current, `${shop} · ขายและ${GROSS_PROFIT} ${range}`)), `ขายและ${GROSS_PROFIT} ${fileRange}.xlsx`);
  };

  /** SRS 3.2: the sale bills of the range, one sheet per product category. Reads every bill's lines (GET /sales/id). */
  const exportByCategory = async () => {
    setBusy(true);
    try {
      const list = await session.authed((t) => session.api.get(t, `/sales?from_date=${from}&to_date=${to}&limit=200`, readSales));
      onSettle(list.kind);
      if (list.kind !== "ok") { setNotice({ text: noticeFor(list, "session"), ok: false }); return; }
      if (list.value.length >= 200) { setNotice({ text: "ช่วงนี้มีบิลขายมากกว่า 200 ใบ — เลือกช่วงวันที่ให้สั้นลง รายงานที่ไม่ครบจะไม่ถูกส่งออก", ok: false }); return; }
      const full = [];
      for (const s of list.value) {
        const one = await session.authed((t) => session.api.get(t, `/sales/${s.id}`, readSale));
        onSettle(one.kind);
        if (one.kind !== "ok") { setNotice({ text: noticeFor(one, "session"), ok: false }); return; }
        full.push(one.value);
      }
      const [prods, cats] = await Promise.all([
        session.authed((t) => session.api.get(t, "/products?include_inactive=true", readProducts)),
        session.authed((t) => session.api.get(t, "/product-categories?include_inactive=true", readCodeNames("product_categories"))),
      ]);
      const catOf = (code: string | null): string => {
        const p = prods.kind === "ok" ? prods.value.find((x) => x.code === code) : undefined;
        const c = cats.kind === "ok" && p !== undefined ? cats.value.find((x) => x.id === p.category_id) : undefined;
        return c?.name ?? "ไม่มีหมวดหมู่";
      };
      const shop = await shopName(session, onSettle);
      await save(buildXlsx(salesByCategorySheets(full, catOf, `${shop} · รายการขาย ${range}`)), `รายการขายแยกหมวด ${fileRange}.xlsx`);
    } finally { setBusy(false); }
  };

  return (
    <div data-sales-report>
      <div className="filters" role="search" aria-label="ตัวกรองรายงานขาย">
        <DateField name="from" label="ตั้งแต่" value={from} today={shopToday(new Date())} onChange={setFrom} />
        <DateField name="to" label="ถึง" value={to} today={shopToday(new Date())} onChange={setTo} />
        <div className="chips" role="group" aria-label="จัดกลุ่มตาม">
          {(["day", "product", "buyer"] as const).map((b) => (
            <button key={b} type="button" className="chip" data-by={b} aria-pressed={by === b} onClick={() => setBy(b)}>ตาม{REPORT_BY_TEXT[b]}</button>
          ))}
        </div>
        <button type="button" className="btn btn-primary" data-run-sales-report disabled={busy} onClick={() => void run()}>แสดงรายงาน</button>
      </div>
      {notice !== null ? <p className={notice.ok ? "notice notice-ok" : "notice notice-warn"} role="status" data-sales-report-notice>{notice.text}</p> : null}
      <p className="field-hint">{GROSS_PROFIT} = ยอดขาย − ต้นทุนเฉลี่ยที่บันทึกไว้กับบิลขาย ยังไม่หักค่าใช้จ่ายอื่น · ไม่นับบิลที่ยกเลิก</p>
      {current !== null ? (
        <>
          <div className="report-totals" data-sales-totals>
            <span>{current.totals.bills.toLocaleString("en-US")} บิล</span>
            <span className="num">ยอดขาย {display(current.totals.amount)}</span>
            <span className="num">ต้นทุน {display(current.totals.cost)}</span>
            <span className="num" data-total-gross-profit={current.totals.gross_profit}>{GROSS_PROFIT} {display(current.totals.gross_profit)}</span>
            <button type="button" className="btn btn-quiet" data-export-sales onClick={() => void exportSummary()}>ส่งออกเป็น Excel</button>
            <button type="button" className="btn btn-quiet" data-export-sales-category disabled={busy} onClick={() => void exportByCategory()}>ส่งออกรายการขาย แยกหมวด</button>
          </div>
          <table className="grid" data-sales-report-table>
            <thead><tr><th>{REPORT_BY_TEXT[current.by]}</th><th className="num">บิล</th>
              {current.by === "product" ? <th className="num">ปริมาณ</th> : null}
              <th className="num">ยอดขาย</th><th className="num">ต้นทุน</th><th className="num">{GROSS_PROFIT}</th></tr></thead>
            <tbody>
              {current.rows.map((r) => (
                <tr key={r.key} data-sales-report-row={r.key}>
                  <td>{current.by === "day" ? shopDayLabel(r.label) : r.label}</td><td className="num">{r.bills}</td>
                  {current.by === "product" ? <td className="num">{r.quantity !== undefined ? `${display(r.quantity)} ${r.unit_code ?? ""}` : "—"}</td> : null}
                  <td className="num">{display(r.amount)}</td><td className="num">{display(r.cost)}</td><td className="num">{display(r.gross_profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}

function StockReportTab({ session, onSettle }: Props) {
  const [stock, setStock] = useState<{ items: StockItem[]; total_value: string | null } | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    void (async () => {
      const out = await session.authed((t) => session.api.get(t, "/stock", readStock));
      onSettle(out.kind);
      if (out.kind === "ok") setStock(out.value); else setNotice({ text: noticeFor(out, "session"), ok: false });
    })();
  }, [session, onSettle]);
  const exportStock = async () => {
    if (stock === null) return;
    const shop = await shopName(session, onSettle);
    try {
      const out = await window.recycle.files.save(buildXlsx(stockSheet(stock.items, stock.total_value, `${shop} · สินค้าคงเหลือ ณ ${shopDayLabel(shopToday(new Date()))}`)),
        `สินค้าคงเหลือ ${shopDayLabel(shopToday(new Date())).replace(/\//g, "-")}.xlsx`);
      setNotice(out.kind === "saved" ? { text: `บันทึกไฟล์แล้ว: ${out.path}`, ok: true } : { text: SAVE_TEXT[out.kind] ?? "", ok: false });
    } catch { setNotice({ text: SAVE_TEXT["failed"] ?? "", ok: false }); }
  };
  const money = stock?.items.some((i) => i.value !== undefined) ?? false;
  return (
    <div data-stock-report>
      {notice !== null ? <p className={notice.ok ? "notice notice-ok" : "notice notice-warn"} role="status" data-stock-report-notice>{notice.text}</p> : null}
      {stock === null ? <div className="table-empty" aria-busy="true">กำลังโหลด…</div> : (
        <>
          <div className="report-totals">
            <span>{stock.items.length.toLocaleString("en-US")} รายการ</span>
            {money && stock.total_value !== null ? <span className="num" data-stock-report-total={stock.total_value}>มูลค่ารวม {display(stock.total_value)} บาท</span> : null}
            <button type="button" className="btn btn-quiet" data-export-stock onClick={() => void exportStock()}>ส่งออกเป็น Excel</button>
          </div>
          <table className="grid" data-stock-report-table>
            <thead><tr><th>รหัส</th><th>ชื่อสินค้า</th>{money ? <th className="num">ราคาเฉลี่ย</th> : null}<th className="num">สต๊อกคงเหลือ</th>{money ? <th className="num">ยอดรวม (มูลค่า)</th> : null}</tr></thead>
            <tbody>
              {stock.items.map((i) => (
                <tr key={i.product_id}><td>{i.code}</td><td>{i.name}</td>
                  {money ? <td className="num">{i.average_cost != null ? display(i.average_cost) : "—"}</td> : null}
                  <td className="num">{display(i.quantity)} {i.unit_name}</td>
                  {money ? <td className="num">{i.value !== undefined ? display(i.value) : "—"}</td> : null}</tr>
              ))}
            </tbody>
            {money && stock.total_value !== null ? <tfoot><tr><td colSpan={4}>รวมมูลค่าสต็อกทั้งหมด</td><td className="num">{display(stock.total_value)}</td></tr></tfoot> : null}
          </table>
        </>
      )}
    </div>
  );
}

// --- the transaction report -----------------------------------------------------------------------

function TransactionReport({ session, onSettle }: Props) {
  const init = presetRange("week", new Date());
  const [filter, setFilter] = useState<BillFilter>({ from: init.from, to: init.to, sellerId: null, includeVoided: true });
  const [sellers, setSellers] = useState<SellerChoice[]>([]);
  const [result, setResult] = useState<{ key: string; rows: BillRow[]; complete: boolean; pages: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const key = JSON.stringify(filter);

  useEffect(() => {
    void (async () => {
      const out = await session.authed((t) => session.api.get(t, "/sellers", readSellers));
      onSettle(out.kind);
      if (out.kind === "ok") setSellers(out.value);
    })();
  }, [session, onSettle]);

  const run = async () => {
    const problem = rangeProblem(filter);
    if (problem !== null) { setNotice({ text: problem, ok: false }); return; }
    setNotice(null);
    setProgress(0);
    const rows: BillRow[] = [];
    let cursor: string | null = null;
    let pages = 0;
    try {
      for (;;) {
        const c: string | null = cursor;
        const out: ApiOutcome<{ rows: BillRow[]; next: string | null }> = await session.authed((t) => session.api.get(t, pageQuery(filter, c), readBillPage));
        onSettle(out.kind);
        if (out.kind !== "ok") { setNotice({ text: noticeFor(out, "session"), ok: false }); setResult(null); return; }
        rows.push(...out.value.rows);
        pages += 1;
        setProgress(rows.length);
        cursor = out.value.next;
        if (cursor === null) { setResult({ key, rows, complete: true, pages }); return; }
        if (rows.length >= MAX_REPORT_ROWS) { setResult({ key, rows, complete: false, pages }); setNotice({ text: REPORT_TEXT.tooMany, ok: false }); return; }
      }
    } finally {
      setProgress(null);
    }
  };

  const current = result !== null && result.key === key ? result : null;
  const totals = current !== null ? reportTotals(current.rows) : null;

  const exportXlsx = async () => {
    if (current === null || !current.complete || totals === null) return;
    try {
      const out = await window.recycle.files.save(buildXlsx(reportSheet(current.rows, totals)), reportFileName(filter.from, filter.to));
      setNotice(out.kind === "saved" ? { text: `บันทึกไฟล์แล้ว: ${out.path}`, ok: true } : { text: SAVE_TEXT[out.kind] ?? SAVE_TEXT["failed"] ?? "", ok: false });
    } catch {
      setNotice({ text: SAVE_TEXT["failed"] ?? "", ok: false });
    }
  };

  return (
    <div data-report>
      <div className="filters" role="search" aria-label="ตัวกรองรายงาน">
        <DateField name="from" label="ตั้งแต่" value={filter.from} today={shopToday(new Date())} onChange={(w) => setFilter((f) => ({ ...f, from: w }))} />
        <DateField name="to" label="ถึง" value={filter.to} today={shopToday(new Date())} onChange={(w) => setFilter((f) => ({ ...f, to: w }))} />
        <label className="field field-inline">
          <span className="field-label">ผู้ขาย</span>
          <select name="seller" value={filter.sellerId ?? ""} onChange={(e) => setFilter((f) => ({ ...f, sellerId: e.target.value === "" ? null : e.target.value }))}>
            <option value="">ทุกคน</option>
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" name="includeVoided" checked={filter.includeVoided} onChange={(e) => setFilter((f) => ({ ...f, includeVoided: e.target.checked }))} />
          รวมบิลที่ยกเลิก
        </label>
        <button type="button" className="btn btn-primary" data-run-report disabled={progress !== null} onClick={() => void run()}>
          {progress !== null ? `กำลังอ่าน… ${progress.toLocaleString("en-US")} บิล` : "แสดงรายงาน"}
        </button>
      </div>
      {notice !== null ? <p className={notice.ok ? "notice notice-ok" : "notice notice-warn"} role="status" data-report-notice>{notice.text}</p> : null}
      {result !== null && current === null ? <p className="field-hint">ตัวกรองเปลี่ยนแล้ว — กด แสดงรายงาน เพื่ออ่านใหม่</p> : null}
      {current !== null && totals !== null ? (
        <>
          <div className="report-totals" data-totals>
            <span data-count={totals.activeCount}>{totals.activeCount.toLocaleString("en-US")} บิล</span>
            {totals.voidedCount > 0 ? <span>ยกเลิก {totals.voidedCount.toLocaleString("en-US")} บิล</span> : null}
            <span className="num" data-total={totals.activeTotal ?? ""}>รวม {totals.activeTotal !== null ? display(totals.activeTotal) : "—"} บาท</span>
            <span className="field-hint" data-pages={current.pages}>อ่านครบ {current.pages} หน้า{current.complete ? "" : " (ยังไม่ครบ)"}</span>
            <button type="button" className="btn btn-quiet" data-export disabled={!current.complete} onClick={() => void exportXlsx()}>ส่งออกเป็น Excel</button>
          </div>
          <table className="grid" data-report-table>
            <thead><tr><th>เลขที่บิล</th><th>วันที่ เวลา</th><th>ผู้ขาย</th><th>ทะเบียนรถ</th><th className="num">ยอดเงิน</th><th>การจ่าย</th></tr></thead>
            <tbody>
              {current.rows.slice(0, 500).map((r) => (
                <tr key={r.id} data-report-row={r.doc_no ?? r.id} className={r.status === "voided" ? "row-voided" : undefined}>
                  <td className="nowrap">{r.doc_no ?? "—"}{r.status === "voided" ? <span className="badge badge-danger">ยกเลิกแล้ว</span> : null}</td>
                  <td className="nowrap">{shopDateTime(r.server_received_at)}</td>
                  <td>{r.seller_code ?? ""} {r.seller_name ?? ""}</td>
                  <td>{r.vehicle_no ?? ""}</td>
                  <td className="num">{display(r.total_amount)}</td>
                  <td>{PAYMENT_STATUS_TEXT[r.payment_status] ?? r.payment_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {current.rows.length > 500 ? <p className="field-hint">แสดงบนจอ 500 บิลแรกจาก {current.rows.length.toLocaleString("en-US")} — ไฟล์ Excel มีครบทุกบิล</p> : null}
        </>
      ) : null}
    </div>
  );
}

// --- printing the master-data lists ---------------------------------------------------------------

type ListKind = "products" | "sellers" | "tiers" | "categories" | "uoms";
const LISTS: readonly { id: ListKind; label: string }[] = [
  { id: "products", label: "สินค้าและราคา" }, { id: "sellers", label: "ผู้ขาย" }, { id: "tiers", label: "เกรด" },
  { id: "categories", label: "หมวดหมู่" }, { id: "uoms", label: "หน่วยนับ" },
];

interface MasterData { products: Product[]; sellers: Seller[]; tiers: Tier[]; categories: CodeName[]; uoms: CodeName[]; shop: string }

function MasterPrint({ session, onSettle }: Props) {
  const [kind, setKind] = useState<ListKind>("products");
  const [data, setData] = useState<MasterData | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [printedAt] = useState(() => new Date().toISOString());

  const load = useCallback(async () => {
    const get = async <T,>(path: string, read: (j: unknown) => T | null): Promise<T | null> => {
      const out = await session.authed((t) => session.api.get(t, path, read));
      onSettle(out.kind);
      return out.kind === "ok" ? out.value : null;
    };
    const [products, sellers, tiers, categories, uoms, shop] = await Promise.all([
      get("/products", readProducts), get("/sellers", readSellerRows), get("/grade-tiers", readTiers),
      get("/product-categories", readCodeNames("product_categories")), get("/uoms", readCodeNames("uoms")),
      get("/shop", (j) => (typeof (j as { name?: unknown }).name === "string" ? (j as { name: string }).name : null)),
    ]);
    if (products === null || sellers === null || tiers === null || categories === null || uoms === null || shop === null) {
      setNotice({ text: "โหลดข้อมูลหลักไม่สำเร็จ", ok: false });
      return;
    }
    setData({ products, sellers, tiers, categories, uoms, shop });
  }, [session, onSettle]);
  useEffect(() => { void load(); }, [load]);

  const savePdf = async () => {
    try {
      const pdf = await window.recycle.files.pdf();
      const label = LISTS.find((l) => l.id === kind)?.label ?? "";
      const out = await window.recycle.files.save(pdf, `รายการ${label}.pdf`);
      setNotice(out.kind === "saved" ? { text: `บันทึกไฟล์แล้ว: ${out.path}`, ok: true } : { text: SAVE_TEXT[out.kind] ?? "", ok: false });
    } catch {
      setNotice({ text: SAVE_TEXT["failed"] ?? "", ok: false });
    }
  };

  const title = LISTS.find((l) => l.id === kind)?.label ?? "";
  const catName = (id: string) => data?.categories.find((c) => c.id === id)?.name ?? "";
  const tierName = (code: string | null) => (code === null ? "เกรดเริ่มต้นของร้าน" : data?.tiers.find((t) => t.code === code)?.name ?? code);
  return (
    <div data-master-print>
      <div className="filters no-print">
        <div className="chips" role="group" aria-label="รายการที่จะพิมพ์">
          {LISTS.map((l) => <button key={l.id} type="button" className="chip" data-list={l.id} aria-pressed={kind === l.id} onClick={() => setKind(l.id)}>{l.label}</button>)}
        </div>
        <button type="button" className="btn btn-primary" disabled={data === null} onClick={() => window.print()}>พิมพ์</button>
        <button type="button" className="btn btn-quiet" data-save-pdf disabled={data === null} onClick={() => void savePdf()}>บันทึกเป็น PDF</button>
      </div>
      {notice !== null ? <p className={`no-print ${notice.ok ? "notice notice-ok" : "notice notice-warn"}`} role="status" data-print-notice>{notice.text}</p> : null}
      {data === null ? <div className="table-empty" aria-busy="true">กำลังโหลด…</div> : (
        <section className="print-area" data-print-area={kind}>
          <header className="print-head">
            <div className="print-shop">{data.shop}</div>
            <h2 className="print-title">รายการ{title}</h2>
            <div className="print-meta">พิมพ์เมื่อ {shopDateTime(printedAt)}</div>
          </header>
          <table className="print-table">
            {kind === "products" ? (<>
              <thead><tr><th>รหัส</th><th>ชื่อสินค้า</th><th>หมวดหมู่</th><th>หน่วย</th>{data.tiers.map((t) => <th key={t.code} className="num">{t.code}</th>)}</tr></thead>
              <tbody>{data.products.map((p) => (
                <tr key={p.id}><td>{p.code}</td><td>{p.name}</td><td>{catName(p.category_id)}</td><td>{p.uom_name}</td>
                  {data.tiers.map((t) => <td key={t.code} className="num" data-print-price={`${p.code}:${t.code}`}>{p.prices[t.code] !== undefined ? display(p.prices[t.code] ?? "") : "—"}</td>)}</tr>
              ))}</tbody>
            </>) : null}
            {kind === "sellers" ? (<>
              <thead><tr><th>รหัส</th><th>ชื่อผู้ขาย</th><th>เบอร์โทร</th><th>ทะเบียนรถ</th><th>เกรด</th></tr></thead>
              <tbody>{data.sellers.map((s) => (
                <tr key={s.id}><td>{s.code}</td><td>{s.name}</td><td>{s.phone ?? ""}</td><td>{s.vehicle_no ?? ""}</td><td>{tierName(s.grade)}</td></tr>
              ))}</tbody>
            </>) : null}
            {kind === "tiers" ? (<>
              <thead><tr><th>ลำดับ</th><th>รหัส</th><th>ชื่อเกรด</th></tr></thead>
              <tbody>{data.tiers.map((t, i) => <tr key={t.id}><td>{i + 1}</td><td>{t.code}</td><td>{t.name}</td></tr>)}</tbody>
            </>) : null}
            {kind === "categories" || kind === "uoms" ? (<>
              <thead><tr><th>รหัส</th><th>ชื่อ</th></tr></thead>
              <tbody>{data[kind].map((c) => <tr key={c.id}><td>{c.code}</td><td>{c.name}</td></tr>)}</tbody>
            </>) : null}
          </table>
          <footer className="print-foot">{kind === "sellers" ? "ไม่พิมพ์เลขบัตรและที่อยู่ของผู้ขาย" : ""}</footer>
        </section>
      )}
    </div>
  );
}
