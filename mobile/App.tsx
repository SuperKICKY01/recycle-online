/**
 * Phase 2c-2. A real single-line bill form.
 *
 * The 2c-1 path is untouched: the bill is written to SQLite first and the sync
 * engine sends it. Only the CONTENTS became real — a product chosen from the
 * tenant's own list, weights typed by hand, and money computed with decimal
 * strings that the server independently recomputes and would reject on
 * disagreement.
 *
 * Still deliberately absent: cart / multiple lines, customer scan, customer
 * picker, history screen.
 */
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { HttpTransport } from "./src/adapters/httpTransport";
import { SqliteLocalStore } from "./src/adapters/sqlite/SqliteLocalStore";
import { ExpoSqliteDriver } from "./src/device/expoSqliteDriver";
import { createLocalBill } from "./src/sync/createBill";
import { SyncEngine } from "./src/sync/engine";
import { systemClock } from "./src/sync/systemClock";
import type { LocalBill, SyncState } from "./src/sync/types";
import type { BillDraftOut } from "./app/BillForm";
import { BillForm } from "./app/BillForm";
import type { Product, Seller } from "./app/api";
import { fetchProducts, fetchSellers, login } from "./app/api";
import { API_BASE_URL, DEMO } from "./app/config";
import { deviceIds } from "./app/ids";

const ALL_STATES: SyncState[] = ["pending", "syncing", "synced", "failed"];

const STATE_COLOR: Record<SyncState, string> = {
  pending: "#b45309",
  syncing: "#1d4ed8",
  synced: "#15803d",
  failed: "#b91c1c",
};

