/**
 * Phase 2c-3. Multi-item cart on one bill, with the cart persisted as a draft.
 *
 * The sync path from 2c-1/2c-2 is untouched: a bill is written locally and the
 * unchanged engine sends it. What changed is what happens BEFORE that — the
 * yard now builds up many lines, and those lines live in SQLite the whole time
 * rather than in React state that a crash would erase.
 *
 * Still deliberately absent: customer scan, customer picker (the seller is
 * fetched but fixed), and any history screen.
 */
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { HttpTransport } from "./src/adapters/httpTransport";
import { SqliteDraftStore } from "./src/adapters/sqlite/SqliteDraftStore";
import { SqliteLocalStore } from "./src/adapters/sqlite/SqliteLocalStore";
import { cartTotal, newDraft, toBillItems } from "./src/cart/cart";
import type { Draft } from "./src/cart/types";
import { ExpoSqliteDriver } from "./src/device/expoSqliteDriver";
import { buildLocalBill } from "./src/sync/createBill";
import { SyncEngine } from "./src/sync/engine";
import { systemClock } from "./src/sync/systemClock";
import type { LocalBill, SyncState } from "./src/sync/types";
import type { Product, Seller } from "./app/api";
import { fetchProducts, fetchSellers, login } from "./app/api";
import { CartScreen } from "./app/CartScreen";
import { API_BASE_URL, DEMO } from "./app/config";
import { deviceIds } from "./app/ids";

const ALL_STATES: SyncState[] = ["pending", "syncing", "synced", "failed"];

const STATE_COLOR: Record<SyncState, string> = {
  pending: "#b45309",
  syncing: "#1d4ed8",
  synced: "#15803d",
  failed: "#b91c1c",
};

const STATE_TH: Record<SyncState, string> = {
  pending: "รอส่ง",
  syncing: "กำลังส่ง",
  synced: "ส่งแล้ว",
  failed: "ผิดพลาด",
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

  const billStoreRef = useRef<SqliteLocalStore | null>(null);
  const draftStoreRef = useRef<SqliteDraftStore | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Debounced write-through for the half-typed entry fields.
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
        // The draft is restored here, before anything is rendered — a killed
        // app comes back to the same cart, not an empty one.
        const restored = await draftStore.load();
        if (cancelled) return;
        setDraft(restored);
        setReady(true);
        setStatus(
          `${API_BASE_URL}` +
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
    const groups = await Promise.all(ALL_STATES.map((s) => store.listByState(s)));
    setBills(groups.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3));
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => void refresh(), 400);
    return () => clearInterval(t);
  }, [ready, refresh]);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => {
      if (tokenRef.current) void engineRef.current?.runOnce();
    }, 4000);
    return () => clearInterval(t);
  }, [ready]);

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
      if (s && draft === null && draftStoreRef.current) {
        const fresh = newDraft(deviceIds.newId(), s.id, nowIso());
        await draftStoreRef.current.save(fresh);
        setDraft(fresh);
      }
      setStatus(`${API_BASE_URL} · สินค้า ${String(ps.length)} · ผู้ขาย ${s?.name ?? "-"}`);
    } catch (err) {
      setStatus(`เข้าสู่ระบบไม่สำเร็จ: ${describe(err)}`);
    } finally {
      setBusy(false);
    }
  }, [draft]);

  const submitBill = useCallback(() => {
    const draftStore = draftStoreRef.current;
    const engine = engineRef.current;
    if (!draftStore || !engine || !seller || !draft || draft.lines.length === 0) return;
    setBusy(true);
    void (async () => {
      try {
        // CRITICAL: kill any debounced save first. If one fired after the
        // promotion it would re-insert the draft row that the transaction just
        // deleted, and the yard would be looking at a full cart for a bill
        // that is already saved — the same load billed twice.
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

        // One transaction: the bill appears and the draft disappears together.
        await draftStore.promoteToBill(draft, bill);

        const fresh = newDraft(deviceIds.newId(), seller.id, nowIso());
        await draftStore.save(fresh);
        setDraft(fresh);
        setStatus(`บันทึกบิล ${String(lineCount)} รายการ รวม ${total} บาท`);
        await refresh();
        void engine.runOnce();
      } catch (err) {
        setStatus(`บันทึกบิลไม่สำเร็จ: ${describe(err)}`);
      } finally {
        setBusy(false);
      }
    })();
  }, [draft, refresh, seller]);

  /* ----------------------------------------------------------------- view -- */

  return (
    <SafeAreaProvider>
      {/*
        The 2c-2 overlap fix. The old screen used a hardcoded paddingTop, which
        is wrong on every device with a different status bar or notch — on the
        test iPhone the title sat under the clock. SafeAreaView asks the OS for
        the real insets instead, and it is not an iOS-only path: on Android the
        same component reports that platform's insets.
      */}
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.h1}>รับซื้อของเก่า</Text>
            <Text style={styles.status} numberOfLines={2}>
              {status}
            </Text>
          </View>

          {bills.length > 0 ? (
            <View style={styles.billStrip}>
              {bills.map((b) => (
                <View key={b.id} style={styles.billChip}>
                  <Text style={[styles.billBadge, { backgroundColor: STATE_COLOR[b.sync_state] }]}>
                    {STATE_TH[b.sync_state]}
                  </Text>
                  <Text style={styles.billDoc}>{b.doc_no ?? "ยังไม่มีเลขที่"}</Text>
                  <Text style={styles.billTotal}>
                    {b.payload.total_amount ?? "-"} ({b.payload.items.length})
                  </Text>
                </View>
              ))}
            </View>
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
              busy={busy}
              newLineId={() => deviceIds.newId()}
              nowIso={nowIso}
              onDraftChange={onDraftChange}
              onSubmit={submitBill}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" },
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  spinner: { marginTop: 40 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  h1: { fontSize: 22, fontWeight: "900", color: "#0f172a" },
  status: { fontSize: 11, color: "#64748b", marginTop: 2 },

  billStrip: {
    flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 10,
  },
  billChip: {
    flex: 1, backgroundColor: "#fff", borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  billBadge: {
    color: "#fff", fontSize: 10, fontWeight: "800", paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: 5, overflow: "hidden", alignSelf: "flex-start",
  },
  billDoc: { fontSize: 12, fontWeight: "800", color: "#0f172a", marginTop: 4 },
  billTotal: { fontSize: 12, color: "#475569" },

  loginBtn: {
    minHeight: 60, borderRadius: 12, backgroundColor: "#0f766e",
    alignItems: "center", justifyContent: "center",
  },
  loginText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  dim: { opacity: 0.4 },
});
