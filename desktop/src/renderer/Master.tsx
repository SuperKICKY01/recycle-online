/**
 * MASTER DATA (B5, SRS 1.1–1.6): products and their prices per grade, categories, units, grade
 * tiers, sellers — list, search, add, edit, retire and bring back. NOTHING IS DELETED.
 *
 * One screen with five tabs, each a list beside a sticky panel (the bills screen's shape, so the
 * office learns one layout — impeccable · operate.md · "Consistency ... outrank[s] expression").
 * Controls a caller may not use are not drawn; the server still decides every write. A seller's
 * full ID number and address appear only for a `sellers.read_personal` holder (the server omits
 * the keys otherwise); everyone else sees the ID's last four, never a field that would look empty.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ApiOutcome } from "../shared/api";
import {
  matches,
  may,
  moveTier,
  PERM,
  priceProblem,
  readCodeNames,
  readOneCodeName,
  readProduct,
  readProducts,
  readSeller,
  readSellers,
  readTier,
  readTiers,
  sellerCreate,
  sellerPatch,
  textProblem,
  type CodeName,
  type Product,
  type Seller,
  type SellerForm,
  type Tier,
} from "../shared/master";
import { display } from "../shared/money";
import { noticeFor, type Session } from "../shared/session";
import {
  BASIS_TEXT,
  DEDUCTION_SETTINGS,
  DEDUCTION_TEXT,
  isOwner,
  MONEY_TEXT,
  PRICING_BASES,
  productRulesPatch,
  type DeductionSetting,
  type PricingBasis,
} from "../shared/moneyRules";

type Tab = "products" | "categories" | "uoms" | "tiers" | "sellers";

const TABS: readonly { id: Tab; label: string; addLabel: string }[] = [
  { id: "products", label: "สินค้าและราคา", addLabel: "เพิ่มสินค้า" },
  { id: "categories", label: "หมวดหมู่", addLabel: "เพิ่มหมวดหมู่" },
  { id: "uoms", label: "หน่วยนับ", addLabel: "เพิ่มหน่วยนับ" },
  { id: "tiers", label: "เกรด", addLabel: "เพิ่มเกรด" },
  { id: "sellers", label: "ผู้ขาย", addLabel: "เพิ่มผู้ขาย" },
];

interface Data {
  readonly products: Product[];
  readonly categories: CodeName[];
  readonly uoms: CodeName[];
  readonly tiers: Tier[];
  readonly sellers: Seller[];
}

interface Props {
  readonly session: Session;
  readonly onSettle: (kind: ApiOutcome<unknown>["kind"]) => void;
}

type Settle = Props["onSettle"];

/** "A" when a tier's name is its code, else "A · ราคาดี" -- never "A · A". */
const tierLabel = (t: { code: string; name: string }): string => (t.name.trim() === t.code ? t.code : `${t.code} · ${t.name}`);

/** Run one authenticated call; on refusal return the operator's sentence instead of the value. */
async function ask<T>(session: Session, onSettle: Settle, call: (token: string) => Promise<ApiOutcome<T>>): Promise<{ ok: T } | { problem: string }> {
  const out = await session.authed(call);
  onSettle(out.kind);
  return out.kind === "ok" ? { ok: out.value } : { problem: noticeFor(out, "session") };
}

