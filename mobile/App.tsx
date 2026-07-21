/**
 * Phase 2c-1 vertical slice. ONE screen, ONE hardcoded bill.
 *
 * There is no form, no scanner, no product picker and no seller picker here on
 * purpose. The only question this screen answers is whether finger -> SQLite ->
 * sync engine -> HTTP -> FastAPI -> doc_no actually connects on a real phone.
 *
 * Nothing in src/sync changed to make this work: the engine already depended on
 * LocalStore / Transport / Clock, and this file just hands it the real ones.
 */
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  const [boot, setBoot] = useState<string>("กำลังเปิดฐานข้อมูล…");
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

        const transport = new HttpTransport({
          baseUrl: API_BASE_URL,
          getToken: () => Promise.resolve(tokenRef.current),
          // Bound explicitly: React Native's global fetch must not be called
          // detached from its receiver.
          fetchImpl: (input, init) => fetch(input, init),
        });
        const engine = new SyncEngine({
          store,
          transport,
          clock: systemClock,
          backoffBaseMs: 2000,
          backoffMaxMs: 30000,
        });
        engineRef.current = engine;

        // Startup sweep BEFORE anything else touches the queue: a bill left in
        // `syncing` by a kill is invisible to the sender until this runs.
        const recovered = await engine.recoverInterrupted();
        if (recovered.length > 0) {
          say(`กู้คืนบิลที่ค้างสถานะ syncing: ${String(recovered.length)} ใบ`);
        }

        setReady(true);
        setBoot(`พร้อม — ${API_BASE_URL}`);
        say("เปิด SQLite บนเครื่องแล้ว (recycle.db)");
      } catch (err) {
        setBoot(`เปิดฐานข้อมูลไม่สำเร็จ: ${describe(err)}`);
        say(`BOOT FAILED: ${describe(err)}`);
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
          say(
            `${short(b.id)}  ${prev} → ${b.sync_state}${b.doc_no ? `  doc_no=${b.doc_no}` : ""}`,
          );
        }
      }
    }
    setBills(all);
  }, [say]);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => {
      void refresh();
    }, 250);
    return () => clearInterval(t);
  }, [ready, refresh]);

  // Background sync tick, so restoring the network drains the queue on its own.
  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => {
      if (tokenRef.current) void engineRef.current?.runOnce();
    }, 4000);
    return () => clearInterval(t);
  }, [ready]);

  /* -------------------------------------------------------------- actions -- */

  const login = useCallback(async () => {
    setBusy(true);
    try {
      say(`POST ${API_BASE_URL}/auth/login …`);
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenant_id: DEMO.tenantId,
          username: DEMO.username,
          password: DEMO.password,
        }),
      });
      if (!res.ok) {
        say(`เข้าสู่ระบบไม่สำเร็จ: HTTP ${String(res.status)}`);
        return;
      }
      const body = (await res.json()) as { access_token: string };
      tokenRef.current = body.access_token;
      setToken(body.access_token);
      say(`เข้าสู่ระบบสำเร็จ — token ${String(body.access_token.length)} ตัวอักษร`);
    } catch (err) {
      say(`เข้าสู่ระบบไม่สำเร็จ: ${describe(err)}`);
    } finally {
      setBusy(false);
    }
  }, [say]);

  const createTestBill = useCallback(async () => {
    const store = storeRef.current;
    const engine = engineRef.current;
    if (!store || !engine) return;
    setBusy(true);
    try {
      // Hardcoded, valid, tenant-A bill. Money and weight are STRINGS end to
      // end — never a JS number, anywhere (project hard rule 1).
      const bill = await createLocalBill(
        { store, clock: systemClock, ids: deviceIds },
        {
          seller_id: DEMO.sellerId,
          vehicle_no: "1กก-1234",
          total_amount: "105.00",
          items: [
            {
              id: deviceIds.newId(),
              product_id: DEMO.productId,
              line_no: 1,
              gross_weight: "10.500",
              tare_weight: "0.500",
              net_weight: "10.000",
              unit_price: "10.50",
              list_price: "10.50",
            },
          ],
        },
      );
      seenState.current.set(bill.id, "pending");
      say(`บันทึกลงเครื่องแล้ว ${short(bill.id)} (pending, ยังไม่มี doc_no)`);
      await refresh();
      void engine.runOnce();
    } catch (err) {
      say(`สร้างบิลไม่สำเร็จ: ${describe(err)}`);
    } finally {
      setBusy(false);
    }
  }, [refresh, say]);

  const syncNow = useCallback(() => {
    say("สั่งซิงก์ด้วยมือ");
    void engineRef.current?.runOnce();
  }, [say]);

  /* ----------------------------------------------------------------- view -- */

  const counts = ALL_STATES.map(
    (s) => `${s} ${String(bills.filter((b) => b.sync_state === s).length)}`,
  ).join("   ");

  return (
    <View style={styles.screen}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.h1}>Recycle Online — ทดสอบเชื่อมต่อ</Text>
        <Text style={styles.mono}>{boot}</Text>

        {!ready ? (
          <ActivityIndicator style={styles.spinner} />
        ) : (
          <>
            <Pressable
              style={[styles.btn, token ? styles.btnDone : null, busy ? styles.btnBusy : null]}
              disabled={busy}
              onPress={() => void login()}
            >
              <Text style={styles.btnText}>
                {token ? "เข้าสู่ระบบแล้ว (แตะเพื่อเข้าใหม่)" : "1. เข้าสู่ระบบ (ร้าน A)"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.btnPrimary, !token || busy ? styles.btnBusy : null]}
              disabled={!token || busy}
              onPress={() => void createTestBill()}
            >
              <Text style={styles.btnText}>2. สร้างบิลทดสอบ</Text>
            </Pressable>

            <Pressable style={[styles.btn, styles.btnGhost]} onPress={syncNow}>
              <Text style={styles.btnTextDark}>ซิงก์เดี๋ยวนี้</Text>
            </Pressable>

            <Text style={styles.counts}>{counts}</Text>

            {bills.map((b) => (
              <View key={b.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={[styles.badge, { backgroundColor: STATE_COLOR[b.sync_state] }]}>
                    {b.sync_state}
                  </Text>
                  <Text style={styles.docNo}>{b.doc_no ?? "ยังไม่มีเลขที่บิล"}</Text>
                </View>
                <Text style={styles.mono}>{short(b.id)}</Text>
                <Text style={styles.mono}>
                  ยอด {b.payload.total_amount ?? "-"} ครั้งที่ส่ง {String(b.attempt_count)}
                </Text>
                {b.last_error ? <Text style={styles.err}>ผิดพลาด: {b.last_error}</Text> : null}
              </View>
            ))}

            <Text style={styles.h2}>บันทึกเหตุการณ์</Text>
            {log.map((line, i) => (
              <Text key={`${line}-${String(i)}`} style={styles.logLine}>
                {line}
              </Text>
            ))}
          </>
        )}
      </ScrollView>
    </View>
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
  body: { padding: 16, paddingTop: 64, paddingBottom: 48 },
  spinner: { marginTop: 24 },
  h1: { fontSize: 20, fontWeight: "700", marginBottom: 4, color: "#0f172a" },
  h2: { fontSize: 15, fontWeight: "700", marginTop: 20, marginBottom: 6, color: "#0f172a" },
  mono: { fontFamily: "Courier", fontSize: 12, color: "#475569" },
  btn: { padding: 14, borderRadius: 10, marginTop: 12, backgroundColor: "#334155" },
  btnPrimary: { backgroundColor: "#0f766e" },
  btnDone: { backgroundColor: "#15803d" },
  btnGhost: { backgroundColor: "#e2e8f0" },
  btnBusy: { opacity: 0.45 },
  btnText: { color: "#fff", fontWeight: "600", textAlign: "center" },
  btnTextDark: { color: "#0f172a", fontWeight: "600", textAlign: "center" },
  counts: { marginTop: 18, fontFamily: "Courier", fontSize: 12, color: "#0f172a" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  badge: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  docNo: { marginLeft: 10, fontWeight: "700", color: "#0f172a" },
  err: { color: "#b91c1c", fontSize: 12, marginTop: 4 },
  logLine: { fontFamily: "Courier", fontSize: 11, color: "#334155" },
});
