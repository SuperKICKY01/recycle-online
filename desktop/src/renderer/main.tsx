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
import type { ApiOutcome, WhoAmI } from "../shared/api";
import { BillsScreen } from "./Bills";
import { Shell, type NavItem } from "./Shell";
import { SetupScreen, SignInScreen } from "./SignIn";

const NAV: readonly NavItem[] = [
  { id: "bills", label: "บิลรับซื้อ", icon: "receipt", enabled: true },
  { id: "slip", label: "พิมพ์สลิป", icon: "printer", enabled: false },
];

type Phase = "loading" | "setup" | "signin" | "offline" | "app";

/** The sentence for a resume that did not succeed and did not end the session. */
function unreachableNotice(kind: ApiOutcome<WhoAmI>["kind"]): string {
  return kind === "outdated" ? SESSION_TEXT.outdated : SESSION_TEXT.offline;
}

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
  /** A non-blocking line at the top of the shell (a server blip on focus, a save that failed). */
  const [shellNotice, setShellNotice] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);

  /**
   * After a re-check: an ENDED session goes to sign-in with its sentence; a server that could not
   * be reached leaves the shell up and says so in it -- the session is still valid
   * (red team 2026-10-12, finding 1).
   */
  const settle = useCallback((kind: ApiOutcome<WhoAmI>["kind"]) => {
    const s = sessionRef.current;
    if (s !== null && !s.signedIn) {
      setNotice(s.notice);
      setPhase("signin");
    } else setShellNotice(kind === "ok" ? null : unreachableNotice(kind));
  }, []);

  /** Start-up and the offline screen's retry: confirm a stored session once. */
  const resumeStored = useCallback(async (s: Session) => {
    const kind = await s.resume();
    if (kind === "ok") setPhase("app");
    else if (!s.signedIn) {
      setNotice(s.notice);
      setPhase("signin");
    } else {
      setNotice(unreachableNotice(kind));
      setPhase("offline");
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
      const token = await window.recycle.session.load();
      const s = makeSession(stored, token);
      sessionRef.current = s;
      if (token === null) setPhase("signin");
      else await resumeStored(s);
    })();
  }, [resumeStored]);

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
    try {
      const code = rawCode.trim().toUpperCase();
      const out = await new ApiClient(apiBase, (url, init) => fetch(url, init)).resolveShopCode(code);
      if (out.kind !== "ok") {
        setNotice(noticeFor(out, "shop"));
        return;
      }
      const c: ShopConfig = { apiBase, shopCode: code, tenantId: out.value };
      try {
        await window.recycle.config.save(c);
      } catch {
        setNotice(SESSION_TEXT.configFailed);
        return;
      }
      setConfig(c);
      sessionRef.current = makeSession(c, null);
      setNotice(null);
      setPhase("signin");
    } finally {
      setBusy(false);
    }
  };

  const doSignIn = async (username: string, password: string) => {
    const s = sessionRef.current;
    if (s === null || config === null) return;
    setBusy(true);
    try {
      const r = await s.signIn(config.tenantId, username, password);
      if (r.ok) {
        setNotice(null);
        setShellNotice(r.notice);
        setPhase("app");
      } else setNotice(r.notice);
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = async () => {
    await sessionRef.current?.signOut();
    setNotice(sessionRef.current?.notice ?? null);
    setPhase("signin");
  };

  const doChangeShop = async () => {
    try {
      await window.recycle.config.clear();
    } catch {
      setNotice(SESSION_TEXT.configFailed);
      return;
    }
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
  if (phase === "offline") {
    return (
      <div className="gate">
        <div className="gate-form" role="alert">
          <h1 className="page-title">ติดต่อเซิร์ฟเวอร์ไม่ได้</h1>
          <p className="notice notice-warn">{notice}</p>
          <p className="page-lead">ยังเข้าสู่ระบบอยู่ ไม่ต้องใส่รหัสผ่านใหม่ — เมื่อเครือข่ายกลับมาให้กดลองอีกครั้ง</p>
          <button type="button" className="btn btn-primary" disabled={busy}
            onClick={() => {
              const s = sessionRef.current;
              if (s === null) return;
              setBusy(true);
              void resumeStored(s).finally(() => setBusy(false));
            }}>
            ลองอีกครั้ง
          </button>
        </div>
      </div>
    );
  }
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
      {shellNotice !== null ? <p className="notice notice-warn shell-notice" role="status">{shellNotice}</p> : null}
      <BillsScreen session={sessionRef.current} onSettle={settle} />
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
