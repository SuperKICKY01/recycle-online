/**
 * THE TWO SCREENS BEFORE THE SHELL: first-run SETUP (the shop's server address and its 8-letter
 * shop code, asked once) and SIGN-IN (the same username and password as on the phone, ROADMAP
 * P1.14). Labels are persistent and sit above their fields; the placeholder is an example, never
 * the label (impeccable · clarify · "Use persistent labels; placeholders are examples, not
 * labels"). Every sentence about the session comes from src/shared/session.ts.
 */
import { useState, type FormEvent } from "react";

interface SetupProps {
  readonly busy: boolean;
  readonly notice: string | null;
  readonly onSubmit: (apiBase: string, shopCode: string) => void;
}

export function SetupScreen({ busy, notice, onSubmit }: SetupProps) {
  const [apiBase, setApiBase] = useState("");
  const [code, setCode] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(apiBase, code);
  };
  return (
    <div className="gate">
      <form className="gate-form" onSubmit={submit} aria-labelledby="setup-title">
        <h1 id="setup-title" className="page-title">ตั้งค่าเครื่องนี้</h1>
        <p className="page-lead">ใส่ที่อยู่เซิร์ฟเวอร์ของร้านและรหัสร้าน 8 ตัว ทำครั้งเดียวต่อเครื่อง</p>
        <label className="field">
          <span className="field-label">ที่อยู่เซิร์ฟเวอร์</span>
          <input name="apiBase" value={apiBase} onChange={(e) => setApiBase(e.target.value)}
            placeholder="http://192.168.1.10:8000" autoComplete="off" spellCheck={false} disabled={busy} />
        </label>
        <label className="field">
          <span className="field-label">รหัสร้าน</span>
          <input name="shopCode" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="เช่น K7M2P9QB" autoComplete="off" spellCheck={false} maxLength={8} disabled={busy} />
        </label>
        {notice !== null ? <p className="notice notice-error" role="alert">{notice}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={busy || apiBase.trim() === "" || code.trim() === ""}>
          {busy ? "กำลังตรวจรหัสร้าน…" : "บันทึกและไปต่อ"}
        </button>
      </form>
    </div>
  );
}

interface SignInProps {
  readonly busy: boolean;
  readonly notice: string | null;
  readonly shopCode: string;
  readonly onSubmit: (username: string, password: string) => void;
  readonly onChangeShop: () => void;
}

export function SignInScreen({ busy, notice, shopCode, onSubmit, onChangeShop }: SignInProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(username.trim(), password);
    // The password leaves component state the moment it is handed over (as on the phone).
    setPassword("");
  };
  return (
    <div className="gate">
      <form className="gate-form" onSubmit={submit} aria-labelledby="signin-title">
        <h1 id="signin-title" className="page-title">เข้าสู่ระบบ</h1>
        <p className="page-lead">ร้านรหัส {shopCode} — ใช้ชื่อผู้ใช้และรหัสผ่านเดียวกับบนมือถือ</p>
        {notice !== null ? <p className="notice notice-warn" role="alert">{notice}</p> : null}
        <label className="field">
          <span className="field-label">ชื่อผู้ใช้</span>
          <input name="username" value={username} onChange={(e) => setUsername(e.target.value)}
            autoComplete="username" spellCheck={false} disabled={busy} />
        </label>
        <label className="field">
          <span className="field-label">รหัสผ่าน</span>
          <input name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password" disabled={busy} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy || username.trim() === "" || password === ""}>
          {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onChangeShop} disabled={busy}>
          เปลี่ยนร้านหรือที่อยู่เซิร์ฟเวอร์
        </button>
      </form>
    </div>
  );
}
