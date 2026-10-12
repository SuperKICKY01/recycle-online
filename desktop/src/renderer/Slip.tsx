/**
 * THE SLIP (B4, ROADMAP P1.17): a preview of exactly what the printer will be sent, and the send;
 * and the printer settings screen.
 *
 * The preview draws `slipLines` and the bytes encode the SAME lines (src/shared/slip.ts), so what
 * the operator approves is what is sent. Printing is refused, with its sentence, for a bill with no
 * doc_no or a voided bill. The bytes go to the SAVED printer only; the main process re-validates.
 */
import { useEffect, useMemo, useState } from "react";

import type { PrinterSettingsBridge } from "../preload/preload";
import type { ApiOutcome } from "../shared/api";
import type { BillDetail } from "../shared/bills";
import { targetProblem } from "../shared/printerTarget";
import {
  COLUMNS,
  DEFAULT_THAI_CODE_PAGE,
  escposBytes,
  isCodePage,
  sendText,
  slipLines,
  slipRefusal,
  testPageLines,
  THAI_CODE_PAGE_CANDIDATES,
  type PaperWidth,
  type ShopHeader,
  type SlipLine,
} from "../shared/slip";
import { noticeFor, type Session } from "../shared/session";

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** GET /shop -> the slip header, or null for a malformed answer (never a guessed name). */
export function readShop(v: unknown): ShopHeader | null {
  const o = v as Record<string, unknown> | null;
  if (o === null || typeof o !== "object" || typeof o["name"] !== "string") return null;
  return { name: o["name"], address: str(o["address"]), phone: str(o["phone"]) };
}

/** The preview: each line drawn from its structure, inside a paper of the chosen width. */
function Paper({ lines, width }: { lines: readonly SlipLine[]; width: PaperWidth }) {
  return (
    // Thai glyphs run wider than the monospace `ch`, so the paper gets room to spare and scrolls
    // sideways rather than re-breaking a line the printer will print whole.
    <div className="paper-scroll">
    <div className="paper" data-paper={width} style={{ width: `${String(COLUMNS[width] + 9)}ch` }} aria-label="ตัวอย่างสลิป">
      {lines.map((l, i) => {
        if (l.kind === "rule") return <div key={i} className="paper-rule" />;
        if (l.kind === "blank") return <div key={i} className="paper-blank" />;
        if (l.kind === "pair") {
          return (
            <div key={i} className={l.bold === true ? "paper-pair paper-bold" : "paper-pair"}>
              <span>{l.left}</span><span>{l.right}</span>
            </div>
          );
        }
        const cls = ["paper-text", l.align === "center" ? "paper-center" : "", l.bold === true ? "paper-bold" : "", l.big === true ? "paper-big" : ""];
        return <div key={i} className={cls.filter((c) => c !== "").join(" ")}>{l.text}</div>;
      })}
    </div>
    </div>
  );
}