export function MasterScreen({ session, onSettle }: Props) {
  const perms = session.me?.permissions ?? [];
  const [tab, setTab] = useState<Tab>("products");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  /** The row open in the panel, or "new" for the add form, per tab. */
  const [open, setOpen] = useState<string | "new" | null>(null);
  /**
   * The last write's confirmation, held HERE because an add re-opens the panel on the new row's id
   * (a new key, so a fresh panel): kept in the panel, the "added" line died with the old one and the
   * operator was told nothing (measured: the first B5 flow run).
   */
  const [flash, setFlash] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const all = "?include_inactive=true";
    const [p, c, u, t, s] = await Promise.all([
      ask(session, onSettle, (tk) => session.api.get(tk, `/products${all}`, readProducts)),
      ask(session, onSettle, (tk) => session.api.get(tk, `/product-categories${all}`, readCodeNames("product_categories"))),
      ask(session, onSettle, (tk) => session.api.get(tk, `/uoms${all}`, readCodeNames("uoms"))),
      ask(session, onSettle, (tk) => session.api.get(tk, `/grade-tiers${all}`, readTiers)),
      ask(session, onSettle, (tk) => session.api.get(tk, `/sellers${all}`, readSellers)),
    ]);
    const firstProblem = [p, c, u, t, s].find((r): r is { problem: string } => "problem" in r);
    if (firstProblem !== undefined || !("ok" in p) || !("ok" in c) || !("ok" in u) || !("ok" in t) || !("ok" in s)) {
      setFailed(firstProblem?.problem ?? "โหลดข้อมูลหลักไม่สำเร็จ");
      return;
    }
    setFailed(null);
    setData({ products: p.ok, categories: c.ok, uoms: u.ok, tiers: [...t.ok].sort((a, b) => a.sort_order - b.sort_order), sellers: s.ok });
  }, [session, onSettle]);

  useEffect(() => { void load(); }, [load]);

  const replace = <K extends keyof Data>(key: K, item: Data[K][number]) => {
    setData((d) => {
      if (d === null) return d;
      const list = d[key] as { id: string }[];
      const exists = list.some((x) => x.id === item.id);
      const next = exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
      return { ...d, [key]: next };
    });
  };

  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  const canAdd = tab === "products" || tab === "categories" || tab === "uoms" ? may(perms, PERM.master)
    : tab === "tiers" ? may(perms, PERM.tiers) : may(perms, PERM.sellerCreate);

  return (
    <div className="master" data-screen="master">
      <h1 className="page-title">ข้อมูลหลัก</h1>
      <div className="tabs" role="tablist" aria-label="ประเภทข้อมูล">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-tab={t.id} className="tab"
            onClick={() => { setTab(t.id); setOpen(null); setFlash(null); setQuery(""); }}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="master-tools">
        <input className="search" type="search" name="masterSearch" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "sellers" ? "ค้นหาชื่อ รหัส เบอร์โทร ทะเบียนรถ หรือเลขบัตร 4 ตัวท้าย" : "ค้นหารหัสหรือชื่อ"} aria-label="ค้นหา" />
        <label className="check">
          <input type="checkbox" name="showInactive" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          แสดงที่ปิดใช้งานแล้ว
        </label>
        {canAdd && current !== undefined ? (
          <button type="button" className="btn btn-primary" data-add={tab} onClick={() => { setFlash(null); setOpen("new"); }}>{current.addLabel}</button>
        ) : null}
      </div>
      {failed !== null ? <p className="notice notice-warn" role="alert">{failed}</p> : null}
      {data === null ? (
        <div className="table-empty" aria-busy={failed === null}>{failed === null ? "กำลังโหลดข้อมูลหลัก…" : "—"}</div>
      ) : (
        <div className={open !== null ? "bills-split has-panel" : "bills-split"}>
          <MasterTable tab={tab} data={data} query={query} showInactive={showInactive} openId={open} onOpen={(id) => { setFlash(null); setOpen(id); }} />
          {open !== null ? (
            <MasterPanel key={`${tab}:${open}`} tab={tab} id={open} data={data} perms={perms} session={session} onSettle={onSettle}
              flash={flash !== null && flash.id === open ? flash.text : null}
              onSaved={(key, item, text) => { replace(key, item as never); setFlash({ id: item.id, text }); setOpen(item.id); }}
              onClose={() => { setOpen(null); setFlash(null); }}
              onTiersReordered={(tiers) => setData((d) => (d === null ? d : { ...d, tiers }))} />
          ) : null}
        </div>
      )}
    </div>
  );
}

// --- the list ------------------------------------------------------------------------------------

