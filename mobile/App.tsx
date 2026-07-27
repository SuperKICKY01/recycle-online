/**
 * Phase 2c-8. THE APP MUST WORK FROM A COLD START.
 *
 * Until now products, sellers and the token all lived in React state, fetched
 * once at sign-in. Opening the app with the server unreachable therefore gave no
 * products, no sellers, no token, and a login button that could not succeed — a
 * yard opening at 07:00 during an outage could not write a single bill. That
 * contradicts hard rule 8 at the first step.
 *
 * Three things change here and nothing else:
 *
 *   the TOKEN is persisted in the OS keystore and restored at boot
 *     (src/session/tokenStore.ts states the trade this reverses, and why);
 *   MASTER DATA is cached in SQLite, written on every successful fetch, read at
 *     boot, and re-fetched when the picker opens and when a cart is started;
 *   the PRICE DEFAULT is gated on how old that cache is — see
 *     src/master/freshness.ts, which is where the money argument lives.
 *
 * What deliberately does NOT change: a restored token is used as if it works,
 * because offline there is no way to ask. If it has expired the first send gets
 * a 401 and lands in the Phase 2c-7 session-ended path, which already says the
 * right thing and already carries the sign-in button.
 *
 * ---------------------------------------------------------------------------
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
import { SqliteMasterStore } from "./src/adapters/sqlite/SqliteMasterStore";
import {
  cartTotal,
  changeSeller,
  newDraft,
  normaliseVehicleNo,
  setVehicleNo,
  toBillItems,
} from "./src/cart/cart";
import type { GradeTiers, SellerChangeImpact } from "./src/cart/cart";
import { NO_LOCKS, releaseOnSave } from "./src/cart/entry";
import type { Locks } from "./src/cart/entry";
import { cleanVehicleNo, gradePrice, indexPlates } from "./src/cart/sellers";
import type { Draft } from "./src/cart/types";
import { ExpoSqliteDriver } from "./src/device/expoSqliteDriver";
import { SecureTokenStore } from "./src/device/secureTokenStore";
import { assessFreshness, defaultUnitPrice, masterNotice } from "./src/master/freshness";
import { buildLocalBill } from "./src/sync/createBill";
import { SyncEngine } from "./src/sync/engine";
import type { SessionState } from "./src/sync/parkedReason";
import { assessQueue } from "./src/sync/queueHealth";
import type { QueueHealth } from "./src/sync/queueHealth";
import { systemClock } from "./src/sync/systemClock";
import type { LocalBill, SyncState } from "./src/sync/types";
import { isMasterDataBlocked, isVoided } from "./src/sync/types";
import type { Product, Seller } from "./app/api";
import { fetchProducts, fetchSellers, isUnauthorized, login } from "./app/api";
import { BillsPanel } from "./app/BillsPanel";
import { CartScreen } from "./app/CartScreen";
import { ConfirmSaveDialog } from "./app/ConfirmSaveDialog";
import { ConfirmSellerChangeDialog } from "./app/ConfirmSellerChangeDialog";
import { API_BASE_URL, DEMO } from "./app/config";
import { deviceIds } from "./app/ids";
import { MasterDataStrip } from "./app/MasterDataStrip";
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

/**
 * Now, rounded DOWN to the minute, as the clock the freshness assessment reads.
 *
 * Rounded because the ages this drives are rendered in whole minutes, hours or
 * days: a value that changed every 400ms would rebuild the strip's text several
 * times a second to say the same sentence. Rounding down can put this up to 59
 * seconds behind a fetch that just completed, which lands inside the fresh
 * window and changes nothing — it is nowhere near the 5-minute clock-suspect
 * threshold, which is the only place a backwards `now` matters.
 */
const nowMinuteIso = (): string =>
  new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();