export function SlipPreview(props: {
  bill: BillDetail; session: Session; onSettle: (kind: ApiOutcome<unknown>["kind"]) => void; onClose: () => void;
}) {
  const { bill, session, onSettle, onClose } = props;
  const [shop, setShop] = useState<ShopHeader | null>(null);
  const [settings, setSettings] = useState<PrinterSettingsBridge | null | undefined>(undefined);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const printedAt = useMemo(() => new Date().toISOString(), [bill.id]);
  const refusal = slipRefusal(bill);

  useEffect(() => {
    void (async () => {
      const out = await session.authed((t) => session.api.get(t, "/shop", readShop));
      onSettle(out.kind);
      if (out.kind === "ok") setShop(out.value);
      else setNotice({ text: noticeFor(out, "session"), ok: false });
    })();
    window.recycle.printer.load().then(setSettings, () => setSettings(null));
  }, [session, onSettle]);

  const width: PaperWidth = settings?.width ?? 58;
  const lines = shop !== null ? slipLines(shop, bill, printedAt) : [];
  const encoded = shop !== null ? escposBytes(lines, width, settings?.codePage ?? DEFAULT_THAI_CODE_PAGE) : null;

  const send = async () => {
    if (encoded === null) return;
    setBusy(true);
    try {
      const out = await window.recycle.printer.send(encoded.bytes);
      setNotice({ text: sendText(out.kind), ok: out.kind === "sent" });
    } catch {
      setNotice({ text: sendText("failed"), ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="panel" aria-label={`สลิป ${bill.doc_no ?? ""}`} data-slip={bill.doc_no ?? bill.id}>
      <div className="panel-head">
        <h2 className="panel-title">พิมพ์สลิป</h2>
        <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>กลับ</button>
      </div>
      {refusal !== null ? (
        <p className="notice notice-error" role="alert" data-slip-refused>{refusal}</p>
      ) : (
        <>
          {settings === null ? <p className="notice notice-warn">{sendText("not_configured")}</p> : null}
          {encoded !== null && encoded.unencodable.length > 0 ? (
            <p className="notice notice-warn" data-unencodable>
              ตัวอักษรเหล่านี้เครื่องพิมพ์พิมพ์ไม่ได้ จะออกเป็น ? : {[...new Set(encoded.unencodable)].join(" ")}
            </p>
          ) : null}
          {shop !== null ? <Paper lines={lines} width={width} /> : <p className="table-empty" aria-busy="true">กำลังเตรียมสลิป…</p>}
          <p className="slip-meta">กระดาษ {width} มม. · {COLUMNS[width]} ตัวอักษรต่อบรรทัด</p>
          {notice !== null ? (
            <p className={notice.ok ? "notice notice-ok" : "notice notice-error"} role="status" data-send-result>{notice.text}</p>
          ) : null}
          <button type="button" className="btn btn-primary" disabled={busy || encoded === null || settings == null}
            onClick={() => void send()}>
            {busy ? "กำลังส่ง…" : "ส่งไปเครื่องพิมพ์"}
          </button>
        </>
      )}
    </aside>
  );
}

const TARGET_PROBLEM_TEXT: Readonly<Record<string, string>> = {
  host: "ที่อยู่เครื่องพิมพ์ไม่ถูกต้อง — ใส่เป็นตัวเลข เช่น 192.168.1.50 หรือชื่อเครื่อง",
  port: "พอร์ตต้องเป็นตัวเลข 1–65535 (เครื่องพิมพ์ส่วนใหญ่ใช้ 9100)",
  share: "ชื่อเครื่องพิมพ์ที่แชร์ต้องเป็นแบบ \\\\ชื่อเครื่อง\\ชื่อที่แชร์",
  kind: "เลือกวิธีต่อเครื่องพิมพ์",
};

export function PrinterScreen() {
  const [width, setWidth] = useState<PaperWidth>(58);
  const [kind, setKind] = useState<"tcp" | "share">("tcp");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("9100");
  const [share, setShare] = useState("");
  const [codePage, setCodePage] = useState(String(DEFAULT_THAI_CODE_PAGE));
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.recycle.printer.load().then((s) => {
      if (s === null) return;
      setWidth(s.width);
      setCodePage(String(s.codePage));
      setKind(s.target.kind);
      if (s.target.kind === "tcp") {
        setHost(s.target.host);
        setPort(String(s.target.port));
      } else setShare(s.target.path);
    }, () => setNotice({ text: "อ่านการตั้งค่าเครื่องพิมพ์ไม่ได้", ok: false }));
  }, []);

  /** The form as settings, or the sentence for what is wrong with it. */
  const current = (): PrinterSettingsBridge | string => {
    const target = kind === "tcp" ? { kind: "tcp" as const, host: host.trim(), port: Number(port) } : { kind: "share" as const, path: share.trim() };
    const p = targetProblem(target);
    if (p !== null) return TARGET_PROBLEM_TEXT[p] ?? TARGET_PROBLEM_TEXT["kind"] ?? "";
    const n = Number(codePage);
    if (!isCodePage(n)) return "หน้ารหัสต้องเป็นตัวเลข 0–255";
    return { width, codePage: n, target };
  };

  const save = async (thenTest: boolean) => {
    const s = current();
    if (typeof s === "string") {
      setNotice({ text: s, ok: false });
      return;
    }
    setBusy(true);
    try {
      await window.recycle.printer.save(s);
      if (!thenTest) {
        setNotice({ text: "บันทึกการตั้งค่าเครื่องพิมพ์แล้ว", ok: true });
        return;
      }
      const out = await window.recycle.printer.send(escposBytes(testPageLines(), s.width, s.codePage).bytes);
      setNotice({
        text: out.kind === "sent" ? "ส่งหน้าทดสอบแล้ว — เลือกหมายเลข n ของบรรทัดที่อ่านภาษาไทยได้ถูกต้อง แล้วบันทึกอีกครั้ง" : sendText(out.kind),
        ok: out.kind === "sent",
      });
    } catch {
      setNotice({ text: "บันทึกการตั้งค่าเครื่องพิมพ์ไม่สำเร็จ", ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="printer" data-screen="printer">
      <h1 className="page-title">เครื่องพิมพ์สลิป</h1>
      <p className="page-lead">ตั้งค่าครั้งเดียวต่อเครื่องคอมพิวเตอร์ แล้วพิมพ์สลิปได้จากหน้ารายละเอียดบิล</p>
      <form className="settings-form" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
        <fieldset className="field">
          <legend className="field-label">ขนาดกระดาษ</legend>
          <div className="chips">
            {([58, 80] as const).map((w) => (
              <button key={w} type="button" className="chip" aria-pressed={width === w} onClick={() => setWidth(w)}>{w} มม.</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend className="field-label">ต่อเครื่องพิมพ์ทาง</legend>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={kind === "tcp"} onClick={() => setKind("tcp")}>สายแลน (เครือข่าย)</button>
            <button type="button" className="chip" aria-pressed={kind === "share"} onClick={() => setKind("share")}>USB ที่แชร์ใน Windows</button>
          </div>
        </fieldset>
        {kind === "tcp" ? (
          <div className="field-row">
            <label className="field">
              <span className="field-label">ที่อยู่เครื่องพิมพ์</span>
              <input name="printerHost" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.50" />
            </label>
            <label className="field field-narrow">
              <span className="field-label">พอร์ต</span>
              <input name="printerPort" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} />
            </label>
          </div>
        ) : (
          <label className="field">
            <span className="field-label">ชื่อเครื่องพิมพ์ที่แชร์</span>
            <input name="printerShare" value={share} onChange={(e) => setShare(e.target.value)} placeholder="\\ชื่อเครื่อง\XP58" />
          </label>
        )}
        <label className="field field-narrow">
          <span className="field-label">หน้ารหัสภาษาไทย (n)</span>
          <input name="codePage" inputMode="numeric" value={codePage} onChange={(e) => setCodePage(e.target.value)}
            list="code-pages" />
          <datalist id="code-pages">{THAI_CODE_PAGE_CANDIDATES.map((n) => <option key={n} value={n} />)}</datalist>
          <span className="field-hint">ถ้าภาษาไทยออกเป็นตัวอักษรแปลก ๆ ให้พิมพ์หน้าทดสอบ แล้วใช้หมายเลขของบรรทัดที่อ่านออก</span>
        </label>
        {notice !== null ? <p className={notice.ok ? "notice notice-ok" : "notice notice-error"} role="status" data-printer-result>{notice.text}</p> : null}
        <div className="void-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>บันทึก</button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void save(true)}>บันทึกและพิมพ์หน้าทดสอบ</button>
        </div>
      </form>
    </div>
  );
}
