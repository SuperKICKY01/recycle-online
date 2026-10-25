/**
 * STOCK (M2, SRS 1.3 สต๊อกคงเหลือ / 3.3): every product's balance at the caller's branch -- the sum of its
 * movements, as the server reads it, nothing cached here -- and one product's movements with the balance after
 * each; a counted correction (+ found, − lost) with its reason, for a stock.adjust holder.
 *
 * Average cost and stock value are money: drawn only when the server sends them (money.view_shop). A
 * movement is never edited here or anywhere: a wrong adjustment is answered by another adjustment.
 */
import { useCallback, useEffect, useState } from "react";
import { shopDateTime } from "@recycle/shop-time";

import type { ApiOutcome } from "../shared/api";
import { display } from "../shared/money";
import { adjustmentProblem, MOVEMENT_TEXT, readMovements, readStock, type Movement, type StockItem } from "../shared/sales";
import { noticeFor, type Session } from "../shared/session";

interface Props {
  readonly session: Session;
  readonly onSettle: (kind: ApiOutcome<unknown>["kind"]) => void;
}

export function StockScreen({ session, onSettle }: Props) {
  const perms = session.me?.permissions ?? [];
  const [stock, setStock] = useState<{ items: StockItem[]; total_value: string | null } | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<StockItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const out = await session.authed((t) => session.api.get(t, "/stock", readStock));
    onSettle(out.kind);
    if (out.kind === "ok") { setStock(out.value); setNotice(null); } else setNotice(noticeFor(out, "session"));
  }, [session, onSettle]);
  useEffect(() => { void load(); }, [load]);

  const q = query.trim().toLowerCase();
  const shown = (stock?.items ?? []).filter((i) => q === "" || i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q));
  const money = stock?.items.some((i) => i.value !== undefined) ?? false;
  return (
    <div className="bills" data-screen="stock">
      <h1 className="page-title">สินค้าคงเหลือ</h1>
      <div className="filters" role="search" aria-label="ค้นหาสินค้า">
        <label className="field field-inline"><span className="field-label">ค้นหา</span>
          <input name="stockSearch" value={query} placeholder="รหัสหรือชื่อสินค้า" onChange={(e) => setQuery(e.target.value)} /></label>
        {money && stock?.total_value != null ? <span className="report-totals" data-stock-total={stock.total_value}>มูลค่าสต็อกรวม {display(stock.total_value)} บาท</span> : null}
      </div>
      {notice !== null ? <p className="notice notice-warn" role="alert">{notice}</p> : null}
      <div className={open !== null ? "bills-split has-panel" : "bills-split"}>
        {stock === null ? <div className="table-empty" aria-busy="true">กำลังโหลด…</div> : (
          <table className="grid" data-stock>
            <thead><tr><th>รหัส</th><th>สินค้า</th>{money ? <th className="num">ราคาเฉลี่ย</th> : null}<th className="num">คงเหลือ</th>
              {money ? <th className="num">มูลค่า</th> : null}</tr></thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.product_id} data-stock-row={i.code} aria-selected={open?.product_id === i.product_id}
                  className={i.quantity.startsWith("-") ? "row-warn" : undefined} onClick={() => setOpen(i)}>
                  <td><button type="button" className="link" onClick={() => setOpen(i)}>{i.code}</button></td>
                  <td>{i.name}</td>
                  {money ? <td className="num">{i.average_cost != null ? display(i.average_cost) : "—"}</td> : null}
                  <td className="num" data-stock-qty>{display(i.quantity)} {i.unit_name}{i.quantity.startsWith("-") ? <span className="badge badge-danger">ติดลบ</span> : null}</td>
                  {money ? <td className="num">{i.value !== undefined ? display(i.value) : "—"}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {open !== null ? (
          <MovementsPanel item={open} session={session} onSettle={onSettle} canAdjust={perms.includes("stock.adjust")}
            onAdjusted={() => void load()} onClose={() => setOpen(null)} />
        ) : null}
      </div>
    </div>
  );
}

function MovementsPanel(props: Props & { item: StockItem; canAdjust: boolean; onAdjusted: () => void; onClose: () => void }) {
  const { item, session, onSettle } = props;
  const [moves, setMoves] = useState<Movement[] | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const load = useCallback(async () => {
    const out = await session.authed((t) => session.api.get(t, `/stock/movements?product_id=${item.product_id}`, readMovements));
    onSettle(out.kind);
    if (out.kind === "ok") setMoves(out.value); else setNotice({ text: noticeFor(out, "session"), ok: false });
  }, [session, onSettle, item.product_id]);
  useEffect(() => { void load(); }, [load]);

  const adjust = async () => {
    const p = adjustmentProblem(qty, reason);
    if (p !== null) { setNotice({ text: p, ok: false }); return; }
    setBusy(true);
    try {
      const out = await session.authed((t) => session.api.post(t, "/stock/adjustments", {
        product_id: item.product_id, quantity: qty.trim(), reason: reason.trim(), idempotency_key: `adj-${key}`,
        device_created_at: new Date().toISOString(),
      }, () => true as const));
      onSettle(out.kind);
      if (out.kind === "ok") {
        setNotice({ text: "บันทึกการปรับสต็อกแล้ว", ok: true });
        setQty(""); setReason(""); setKey(crypto.randomUUID());
        void load(); props.onAdjusted();
      } else setNotice({ text: noticeFor(out, "session"), ok: false });
    } finally { setBusy(false); }
  };

  return (
    <aside className="panel" aria-label={`ความเคลื่อนไหว ${item.code}`} data-movements={item.code}>
      <div className="panel-head"><h2 className="panel-title">{item.code} · {item.name}</h2>
        <button type="button" className="btn btn-quiet btn-small" onClick={props.onClose}>ปิด</button></div>
      <p className="panel-sub">คงเหลือ {display(item.quantity)} {item.unit_name}</p>
      {notice !== null ? <p className={notice.ok ? "notice notice-ok" : "notice notice-error"} role="status" data-adjust-notice>{notice.text}</p> : null}
      {props.canAdjust ? (
        <fieldset className="policy" data-adjust>
          <legend className="section-title">ปรับยอดสต็อก</legend>
          <p className="field-hint">ใส่จำนวนที่นับได้ต่างจากระบบ: บวกเมื่อเจอเพิ่ม ลบเมื่อหายหรือเสียหาย ระบบไม่แก้รายการเดิม</p>
          <label className="field field-narrow"><span className="field-label">จำนวน ({item.unit_name})</span>
            <input name="adjustQty" inputMode="decimal" value={qty} placeholder="-2.500" onChange={(e) => setQty(e.target.value)} /></label>
          <label className="field"><span className="field-label">เหตุผล (จำเป็น)</span>
            <input name="adjustReason" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <button type="button" className="btn btn-primary" data-adjust-save disabled={busy} onClick={() => void adjust()}>บันทึกการปรับ</button>
        </fieldset>
      ) : null}
      {moves === null ? <p className="table-empty" aria-busy="true">กำลังโหลด…</p> : moves.length === 0 ? <p className="table-empty">ยังไม่มีความเคลื่อนไหว</p> : (
        <div className="table-scroll">
          <table className="grid grid-compact" data-movement-list>
            <thead><tr><th>วันที่ เวลา</th><th>รายการ</th><th className="num">จำนวน</th><th className="num">คงเหลือ</th></tr></thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id} data-movement={m.kind}>
                  <td className="nowrap">{shopDateTime(m.created_at)}</td>
                  <td>{MOVEMENT_TEXT[m.kind] ?? m.kind}{m.doc_no !== null ? ` ${m.doc_no}` : ""}{m.reason !== null ? ` · ${m.reason}` : ""}
                    {m.recorded_by_migration ? <span className="badge">ย้อนหลัง</span> : null}</td>
                  <td className="num nowrap">{m.quantity.startsWith("-") ? "" : "+"}{display(m.quantity)}</td>
                  <td className="num nowrap">{display(m.balance_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
}
