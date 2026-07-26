/**
 * Phase 2c-4. Entry-screen safety and field UX on top of the 2c-3 cart.
 *
 * No data model changed here: the bill payload, sync path, money module and
 * draft storage are exactly as 2c-3 left them. What is new is that the entry
 * fields defend against stale values, numeric entry goes through an in-app pad,
 * and the operator can see the connection state without opening anything.
 *
 * Still deliberately absent: customer scan, customer picker (the seller is
 * fetched but fixed), and any history screen.
 */
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { HttpTransport } from "./src/adapters/httpTransport";
import { SqliteDraftStore } from "./src/adapters/sqlite/SqliteDraftStore";
import { SqliteLocalStore } from "./src/adapters/sqlite/SqliteLocalStore";
import { cartTotal, newDraft, toBillItems } from "./src/cart/cart";
import { NO_LOCKS, releaseOnSave } from "./src/cart/entry";
import type { Locks } from "./src/cart/entry";
import type { Draft } from "./src/cart/types";
import { ExpoSqliteDriver } from "./src/device/expoSqliteDriver";
import { buildLocalBill } from "./src/sync/createBill";
import { SyncEngine } from "./src/sync/engine";
import { assessQueue } from "./src/sync/queueHealth";
import type { QueueHealth } from "./src/sync/queueHealth";
import { systemClock } from "./src/sync/systemClock";
import type { LocalBill, SyncState } from "./src/sync/types";
import { isVoided } from "./src/sync/types";
import type { Product, Seller } from "./app/api";
import { fetchProducts, fetchSellers, login } from "./app/api";
import { BillsPanel } from "./app/BillsPanel";
import { CartScreen } from "./app/CartScreen";
import { ConfirmSaveDialog } from "./app/ConfirmSaveDialog";
import { API_BASE_URL, DEMO } from "./app/config";
import { deviceIds } from "./app/ids";
import { StatusStrip } from "./app/StatusStrip";

const ALL_STATES: SyncState[] = ["pending", "syncing", "synced", "failed"];

const STATE_TH: Record<SyncState, string> = {
  pending: "รอส่ง",
  syncing: "กำลังส่ง",
  synced: "ส่งแล้ว",
  failed: "ผิดพลาด",
};

const STATE_COLOR: Record<SyncState, string> = {
  pending: "#b45309",
  syncing: "#1d4ed8",
  synced: "#15803d",
  failed: "#b91c1c",
};

/** Form keystrokes are written through on this delay; lines are written at once. */
const FORM_DEBOUNCE_MS = 400;

const nowIso = (): string => new Date().toISOString();