export default function App() {
  const [boot, setBoot] = useState("กำลังเปิดฐานข้อมูล…");
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [bills, setBills] = useState<LocalBill[]>([]);
  const [log, setLog] = useState<string[]>([]);

  const storeRef = useRef<SqliteLocalStore | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const tokenRef = useRef<string | null>(null);
  const seenState = useRef<Map<string, SyncState>>(new Map());

  const say = useCallback((line: string) => {
    const t = new Date().toISOString().slice(11, 23);
    setLog((prev) => [`${t}  ${line}`, ...prev].slice(0, 40));
  }, []);

  /* ---------------------------------------------------------------- boot -- */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const driver = await ExpoSqliteDriver.open("recycle.db");
        const store = await SqliteLocalStore.open(driver);
        if (cancelled) return;
        storeRef.current = store;

        const engine = new SyncEngine({
          store,
          transport: new HttpTransport({
            baseUrl: API_BASE_URL,
            getToken: () => Promise.resolve(tokenRef.current),
            fetchImpl: (input, init) => fetch(input, init),
          }),
          clock: systemClock,
          backoffBaseMs: 2000,
          backoffMaxMs: 30000,
        });
        engineRef.current = engine;

        const recovered = await engine.recoverInterrupted();
        if (recovered.length > 0) {
          say(`กู้คืนบิลที่ค้าง syncing: ${String(recovered.length)} ใบ`);
        }
        setReady(true);
        setBoot(`พร้อม — ${API_BASE_URL}`);
      } catch (err) {
        setBoot(`เปิดฐานข้อมูลไม่สำเร็จ: ${describe(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [say]);

  /* ------------------------------------------------------- live bill view -- */

  const refresh = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    const groups = await Promise.all(ALL_STATES.map((s) => store.listByState(s)));
    const all = groups.flat().sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const b of all) {
      const prev = seenState.current.get(b.id);
      if (prev !== b.sync_state) {
        seenState.current.set(b.id, b.sync_state);
        if (prev !== undefined) {
          say(`${short(b.id)} ${prev} → ${b.sync_state}${b.doc_no ? `  ${b.doc_no}` : ""}`);
        }
      }
    }
    setBills(all);
  }, [say]);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => void refresh(), 250);
    return () => clearInterval(t);
  }, [ready, refresh]);

  // Background tick, so restoring the network drains the queue on its own.
  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => {
      if (tokenRef.current) void engineRef.current?.runOnce();
    }, 4000);
    return () => clearInterval(t);
  }, [ready]);

  /* -------------------------------------------------------------- actions -- */

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      const t = await login(DEMO.tenantId, DEMO.username, DEMO.password);
      tokenRef.current = t;
      setToken(t);
      say("เข้าสู่ระบบสำเร็จ");
      const [ps, ss] = await Promise.all([fetchProducts(t), fetchSellers(t)]);
      setProducts(ps);
      setSeller(ss[0] ?? null);
      say(`โหลดสินค้า ${String(ps.length)} รายการ, ผู้ขาย ${String(ss.length)} ราย`);
    } catch (err) {
      say(`เข้าสู่ระบบ/โหลดข้อมูลไม่สำเร็จ: ${describe(err)}`);
    } finally {
      setBusy(false);
    }
  }, [say]);

  const saveBill = useCallback(
    (draft: BillDraftOut) => {
      const store = storeRef.current;
      const engine = engineRef.current;
      if (!store || !seller || !engine) return;
      setBusy(true);
      void (async () => {
        try {
          const bill = await createLocalBill(
            { store, clock: systemClock, ids: deviceIds },
            {
              seller_id: seller.id,
              vehicle_no: null,
              total_amount: draft.amount,
              items: [
                {
                  id: deviceIds.newId(),
                  product_id: draft.product.id,
                  line_no: 1,
                  gross_weight: draft.grossWeight,
                  tare_weight: draft.tareWeight,
                  net_weight: draft.netWeight,
                  unit_price: draft.unitPrice,
                  list_price: draft.listPrice,
                },
              ],
            },
          );
          seenState.current.set(bill.id, "pending");
          say(
            `บันทึกลงเครื่อง ${short(bill.id)} — ${draft.product.code}` +
              ` สุทธิ ${draft.netWeight} × ${draft.unitPrice} = ${draft.amount}`,
          );
          await refresh();
          void engine.runOnce();
        } catch (err) {
          say(`บันทึกไม่สำเร็จ: ${describe(err)}`);
        } finally {
          setBusy(false);
        }
      })();
    },
    [refresh, say, seller],
  );

  /* ----------------------------------------------------------------- view -- */

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>รับซื้อของเก่า — บันทึกบิล</Text>
        <Text style={styles.mono}>{boot}</Text>

        {!ready ? (
          <ActivityIndicator style={styles.spinner} />
        ) : token === null || seller === null ? (
          <Pressable
            style={[styles.btn, busy ? styles.btnOff : null]}
            disabled={busy}
            onPress={() => void signIn()}
          >
            <Text style={styles.btnText}>เข้าสู่ระบบ (ร้าน A)</Text>
          </Pressable>
        ) : (
          <BillForm products={products} seller={seller} busy={busy} onSave={saveBill} />
        )}

        {bills.length > 0 ? <Text style={styles.h2}>บิลในเครื่อง</Text> : null}
        {bills.map((b) => (
          <View key={b.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={[styles.badge, { backgroundColor: STATE_COLOR[b.sync_state] }]}>
                {b.sync_state}
              </Text>
              <Text style={styles.docNo}>{b.doc_no ?? "ยังไม่มีเลขที่บิล"}</Text>
            </View>
            <Text style={styles.mono}>
              {b.payload.items[0]?.net_weight ?? "-"} × {b.payload.items[0]?.unit_price ?? "-"} ={" "}
              {b.payload.total_amount ?? "-"} บาท
            </Text>
            {b.last_error ? <Text style={styles.err}>ผิดพลาด: {b.last_error}</Text> : null}
          </View>
        ))}

        {log.length > 0 ? <Text style={styles.h2}>บันทึกเหตุการณ์</Text> : null}
        {log.map((line, i) => (
          <Text key={`${line}-${String(i)}`} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function short(id: string): string {
  return `${id.slice(0, 8)}…`;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" },
  body: { padding: 16, paddingTop: 64, paddingBottom: 64 },
  spinner: { marginTop: 24 },
  h1: { fontSize: 20, fontWeight: "700", marginBottom: 4, color: "#0f172a" },
  h2: { fontSize: 15, fontWeight: "700", marginTop: 24, marginBottom: 4, color: "#0f172a" },
  mono: { fontFamily: "Courier", fontSize: 12, color: "#475569" },
  btn: { padding: 14, borderRadius: 10, marginTop: 16, backgroundColor: "#334155" },
  btnOff: { opacity: 0.45 },
  btnText: { color: "#fff", fontWeight: "600", textAlign: "center" },
  card: {
    backgroundColor: "#fff", borderRadius: 10, padding: 12, marginTop: 8,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  badge: {
    color: "#fff", fontSize: 11, fontWeight: "700", paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 6, overflow: "hidden",
  },
  docNo: { marginLeft: 10, fontWeight: "700", color: "#0f172a" },
  err: { color: "#b91c1c", fontSize: 12, marginTop: 4 },
  logLine: { fontFamily: "Courier", fontSize: 11, color: "#334155" },
});
