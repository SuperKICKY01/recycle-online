/**
 * THE BILLS SCREEN (B3, SRS 2.1, ROADMAP P1.14): the shop's purchase bills for a shop-day range
 * and optionally one seller, a detail beside the list, and VOID WITH A REASON — hard rule 5: a
 * wrong bill is voided and stays in history, never deleted.
 *
 * Every request goes through `Session.authed`, so a 401 here ends the session exactly as
 * anywhere else (no retry, no loop). Money is the server's decimal string, grouped for the eye
 * only (src/shared/money.ts); dates are shop time, Buddhist era, via @recycle/shop-time.
 * Voiding is an INLINE confirmation in the detail panel, not a modal
 * (impeccable · operate.md · "Modal as first thought. Modals are usually laziness.").
 */
import { useCallback, useEffect, useState } from "react";
import { shopDateTime } from "@recycle/shop-time";

import type { ApiOutcome } from "../shared/api";
import {
  billsQuery,
  listCountText,
  RANGE_TEXT,
  rangeProblem,
  mayVoid,
  PAYMENT_STATUS_TEXT,
  readBillDetail,
  readBillList,
  readSellers,
  voidReasonProblem,
  type BillDetail,
  type BillFilter,
  type BillRow,
  type SellerChoice,
} from "../shared/bills";
import { display } from "../shared/money";
import { presetRange, PRESETS, shopDayLabel, type PresetId } from "../shared/period";
import { noticeFor, type Session } from "../shared/session";
import { SlipPreview } from "./Slip";

interface Props {
  readonly session: Session;
  /** Called after any request, so an ended session leaves this screen. */
  readonly onSettle: (kind: ApiOutcome<unknown>["kind"]) => void;
}

export function BillsScreen({ session, onSettle }: Props) {
  const initial = presetRange("today", new Date());
  const [filter, setFilter] = useState<BillFilter>({ from: initial.from, to: initial.to, sellerId: null, includeVoided: false });
  const [preset, setPreset] = useState<PresetId | null>("today");
  /**
   * The last list the server gave, WITH the query it answers. The screen shows it only while that
   * query is still the one on screen, so a failed or late answer can never put one range's bills
   * (or their count) under another range's heading (red team 2026-10-12, B3 finding 2).
   */
  const [listed, setListed] = useState<{ key: string; rows: BillRow[] } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [sellers, setSellers] = useState<SellerChoice[]>([]);
  const [selected, setSelected] = useState<BillDetail | null>(null);
  /** The bill whose slip is on screen (the preview replaces the detail panel), or null. */
  const [printing, setPrinting] = useState(false);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (f: BillFilter) => {
    const problem = rangeProblem(f);
    if (problem !== null) {
      setListNotice(problem);
      return;
    }
    const key = billsQuery(f);
    setLoading(true);
    const out = await session.authed((t) => session.api.get(t, key, readBillList));
    setLoading(false);
    onSettle(out.kind);
    if (out.kind === "ok") {
      setListed({ key, rows: out.value });
      setFailedKey(null);
      setListNotice(null);
    } else {
      setFailedKey(key);
      setListNotice(noticeFor(out, "session"));
    }
  }, [session, onSettle]);

  useEffect(() => {
    void (async () => {
      const out = await session.authed((t) => session.api.get(t, "/sellers", readSellers));
      onSettle(out.kind);
      if (out.kind === "ok") setSellers(out.value);
    })();
  }, [session, onSettle]);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const open = async (id: string) => {
    const out = await session.authed((t) => session.api.get(t, `/bills/${id}`, readBillDetail));
    onSettle(out.kind);
    if (out.kind === "ok") {
      setSelected(out.value);
      setPrinting(false);
    } else setListNotice(noticeFor(out, "session"));
  };

  const currentKey = billsQuery(filter);
  const rows = listed !== null && listed.key === currentKey ? listed.rows : null;
  const invalid = rangeProblem(filter);
  const tableState = invalid !== null ? "invalid" : failedKey === currentKey ? "failed" : "loading";

  const choosePreset = (id: PresetId) => {
    const r = presetRange(id, new Date());
    setPreset(id);
    setFilter((f) => ({ ...f, from: r.from, to: r.to }));
  };

  return (
    <div className="bills" data-screen="bills">
      <h1 className="page-title">บิลรับซื้อ</h1>
      <div className="filters" role="search" aria-label="ตัวกรองบิล">
        <div className="chips" role="group" aria-label="ช่วงวันที่">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={preset === p.id} onClick={() => choosePreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="field field-inline">
          <span className="field-label">ตั้งแต่</span>
          <input type="date" name="from" value={filter.from}
            onChange={(e) => { setPreset(null); setFilter((f) => ({ ...f, from: e.target.value })); }} />
        </label>
        <label className="field field-inline">
          <span className="field-label">ถึง</span>
          <input type="date" name="to" value={filter.to}
            onChange={(e) => { setPreset(null); setFilter((f) => ({ ...f, to: e.target.value })); }} />
        </label>
        <label className="field field-inline">
          <span className="field-label">ผู้ขาย</span>
          <select name="seller" value={filter.sellerId ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, sellerId: e.target.value === "" ? null : e.target.value }))}>
            <option value="">ทุกคน</option>
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" name="includeVoided" checked={filter.includeVoided}
            onChange={(e) => setFilter((f) => ({ ...f, includeVoided: e.target.checked }))} />
          แสดงบิลที่ยกเลิกแล้ว
        </label>
      </div>
      <p className="range-label" data-range={`${filter.from}..${filter.to}`}>
        {filter.from === filter.to ? `วันที่ ${shopDayLabel(filter.from)}` : `${shopDayLabel(filter.from)} – ${shopDayLabel(filter.to)}`}
        {rows !== null && !listCountText(rows.length).partial ? ` · ${listCountText(rows.length).text}` : ""}
      </p>
      {rows !== null && listCountText(rows.length).partial ? (
        <p className="notice notice-warn" role="status" data-partial="true">{listCountText(rows.length).text}</p>
      ) : null}
      {listNotice !== null ? <p className="notice notice-warn" role="alert">{listNotice}</p> : null}
      <div className={selected !== null ? "bills-split has-panel" : "bills-split"}>
        <BillTable rows={rows} loading={loading} state={tableState} selectedId={selected?.id ?? null} onOpen={(id) => void open(id)} />
        {selected !== null && printing ? (
          <SlipPreview bill={selected} session={session} onSettle={onSettle} onClose={() => setPrinting(false)} />
        ) : null}
        {selected !== null && !printing ? (
          <BillPanel bill={selected} session={session} onSettle={onSettle} onPrint={() => setPrinting(true)}
            onVoided={(b) => { setSelected(b); void load(filter); }} onClose={() => setSelected(null)} />
        ) : null}
      </div>
    </div>
  );
}

