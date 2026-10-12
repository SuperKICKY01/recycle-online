/**
 * THE RENDERER'S ENTRY. B1 (the scaffold): the shell and one screen saying what this program
 * is and what comes next. Sign-in (B2), bills (B3) and the slip (B4) replace the placeholder.
 */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { Shell, type NavItem } from "./Shell";

const NAV: readonly NavItem[] = [
  { id: "bills", label: "บิลรับซื้อ", icon: "receipt", enabled: true },
  { id: "slip", label: "พิมพ์สลิป", icon: "printer", enabled: false },
];

function App() {
  const [current, setCurrent] = useState("bills");
  return (
    <Shell items={NAV} current={current} onNavigate={setCurrent} footer="ยังไม่ได้เข้าสู่ระบบ">
      <h1 className="page-title">บิลรับซื้อ</h1>
      <p className="page-lead">
        โปรแกรมสำนักงานติดตั้งเรียบร้อยแล้ว ขั้นถัดไปคือการเข้าสู่ระบบด้วยรหัสร้านและบัญชีผู้ใช้เดียวกับที่ใช้บนมือถือ
      </p>
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
