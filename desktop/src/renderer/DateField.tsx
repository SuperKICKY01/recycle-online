/**
 * ONE WAY TO ENTER A DATE ON THE DESKTOP (D-5, ADVISOR-DECIDED 2026-10-12): Buddhist era,
 * day/month/year, typed or picked. Chromium's `<input type="date">` drew `10/12/2026` -- month
 * first, Christian era -- beside every other date on the screen reading `12/10/2569`, so it is not
 * used anywhere in this program.
 *
 * The value is a shop day on the wire (`2026-10-12`, what the API takes); what the operator sees and
 * types is `12/10/2569`. A typed value is committed on Enter or on leaving the field; a value that is
 * not a day, or carries a Christian-era year, is refused with its sentence and the previous day
 * stands. The calendar shows Thai month names and the Buddhist-era year
 * (impeccable · operate.md · "Native expectations ... outrank expression" -- a Thai office reads
 * dates this way; the picker follows the reader, not the browser).
 */
import { useEffect, useId, useRef, useState } from "react";

import { monthGrid, monthTitle, parseShopDay, shiftMonth, shopDayLabel, THAI_WEEKDAYS } from "../shared/period";

interface Props {
  readonly name: string;
  readonly label: string;
  /** The shop day, `YYYY-MM-DD`. */
  readonly value: string;
  readonly today: string;
  readonly onChange: (wire: string) => void;
}

export function DateField({ name, label, value, today, onChange }: Props) {
  const [text, setText] = useState(shopDayLabel(value));
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value);
  const box = useRef<HTMLDivElement>(null);
  const hintId = useId();

  useEffect(() => { setText(shopDayLabel(value)); setProblem(null); }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (box.current !== null && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const commit = () => {
    if (text === shopDayLabel(value)) return;
    const r = parseShopDay(text);
    if ("problem" in r) {
      setProblem(r.problem);
      return;
    }
    setProblem(null);
    onChange(r.wire);
  };

  const pick = (wire: string) => {
    setOpen(false);
    setProblem(null);
    onChange(wire);
  };

  return (
    <div className="field field-inline date-field" ref={box}>
      <label className="field-label" htmlFor={`${hintId}-input`}>{label}</label>
      <div className="date-input">
        <input id={`${hintId}-input`} name={name} value={text} inputMode="numeric" autoComplete="off"
          placeholder="วว/ดด/ปปปป" aria-invalid={problem !== null} aria-describedby={problem !== null ? `${hintId}-problem` : undefined}
          onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
        <button type="button" className="date-open" aria-label={`เลือก${label}จากปฏิทิน`} aria-expanded={open}
          onClick={() => { setMonth(value); setOpen((o) => !o); }}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" />
          </svg>
        </button>
      </div>
      {problem !== null ? <span className="field-problem" id={`${hintId}-problem`} role="alert">{problem}</span> : null}
      {open ? (
        <div className="calendar" role="dialog" aria-label={`ปฏิทิน ${label}`} data-calendar={name}>
          <div className="calendar-head">
            <button type="button" className="calendar-nav" aria-label="เดือนก่อน" onClick={() => setMonth((m) => shiftMonth(m, -1))}>‹</button>
            <span className="calendar-title" data-calendar-title>{monthTitle(month)}</span>
            <button type="button" className="calendar-nav" aria-label="เดือนถัดไป" onClick={() => setMonth((m) => shiftMonth(m, 1))}>›</button>
          </div>
          <table className="calendar-grid">
            <thead><tr>{THAI_WEEKDAYS.map((d) => <th key={d} scope="col">{d}</th>)}</tr></thead>
            <tbody>
              {monthGrid(month).map((week, i) => (
                <tr key={i}>
                  {week.map((wire, j) => (
                    <td key={j}>
                      {wire !== null ? (
                        <button type="button" data-day={wire} aria-label={shopDayLabel(wire)}
                          aria-pressed={wire === value} className={wire === today ? "calendar-day is-today" : "calendar-day"}
                          onClick={() => pick(wire)}>
                          {Number(wire.slice(8, 10))}
                        </button>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