function BillTable(props: {
  rows: BillRow[] | null; loading: boolean; state: "invalid" | "failed" | "loading"; selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const { rows, loading, state, selectedId, onOpen } = props;
  if (rows === null) {
    if (state === "invalid") return <div className="table-empty" data-list-state="invalid">—</div>;
    if (state === "failed") return <div className="table-empty" data-list-state="failed">{RANGE_TEXT.failed}</div>;
    return <div className="table-empty" aria-busy="true" data-list-state="loading">กำลังโหลดบิล…</div>;
  }
  if (rows.length === 0) {
    return <div className="table-empty">ไม่มีบิลในช่วงนี้ — ลองเปลี่ยนวันที่หรือผู้ขาย</div>;
  }
  return (
    <table className="grid" aria-busy={loading}>
      <thead>
        <tr><th>เลขที่บิล</th><th>วันที่ เวลา</th><th>ผู้ขาย</th><th className="col-opt">ทะเบียนรถ</th><th className="num">ยอดเงิน</th><th className="col-opt">การจ่าย</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} data-bill={r.doc_no ?? r.id} aria-selected={r.id === selectedId}
            className={r.status === "voided" ? "row-voided" : undefined} onClick={() => onOpen(r.id)}>
            <td className="nowrap">
              <button type="button" className="link" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}>{r.doc_no ?? "—"}</button>
              {r.status === "voided" ? <span className="badge badge-danger">ยกเลิกแล้ว</span> : null}
            </td>
            <td className="nowrap">{shopDateTime(r.server_received_at)}</td>
            <td>{r.seller_code ?? ""} {r.seller_name ?? ""}</td>
            <td className="col-opt">{r.vehicle_no ?? ""}</td>
            <td className="num">{display(r.total_amount)}</td>
            <td className="col-opt nowrap">{PAYMENT_STATUS_TEXT[r.payment_status] ?? r.payment_status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BillPanel(props: {
  bill: BillDetail; session: Session; onSettle: (kind: ApiOutcome<unknown>["kind"]) => void;
  onVoided: (b: BillDetail) => void; onClose: () => void; onPrint: () => void;
}) {
  const { bill, session, onSettle, onVoided, onClose, onPrint } = props;
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * One idempotency key per void the operator MEANS (minted when the form opens, reused by every
   * confirm of it): a confirm repeated after a lost answer replays that void and gets its original
   * outcome, never a second void (migration 0025, hard rule 4).
   */
  const [voidKey, setVoidKey] = useState("");
  /** Set when someone else voided the bill first: the panel then shows THEIR record. */
  const [already, setAlready] = useState(false);
  const canVoid = bill.status === "active" && mayVoid(session.me?.permissions ?? []);

  useEffect(() => { setVoiding(false); setReason(""); setProblem(null); setAlready(false); }, [bill.id]);

  const confirm = async () => {
    const p = voidReasonProblem(reason);
    if (p !== null) {
      setProblem(p);
      return;
    }
    setBusy(true);
    try {
      const out = await session.authed((t) => session.api.post(t, `/bills/${bill.id}/void`,
        { reason: reason.trim(), idempotency_key: voidKey }, readBillDetail));
      onSettle(out.kind);
      if (out.kind === "ok") {
        setVoiding(false);
        onVoided(out.value);
      } else if (out.kind === "invalid" && out.status === 409) {
        // Voided by someone else first. Their who/when/why stand; show THEM, not ours.
        const fresh = await session.authed((t) => session.api.get(t, `/bills/${bill.id}`, readBillDetail));
        onSettle(fresh.kind);
        setVoiding(false);
        setAlready(true);
        if (fresh.kind === "ok") onVoided(fresh.value);
      }
      else if (out.kind === "forbidden") setProblem("บัญชีนี้ไม่มีสิทธิ์ยกเลิกบิล");
      else setProblem(noticeFor(out, "session"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="panel" aria-label={`บิล ${bill.doc_no ?? ""}`} data-detail={bill.doc_no ?? bill.id}>
      <div className="panel-head">
        <h2 className="panel-title">บิล {bill.doc_no ?? "—"}</h2>
        <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>ปิด</button>
      </div>
      {already ? (
        <p className="notice notice-warn" role="status" data-void-already>
          บิลนี้ถูกยกเลิกไปก่อนแล้ว — เหตุผลของคุณไม่ได้ถูกบันทึก ด้านล่างคือการยกเลิกที่บันทึกไว้
        </p>
      ) : null}
      {bill.status === "voided" ? (
        <p className="notice notice-error" data-void-reason={bill.void_reason ?? ""}>
          ยกเลิกแล้ว{bill.voided_at !== null ? ` เมื่อ ${shopDateTime(bill.voided_at)}` : ""} — เหตุผล: {bill.void_reason}
        </p>
      ) : null}
      <dl className="facts">
        <dt>ผู้ขาย</dt><dd data-seller-name>{bill.seller_code ?? ""} {bill.seller_name ?? "—"}</dd>
        <dt>วันที่ เวลา</dt><dd>{shopDateTime(bill.server_received_at)}</dd>
        <dt>ทะเบียนรถ</dt><dd>{bill.vehicle_no ?? "—"}</dd>
        <dt>การจ่าย</dt><dd>{PAYMENT_STATUS_TEXT[bill.payment_status] ?? bill.payment_status} {bill.paid_amount !== null ? ` (${display(bill.paid_amount)} บาท)` : " (ไม่มียอดจ่ายในข้อมูล)"}</dd>
      </dl>
      <ol className="lines" aria-label="รายการสินค้า">
        {bill.items.map((i) => (
          <li key={i.line_no} className="line">
            <div className="line-head">
              <span>{i.product_code ?? ""} {i.product_name ?? ""}</span>
              <span className="num line-amount">{display(i.amount)}</span>
            </div>
            <div className="line-calc">
              ชั่งรวม {display(i.gross_weight)} − ภาชนะ {display(i.tare_weight)} = สุทธิ {display(i.net_weight)} กก. × {display(i.unit_price)} บาท/กก.
            </div>
          </li>
        ))}
      </ol>
      <div className="bill-total"><span>รวมทั้งบิล</span><span className="num">{display(bill.total_amount)} บาท</span></div>
      {!voiding ? (
        <div className="void-actions">
          <button type="button" className="btn btn-primary" onClick={onPrint}>พิมพ์สลิป</button>
          {canVoid ? <button type="button" className="btn btn-danger-quiet" onClick={() => { setVoidKey(crypto.randomUUID()); setVoiding(true); }}>ยกเลิกบิลนี้</button> : null}
        </div>
      ) : null}
      {voiding && canVoid ? (
        <div className="void-form" role="group" aria-label="ยกเลิกบิล">
          <p className="void-warn">บิลที่ยกเลิกจะยังอยู่ในประวัติพร้อมเหตุผล และเลขที่บิลจะไม่ถูกนำกลับมาใช้</p>
          <label className="field">
            <span className="field-label">เหตุผลที่ยกเลิก</span>
            <textarea name="voidReason" rows={2} value={reason} disabled={busy}
              onChange={(e) => { setReason(e.target.value); setProblem(null); }} placeholder="เช่น ชั่งผิดรายการ" />
          </label>
          {problem !== null ? <p className="notice notice-error" role="alert">{problem}</p> : null}
          <div className="void-actions">
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void confirm()}>
              {busy ? "กำลังยกเลิก…" : "ยืนยันยกเลิกบิล"}
            </button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setVoiding(false)}>ไม่ยกเลิก</button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
