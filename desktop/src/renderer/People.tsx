/**
 * SHOP AND PEOPLE (B6, SRS 1.9, 4.1): the shop's information (what the slip prints), its settings,
 * the staff accounts, the permissions each role holds as ticks, and the cash drawer's shift.
 *
 * Four tabs on one screen. The shop's NAME is shown, not edited: the server records that changing
 * it is a provisioning act (master.py ShopUpdate, decision 9ad225e). Ticks are edited per role --
 * a person's permissions ARE their role's -- and only by a `roles.manage` holder; the owner's column
 * and the roles.manage row are fixed. The drawer's figure is the server's: computed, frozen at
 * close, never re-added here (impeccable · operate.md · "the interface ... never second-guesses
 * the system of record").
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { shopDateTime } from "@recycle/shop-time";

import type { ApiOutcome } from "../shared/api";
import { readTiers, type Tier } from "../shared/master";
import { display } from "../shared/money";
import {
  groupCatalogue,
  isZeroMoney,
  moneyProblem,
  newUserProblems,
  PEOPLE_TEXT,
  PERMISSION_TEXT,
  readOneRole,
  readOneUser,
  readPolicy,
  readRoles,
  readShift,
  readShop,
  readUsers,
  roleLabel,
  shopPatch,
  tickEditable,
  type Policy,
  type Role,
  type Shift,
  type Shop,
  type User,
  OWNER_ACCOUNT_NOTE,
  ownerAccountLocked,
} from "../shared/people";
import { noticeFor, type Session } from "../shared/session";
import {
  DEDUCTION_SETTINGS,
  DEDUCTION_TEXT,
  isOwner,
  MONEY_TEXT,
  moneyPatch,
  ROUNDING_RULES,
  ROUNDING_TEXT,
  type ShopMoney,
} from "../shared/moneyRules";

type Tab = "shop" | "users" | "roles" | "drawer";

interface Props {
  readonly session: Session;
  readonly onSettle: (kind: ApiOutcome<unknown>["kind"]) => void;
}

type Asked<T> = { ok: T } | { problem: string; kind: ApiOutcome<T>["kind"]; code: string | null };

async function ask<T>(p: Props, call: (token: string) => Promise<ApiOutcome<T>>): Promise<Asked<T>> {
  const out = await p.session.authed(call);
  p.onSettle(out.kind);
  if (out.kind === "ok") return { ok: out.value };
  return { problem: noticeFor(out, "session"), kind: out.kind, code: out.kind === "invalid" ? out.code : null };
}

const anyObject = (j: unknown): true | null => (j !== null && typeof j === "object" ? true : null);

export function PeopleScreen(props: Props) {
  const perms = props.session.me?.permissions ?? [];
  const tabs: { id: Tab; label: string; shown: boolean }[] = [
    { id: "shop", label: "ข้อมูลร้าน", shown: true },
    { id: "users", label: "พนักงาน", shown: perms.includes("users.manage") },
    { id: "roles", label: "สิทธิ์ตามตำแหน่ง", shown: perms.includes("users.manage") },
    { id: "drawer", label: "ลิ้นชักเงิน", shown: perms.includes("shifts.manage") },
  ];
  const [tab, setTab] = useState<Tab>("shop");
  return (
    <div className="people" data-screen="people">
      <h1 className="page-title">ร้านและพนักงาน</h1>
      <div className="tabs" role="tablist" aria-label="ส่วนของร้าน">
        {tabs.filter((t) => t.shown).map((t) => (
          <button key={t.id} type="button" role="tab" className="tab" data-tab={t.id} aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "shop" ? <ShopTab {...props} /> : null}
      {tab === "users" ? <UsersTab {...props} /> : null}
      {tab === "roles" ? <RolesTab {...props} /> : null}
      {tab === "drawer" ? <DrawerTab {...props} /> : null}
    </div>
  );
}

function Notice({ problem, saved }: { problem: string | null; saved: string | null }) {
  return (
    <>
      {problem !== null ? <p className="notice notice-error" role="alert" data-panel-problem>{problem}</p> : null}
      {saved !== null ? <p className="notice notice-ok" role="status" data-panel-saved>{saved}</p> : null}
    </>
  );
}

// --- the shop -------------------------------------------------------------------------------------

function ShopTab(props: Props) {
  const perms = props.session.me?.permissions ?? [];
  const can = perms.includes("shop.settings.write");
  // MONEY RULES ARE THE OWNER'S (server migration 0027, app/policy.py): the default grade and the
  // three rules below. The role here is the session's advisory claim, used only to decide what is
  // drawn editable; the server refuses anyone else 403 money_rule_owner_only.
  const owner = can && isOwner(props.session.me);
  const [shop, setShop] = useState<Shop | null>(null);
  const [money, setMoney] = useState<ShopMoney | null>(null);
  const [moneyBusy, setMoneyBusy] = useState(false);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [form, setForm] = useState({ address: "", phone: "", default_grade: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, p, t] = await Promise.all([
      ask(props, (tk) => props.session.api.get(tk, "/shop", readShop)),
      ask(props, (tk) => props.session.api.get(tk, "/shop/policy", readPolicy)),
      ask(props, (tk) => props.session.api.get(tk, "/grade-tiers", readTiers)),
    ]);
    if ("ok" in s) {
      setShop(s.ok);
      setForm({ address: s.ok.address ?? "", phone: s.ok.phone ?? "", default_grade: s.ok.default_grade ?? "" });
      setMoney(s.ok.money);
    } else setProblem(s.problem);
    if ("ok" in p) setPolicy(p.ok);
    if ("ok" in t) setTiers(t.ok);
  }, [props.session, props.onSettle]); // stable: never `props`, a new object every render
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (shop === null) return;
    const body = shopPatch(shop, form);
    if (Object.keys(body).length === 0) {
      setProblem("ยังไม่ได้แก้ไขอะไร");
      return;
    }
    setBusy(true);
    try {
      const r = await ask(props, (tk) => props.session.api.patch(tk, "/shop", body, readShop));
      if ("ok" in r) {
        setShop(r.ok);
        setProblem(null);
        setSaved("บันทึกข้อมูลร้านแล้ว — สลิปที่พิมพ์ต่อจากนี้ใช้ข้อมูลใหม่");
      } else setProblem(r.problem);
    } finally {
      setBusy(false);
    }
  };

  const saveMoney = async () => {
    if (shop?.money == null || money === null) return;
    const body = moneyPatch(shop.money, money);
    if (Object.keys(body).length === 0) {
      setProblem("ยังไม่ได้แก้ไขอะไร");
      return;
    }
    setMoneyBusy(true);
    try {
      const r = await ask(props, (tk) => props.session.api.patch(tk, "/shop", body, readShop));
      if ("ok" in r) {
        // What the SERVER stored, never what was sent.
        setShop(r.ok);
        setMoney(r.ok.money);
        setProblem(null);
        setSaved(MONEY_TEXT.saved);
      } else setProblem(r.problem);
    } finally {
      setMoneyBusy(false);
    }
  };

  const setPolicyFlag = async (key: "separate_cashier" | "shifts_enabled", value: boolean) => {
    if (policy?.branch_id == null) return;
    const r = await ask(props, (tk) => props.session.api.patch(tk, `/branches/${policy.branch_id ?? ""}`, { [key]: value }, readPolicy));
    if ("ok" in r) {
      setPolicy((p) => (p === null ? p : { ...p, [key]: value }));
      setSaved("บันทึกการตั้งค่าแล้ว");
      setProblem(null);
    } else setProblem(r.problem);
  };

  if (shop === null) return <div className="table-empty" aria-busy={problem === null}>{problem ?? "กำลังโหลดข้อมูลร้าน…"}</div>;
  return (
    <div className="settings-form" data-shop-form>
      <label className="field">
        <span className="field-label">ชื่อร้าน</span>
        <input name="shopName" value={shop.name} readOnly />
        <span className="field-hint">ชื่อร้านพิมพ์อยู่บนสลิปทุกใบ จึงเปลี่ยนได้ผ่านผู้ให้บริการเท่านั้น</span>
      </label>
      <label className="field">
        <span className="field-label">ที่อยู่ (พิมพ์บนสลิป)</span>
        <textarea name="shopAddress" rows={3} value={form.address} readOnly={!can} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
      </label>
      <label className="field field-narrow">
        <span className="field-label">เบอร์โทร (พิมพ์บนสลิป)</span>
        <input name="shopPhone" value={form.phone} readOnly={!can} inputMode="tel" onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
      </label>
      <label className="field field-narrow">
        <span className="field-label">เกรดเริ่มต้นของร้าน</span>
        <select name="defaultGrade" value={form.default_grade} disabled={!owner} onChange={(e) => setForm((f) => ({ ...f, default_grade: e.target.value }))}>
          <option value="">ไม่กำหนด — ผู้ขายที่ไม่มีเกรดซื้อไม่ได้จนกว่าจะกำหนด</option>
          {tiers.map((t) => <option key={t.code} value={t.code}>{t.name.trim() === t.code ? t.code : `${t.code} · ${t.name}`}</option>)}
        </select>
      </label>
      <Notice problem={problem} saved={saved} />
      {can ? <div className="void-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button></div> : null}
      {shop.money !== null && money !== null ? (
        <fieldset className="policy" data-money-rules>
          <legend className="section-title">{MONEY_TEXT.title}</legend>
          <p className="field-hint">{MONEY_TEXT.ownerNote}</p>
          <label className="field field-narrow">
            <span className="field-label">{MONEY_TEXT.rounding}</span>
            <select name="roundingRule" value={money.rounding_rule} disabled={!owner}
              onChange={(e) => setMoney((m) => (m === null ? m : { ...m, rounding_rule: e.target.value as ShopMoney["rounding_rule"] }))}>
              {ROUNDING_RULES.map((r) => <option key={r} value={r}>{ROUNDING_TEXT[r]}</option>)}
            </select>
          </label>
          <label className="field field-narrow">
            <span className="field-label">{MONEY_TEXT.deduction}</span>
            <select name="deductionMode" value={money.deduction_mode} disabled={!owner}
              onChange={(e) => setMoney((m) => (m === null ? m : { ...m, deduction_mode: e.target.value as ShopMoney["deduction_mode"] }))}>
              {DEDUCTION_SETTINGS.map((d) => <option key={d} value={d}>{DEDUCTION_TEXT[d]}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" name="reasonRequired" checked={money.deduction_reason_required} disabled={!owner}
              onChange={(e) => setMoney((m) => (m === null ? m : { ...m, deduction_reason_required: e.target.checked }))} />
            {MONEY_TEXT.reason}
          </label>
          {owner ? (
            <div className="void-actions">
              <button type="button" className="btn btn-primary" data-save-money disabled={moneyBusy} onClick={() => void saveMoney()}>
                {moneyBusy ? "กำลังบันทึก…" : "บันทึกการคิดเงิน"}
              </button>
            </div>
          ) : null}
        </fieldset>
      ) : null}
      {policy?.branch_id != null ? (
        <fieldset className="policy">
          <legend className="section-title">การทำงานของสาขานี้</legend>
          <label className="check">
            <input type="checkbox" name="separateCashier" checked={policy.separate_cashier === true} disabled={!can}
              onChange={(e) => void setPolicyFlag("separate_cashier", e.target.checked)} />
            แยกจุดจ่ายเงิน — บิลออกจากตาชั่งโดยยังไม่จ่าย แล้วไปจ่ายที่เคาน์เตอร์
          </label>
          <label className="check">
            <input type="checkbox" name="shiftsEnabled" checked={policy.shifts_enabled === true} disabled={!can}
              onChange={(e) => void setPolicyFlag("shifts_enabled", e.target.checked)} />
            ใช้กะและลิ้นชักเงิน — นับเงินเปิด-ปิดกะทุกครั้ง
          </label>
        </fieldset>
      ) : null}
    </div>
  );
}

// --- the accounts ---------------------------------------------------------------------------------

function UsersTab(props: Props) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [open, setOpen] = useState<string | "new" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    const [u, r] = await Promise.all([
      ask(props, (tk) => props.session.api.get(tk, "/users?include_inactive=true", readUsers)),
      ask(props, (tk) => props.session.api.get(tk, "/roles", readRoles)),
    ]);
    if ("ok" in u) setUsers(u.ok); else setProblem(u.problem);
    if ("ok" in r) setRoles(r.ok.roles);
  }, [props.session, props.onSettle]); // stable: never `props`, a new object every render
  useEffect(() => { void load(); }, [load]);

  const roleOf = (code: string) => roles.find((r) => r.code === code);
  const shown = (users ?? []).filter((u) => showInactive || u.is_active);
  return (
    <>
      <div className="master-tools">
        <label className="check">
          <input type="checkbox" name="showInactiveUsers" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          แสดงบัญชีที่ปิดใช้งานแล้ว
        </label>
        <button type="button" className="btn btn-primary" data-add="users" onClick={() => setOpen("new")}>เพิ่มบัญชีพนักงาน</button>
      </div>
      {problem !== null ? <p className="notice notice-warn" role="alert">{problem}</p> : null}
      <div className={open !== null ? "bills-split has-panel" : "bills-split"}>
        {users === null ? <div className="table-empty" aria-busy="true">กำลังโหลดบัญชี…</div> : (
          <table className="grid" data-users>
            <thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>สถานะ</th></tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.user_id} data-row={u.username} aria-selected={u.user_id === open} className={u.is_active ? undefined : "row-retired"}
                  onClick={() => setOpen(u.user_id)}>
                  <td className="nowrap"><button type="button" className="link" onClick={(e) => { e.stopPropagation(); setOpen(u.user_id); }}>{u.username}</button></td>
                  <td>{u.full_name}</td>
                  <td>{roleOf(u.role) !== undefined ? roleLabel(roleOf(u.role) as Role) : u.role}</td>
                  <td>{u.is_active ? "ใช้งานอยู่" : <span className="badge badge-muted">ปิดใช้งาน</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {open === "new" ? <NewUserPanel {...props} roles={roles} onClose={() => setOpen(null)}
          onCreated={(u) => { setUsers((l) => [...(l ?? []), u]); setOpen(u.user_id); }} /> : null}
        {open !== null && open !== "new" ? (
          <UserPanel key={open} {...props} user={(users ?? []).find((u) => u.user_id === open) ?? null} role={roleOf((users ?? []).find((u) => u.user_id === open)?.role ?? "")}
            onClose={() => setOpen(null)} onChanged={() => void load()} />
        ) : null}
      </div>
    </>
  );
}

function NewUserPanel(props: Props & { roles: Role[]; onClose: () => void; onCreated: (u: User) => void }) {
  const [f, setF] = useState({ username: "", full_name: "", password: "", role: "" });
  const [checks, setChecks] = useState<Record<string, string | null>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const create = async () => {
    const c = newUserProblems(f);
    setChecks(c);
    if (Object.values(c).some((x) => x !== null)) return;
    setBusy(true);
    try {
      const r = await ask(props, (tk) => props.session.api.post(tk, "/users", { username: f.username.trim(), full_name: f.full_name.trim(), role: f.role, password: f.password }, readOneUser));
      if ("ok" in r) props.onCreated(r.ok); else setProblem(r.problem);
    } finally {
      setBusy(false);
    }
  };
  const err = (k: string) => (checks[k] != null ? <span className="field-problem" role="alert">{checks[k]}</span> : null);
  return (
    <aside className="panel" data-panel="new-user" aria-label="เพิ่มบัญชีพนักงาน">
      <div className="panel-head"><h2 className="panel-title">เพิ่มบัญชีพนักงาน</h2>
        <button type="button" className="btn btn-quiet btn-small" onClick={props.onClose}>ปิด</button></div>
      <div className="form-stack">
        <label className="field"><span className="field-label">ชื่อผู้ใช้ (ใช้เข้าสู่ระบบ)</span><input name="username" value={f.username} onChange={set("username")} autoComplete="off" />{err("username")}</label>
        <label className="field"><span className="field-label">ชื่อ-นามสกุล</span><input name="full_name" value={f.full_name} onChange={set("full_name")} />{err("full_name")}</label>
        <label className="field"><span className="field-label">ตำแหน่ง</span>
          <select name="role" value={f.role} onChange={set("role")}>
            <option value="">— เลือก —</option>
            {props.roles.filter((r) => r.is_active).map((r) => <option key={r.code} value={r.code}>{roleLabel(r)}</option>)}
          </select>{err("role")}</label>
        <label className="field"><span className="field-label">รหัสผ่านแรก</span><input name="password" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" />
          <span className="field-hint">แจ้งรหัสนี้กับพนักงานโดยตรง เขาเปลี่ยนเองได้ภายหลัง</span>{err("password")}</label>
        <Notice problem={problem} saved={null} />
        <div className="void-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void create()}>{busy ? "กำลังเพิ่ม…" : "เพิ่มบัญชี"}</button></div>
      </div>
    </aside>
  );
}

function UserPanel(props: Props & { user: User | null; role: Role | undefined; onClose: () => void; onChanged: () => void }) {
  const { user, role } = props;
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const self = user !== null && props.session.me?.user_id === user.user_id;
  const act = async (path: string, body: unknown, done: string) => {
    if (user === null) return;
    setBusy(true);
    try {
      const r = await ask(props, (tk) => props.session.api.post(tk, `/users/${user.user_id}/${path}`, body, anyObject));
      if ("ok" in r) {
        setProblem(null);
        setSaved(done);
        props.onChanged();
      } else setProblem(r.problem);
    } finally {
      setBusy(false);
    }
  };
  if (user === null) return null;
  return (
    <aside className="panel" data-panel="user" aria-label={`บัญชี ${user.username}`}>
      <div className="panel-head"><h2 className="panel-title">{user.username}</h2>
        <button type="button" className="btn btn-quiet btn-small" onClick={props.onClose}>ปิด</button></div>
      <dl className="facts">
        <dt>ชื่อ-นามสกุล</dt><dd>{user.full_name}</dd>
        <dt>ตำแหน่ง</dt><dd>{role !== undefined ? roleLabel(role) : user.role}</dd>
        <dt>สถานะ</dt><dd>{user.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}</dd>
      </dl>
      <section aria-label="สิทธิ์ของบัญชีนี้" data-user-ticks>
        <h3 className="section-title">สิทธิ์ (ตามตำแหน่ง)</h3>
        <ul className="tick-list">
          {Object.keys(PERMISSION_TEXT).map((code) => {
            const has = role?.permissions.includes(code) === true;
            return <li key={code} className={has ? "tick-on" : "tick-off"} data-has={has ? code : undefined}>{has ? "✓" : "–"} {PERMISSION_TEXT[code]}</li>;
          })}
        </ul>
        <p className="field-hint">สิทธิ์เปลี่ยนตามตำแหน่ง แก้ได้ที่แท็บ สิทธิ์ตามตำแหน่ง</p>
      </section>
      <Notice problem={problem} saved={saved} />
      {self ? <p className="field-hint">นี่คือบัญชีของคุณเอง — ปิดใช้งานหรือรีเซ็ตรหัสผ่านตัวเองจากที่นี่ไม่ได้</p>
        : ownerAccountLocked(user, props.session.me?.user_id ?? null) ? (
          // Another person's owner row: every action here would be refused (owner_*_owner_only).
          <p className="field-hint" data-owner-locked>{OWNER_ACCOUNT_NOTE}</p>
        ) : (
        <>
          <div className="void-actions">
            <button type="button" className="btn btn-quiet" disabled={busy} data-user-toggle
              onClick={() => void act(user.is_active ? "deactivate" : "activate", {}, user.is_active ? "ปิดใช้งานบัญชีแล้ว — เข้าสู่ระบบไม่ได้อีก" : "เปิดใช้งานบัญชีแล้ว")}>
              {user.is_active ? "ปิดใช้งานบัญชี" : "เปิดใช้งานอีกครั้ง"}
            </button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void act("unlock-login", {}, "ปลดล็อกการเข้าสู่ระบบแล้ว")}>ปลดล็อกการเข้าสู่ระบบ</button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void act("revoke-sessions", {}, "ออกจากระบบทุกเครื่องแล้ว")}>ออกจากระบบทุกเครื่อง</button>
          </div>
          <label className="field">
            <span className="field-label">ตั้งรหัสผ่านใหม่ให้บัญชีนี้</span>
            <input name="newPassword" type="password" value={pw} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} />
          </label>
          <div className="void-actions">
            <button type="button" className="btn btn-quiet" disabled={busy}
              onClick={() => { if ([...pw].length < 8) { setProblem(PEOPLE_TEXT.password); return; } void act("password", { new_password: pw }, "ตั้งรหัสผ่านใหม่แล้ว"); setPw(""); }}>
              ตั้งรหัสผ่านใหม่
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

// --- permissions as ticks -------------------------------------------------------------------------

function RolesTab(props: Props) {
  const perms = props.session.me?.permissions ?? [];
  const canManage = perms.includes("roles.manage");
  const [data, setData] = useState<{ roles: Role[]; catalogue: string[] } | null>(null);
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await ask(props, (tk) => props.session.api.get(tk, "/roles", readRoles));
    if ("ok" in r) {
      setData(r.ok);
      setDraft(Object.fromEntries(r.ok.roles.map((x) => [x.id, new Set(x.permissions)])));
    } else setProblem(r.problem);
  }, [props.session, props.onSettle]); // stable: never `props`, a new object every render
  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => groupCatalogue(data?.catalogue ?? []), [data]);
  if (data === null) return <div className="table-empty" aria-busy={problem === null}>{problem ?? "กำลังโหลดสิทธิ์…"}</div>;
  const roles = data.roles.filter((r) => r.is_active);
  const changed = roles.filter((r) => {
    const d = draft[r.id];
    return d !== undefined && (d.size !== r.permissions.length || r.permissions.some((p) => !d.has(p)));
  });

  // A new edit makes the last "saved" line stale: it is cleared, never left beside unsaved ticks.
  const toggle = (role: Role, code: string, on: boolean) => { setSaved(null); setDraft((d) => {
    const next = new Set(d[role.id]);
    if (on) next.add(code); else next.delete(code);
    return { ...d, [role.id]: next };
  }); };
  const save = async () => {
    setBusy(true);
    setSaved(null);
    try {
      for (const r of changed) {
        const out = await ask(props, (tk) => props.session.api.put(tk, `/roles/${r.id}/permissions`, { permissions: [...(draft[r.id] ?? [])].sort() }, readOneRole));
        if (!("ok" in out)) {
          setProblem(`${roleLabel(r)}: ${out.problem}`);
          return;
        }
      }
      setProblem(null);
      setSaved(`บันทึกสิทธิ์แล้ว ${String(changed.length)} ตำแหน่ง — มีผลทันทีกับทุกบัญชีในตำแหน่งนั้น`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="roles" data-roles>
      <p className="page-lead">{canManage
        ? "ติ๊กสิทธิ์ที่แต่ละตำแหน่งทำได้ ทุกบัญชีในตำแหน่งนั้นได้สิทธิ์เดียวกันทันทีที่บันทึก สิทธิ์ของเจ้าของร้านแก้ไขไม่ได้"
        : "ดูได้อย่างเดียว — เฉพาะเจ้าของร้านแก้ไขสิทธิ์ตามตำแหน่งได้"}</p>
      {canManage ? (
        <p className="field-hint" data-phone-hint>
          ถ้าเอาสิทธิ์ใดออกแล้วใส่คืน โทรศัพท์ของพนักงานจะส่งงานประเภทนั้นต่อเองเมื่อเปิดแอปขึ้นมาอีกครั้ง หรือเมื่อกด ลองอีกครั้ง ที่แถบแจ้งเตือนในโทรศัพท์ — ไม่ต้องออกจากระบบ
        </p>
      ) : null}
      <table className="grid tick-grid">
        <thead><tr><th>สิทธิ์</th>{roles.map((r) => <th key={r.id} className="tick-col" data-role-col={r.code}>{roleLabel(r)}</th>)}</tr></thead>
        <tbody>
          {groups.map((g) => [
            <tr key={g.title} className="tick-group"><td colSpan={roles.length + 1}>{g.title}</td></tr>,
            ...g.codes.map((code) => (
              <tr key={code}>
                <td>{PERMISSION_TEXT[code] ?? code}</td>
                {roles.map((r) => {
                  const editable = tickEditable(r, code, canManage);
                  return (
                    <td key={r.id} className="tick-col">
                      <input type="checkbox" aria-label={`${roleLabel(r)}: ${PERMISSION_TEXT[code] ?? code}`} data-tick={`${r.code}:${code}`}
                        checked={draft[r.id]?.has(code) === true} disabled={!editable || busy} onChange={(e) => toggle(r, code, e.target.checked)} />
                    </td>
                  );
                })}
              </tr>
            )),
          ])}
        </tbody>
      </table>
      <Notice problem={problem} saved={saved} />
      {canManage ? (
        <div className="void-actions">
          <button type="button" className="btn btn-primary" disabled={busy || changed.length === 0} onClick={() => void save()}>
            {busy ? "กำลังบันทึก…" : changed.length > 0 ? `บันทึกสิทธิ์ (${String(changed.length)} ตำแหน่ง)` : "บันทึกสิทธิ์"}
          </button>
          {changed.length > 0 ? <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void load()}>ยกเลิกการแก้ไข</button> : null}
        </div>
      ) : null}
    </div>
  );
}

// --- the drawer -----------------------------------------------------------------------------------

function DrawerTab(props: Props) {
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);
  const [closed, setClosed] = useState<Shift | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await ask(props, (tk) => props.session.api.get(tk, "/shifts/current", readShift));
    if ("ok" in r) setShift(r.ok);
    else if (r.kind === "not_found") setShift(null);
    else setProblem(r.problem);
  }, [props.session, props.onSettle]); // stable: never `props`, a new object every render
  useEffect(() => { void load(); }, [load]);

  const run = async (call: (tk: string) => Promise<ApiOutcome<Shift>>, then: (s: Shift) => void) => {
    setBusy(true);
    try {
      const r = await ask(props, call);
      if ("ok" in r) { setProblem(null); setAmount(""); then(r.ok); } else setProblem(r.problem);
    } finally {
      setBusy(false);
    }
  };
  const open = () => {
    const p = moneyProblem(amount);
    if (p !== null) { setProblem(p); return; }
    void run((tk) => props.session.api.post(tk, "/shifts", { id: crypto.randomUUID(), opening_float: amount.trim() }, readShift),
      // The open's answer carries no running figure; read the current shift, which does.
      (s) => { setClosed(null); setShift(s); void load(); });
  };
  const close = () => {
    if (shift == null) return;
    const p = moneyProblem(amount);
    if (p !== null) { setProblem(p); return; }
    void run((tk) => props.session.api.post(tk, `/shifts/${shift.id}/close`, { counted_cash: amount.trim() }, readShift),
      (s) => { setClosed(s); setShift(null); });
  };
  const explain = () => {
    if (closed === null) return;
    if (reason.trim() === "") { setProblem(PEOPLE_TEXT.reason); return; }
    void run((tk) => props.session.api.patch(tk, `/shifts/${closed.id}`, { variance_reason: reason.trim() }, readShift),
      (s) => { setClosed({ ...s, drawer: closed.drawer }); setReason(""); });
  };

  if (shift === undefined && problem === null) return <div className="table-empty" aria-busy="true">กำลังโหลดกะ…</div>;
  return (
    <div className="drawer settings-form" data-drawer>
      {closed !== null ? (
        <section className="drawer-result" data-closed={closed.id}>
          <h2 className="section-title">ปิดกะแล้ว</h2>
          <dl className="facts">
            <dt>ยอดที่ควรมี</dt><dd className="num" data-expected>{display(closed.expected_cash ?? "")} บาท</dd>
            <dt>นับได้จริง</dt><dd className="num" data-counted>{display(closed.counted_cash ?? "")} บาท</dd>
            <dt>ส่วนต่าง</dt><dd className={isZeroMoney(closed.variance) ? "num" : "num variance"} data-variance>{display(closed.variance ?? "")} บาท</dd>
            {closed.drawer !== null ? (<>
              <dt>เงินทอนตั้งต้น</dt><dd className="num">{display(closed.drawer.opening_float)}</dd>
              <dt>เงินเข้าลิ้นชัก</dt><dd className="num">{display(closed.drawer.cash_in)}</dd>
              <dt>เงินออกจากลิ้นชัก</dt><dd className="num">{display(closed.drawer.cash_out)}</dd>
              <dt>จ่ายค่าของเป็นเงินสด</dt><dd className="num">{display(closed.drawer.cash_payments)}</dd>
            </>) : null}
          </dl>
          {!isZeroMoney(closed.variance) && closed.variance_reason === null ? (
            <>
              <label className="field"><span className="field-label">เหตุผลของส่วนต่าง (บันทึกได้ครั้งเดียว)</span>
                <textarea name="varianceReason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              <div className="void-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={explain}>บันทึกเหตุผล</button></div>
            </>
          ) : null}
          {closed.variance_reason !== null ? <p className="notice notice-ok" data-reason-saved>เหตุผล: {closed.variance_reason}</p> : null}
        </section>
      ) : null}
      {shift != null ? (
        <section data-open-shift={shift.id}>
          <h2 className="section-title">กะที่เปิดอยู่</h2>
          <dl className="facts">
            <dt>เปิดเมื่อ</dt><dd>{shopDateTime(shift.opened_at)}</dd>
            <dt>เงินทอนตั้งต้น</dt><dd className="num">{display(shift.opening_float)} บาท</dd>
            {shift.drawer !== null ? (<>
              <dt>ยอดที่ควรมีตอนนี้</dt><dd className="num" data-running>{display(shift.drawer.expected_cash)} บาท</dd>
            </>) : null}
          </dl>
          <label className="field field-narrow"><span className="field-label">นับเงินในลิ้นชักได้ (บาท)</span>
            <input name="countedCash" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
          <p className="field-hint">ระบบคำนวณยอดที่ควรมีเองตอนปิดกะ แล้วบันทึกไว้คู่กับยอดที่นับได้ แก้ไขภายหลังไม่ได้</p>
          <div className="void-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={close}>ปิดกะ</button></div>
        </section>
      ) : null}
      {shift === null ? (
        <section data-no-shift>
          <h2 className="section-title">ยังไม่มีกะที่เปิดอยู่</h2>
          <label className="field field-narrow"><span className="field-label">เงินทอนตั้งต้น (บาท)</span>
            <input name="openingFloat" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
          <div className="void-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={open}>เปิดกะ</button></div>
        </section>
      ) : null}
      {problem !== null ? <p className="notice notice-error" role="alert" data-panel-problem>{problem}</p> : null}
    </div>
  );
}