function MasterTable(props: { tab: Tab; data: Data; query: string; showInactive: boolean; openId: string | null; onOpen: (id: string) => void }) {
  const { tab, data, query, showInactive, openId, onOpen } = props;
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "";
  const tierName = (code: string | null) => {
    if (code === null) return "เกรดเริ่มต้นของร้าน";
    const t = data.tiers.find((x) => x.code === code);
    return t === undefined ? code : tierLabel(t);
  };
  const keep = <T extends CodeName>(rows: T[], texts: (r: T) => (string | null | undefined)[]) =>
    rows.filter((r) => (showInactive || r.is_active) && matches(query, texts(r)));

  const head = (cols: string[]) => <thead><tr>{cols.map((c) => <th key={c} className={c === "ราคา" ? "num" : undefined}>{c}</th>)}</tr></thead>;
  const row = (r: CodeName, cells: React.ReactNode[]) => (
    <tr key={r.id} data-row={r.code} aria-selected={r.id === openId} className={r.is_active ? undefined : "row-retired"} onClick={() => onOpen(r.id)}>
      <td className="nowrap">
        <button type="button" className="link" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}>{r.code}</button>
        {!r.is_active ? <span className="badge badge-muted">ปิดใช้งาน</span> : null}
      </td>
      {cells.map((c, i) => <td key={i}>{c}</td>)}
    </tr>
  );

  let body: React.ReactNode[] = [];
  let cols: string[] = [];
  if (tab === "products") {
    cols = ["รหัส", "ชื่อสินค้า", "หมวดหมู่", "หน่วย", "ราคา"];
    body = keep(data.products, (p) => [p.code, p.name, catName(p.category_id)]).map((p) => row(p, [
      p.name, catName(p.category_id), p.uom_name,
      <span key="p" className="price-list">
        {data.tiers.filter((t) => t.is_active).map((t) => (
          <span key={t.code} className="price-chip" data-price={`${p.code}:${t.code}`}>
            {t.code} {p.prices[t.code] !== undefined ? display(p.prices[t.code] ?? "") : "—"}
          </span>
        ))}
      </span>,
    ]));
  } else if (tab === "categories" || tab === "uoms") {
    cols = ["รหัส", "ชื่อ"];
    body = keep(data[tab], (r) => [r.code, r.name]).map((r) => row(r, [r.name]));
  } else if (tab === "tiers") {
    cols = ["รหัส", "ชื่อเกรด", "ลำดับ"];
    body = keep(data.tiers, (t) => [t.code, t.name]).map((t) => row(t, [t.name, String(data.tiers.indexOf(t) + 1)]));
  } else {
    cols = ["รหัส", "ชื่อผู้ขาย", "เบอร์โทร", "ทะเบียนรถ", "เกรด"];
    body = keep(data.sellers, (s) => [s.code, s.name, s.phone, s.vehicle_no, s.id_last4]).map((s) => row(s, [
      s.name, <span key="ph" className="nowrap">{s.phone ?? ""}</span>, s.vehicle_no ?? "", tierName(s.grade),
    ]));
  }
  if (body.length === 0) {
    return <div className="table-empty" data-list-state="empty">{query.trim() !== "" ? "ไม่พบรายการที่ตรงกับคำค้น" : "ยังไม่มีรายการ"}</div>;
  }
  return <table className="grid" data-master={tab}>{head(cols)}<tbody>{body}</tbody></table>;
}

// --- the panel -----------------------------------------------------------------------------------

interface PanelProps {
  tab: Tab;
  id: string | "new";
  data: Data;
  perms: readonly string[];
  session: Session;
  onSettle: Settle;
  /** The confirmation of the write that opened this panel, if any. */
  flash: string | null;
  onSaved: (key: keyof Data, item: { id: string }, text: string) => void;
  onClose: () => void;
  onTiersReordered: (tiers: Tier[]) => void;
}

function MasterPanel(props: PanelProps) {
  const { tab, id } = props;
  const title = TABS.find((t) => t.id === tab)?.label ?? "";
  return (
    <aside className="panel" data-panel={tab} aria-label={title}>
      <div className="panel-head">
        <h2 className="panel-title">{id === "new" ? (TABS.find((t) => t.id === tab)?.addLabel ?? "") : `แก้ไข${title}`}</h2>
        <button type="button" className="btn btn-quiet btn-small" onClick={props.onClose}>ปิด</button>
      </div>
      {tab === "products" ? <ProductForm {...props} /> : null}
      {tab === "categories" || tab === "uoms" ? <CodeNameForm {...props} /> : null}
      {tab === "tiers" ? <TierForm {...props} /> : null}
      {tab === "sellers" ? <SellerFormPanel {...props} /> : null}
    </aside>
  );
}

