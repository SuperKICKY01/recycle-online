/**
 * `local_sales` and `cached_buyers` on SQLite (M2) -- the sale kind's store, beside the bill and seller stores on
 * the SAME connection (one file; `SqliteLocalStore.open` brings the schema up, as `SqliteLocalSellerStore` notes).
 *
 * OWNERSHIP IS THE DEFINITION. Every statement that defines the owed queue or the screen's list splices
 * `OWNED_BY_CURRENT` (SqliteLocalStore), so a sale another person wrote on this handset is neither sent nor shown
 * under the wrong name, and no identity at all selects nothing (fails CLOSED). The identity is read FRESH per
 * statement, for the reason the seller store gives: a cached owner goes stale exactly when someone else signs in.
 *
 * THE PAYLOAD IS WRITTEN ONCE. `payload_json` carries the id and the idempotency key; nothing here rewrites it, so
 * every retry sends the bytes the yard confirmed (hard rule 4) -- the state columns move, the content never does.
 */

import type { CachedBuyer, LocalSale, LocalSaleStore, NewLocalSale, SalePayload } from "../../sync/localSale.js";
import type { RowOwner, SyncState } from "../../sync/types.js";
import type { SqlDriver } from "./driver.js";
import { OWNED_BY_CURRENT, ownerParams } from "./SqliteLocalStore.js";
import { SqliteIdentityStore } from "./SqliteIdentityStore.js";

interface SaleRow {
  id: string;
  idempotency_key: string;
  payload_json: string;
  buyer_label: string;
  sync_state: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  device_created_at: string;
  next_attempt_at: string;
  doc_no: string | null;
  parked_code: string | null;
  owner_tenant_id: string | null;
  owner_user_id: string | null;
}

const COLUMNS =
  "id, idempotency_key, payload_json, buyer_label, sync_state, attempt_count, last_error, created_at," +
  " device_created_at, next_attempt_at, doc_no, parked_code, owner_tenant_id, owner_user_id";

/**
 * OWED AND ACTIONABLE: pending, mine, and not parked -- or parked and its slow retry has come (`?` = now). The
 * backoff of an ordinary retry is NOT here: the drain applies `dueAt` to the head it must not skip.
 */
const SALE_ACTIONABLE = `sync_state = 'pending' AND ${OWNED_BY_CURRENT} AND (parked_code IS NULL OR next_attempt_at <= ?)`;

/** `sync_state` is narrowed by the table's CHECK; the cast states what the schema enforces. */
function toSale(row: SaleRow): LocalSale {
  return {
    id: row.id,
    idempotency_key: row.idempotency_key,
    payload: JSON.parse(row.payload_json) as SalePayload,
    buyer_label: row.buyer_label,
    sync_state: row.sync_state as SyncState,
    attempt_count: row.attempt_count,
    last_error: row.last_error,
    created_at: row.created_at,
    device_created_at: row.device_created_at,
    next_attempt_at: row.next_attempt_at,
    doc_no: row.doc_no,
    parked_code: row.parked_code,
    owner_tenant_id: row.owner_tenant_id,
    owner_user_id: row.owner_user_id,
  };
}

export class SqliteLocalSaleStore implements LocalSaleStore {
  private constructor(
    private readonly db: SqlDriver,
    private readonly identity: SqliteIdentityStore,
  ) {}

  /** Over an ALREADY-INITIALISED connection (the bill store's open ran the schema). */
  static open(db: SqlDriver): SqliteLocalSaleStore {
    return new SqliteLocalSaleStore(db, new SqliteIdentityStore(db));
  }

  private currentOwner(): Promise<RowOwner | null> {
    return this.identity.load();
  }

  async createSale(sale: NewLocalSale): Promise<void> {
    const p = sale.payload;
    const now = sale.now.toISOString();
    await this.db.run(
      `INSERT INTO local_sales (${COLUMNS}) VALUES (?, ?, ?, ?, 'pending', 0, NULL, ?, ?, ?, NULL, NULL, ?, ?)`,
      [p.id, p.idempotency_key, JSON.stringify(p), sale.buyer_label, now, p.device_created_at, now,
        sale.owner.tenant_id, sale.owner.user_id],
    );
  }

