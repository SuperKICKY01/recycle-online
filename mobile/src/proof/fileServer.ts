/**
 * A FakeServer whose state lives in a JSON file instead of memory.
 *
 * Needed because proveVoid V4 kills a child process between "bill synced" and
 * "void applied". An in-memory server dies with the child, so the parent could
 * not check what the server had actually been told — the very question the case
 * exists to answer. Backing it with a file makes the server outlive the crash,
 * exactly as a real one would.
 *
 * Mirrors the Phase 1c contract: repeated idempotency_key returns the existing
 * bill; voiding an already-voided bill answers "already"; a voided bill keeps
 * its doc_no and the counter never rewinds.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

import type { BillPayload, LocalBill, SendOutcome, Transport, VoidOutcome } from "../sync/types.js";

export interface ServerRow {
  id: string;
  doc_no: string;
  idempotency_key: string;
  voided_at: string | null;
  void_reason: string | null;
}

interface State {
  seq: number;
  rows: ServerRow[];
  /** Every void request the server received, repeats included. */
  voidCalls: number;
}

const EMPTY: State = { seq: 0, rows: [], voidCalls: 0 };

export class FileServer {
  constructor(private readonly path: string) {
    if (!existsSync(path)) this.write(EMPTY);
  }

  private read(): State {
    return JSON.parse(readFileSync(this.path, "utf8")) as State;
  }

  private write(s: State): void {
    writeFileSync(this.path, JSON.stringify(s, null, 2), "utf8");
  }

  snapshot(): State {
    return this.read();
  }

  submit(payload: BillPayload): { kind: "accepted" | "duplicate"; bill: ServerRow } {
    const s = this.read();
    const existing = s.rows.find((r) => r.idempotency_key === payload.idempotency_key);
    if (existing) return { kind: "duplicate", bill: existing };
    s.seq += 1;
    const row: ServerRow = {
      id: payload.id,
      doc_no: `B-2569-${String(s.seq)}`,
      idempotency_key: payload.idempotency_key,
      voided_at: null,
      void_reason: null,
    };
    s.rows.push(row);
    this.write(s);
    return { kind: "accepted", bill: row };
  }

  voidBill(
    id: string,
    reason: string,
  ): { kind: "voided" | "already_voided" | "not_found"; bill?: ServerRow } {
    const s = this.read();
    s.voidCalls += 1;
    const row = s.rows.find((r) => r.id === id);
    if (!row) {
      this.write(s);
      return { kind: "not_found" };
    }
    if (row.voided_at !== null) {
      this.write(s);
      return { kind: "already_voided", bill: row };
    }
    row.voided_at = new Date().toISOString();
    row.void_reason = reason;
    this.write(s);
    return { kind: "voided", bill: row };
  }
}

/** Transport over a FileServer. `onVoid` lets a test crash at that instant. */
export class FileServerTransport implements Transport {
  constructor(
    private readonly server: FileServer,
    private readonly onVoid?: () => void,
  ) {}

  sendBill(bill: LocalBill): Promise<SendOutcome> {
    const r = this.server.submit(bill.payload);
    return Promise.resolve({ kind: r.kind, doc_no: r.bill.doc_no });
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    this.onVoid?.(); // the crash hook: fires BEFORE the server hears anything
    const r = this.server.voidBill(bill.id, reason);
    if (r.kind === "not_found") {
      return Promise.resolve({ kind: "rejected", reason: "HTTP 404: bill not found" });
    }
    return Promise.resolve({ kind: r.kind, doc_no: r.bill?.doc_no ?? null });
  }
}