function Field(props: { label: string; name: string; value: string; onChange?: (v: string) => void; problem?: string | null; hint?: string; readOnly?: boolean; inputMode?: "numeric" | "decimal" | "tel" }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <input name={props.name} value={props.value} readOnly={props.readOnly === true} aria-invalid={props.problem != null}
        {...(props.inputMode !== undefined ? { inputMode: props.inputMode } : {})}
        onChange={(e) => props.onChange?.(e.target.value)} />
      {props.problem != null ? <span className="field-problem" role="alert">{props.problem}</span> : null}
      {props.hint !== undefined ? <span className="field-hint">{props.hint}</span> : null}
    </label>
  );
}

/** The panel's footer: a refusal line, save, and retire/bring back for an existing row. */
function Actions(props: { problem: string | null; saved: string | null; busy: boolean; canSave: boolean; onSave: () => void;
  retire?: { active: boolean; can: boolean; onToggle: () => void };
  /** The save button's own words where a panel holds two saves (impeccable · clarify · "Use a specific
   *  verb and object when the outcome is not already obvious."). */
  saveLabel?: string }) {
  return (
    <>
      {props.problem !== null ? <p className="notice notice-error" role="alert" data-panel-problem>{props.problem}</p> : null}
      {props.saved !== null ? <p className="notice notice-ok" role="status" data-panel-saved>{props.saved}</p> : null}
      <div className="void-actions">
        {props.canSave ? <button type="button" className="btn btn-primary" disabled={props.busy} onClick={props.onSave}>{props.busy ? "กำลังบันทึก…" : (props.saveLabel ?? "บันทึก")}</button> : null}
        {props.retire !== undefined && props.retire.can ? (
          <button type="button" className="btn btn-quiet" disabled={props.busy} data-toggle-active onClick={props.retire.onToggle}>
            {props.retire.active ? "ปิดใช้งาน" : "เปิดใช้งานอีกครั้ง"}
          </button>
        ) : null}
      </div>
    </>
  );
}

/** Shared write plumbing for the forms: busy, the refusal sentence, the saved line. */
function useWrite(props: PanelProps) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(props.flash);
  const run = async <T extends { id: string }>(key: keyof Data, call: (token: string) => Promise<ApiOutcome<T>>, done: string) => {
    setBusy(true);
    setSaved(null);
    try {
      const r = await ask(props.session, props.onSettle, call);
      if ("problem" in r) {
        setProblem(r.problem);
        return null;
      }
      setProblem(null);
      setSaved(done);
      props.onSaved(key, r.ok, done);
      return r.ok;
    } finally {
      setBusy(false);
    }
  };
  return { busy, problem, saved, setProblem, run };
}