export default function App() {
  const [status, setStatus] = useState("กำลังเปิดฐานข้อมูล…");
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bills, setBills] = useState<LocalBill[]>([]);
  const [latest, setLatest] = useState<LocalBill | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [billsOpen, setBillsOpen] = useState(false);

  /*
   * Locks live here, not in CartScreen, because their lifetime is the BILL:
   * saving releases them, and saving happens here. Keeping them in the entry
   * screen would make "released on save" a message the screen has to be told,
   * which is exactly the kind of thing that gets missed on a later refactor.
   *
   * They are intentionally NOT persisted: the phase forbids a data model
   * change, and the failure direction is safe — after a force-quit the values
   * return (they live in the draft form) while the locks do not, so the next
   * product change clears them rather than silently carrying them.
   */
  const [locks, setLocks] = useState<Locks>(NO_LOCKS);

  const [online, setOnline] = useState<boolean | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [health, setHealth] = useState<QueueHealth | null>(null);

  const billStoreRef = useRef<SqliteLocalStore | null>(null);
  const draftStoreRef = useRef<SqliteDraftStore | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const tokenRef = useRef<string | null>(null);

  const pendingDraft = useRef<Draft | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------------------------------------------------------------- boot -- */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const driver = await ExpoSqliteDriver.open("recycle.db");
        const billStore = await SqliteLocalStore.open(driver);
        const draftStore = await SqliteDraftStore.open(driver);
        if (cancelled) return;
        billStoreRef.current = billStore;
        draftStoreRef.current = draftStore;

        engineRef.current = new SyncEngine({
          store: billStore,
          transport: new HttpTransport({
            baseUrl: API_BASE_URL,
            getToken: () => Promise.resolve(tokenRef.current),
            fetchImpl: (input, init) => fetch(input, init),
          }),
          clock: systemClock,
          backoffBaseMs: 2000,
          backoffMaxMs: 30000,
        });

        const recovered = await engineRef.current.recoverInterrupted();
        const restored = await draftStore.load();
        if (cancelled) return;
        setDraft(restored);
        setReady(true);
        setStatus(
          API_BASE_URL +
            (recovered.length > 0 ? ` · กู้คืน ${String(recovered.length)} บิลที่ค้าง` : "") +
            (restored ? ` · พบบิลค้างไว้ ${String(restored.lines.length)} รายการ` : ""),
        );
      } catch (err) {
        setStatus(`เปิดฐานข้อมูลไม่สำเร็จ: ${describe(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------- live bill view -- */

  const refresh = useCallback(async () => {
    const store = billStoreRef.current;
    if (!store) return;
    const [pending, syncing, synced, failed] = await Promise.all(
      ALL_STATES.map((s) => store.listByState(s)),
    );
    setPendingCount((pending?.length ?? 0) + (syncing?.length ?? 0));
    setFailedCount(failed?.length ?? 0);
    // Read the last successful sync from storage rather than from a variable,
    // so it survives a restart instead of resetting to "never".
    setLastSyncedAt(
      (synced ?? []).reduce<string | null>(
        (max, b) => (b.synced_at && (max === null || b.synced_at > max) ? b.synced_at : max),
        null,
      ),
    );
    const all = [pending, syncing, synced, failed]
      .flatMap((g) => g ?? [])
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    setBills(all.slice(0, 30));
    // A voided bill is not the "latest bill" — it is a reversal, and showing it
    // as the shop's most recent business would misreport the day.
    setLatest(all.find((b) => !isVoided(b)) ?? null);

    // Queue health: is one bill stuck at the head, holding up everything behind
    // it? Assessed on the SAME ordering the engine sends in, so the bill flagged
    // as the blocker is the bill actually blocking. Keyed on the real wall clock
    // because "how long has it been stuck" is a real elapsed duration.
    const snap = await store.pendingQueueSnapshot();
    setHealth(assessQueue(snap, new Date()));
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => void refresh(), 400);
    return () => clearInterval(t);
  }, [ready, refresh]);

  /** One sync pass, recording what it tells us about the connection. */
  const syncOnce = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || !tokenRef.current) return;
    const r = await engine.runOnce();
    if (r.attempted === 0) return;
    // A rejection means the server ANSWERED — that is a working connection with
    // a bad bill, not an outage. Conflating the two is the mistake the
    // unavailable-is-not-rejected lesson is about, and it would show here as a
    // yard being told it is offline while the server is refusing its data.
    if (r.synced > 0 || r.rejected > 0) setOnline(true);
    else if (r.retryable > 0) setOnline(false);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => void syncOnce(), 4000);
    return () => clearInterval(t);
  }, [ready, syncOnce]);

  /* ------------------------------------------------------ draft persistence */

  const flushDraft = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const d = pendingDraft.current;
    pendingDraft.current = null;
    if (d && draftStoreRef.current) await draftStoreRef.current.save(d);
  }, []);

  const onDraftChange = useCallback(
    (next: Draft, immediate: boolean) => {
      setDraft(next);
      pendingDraft.current = next;
      if (immediate) {
        void flushDraft();
        return;
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flushDraft(), FORM_DEBOUNCE_MS);
    },
    [flushDraft],
  );

  /* -------------------------------------------------------------- actions -- */

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      const t = await login(DEMO.tenantId, DEMO.username, DEMO.password);
      tokenRef.current = t;
      setToken(t);
      const [ps, ss] = await Promise.all([fetchProducts(t), fetchSellers(t)]);
      setProducts(ps);
      const s = ss[0] ?? null;
      setSeller(s);
      setOnline(true); // we just spoke to the server
      if (s && draft === null && draftStoreRef.current) {
        const fresh = newDraft(deviceIds.newId(), s.id, nowIso());
        await draftStoreRef.current.save(fresh);
        setDraft(fresh);
      }
      setStatus(`${API_BASE_URL} · สินค้า ${String(ps.length)} · ผู้ขาย ${s?.name ?? "-"}`);
    } catch (err) {
      setOnline(false);
      setStatus(`เข้าสู่ระบบไม่สำเร็จ: ${describe(err)}`);
    } finally {
      setBusy(false);
    }
  }, [draft]);

  /**
   * Voiding is recorded locally FIRST and unconditionally.
   *
   * No network call happens here. The engine picks the void up on its next
   * pass, and — critically — only once the bill itself has synced, so a bill
   * created offline reaches the server, gets its doc_no, and is then voided.
   * The owner sees ยกเลิกแล้ว immediately either way.
   */
  const voidBill = useCallback(
    (billId: string, reason: string) => {
      const store = billStoreRef.current;
      if (!store) return;
      setBusy(true);
      void (async () => {
        try {
          const fresh = await store.requestVoid(billId, reason, new Date());
          setStatus(fresh ? `ยกเลิกบิลแล้ว: ${reason}` : "บิลนี้ถูกยกเลิกไปก่อนหน้านี้แล้ว");
          await refresh();
          void syncOnce();
        } catch (err) {
          setStatus(`ยกเลิกบิลไม่สำเร็จ: ${describe(err)}`);
        } finally {
          setBusy(false);
        }
      })();
    },
    [refresh, syncOnce],
  );

  const doSaveBill = useCallback(() => {
    const draftStore = draftStoreRef.current;
    const engine = engineRef.current;
    if (!draftStore || !engine || !seller || !draft || draft.lines.length === 0) return;
    setConfirmOpen(false);
    setBusy(true);
    void (async () => {
      try {
        // Kill any debounced save first: one firing after the promotion would
        // re-insert the draft row the transaction just deleted, and the yard
        // would be looking at a full cart for a bill already saved.
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        pendingDraft.current = null;

        const bill = buildLocalBill(
          { clock: systemClock, ids: deviceIds },
          {
            seller_id: seller.id,
            vehicle_no: null,
            total_amount: cartTotal(draft),
            items: toBillItems(draft),
          },
        );
        const lineCount = draft.lines.length;
        const total = cartTotal(draft);

        await draftStore.promoteToBill(draft, bill);

        const fresh = newDraft(deviceIds.newId(), seller.id, nowIso());
        await draftStore.save(fresh);
        setDraft(fresh);
        // The bill is finished, so the locks are too: their scope is one
        // customer / one vehicle. Carrying a tare into the next customer's
        // load is the silent error this whole phase exists to prevent.
        setLocks(releaseOnSave());
        setStatus(`บันทึกบิล ${String(lineCount)} รายการ รวม ${total} บาท`);
        await refresh();
        void syncOnce();
      } catch (err) {
        setStatus(`บันทึกบิลไม่สำเร็จ: ${describe(err)}`);
      } finally {
        setBusy(false);
      }
    })();
  }, [draft, refresh, seller, syncOnce]);

  /* ----------------------------------------------------------------- view -- */

  return (
    <SafeAreaProvider>
      {/*
        SafeAreaView asks the OS for the real insets, replacing the hardcoded
        paddingTop that caused the 2c-2 status-bar overlap. `bottom` matters
        more now than it did in 2c-3: the numpad and the total bar sit at the
        very bottom, so without it the last key row would fall under the home
        indicator. Not an iOS-only path — the same component reports Android's
        insets.
      */}
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Text style={styles.h1}>รับซื้อของเก่า</Text>
          <Text style={styles.status} numberOfLines={1}>
            {status}
          </Text>
        </View>

        <StatusStrip
          online={online}
          pending={pendingCount}
          failed={failedCount}
          lastSyncedAt={lastSyncedAt}
          blocked={
            health?.alarm
              ? { behind: health.behind, forMs: health.poisonedForMs }
              : null
          }
        />

        {bills.length > 0 ? (
          <Pressable style={styles.latest} onPress={() => setBillsOpen(true)}>
            {latest !== null ? (
              <>
                <Text
                  style={[styles.latestBadge, { backgroundColor: STATE_COLOR[latest.sync_state] }]}
                >
                  {STATE_TH[latest.sync_state]}
                </Text>
                <Text style={styles.latestDoc}>
                  บิลล่าสุด {latest.doc_no ?? "ยังไม่มีเลขที่"}
                </Text>
                <Text style={styles.latestTotal}>
                  {latest.payload.total_amount ?? "-"} ({latest.payload.items.length})
                </Text>
              </>
            ) : (
              <Text style={styles.latestDoc}>ไม่มีบิลที่ยังไม่ถูกยกเลิก</Text>
            )}
            <Text style={styles.latestOpen}>ดู/ยกเลิก ›</Text>
          </Pressable>
        ) : null}

        {!ready ? (
          <ActivityIndicator style={styles.spinner} size="large" />
        ) : token === null || seller === null || draft === null ? (
          <View style={styles.center}>
            <Pressable
              style={[styles.loginBtn, busy && styles.dim]}
              disabled={busy}
              onPress={() => void signIn()}
            >
              <Text style={styles.loginText}>เข้าสู่ระบบ (ร้าน A)</Text>
            </Pressable>
          </View>
        ) : (
          <CartScreen
            products={products}
            seller={seller}
            draft={draft}
            locks={locks}
            busy={busy}
            newLineId={() => deviceIds.newId()}
            nowIso={nowIso}
            onDraftChange={onDraftChange}
            onLocksChange={setLocks}
            onSubmit={() => setConfirmOpen(true)}
          />
        )}

        <ConfirmSaveDialog
          visible={confirmOpen && draft !== null && seller !== null}
          lineCount={draft?.lines.length ?? 0}
          total={draft ? cartTotal(draft) : "0.00"}
          sellerName={seller?.name ?? "-"}
          busy={busy}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={doSaveBill}
        />

        <BillsPanel
          visible={billsOpen}
          bills={bills}
          busy={busy}
          blockerId={health?.blockerId ?? null}
          onClose={() => setBillsOpen(false)}
          onVoid={voidBill}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  spinner: { marginTop: 40 },
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 },
  h1: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  status: { fontSize: 10, color: "#94a3b8" },

  latest: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 6, backgroundColor: "#fff",
    borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  latestBadge: {
    color: "#fff", fontSize: 10, fontWeight: "800", paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: 5, overflow: "hidden",
  },
  latestDoc: { flex: 1, fontSize: 13, fontWeight: "800", color: "#0f172a" },
  latestTotal: { fontSize: 13, color: "#475569", fontWeight: "700" },
  latestOpen: { fontSize: 13, color: "#0f766e", fontWeight: "800" },

  loginBtn: {
    minHeight: 60, borderRadius: 12, backgroundColor: "#0f766e",
    alignItems: "center", justifyContent: "center",
  },
  loginText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  dim: { opacity: 0.4 },
});