export default function App() {
  const [status, setStatus] = useState("กำลังเปิดฐานข้อมูล…");
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  /*
   * WHEN each cached list was last fetched. Two values, not one: a refresh is
   * two requests and the second can fail alone, so a shared timestamp would
   * claim the seller list had been re-read when only the product list had. See
   * src/master/types.ts.
   *
   * null means NEVER FETCHED — a device that cannot start a bill at all, which
   * is a different sentence to the operator than "your prices are old".
   */
  const [productsFetchedAt, setProductsFetchedAt] = useState<string | null>(null);
  const [sellersFetchedAt, setSellersFetchedAt] = useState<string | null>(null);
  /** Minute-granular clock driving the cache ages. See nowMinuteIso. */
  const [nowMinute, setNowMinute] = useState(nowMinuteIso);
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
   * HOW OLD IS WHAT WE ARE PRICING AGAINST, and may the app fill a price in.
   *
   * Derived, never stored, so every screen that consumes it agrees by
   * construction and a refresh fixes all of them at once. The rules and every
   * sentence live in src/master/freshness.ts, which the headless proof can
   * reach — this file only routes the answer.
   */
  const freshness = useMemo(
    () => assessFreshness({ productsFetchedAt, sellersFetchedAt, now: nowMinute }),
    [productsFetchedAt, sellersFetchedAt, nowMinute],
  );
  const masterMessage = useMemo(() => masterNotice(freshness), [freshness]);

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
   * NOT persisted and NOT stamped on any bill. Cleared by any send the server
   * accepts.
   *
   * ITS REASON FOR NOT BEING PERSISTED CHANGED IN PHASE 2c-8 and the conclusion
   * did not, so read this rather than assuming: it used to be "the token lives
   * only in memory, so a restart is signed out anyway". The token now survives a
   * restart. What has not changed is that this flag is a fact about the SERVER's
   * last answer, and a stored one would be a guess about the next — the token
   * may have been renewed, or the shift may start with a fresh one. It is
   * re-derived within seconds by the send loop, which is cheaper than being
   * wrong.
   *
   * AND THE EXPIRED TOKEN ITSELF IS DELIBERATELY NOT DELETED from the keystore.
   * Deleting it would make the next launch `token === null`, which renders the
   * LOGIN SCREEN — putting the yard back at the one screen an offline morning
   * cannot get past, over a token that costs nothing to carry and that a single
   * sign-in replaces.
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
  const masterStoreRef = useRef<SqliteMasterStore | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const tokenRef = useRef<string | null>(null);
  /**
   * The keystore. One instance, created once — the token is read at boot and
   * written on every sign-in, and there is nothing to configure per call.
   */
  const tokenStoreRef = useRef(new SecureTokenStore());
  /**
   * A refresh already in flight. Master data is now re-fetched on operator
   * ACTIONS (opening the picker, starting a cart), which can be tapped twice in
   * a second — and two overlapping refreshes would race to write the same two
   * tables and could leave the older answer on disk under the newer timestamp.
   */
  const refreshingRef = useRef(false);

  const pendingDraft = useRef<Draft | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ------------------------------------------------------- master refresh -- */

  /**
   * Re-read products and sellers and write them through to the cache.
   *
   * THE TWO LISTS ARE FETCHED AND SAVED INDEPENDENTLY, not under one
   * Promise.all. A single connection can die between the two requests, and with
   * all-or-nothing the device would discard a product list it successfully
   * received because the seller list failed — throwing away the fresher of the
   * two for no reason. Each writes its own rows with its own timestamp, and the
   * price default is gated on the OLDER of them, so a half-refresh is recorded
   * honestly rather than papered over.
   *
   * Failure is NEVER destructive: the cache keeps whatever it had, and the age
   * simply carries on growing where the operator can see it.
   *
   * A 401 here is the session ending, not an outage — the server answered. It is
   * routed to the same device-global state a 401 on a SEND produces, so the
   * strip says "sign in" and carries the button, rather than blaming the
   * network. lessons/401-is-about-the-caller-not-the-bill.md.
   */
  const refreshMaster = useCallback(async (token: string): Promise<void> => {
    const store = masterStoreRef.current;
    if (!store || refreshingRef.current) return;
    refreshingRef.current = true;
    let answered = false;
    let expired = false;
    let failed = false;
    try {
      try {
        const ps = await fetchProducts(token);
        const at = nowIso();
        await store.saveProducts(ps, at);
        setProducts(ps);
        setProductsFetchedAt(at);
        answered = true;
      } catch (err) {
        if (isUnauthorized(err)) expired = true;
        else failed = true;
      }
      try {
        const ss = await fetchSellers(token);
        const at = nowIso();
        await store.saveSellers(ss, at);
        setSellers(ss);
        setSellersFetchedAt(at);
        answered = true;
      } catch (err) {
        if (isUnauthorized(err)) expired = true;
        else failed = true;
      }
    } finally {
      refreshingRef.current = false;
    }
    // Ranked: a 401 is about the CALLER and outranks a transport failure on the
    // other request, because signing in is the only thing that fixes either.
    if (expired) {
      setSessionEnded(true);
      setOnline(true); // the server answered, promptly. This is not an outage.
      return;
    }
    if (answered) {
      setOnline(true);
      setSessionEnded(false);
      return;
    }
    if (failed) setOnline(false);
  }, []);

  /* ---------------------------------------------------------------- boot -- */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const driver = await ExpoSqliteDriver.open("recycle.db");
        const billStore = await SqliteLocalStore.open(driver);
        const draftStore = await SqliteDraftStore.open(driver);
        const masterStore = await SqliteMasterStore.open(driver);
        if (cancelled) return;
        billStoreRef.current = billStore;
        draftStoreRef.current = draftStore;
        masterStoreRef.current = masterStore;

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

        /*
         * THE COLD START, in the order that matters.
         *
         * Master data and the token come off local storage BEFORE anything
         * touches the network, and neither waits on it. With the server down
         * this is the whole of what the yard gets, and it is enough: a seller
         * can be picked, a load weighed, a bill saved and queued.
         *
         * The token is restored as-is. It may already be expired and, offline,
         * that is unknowable — there is nothing to ask. Treating it as usable is
         * deliberate: bills queue behind it either way, and the first send that
         * reaches a server resolves it through the 2c-7 session-ended path.
         */
        const cache = await masterStoreRef.current.load();
        const token = await tokenStoreRef.current.load();
        if (cancelled) return;
        setProducts(cache.products);
        setSellers(cache.sellers);
        setProductsFetchedAt(cache.productsFetchedAt);
        setSellersFetchedAt(cache.sellersFetchedAt);
        tokenRef.current = token;
        setToken(token);

        setDraft(restored);
        setReady(true);
        setStatus(
          API_BASE_URL +
            (recovered.length > 0 ? ` · กู้คืน ${String(recovered.length)} บิลที่ค้าง` : "") +
            (restored ? ` · พบบิลค้างไว้ ${String(restored.lines.length)} รายการ` : "") +
            ` · ในเครื่อง: สินค้า ${String(cache.products.length)} · ผู้ขาย ${String(cache.sellers.length)} ราย`,
        );

        // Only NOW does the network get involved, and nothing above depends on
        // it. A failure here leaves the cache exactly as it was and says so.
        if (token !== null) void refreshMaster(token);
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
    const t = setInterval(() => {
      void refresh();
      // The cache ages on screen without anything happening. Set from the same
      // tick rather than its own timer, and minute-rounded, so it changes
      // identity ~once a minute instead of 150 times.
      setNowMinute(nowMinuteIso());
    }, 400);
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
      // Persisted BEFORE anything else is attempted, so a fetch that fails
      // straight afterwards still leaves the next launch able to work offline.
      // A keystore write that fails is swallowed by SecureTokenStore — it costs
      // one sign-in tomorrow and must never cost this one.
      await tokenStoreRef.current.save(t);
      setOnline(true); // we just spoke to the server
      setSessionEnded(false);
      // The SAME path the boot and the picker use. Duplicating the fetch here
      // is how the cache write would come to be missing from one of the three.
      await refreshMaster(t);
      // Every backoff on the queue was computed while there was no usable
      // session, which says nothing about the network. Without this the yard
      // signs in, the sign-in succeeds, and then nothing visibly happens for up
      // to 30 seconds — which reads as "signing in did not work".
      const freed = (await engineRef.current?.resumeAfterSignIn()) ?? 0;
      if (freed > 0) void syncOnce();
      // NO draft is created here any more. A bill starts when a seller is
      // picked, so signing in never silently opens one for whoever happened to
      // come back first from /sellers.
      setStatus(`${API_BASE_URL} · เข้าสู่ระบบแล้ว`);
    } catch (err) {
      setOnline(false);
      setStatus(`เข้าสู่ระบบไม่สำเร็จ: ${describe(err)}`);
    } finally {
      setBusy(false);
    }
  }, [refreshMaster, syncOnce]);

  /**
   * Open the seller picker, and re-read master data while it is open.
   *
   * The refresh is fired and NOT waited on: the picker opens immediately with
   * whatever is cached, and the list simply updates underneath if the network
   * answers. Blocking the picker on a request would put a spinner between the
   * operator and a customer standing at the scale, and would fail hardest
   * offline — which is the case this phase exists for.
   */
  const openPicker = useCallback(() => {
    setPickerOpen(true);
    const t = tokenRef.current;
    if (t !== null) void refreshMaster(t);
  }, [refreshMaster]);

  /*
   * A CART WAS OPENED, so the product list is on screen — re-read it.
   *
   * Keyed on the draft's id, so this fires when a bill starts (and once at boot
   * for a restored draft) and not on every keystroke of the one in progress.
   * Together with openPicker this is what makes a product or seller added at the
   * office during the day appear without a force-quit.
   */
  useEffect(() => {
    if (!ready || draft === null) return;
    const t = tokenRef.current;
    if (t !== null) void refreshMaster(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the draft's IDENTITY
    // is the event; re-running on every edit would refetch while typing.
  }, [ready, draft?.id, refreshMaster]);

  /* ------------------------------------------------------- seller choice -- */

  /**
   * The chosen seller's tiers, split into the two questions a grade answers.
   *
   * `reference` is the grade's list price as the device last heard it, used for
   * line.list_price and the off-tier badge — a cached answer is correct there,
   * because it is a comparison value shown as information and the server
   * discards the client's list_price anyway.
   *
   * `pendingDefault` is what may be written INTO the money field with nobody
   * deciding, and it goes through defaultUnitPrice — so once the cache is past
   * the cutoff the box is left empty and the operator enters the agreed price.
   * See src/master/freshness.ts for the whole argument.
   */
  const tierResolver = useCallback(
    (grade: string | null): GradeTiers => {
      const reference = (productId: string): string | null => {
        const p = products.find((x) => x.id === productId);
        return p === undefined ? null : gradePrice(p.prices, grade);
      };
      return {
        reference,
        pendingDefault: (productId) => defaultUnitPrice(reference(productId), freshness),
      };
    },
    [products, freshness],
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
          // master_as_of is stamped HERE, at the start, and never moved. It is
          // the oldest master data any line on this bill can have been priced
          // from — see src/master/freshness.ts on why stamping it at save time
          // would be the false negative that makes the marker worthless.
          const fresh = newDraft(deviceIds.newId(), s.id, nowIso(), freshness.asOf);
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
    [applySellerChange, draft, freshness.asOf, locks, tierResolver],
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
            // From the DRAFT, not from `freshness` — the age that matters is
            // the data these prices came from, not the data available at the
            // moment the confirm button was tapped.
            master_as_of: draft.master_as_of,
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

        {/*
          A SECOND strip, below the first and never merged into it. StatusStrip
          answers "are my bills getting out"; this answers "is what I am pricing
          against still true". They fail independently — a yard can be online
          with an empty queue and still be looking at a price list from before a
          change — so one line would mean one of the two facts being silently
          outranked. Renders nothing when the data was just refreshed.
        */}
        <MasterDataStrip notice={masterMessage} />

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
            {/*
              THE COLD START WITH AN EMPTY CACHE. A device that has never
              fetched master data cannot begin a bill — there is no customer to
              file it to and no product to weigh. The button is disabled rather
              than opening an empty picker, because a picker that says "no
              sellers" reads as "this shop has no customers", which is a
              different and alarming claim. The strip above already says what is
              missing and what fixes it; this only stops the dead end.
            */}
            <Pressable
              style={[styles.loginBtn, (busy || freshness.state === "empty") && styles.dim]}
              disabled={busy || freshness.state === "empty"}
              onPress={openPicker}
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
            freshness={freshness}
            newLineId={() => deviceIds.newId()}
            nowIso={nowIso}
            onDraftChange={onDraftChange}
            onLocksChange={setLocks}
            onPickSeller={openPicker}
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
          /* Tells "this device has never downloaded the list" apart from "the
             office has not added anyone" — same empty screen, opposite fixes. */
          neverFetched={!freshness.haveSellers}
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
          /*
            The last screen before cash leaves the drawer, so it is the last
            chance to say the prices came from data this old. Computed from the
            DRAFT's stamp, not from the current freshness: what matters is the
            data these numbers were priced against.

            NOT nowMinute. That value is rounded DOWN to the minute for the
            freshness strip (see nowMinuteIso), so it sits up to 59 seconds
            behind the truth — which UNDERSTATES the age by up to a minute and,
            within a minute of the FRESH_MAX_AGE_MS boundary, suppresses this
            line entirely. Understating is the direction that hides things on a
            money marker (lessons/cached-master-data-is-a-price-claim.md Rule 4),
            and this is the screen where it matters most. The honest value is the
            real instant the operator is deciding at, which is also what the
            bill's own device_created_at will be stamped with a moment later.
          */
          pricedFrom={
            draft === null
              ? null
              : { master_as_of: draft.master_as_of, device_created_at: nowIso() }
          }
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