function CodeNameForm(props: PanelProps) {
  const { tab, id, data, perms, session } = props;
  const key = tab === "uoms" ? "uoms" : "categories";
  const path = tab === "uoms" ? "/uoms" : "/product-categories";
  const row = id === "new" ? null : data[key].find((r) => r.id === id) ?? null;
  const [code, setCode] = useState(row?.code ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [checks, setChecks] = useState<{ code: string | null; name: string | null }>({ code: null, name: null });
  const w = useWrite(props);
  const can = may(perms, PERM.master);

  const save = () => {
    const c = { code: row === null ? textProblem(code, 64, true) : null, name: textProblem(name, 200, true) };
    setChecks(c);
    if (c.code !== null || c.name !== null) return;
    void (row === null
      ? w.run(key, (t) => session.api.post(t, path, { code: code.trim(), name: name.trim() }, readOneCodeName), "เพิ่มแล้ว")
      : w.run(key, (t) => session.api.patch(t, `${path}/${row.id}`, { name: name.trim() }, readOneCodeName), "บันทึกแล้ว"));
  };
  return (
    <div className="form-stack">
      <Field label="รหัส" name="code" value={code} onChange={setCode} readOnly={row !== null} problem={checks.code}
        {...(row !== null ? { hint: "รหัสแก้ไขไม่ได้ — ถ้าผิด ให้เพิ่มรายการใหม่แล้วปิดใช้งานรายการเดิม" } : {})} />
      <Field label="ชื่อ" name="name" value={name} onChange={setName} problem={checks.name} readOnly={!can} />
      <Actions problem={w.problem} saved={w.saved} busy={w.busy} canSave={can} onSave={save}
        {...(row !== null ? { retire: { active: row.is_active, can, onToggle: () => void w.run(key, (t) => session.api.post(t, `${path}/${row.id}/${row.is_active ? "deactivate" : "activate"}`, {}, readOneCodeName), row.is_active ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว") } } : {})} />
    </div>
  );
}

function ProductForm(props: PanelProps) {
  const { id, data, perms, session } = props;
  const row = id === "new" ? null : data.products.find((p) => p.id === id) ?? null;
  const [code, setCode] = useState(row?.code ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [cat, setCat] = useState(row?.category_id ?? "");
  const [uom, setUom] = useState(row?.uom_id ?? "");
  const [checks, setChecks] = useState<Record<string, string | null>>({});
  const w = useWrite(props);
  const can = may(perms, PERM.master);
  const offered = (list: CodeName[], current: string) => list.filter((x) => x.is_active || x.id === current);

  const save = () => {
    const c = { code: row === null ? textProblem(code, 64, true) : null, name: textProblem(name, 200, true),
      cat: cat === "" ? "ต้องเลือกหมวดหมู่" : null, uom: uom === "" ? "ต้องเลือกหน่วยนับ" : null };
    setChecks(c);
    if (Object.values(c).some((x) => x !== null)) return;
    if (row === null) {
      void w.run("products", (t) => session.api.post(t, "/products", { code: code.trim(), name: name.trim(), category_id: cat, uom_id: uom }, readProduct), "เพิ่มสินค้าแล้ว — ตั้งราคาต่อเกรดได้ด้านล่าง");
      return;
    }
    const body: Record<string, string> = {};
    if (name.trim() !== row.name) body["name"] = name.trim();
    if (cat !== row.category_id) body["category_id"] = cat;
    if (uom !== row.uom_id) body["uom_id"] = uom;
    if (Object.keys(body).length === 0) {
      w.setProblem("ยังไม่ได้แก้ไขอะไร");
      return;
    }
    void w.run("products", (t) => session.api.patch(t, `/products/${row.id}`, body, readProduct), "บันทึกแล้ว");
  };

  return (
    <div className="form-stack">
      <Field label="รหัสสินค้า" name="code" value={code} onChange={setCode} readOnly={row !== null} problem={checks["code"] ?? null}
        {...(row !== null ? { hint: "รหัสแก้ไขไม่ได้ — รหัสนี้พิมพ์อยู่บนบิลเก่าทุกใบ" } : {})} />
      <Field label="ชื่อสินค้า" name="name" value={name} onChange={setName} problem={checks["name"] ?? null} readOnly={!can} />
      <label className="field">
        <span className="field-label">หมวดหมู่</span>
        <select name="category" value={cat} disabled={!can} onChange={(e) => setCat(e.target.value)}>
          <option value="">— เลือก —</option>
          {offered(data.categories, cat).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}{c.is_active ? "" : " (ปิดใช้งาน)"}</option>)}
        </select>
        {checks["cat"] != null ? <span className="field-problem" role="alert">{checks["cat"]}</span> : null}
      </label>
      <label className="field">
        <span className="field-label">หน่วยนับ</span>
        <select name="uom" value={uom} disabled={!can} onChange={(e) => setUom(e.target.value)}>
          <option value="">— เลือก —</option>
          {offered(data.uoms, uom).map((u) => <option key={u.id} value={u.id}>{u.code} · {u.name}{u.is_active ? "" : " (ปิดใช้งาน)"}</option>)}
        </select>
        {checks["uom"] != null ? <span className="field-problem" role="alert">{checks["uom"]}</span> : null}
      </label>
      <Actions problem={w.problem} saved={w.saved} busy={w.busy} canSave={can} onSave={save}
        {...(row !== null ? { retire: { active: row.is_active, can, onToggle: () => void w.run("products", (t) => session.api.post(t, `/products/${row.id}/${row.is_active ? "deactivate" : "activate"}`, {}, readProduct), row.is_active ? "ปิดใช้งานแล้ว — บิลเก่ายังแสดงสินค้านี้ตามเดิม" : "เปิดใช้งานแล้ว") } } : {})} />
      {row !== null ? <ProductRules product={row} {...props} /> : null}
      {row !== null ? <PriceTable product={row} {...props} /> : null}
    </div>
  );
}

/**
 * A PRODUCT'S MONEY RULES (server migration 0027): what its price multiplies, and its own impurity
 * deduction rule (or the shop's). OWNER ONLY (app/policy.py) -- every other session reads them; the
 * server refuses anyone else 403. Its own save, apart from the product's name and unit, so an admin
 * editing a name never sends a rule the server would refuse the whole request for.
 */
function ProductRules(props: PanelProps & { product: Product }) {
  const { product, session } = props;
  const owner = isOwner(session.me);
  const [basis, setBasis] = useState<PricingBasis>(product.pricing_basis);
  const [mode, setMode] = useState<DeductionSetting | null>(product.deduction_mode);
  const w = useWrite({ ...props, flash: null });
  const save = () => {
    const body = productRulesPatch(product, { pricing_basis: basis, deduction_mode: mode });
    if (Object.keys(body).length === 0) {
      w.setProblem("ยังไม่ได้แก้ไขอะไร");
      return;
    }
    void w.run("products", (t) => session.api.patch(t, `/products/${product.id}`, body, readProduct), MONEY_TEXT.saved);
  };
  return (
    <section className="price-table" aria-label={MONEY_TEXT.productTitle} data-product-rules>
      <h3 className="section-title">{MONEY_TEXT.productTitle}</h3>
      <p className="field-hint">{MONEY_TEXT.ownerNote}</p>
      <label className="field">
        <span className="field-label">{MONEY_TEXT.basis}</span>
        <select name="pricingBasis" value={basis} disabled={!owner} onChange={(e) => setBasis(e.target.value as PricingBasis)}>
          {PRICING_BASES.map((b) => <option key={b} value={b}>{BASIS_TEXT[b]}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{MONEY_TEXT.productDeduction}</span>
        <select name="productDeduction" value={mode ?? ""} disabled={!owner}
          onChange={(e) => setMode(e.target.value === "" ? null : (e.target.value as DeductionSetting))}>
          <option value="">{product.deduction_mode === null ? `${MONEY_TEXT.followShop} (${DEDUCTION_TEXT[product.deduction_mode_effective]})` : MONEY_TEXT.followShop}</option>
          {DEDUCTION_SETTINGS.map((d) => <option key={d} value={d}>{DEDUCTION_TEXT[d]}</option>)}
        </select>
      </label>
      {owner ? <Actions problem={w.problem} saved={w.saved} busy={w.busy} canSave onSave={save} saveLabel="บันทึกการคิดเงิน" /> : null}
    </section>
  );
}

/** One price per tier, typed as text and sent as text; only changed rows are sent. */
function PriceTable(props: PanelProps & { product: Product }) {
  const { product, data, perms, session } = props;
  const tiers = data.tiers.filter((t) => t.is_active || product.prices[t.code] !== undefined);
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(tiers.map((t) => [t.code, product.prices[t.code] ?? ""])));
  const [problems, setProblems] = useState<Record<string, string | null>>({});
  // Its own confirmation only: the product's "added" line belongs to the form above.
  const w = useWrite({ ...props, flash: null });
  const can = may(perms, PERM.prices);

  const save = async () => {
    const changed = tiers.filter((t) => (draft[t.code] ?? "").trim() !== (product.prices[t.code] ?? "") && (draft[t.code] ?? "").trim() !== "");
    const p = Object.fromEntries(changed.map((t) => [t.code, priceProblem(draft[t.code] ?? "")]));
    setProblems(p);
    if (Object.values(p).some((x) => x !== null)) return;
    if (changed.length === 0) {
      w.setProblem("ยังไม่ได้แก้ราคา");
      return;
    }
    let last: Product | null = null;
    for (const t of changed) {
      last = await w.run("products", (tk) => session.api.put(tk, `/products/${product.id}/prices/${encodeURIComponent(t.code)}`, { price: (draft[t.code] ?? "").trim() }, readProduct),
        `บันทึกราคาแล้ว ${String(changed.length)} เกรด — มีผลกับบิลใหม่เท่านั้น บิลเก่าไม่เปลี่ยน`);
      if (last === null) return;
    }
    // Show what the SERVER stored ("15.50"), not what was typed ("15.5").
    const stored = last;
    if (stored !== null) setDraft(Object.fromEntries(tiers.map((t) => [t.code, stored.prices[t.code] ?? ""])));
  };

  return (
    <section className="price-table" aria-label="ราคาต่อเกรด">
      <h3 className="section-title">ราคารับซื้อต่อ{product.uom_name || "หน่วย"} (บาท)</h3>
      {tiers.length === 0 ? <p className="field-hint">ยังไม่มีเกรด — เพิ่มเกรดที่แท็บ เกรด ก่อน</p> : null}
      {tiers.map((t) => (
        <div key={t.code} className="price-row">
          <span className="price-tier">{tierLabel(t)}{t.is_active ? "" : " (ปิดใช้งาน)"}</span>
          {can ? (
            <input name={`price-${t.code}`} inputMode="decimal" value={draft[t.code] ?? ""} placeholder="ยังไม่ตั้งราคา"
              aria-invalid={problems[t.code] != null} onChange={(e) => setDraft((d) => ({ ...d, [t.code]: e.target.value }))} />
          ) : (
            <span className="num">{product.prices[t.code] !== undefined ? display(product.prices[t.code] ?? "") : "ยังไม่ตั้งราคา"}</span>
          )}
          {problems[t.code] != null ? <span className="field-problem" role="alert">{problems[t.code]}</span> : null}
        </div>
      ))}
      {can && tiers.length > 0 ? <Actions problem={w.problem} saved={w.saved} busy={w.busy} canSave onSave={() => void save()} /> : null}
    </section>
  );
}

function TierForm(props: PanelProps) {
  const { id, data, perms, session } = props;
  const row = id === "new" ? null : data.tiers.find((t) => t.id === id) ?? null;
  const [code, setCode] = useState(row?.code ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [checks, setChecks] = useState<{ code: string | null; name: string | null }>({ code: null, name: null });
  const w = useWrite(props);
  const can = may(perms, PERM.tiers);
  const order = data.tiers.map((t) => t.id);

  const save = () => {
    const c = { code: row === null ? textProblem(code, 32, true) : null, name: textProblem(name, 100, true) };
    setChecks(c);
    if (c.code !== null || c.name !== null) return;
    void (row === null
      ? w.run("tiers", (t) => session.api.post(t, "/grade-tiers", { code: code.trim(), name: name.trim() }, readTier), "เพิ่มเกรดแล้ว")
      : w.run("tiers", (t) => session.api.patch(t, `/grade-tiers/${row.id}`, { name: name.trim() }, readTier), "บันทึกแล้ว"));
  };
  const move = async (delta: -1 | 1) => {
    if (row === null) return;
    const next = moveTier(order, row.id, delta);
    const r = await ask(session, props.onSettle, (t) => session.api.put(t, "/grade-tiers/order", { order: next }, readTiers));
    if ("problem" in r) w.setProblem(r.problem);
    else props.onTiersReordered([...r.ok].sort((a, b) => a.sort_order - b.sort_order));
  };
  return (
    <div className="form-stack">
      <Field label="รหัสเกรด" name="code" value={code} onChange={setCode} readOnly={row !== null} problem={checks.code}
        {...(row !== null ? { hint: "รหัสเกรดแก้ไขไม่ได้ — ผู้ขายและราคาอ้างถึงรหัสนี้" } : {})} />
      <Field label="ชื่อเกรด" name="name" value={name} onChange={setName} problem={checks.name} readOnly={!can} />
      {row !== null && can ? (
        <div className="void-actions">
          <button type="button" className="btn btn-quiet btn-small" disabled={order[0] === row.id} onClick={() => void move(-1)}>เลื่อนขึ้น</button>
          <button type="button" className="btn btn-quiet btn-small" disabled={order[order.length - 1] === row.id} onClick={() => void move(1)}>เลื่อนลง</button>
        </div>
      ) : null}
      <Actions problem={w.problem} saved={w.saved} busy={w.busy} canSave={can} onSave={save}
        {...(row !== null ? { retire: { active: row.is_active, can, onToggle: () => void w.run("tiers", (t) => session.api.patch(t, `/grade-tiers/${row.id}`, { is_active: !row.is_active }, readTier), row.is_active ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว") } } : {})} />
    </div>
  );
}

function SellerFormPanel(props: PanelProps) {
  const { id, data, perms, session } = props;
  const row = id === "new" ? null : data.sellers.find((s) => s.id === id) ?? null;
  const personal = may(perms, PERM.personal);
  const can = row === null ? may(perms, PERM.sellerCreate) : may(perms, PERM.sellerWrite);
  const [code, setCode] = useState(row?.code ?? "");
  const [form, setForm] = useState<SellerForm>({
    name: row?.name ?? "", phone: row?.phone ?? "", grade: row?.grade ?? "", vehicle_no: row?.vehicle_no ?? "",
    id_number: row?.id_number ?? "", address: row?.address ?? "",
  });
  const [checks, setChecks] = useState<Record<string, string | null>>({});
  const w = useWrite(props);
  const set = (k: keyof SellerForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const tiers = useMemo(() => data.tiers.filter((t) => t.is_active || t.code === form.grade), [data.tiers, form.grade]);

  const save = () => {
    const c: Record<string, string | null> = {
      code: row === null ? textProblem(code, 64, false) : null, name: textProblem(form.name, 200, true),
      phone: textProblem(form.phone, 32, false), vehicle_no: textProblem(form.vehicle_no, 32, false),
      id_number: personal ? textProblem(form.id_number, 32, false) : null, address: personal ? textProblem(form.address, 500, false) : null,
    };
    setChecks(c);
    if (Object.values(c).some((x) => x !== null)) return;
    if (row === null) {
      void w.run("sellers", (t) => session.api.post(t, "/sellers", sellerCreate(code, form, personal), readSeller), "เพิ่มผู้ขายแล้ว");
      return;
    }
    const body = sellerPatch(row, form, personal);
    if (Object.keys(body).length === 0) {
      w.setProblem("ยังไม่ได้แก้ไขอะไร");
      return;
    }
    void w.run("sellers", (t) => session.api.patch(t, `/sellers/${row.id}`, body, readSeller), "บันทึกแล้ว");
  };

  return (
    <div className="form-stack">
      <Field label="รหัสผู้ขาย" name="code" value={code} onChange={setCode} readOnly={row !== null} problem={checks["code"] ?? null}
        hint={row !== null ? "รหัสแก้ไขไม่ได้" : "เว้นว่างได้ — ระบบจะกำหนดรหัสให้"} />
      <Field label="ชื่อผู้ขาย" name="name" value={form.name} onChange={set("name")} problem={checks["name"] ?? null} readOnly={!can} />
      <Field label="เบอร์โทร" name="phone" value={form.phone} onChange={set("phone")} problem={checks["phone"] ?? null} readOnly={!can} inputMode="tel" />
      <Field label="ทะเบียนรถประจำ" name="vehicle_no" value={form.vehicle_no} onChange={set("vehicle_no")} problem={checks["vehicle_no"] ?? null} readOnly={!can} />
      <label className="field">
        <span className="field-label">เกรด</span>
        <select name="grade" value={form.grade} disabled={!can} onChange={(e) => set("grade")(e.target.value)}>
          <option value="">ใช้เกรดเริ่มต้นของร้าน</option>
          {tiers.map((t) => <option key={t.code} value={t.code}>{tierLabel(t)}{t.is_active ? "" : " (ปิดใช้งาน)"}</option>)}
        </select>
      </label>
      {personal ? (
        <>
          <Field label="เลขบัตรประชาชน / เลขผู้เสียภาษี" name="id_number" value={form.id_number} onChange={set("id_number")} problem={checks["id_number"] ?? null} readOnly={!can} />
          <label className="field">
            <span className="field-label">ที่อยู่</span>
            <textarea name="address" rows={3} value={form.address} readOnly={!can} onChange={(e) => set("address")(e.target.value)} />
            {checks["address"] != null ? <span className="field-problem" role="alert">{checks["address"]}</span> : null}
          </label>
        </>
      ) : (
        <p className="field-hint" data-personal-hidden>
          {row?.id_last4 != null ? `เลขบัตรลงท้าย ${row.id_last4} · ` : ""}เลขบัตรเต็มและที่อยู่ดูได้เฉพาะผู้มีสิทธิ์ดูข้อมูลส่วนบุคคล
        </p>
      )}
      <Actions problem={w.problem} saved={w.saved} busy={w.busy} canSave={can} onSave={save}
        {...(row !== null ? { retire: { active: row.is_active, can: may(perms, PERM.sellerWrite), onToggle: () => void w.run("sellers", (t) => session.api.post(t, `/sellers/${row.id}/${row.is_active ? "deactivate" : "activate"}`, {}, readSeller), row.is_active ? "ปิดใช้งานแล้ว — บิลเก่ายังแสดงชื่อผู้ขายนี้ตามเดิม" : "เปิดใช้งานแล้ว") } } : {})} />
    </div>
  );
}
