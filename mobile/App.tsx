/**
 * Phase 2c-6. The seller becomes a PER-BILL choice.
 *
 * Until now `seller` was whoever /sellers returned first, for every bill this
 * device ever wrote. Now the bill belongs to someone the operator picked, and
 * the draft — not this component — is what remembers who: `seller` is derived
 * from draft.seller_id, so the choice survives a force-quit for the same reason
 * the lines do, and there is no second copy of it to drift.
 *
 * A DRAFT NOW STARTS WITH THE PICK, not before it. Saving a bill leaves NO
 * draft behind, so the next bill begins at the picker rather than inheriting
 * the previous customer. That is deliberate: seeding the next draft with the
 * last seller is exactly how a load gets filed to the wrong person with nobody
 * noticing, and it costs one tap to remove the possibility.
 *
 * Still deliberately absent: creating a seller from the yard, QR scan, and any
 * history screen.
 */
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { HttpTransport } from "./src/adapters/httpTransport";
import { SqliteDraftStore } from "./src/adapters/sqlite/SqliteDraftStore";
import { SqliteLocalStore } from "./src/adapters/sqlite/SqliteLocalStore";
import {
  cartTotal,
  changeSeller,
  newDraft,
  normaliseVehicleNo,
  setVehicleNo,
  toBillItems,
} from "./src/cart/cart";
import type { SellerChangeImpact } from "./src/cart/cart";
import { NO_LOCKS, releaseOnSave } from "./src/cart/entry";
import type { Locks } from "./src/cart/entry";
import { cleanVehicleNo, gradePrice, indexPlates } from "./src/cart/sellers";
import type { Draft } from "./src/cart/types";
import { ExpoSqliteDriver } from "./src/device/expoSqliteDriver";
import { buildLocalBill } from "./src/sync/createBill";
import { SyncEngine } from "./src/sync/engine";
import type { SessionState } from "./src/sync/parkedReason";
import { assessQueue } from "./src/sync/queueHealth";
import type { QueueHealth } from "./src/sync/queueHealth";
import { systemClock } from "./src/sync/systemClock";
import type { LocalBill, SyncState } from "./src/sync/types";
import { isMasterDataBlocked, isVoided } from "./src/sync/types";
import type { Product, Seller } from "./app/api";
import { fetchProducts, fetchSellers, login } from "./app/api";
import { BillsPanel } from "./app/BillsPanel";
import { CartScreen } from "./app/CartScreen";
import { ConfirmSaveDialog } from "./app/ConfirmSaveDialog";
import { ConfirmSellerChangeDialog } from "./app/ConfirmSellerChangeDialog";
import { API_BASE_URL, DEMO } from "./app/config";
import { deviceIds } from "./app/ids";
import { SellerPicker } from "./app/SellerPicker";
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
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bills, setBills] = useState<LocalBill[]>([]);
  const [latest, setLatest] = useState<LocalBill | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [billsOpen, setBillsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** A seller change the operator has been warned about but not yet confirmed. */
  const [pendingChange, setPendingChange] = useState<
    { to: Seller; impact: SellerChangeImpact } | null
  >(null);

  /*
   * THE bill's seller — derived, never stored twice. draft.seller_id is the
   * single source of truth (it is what survives a force-quit and what goes on
   * the wire); this only resolves it to something displayable. May be null if
   * the id is not in the fetched list, which CartScreen treats as "cannot save".
   */
  const seller = useMemo(
    () => sellers.find((s) => s.id === draft?.seller_id) ?? null,
    [sellers, draft?.seller_id],
  );

  /*
   * Plates this device has recorded, per seller, newest first — the index the
   * picker searches. Sellers carry no plate: it belongs to the bill (SRS 1.6),
   * so this is built from our OWN bills and a fresh install legitimately knows
   * none. `bills` is already sorted newest-first by refresh().
   */
  const platesBySeller = useMemo(
    () =>
      indexPlates(
        bills.map((b) => ({
          seller_id: b.payload.seller_id,
          vehicle_no: b.payload.vehicle_no,
        })),
      ),
    [bills],
  );

  /*
   * The server's reason CODE for each parked bill — not a count, because the two
   * causes need different things from the office. Codes only: the raw 424 body
   * lives in last_error as a developer breadcrumb and never travels to the UI.
   */
  const masterDataCodes = useMemo(
    () =>
      bills
        .filter(isMasterDataBlocked)
        .map((b) => b.master_data_code)
        .filter((c): c is string => c !== null),
    [bills],
  );

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

  /**
   * The server answered 401: our token is no longer accepted (JWT_TTL is 3600s
   * and there is no refresh token — re-login IS the recovery, by decision).
   *
   * NOT persisted and NOT stamped on any bill. The token itself lives only in
   * memory, so after a restart the app is signed out anyway and this would be
   * stale the moment it survived. Cleared by any send the server accepts.
   */
  const [sessionEnded, setSessionEnded] = useState(false);

  /*
   * Can this device act as someone right now? One derived value, consumed by
   * both the strip and the bill cards, so they cannot disagree.
   *
   * "signed_out" and "expired" are kept apart because they read differently to
   * an operator mid-shift — one has never worked yet, the other stopped working
   * — but they mean the same thing for every bill: it stays queued, intact, and
   * goes the moment someone signs in.
   */
  const session: SessionState =
    token === null ? "signed_out" : sessionEnded ? "expired" : "active";

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

    // THE SESSION ENDED — checked FIRST and above `attempted === 0`, because a
    // pass that sent no bills can still have tried to push a void and been told
    // 401. It is also the reason `online` is set TRUE here: the server answered,
    // promptly, so calling this an outage was never anything but wrong.
    if (r.sessionExpired > 0) {
      setSessionEnded(true);
      setOnline(true);
      return;
    }
    if (r.attempted === 0) return;
    // A rejection means the server ANSWERED — that is a working connection with
    // a bad bill, not an outage. Conflating the two is the mistake the
    // unavailable-is-not-rejected lesson is about, and it would show here as a
    // yard being told it is offline while the server is refusing its data.
    //
    // A 424 (parked) counts as an answer for the same reason. And any answer at
    // all clears sessionEnded: the token evidently works, so the prompt must go
    // even if nothing here ever asked it to.
    if (r.synced > 0 || r.rejected > 0 || r.masterDataBlocked > 0) {
      setOnline(true);
      setSessionEnded(false);
    } else if (r.retryable > 0) setOnline(false);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => void syncOnce(), 4000);
    return () => clearInterval(t);
  }, [ready, syncOnce]);

  /**
   * The office has added the missing price; release every parked bill at once
   * rather than waiting out the slow cadence. Nothing is re-created here — the
   * same bills, with the same ids and idempotency keys, simply rejoin the queue.
   */
  const retryMasterData = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    void (async () => {
      const released = await engine.retryMasterDataNow();
      setStatus(
        released > 0 ? `ลองส่งใหม่ ${String(released)} ใบ` : "ไม่มีบิลที่รอราคา",
      );
      await refresh();
      void syncOnce();
    })();
  }, [refresh, syncOnce]);

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
      setSellers(ss);
      setOnline(true); // we just spoke to the server
      setSessionEnded(false);
      // Every backoff on the queue was computed while there was no usable
      // session, which says nothing about the network. Without this the yard
      // signs in, the sign-in succeeds, and then nothing visibly happens for up
      // to 30 seconds — which reads as "signing in did not work".
      const freed = (await engineRef.current?.resumeAfterSignIn()) ?? 0;
      if (freed > 0) void syncOnce();
      // NO draft is created here any more. A bill starts when a seller is
      // picked, so signing in never silently opens one for whoever happened to
      // come back first from /sellers.
      setStatus(
        `${API_BASE_URL} · สินค้า ${String(ps.length)} · ผู้ขาย ${String(ss.length)} ราย`,
      );
    } catch (err) {
      setOnline(false);
      setStatus(`เข้าสู่ระบบไม่สำเร็จ: ${describe(err)}`);
    } finally {
      setBusy(false);
    }
  }, [syncOnce]);

  /* ------------------------------------------------------- seller choice -- */

  /** The chosen seller's tier for a product, or null if that grade has no row. */
  const tierResolver = useCallback(
    (grade: string | null) =>
      (productId: string): string | null => {
        const p = products.find((x) => x.id === productId);
        return p === undefined ? null : gradePrice(p.prices, grade);
      },
    [products],
  );

  /**
   * Apply the change. Note what is NOT here: setLocks. A seller change is a
   * correction of who the bill belongs to, not the end of the bill, and the
   * container on the scale did not move — see entry.ts on why releasing a
   * pinned tare here would make the shop pay for the container.
   */
  const applySellerChange = useCallback(
    (to: Seller) => {
      if (draft === null) return;
      const r = changeSeller(draft, to.id, locks, tierResolver(to.grade), nowIso());
      onDraftChange(r.draft, true);
      setStatus(
        `เปลี่ยนผู้ขายเป็น ${to.name}` +
          (r.impact.keptLines > 0
            ? ` · ${String(r.impact.keptLines)} รายการเดิมใช้ราคาที่กรอกไว้เหมือนเดิม`
            : ""),
      );
    },
    [draft, locks, onDraftChange, tierResolver],
  );

  const chooseSeller = useCallback(
    (s: Seller) => {
      setPickerOpen(false);
      const draftStore = draftStoreRef.current;
      if (!draftStore) return;

      // No bill in progress: this pick STARTS one.
      if (draft === null) {
        void (async () => {
          const fresh = newDraft(deviceIds.newId(), s.id, nowIso());
          await draftStore.save(fresh);
          setDraft(fresh);
          setStatus(`เริ่มบิลใหม่ · ผู้ขาย ${s.name}`);
        })();
        return;
      }

      if (draft.seller_id === s.id) return; // same seller, nothing to do

      // An empty cart has nothing to warn about, and a confirm on a harmless
      // action is the one that trains people to tap through the real ones.
      if (draft.lines.length === 0) {
        applySellerChange(s);
        return;
      }

      // Lines already entered: compute the real impact and show it BEFORE
      // touching the draft. The preview comes from the same function that will
      // apply it, so the dialog cannot describe something else.
      const preview = changeSeller(draft, s.id, locks, tierResolver(s.grade), nowIso());
      setPendingChange({ to: s, impact: preview.impact });
    },
    [applySellerChange, draft, locks, tierResolver],
  );

  /* ------------------------------------------------------------ vehicle -- */

  const onVehicleChange = useCallback(
    (raw: string) => {
      if (draft === null) return;
      // Debounced, like the other form fields. NOT trimmed per keystroke —
      // that would make an internal space impossible to type ("70 1234").
      onDraftChange(setVehicleNo(draft, raw, nowIso()), false);
    },
    [draft, onDraftChange],
  );

  const onVehicleBlur = useCallback(() => {
    if (draft === null) return;
    // Trim at the edge, and write through immediately so the last keystrokes
    // are on disk rather than sitting in the 400ms debounce window.
    onDraftChange(normaliseVehicleNo(draft, nowIso()), true);
  }, [draft, onDraftChange]);

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
            // The DRAFT's seller, not a component variable: it is what was
            // persisted, and it is what the operator confirmed in the dialog.
            seller_id: draft.seller_id,
            // Trimmed here as well as on blur, because save can be tapped with
            // the field still focused and never blurred.
            vehicle_no: cleanVehicleNo(draft.vehicle_no),
            total_amount: cartTotal(draft),
            items: toBillItems(draft),
          },
        );
        const lineCount = draft.lines.length;
        const total = cartTotal(draft);

        await draftStore.promoteToBill(draft, bill);

        // NO replacement draft. The next bill starts at the seller picker, so
        // this customer cannot be inherited by the next load — see the header.
        setDraft(null);
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
          /*
            Three states, one derived value: no token at all (never signed in on
            this launch), a token the server has stopped accepting, or a working
            session. Derived rather than stored, so signing in fixes every screen
            at once and nothing can be left saying "sign in" after they have.
          */
          session={session}
          online={online}
          pending={pendingCount}
          failed={failedCount}
          lastSyncedAt={lastSyncedAt}
          onSignIn={() => void signIn()}
          blocked={
            health?.alarm
              ? {
                  behind: health.behind,
                  forMs: health.poisonedForMs,
                  attempts: health.serverErrorAttempts,
                }
              : null
          }
          waitingOnMasterData={health?.masterDataBlocked ?? 0}
          masterDataCodes={masterDataCodes}
          onRetryMasterData={retryMasterData}
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
        ) : token === null ? (
          <View style={styles.center}>
            <Pressable
              style={[styles.loginBtn, busy && styles.dim]}
              disabled={busy}
              onPress={() => void signIn()}
            >
              <Text style={styles.loginText}>เข้าสู่ระบบ (ร้าน A)</Text>
            </Pressable>
          </View>
        ) : draft === null ? (
          /* No bill in progress. It starts with WHO, not with what. */
          <View style={styles.center}>
            <Text style={styles.startHint}>ยังไม่มีบิลที่กำลังทำอยู่</Text>
            <Pressable
              style={[styles.loginBtn, busy && styles.dim]}
              disabled={busy}
              onPress={() => setPickerOpen(true)}
            >
              <Text style={styles.loginText}>เลือกผู้ขาย เพื่อเริ่มบิลใหม่</Text>
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
            onPickSeller={() => setPickerOpen(true)}
            onVehicleChange={onVehicleChange}
            onVehicleBlur={onVehicleBlur}
            onSubmit={() => setConfirmOpen(true)}
          />
        )}

        <SellerPicker
          visible={pickerOpen}
          sellers={sellers}
          platesBySeller={platesBySeller}
          currentSellerId={draft?.seller_id ?? null}
          changing={draft !== null}
          onClose={() => setPickerOpen(false)}
          onPick={chooseSeller}
        />

        <ConfirmSellerChangeDialog
          visible={pendingChange !== null}
          from={seller}
          to={pendingChange?.to ?? null}
          impact={pendingChange?.impact ?? null}
          onCancel={() => setPendingChange(null)}
          onConfirm={() => {
            if (pendingChange !== null) applySellerChange(pendingChange.to);
            setPendingChange(null);
          }}
        />

        <ConfirmSaveDialog
          visible={confirmOpen && draft !== null && seller !== null}
          lineCount={draft?.lines.length ?? 0}
          total={draft ? cartTotal(draft) : "0.00"}
          sellerName={seller?.name ?? "-"}
          sellerGrade={seller?.grade ?? null}
          vehicleNo={cleanVehicleNo(draft?.vehicle_no ?? null)}
          busy={busy}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={doSaveBill}
        />

        <BillsPanel
          visible={billsOpen}
          bills={bills}
          busy={busy}
          session={session}
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
  startHint: {
    fontSize: 15, color: "#64748b", textAlign: "center", marginBottom: 14,
    fontWeight: "600",
  },
  dim: { opacity: 0.4 },
});
