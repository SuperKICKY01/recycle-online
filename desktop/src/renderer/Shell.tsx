/**
 * THE SHELL — left navigation and a content area, in ONE component (ADVISOR-DECIDED D-4).
 *
 * Every screen is handed in as `children` and knows nothing about this frame, so the frame can
 * be replaced — the SRS asks for an MDI blue-white shell (docs/SRS.md "โครงสร้างหน้าต่างซ้อนทับกัน
 * (MDI - Multiple Document Interface)") and the payer has not said whether that stands —
 * without touching a screen. The navigation items are DATA (`items`), not markup a screen adds.
 */
import type { ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  /** False for a screen not built yet: shown, so the shop sees what is coming, but inert. */
  readonly enabled: boolean;
}

interface Props {
  readonly items: readonly NavItem[];
  readonly current: string;
  readonly onNavigate: (id: string) => void;
  /** The line at the foot of the navigation: who is signed in, or why nobody is. */
  readonly footer: ReactNode;
  readonly children: ReactNode;
}

export function Shell({ items, current, onNavigate, footer, children }: Props) {
  return (
    <div className="shell" data-shell="nav-content">
      <nav className="shell-nav" aria-label="เมนูหลัก">
        <div className="shell-brand">
          <Icon name="scale" />
          <div>
            <div className="shell-brand-name">Recycle Online</div>
            <div className="shell-brand-sub">สำนักงาน</div>
          </div>
        </div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="nav-item"
            data-nav={item.id}
            disabled={!item.enabled}
            aria-current={item.id === current ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
        <div className="shell-foot">{footer}</div>
      </nav>
      <main className="shell-main">{children}</main>
    </div>
  );
}
