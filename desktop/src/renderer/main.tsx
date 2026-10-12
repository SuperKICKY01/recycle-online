/**
 * THE RENDERER'S ENTRY: setup → sign-in → the shell.
 *
 * The session is checked ONCE at start-up (a stored token is confirmed with /whoami) and again
 * when the operator comes back to the window or moves between screens — events a person makes,
 * never a timer. Any 401 drops to the sign-in screen with the expiry sentence and the session
 * sends nothing more until a sign-in (src/shared/session.ts).
 */
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { ApiClient } from "../shared/api";
import { normaliseApiBase, noticeFor, Session, SESSION_TEXT, type ShopConfig } from "../shared/session";
import { Shell, type NavItem } from "./Shell";
import { SetupScreen, SignInScreen } from "./SignIn";

const NAV: readonly NavItem[] = [
  { id: "bills", label: "บิลรับซื้อ", icon: "receipt", enabled: true },
  { id: "slip", label: "พิมพ์สลิป", icon: "printer", enabled: false },
];

type Phase = "loading" | "setup" | "signin" | "app";

function makeSession(config: ShopConfig, token: string | null): Session {
  const api = new ApiClient(config.apiBase, (url, init) => fetch(url, init));
  return new Session(
    api,
    {
      saveToken: async (t) => { await window.recycle.session.save(t); },
      clearToken: () => window.recycle.session.clear(),
    },
    token,
  );
}

function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [config, setConfig] = useState<ShopConfig | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("bills");
  const sessionRef = useRef<Session | null>(null);

  /** After any authenticated call: if it ended the session, go to sign-in and say why. */
  const settle = useCallback(() => {
    const s = sessionRef.current;
    if (s !== null && !s.signedIn) {
      setNotice(s.notice);
      setPhase("signin");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const stored = await window.recycle.config.load();
      if (stored === null) {
        setPhase("setup");
        return;
      }
      setConfig(stored);
      const s = makeSession(stored, await window.recycle.session.load());
      sessionRef.current = s;
      if (await s.resume()) setPhase("app");
      else {
        setNotice(s.notice);
        setPhase("signin");
      }
    })();
  }, []);

  /** Coming back to the window re-confirms the session once — an event, not a poll. */
  useEffect(() => {
    if (phase !== "app") return undefined;
    const onFocus = () => {
      void sessionRef.current?.resume().then(settle);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [phase, settle]);

  const doSetup = async (rawBase: string, rawCode: string) => {
    const apiBase = normaliseApiBase(rawBase);
    if (apiBase === null) {
      setNotice(SESSION_TEXT.badAddress);
      return;
    }
    setBusy(true);
    const code = rawCode.trim().toUpperCase();
    const out = await new ApiClient(apiBase, (url, init) => fetch(url, init)).resolveShopCode(code);
    setBusy(false);
    if (out.kind !== "ok") {
      setNotice(noticeFor(out, "shop"));
      return;
    }
    const c: ShopConfig = { apiBase, shopCode: code, tenantId: out.value };
    await window.recycle.config.save(c);
    setConfig(c);
    sessionRef.current = makeSession(c, null);
    setNotice(null);
    setPhase("signin");
  };

  const doSignIn = async (username: string, password: string) => {
    const s = sessionRef.current;
    if (s === null || config === null) return;
    setBusy(true);
    const r = await s.signIn(config.tenantId, username, password);
    setBusy(false);
    if (r.ok) {
      setNotice(null);
      setPhase("app");
    } else setNotice(r.notice);
  };

  const doSignOut = async () => {
    await sessionRef.current?.signOut();
    setNotice(sessionRef.current?.notice ?? null);
    setPhase("signin");
  };

  const doChangeShop = async () => {
    await window.recycle.config.clear();
    sessionRef.current = null;
    setConfig(null);
    setNotice(null);
    setPhase("setup");
  };

  const navigate = (id: string) => {
    setCurrent(id);
    void sessionRef.current?.resume().then(settle);
  };

  if (phase === "loading") return <div className="gate" aria-busy="true" />;
  if (phase === "setup") return <SetupScreen busy={busy} notice={notice} onSubmit={(b, c) => void doSetup(b, c)} />;
  if (phase === "signin" || config === null || sessionRef.current?.me == null) {
    return (
      <SignInScreen busy={busy} notice={notice} shopCode={config?.shopCode ?? ""}
        onSubmit={(u, p) => void doSignIn(u, p)} onChangeShop={() => void doChangeShop()} />
    );
  }
  const me = sessionRef.current.me;
  return (
    <Shell
      items={NAV}
      current={current}
      onNavigate={navigate}
      footer={
        <div className="who">
          <div className="who-name" data-signed-in={me.username}>{me.username}</div>
          <div className="who-role">ร้าน {config.shopCode} · {me.role}</div>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => void doSignOut()}>ออกจากระบบ</button>
        </div>
      }
    >
      <h1 className="page-title">บิลรับซื้อ</h1>
      <p className="page-lead">เข้าสู่ระบบแล้ว รายการบิลของร้านจะแสดงที่หน้านี้</p>
    </Shell>
  );
}

const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