  async listSalesToSend(limit: number, now: Date): Promise<LocalSale[]> {
    const rows = await this.db.all<SaleRow>(
      `SELECT ${COLUMNS} FROM local_sales WHERE ${SALE_ACTIONABLE} ORDER BY device_created_at, id LIMIT ?`,
      [...ownerParams(await this.currentOwner()), now.toISOString(), limit],
    );
    return rows.map(toSale);
  }

  /** Owed whatever the schedule: pending (parked included) or syncing. A failed sale is not owed -- it is shown. */
  async countSalesOwed(): Promise<number> {
    const rows = await this.db.all<{ n: number }>(
      `SELECT count(*) AS n FROM local_sales WHERE sync_state IN ('pending', 'syncing') AND ${OWNED_BY_CURRENT}`,
      ownerParams(await this.currentOwner()),
    );
    return rows[0]?.n ?? 0;
  }

  async claimSaleSend(id: string, now: Date): Promise<boolean> {
    const r = await this.db.run(
      `UPDATE local_sales SET sync_state = 'syncing', next_attempt_at = ? WHERE id = ? AND ${SALE_ACTIONABLE}`,
      [now.toISOString(), id, ...ownerParams(await this.currentOwner()), now.toISOString()],
    );
    return r.changes === 1;
  }

  async markSaleSynced(id: string, docNo: string | null, attempt: number, now: Date): Promise<void> {
    await this.db.run(
      "UPDATE local_sales SET sync_state = 'synced', doc_no = ?, attempt_count = ?, last_error = NULL, parked_code = NULL," +
        " next_attempt_at = ? WHERE id = ?",
      [docNo, attempt, now.toISOString(), id],
    );
  }

  async markSaleFailed(id: string, reason: string, attempt: number, now: Date): Promise<void> {
    await this.db.run(
      "UPDATE local_sales SET sync_state = 'failed', last_error = ?, attempt_count = ?, next_attempt_at = ? WHERE id = ?",
      [reason, attempt, now.toISOString(), id],
    );
  }

  async markSalePending(id: string, reason: string, parkedCode: string | null, attempt: number, next: Date, _now: Date): Promise<void> {
    await this.db.run(
      "UPDATE local_sales SET sync_state = 'pending', last_error = ?, parked_code = ?, attempt_count = ?, next_attempt_at = ?" +
        " WHERE id = ?",
      [reason, parkedCode, attempt, next.toISOString(), id],
    );
  }

  /** A crash left it in flight: back to pending, unchanged. The key is the same, so the resend cannot duplicate. */
  async resetSyncingSalesToPending(now: Date): Promise<string[]> {
    const rows = await this.db.all<{ id: string }>("SELECT id FROM local_sales WHERE sync_state = 'syncing'");
    if (rows.length > 0) {
      await this.db.run("UPDATE local_sales SET sync_state = 'pending', next_attempt_at = ? WHERE sync_state = 'syncing'",
        [now.toISOString()]);
    }
    return rows.map((r) => r.id);
  }

  async listSalesForScreen(limit: number): Promise<LocalSale[]> {
    const rows = await this.db.all<SaleRow>(
      `SELECT ${COLUMNS} FROM local_sales WHERE ${OWNED_BY_CURRENT} ORDER BY device_created_at DESC, id DESC LIMIT ?`,
      [...ownerParams(await this.currentOwner()), limit],
    );
    return rows.map(toSale);
  }

  async saveBuyers(buyers: readonly CachedBuyer[]): Promise<void> {
    const owner = await this.currentOwner();
    if (owner === null) throw new Error("saveBuyers: no signed-in shop to stamp the buyers with");
    await this.db.transaction(async (tx) => {
      await tx.run("DELETE FROM cached_buyers WHERE owner_tenant_id = ?", [owner.tenant_id]);
      for (const b of buyers) {
        await tx.run("INSERT OR REPLACE INTO cached_buyers (id, code, name, owner_tenant_id) VALUES (?, ?, ?, ?)",
          [b.id, b.code, b.name, owner.tenant_id]);
      }
    });
  }

  async listBuyers(): Promise<CachedBuyer[]> {
    const owner = await this.currentOwner();
    return this.db.all<CachedBuyer>("SELECT id, code, name FROM cached_buyers WHERE owner_tenant_id = ? ORDER BY code",
      [owner === null ? null : owner.tenant_id]);
  }
}
