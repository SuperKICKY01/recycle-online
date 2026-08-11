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
import { SqliteIdentityStore } from "./src/adapters/sqlite/SqliteIdentityStore";
import type { LocalIdentity } from "./src/adapters/sqlite/SqliteIdentityStore";
import { ownerForNewRow } from "./src/session/rowOwner";
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
import { withheldDraftNotice } from "./src/cart/draftNotice";
import { NO_LOCKS, releaseOnSave } from "./src/cart/entry";
import type { Locks } from "./src/cart/entry";
import { cleanVehicleNo, gradePrice, indexPlates } from "./src/cart/sellers";
import type { Draft } from "./src/cart/types";
import { ExpoSqliteDriver } from "./src/device/expoSqliteDriver";
import { SecureTokenStore } from "./src/device/secureTokenStore";
import {
  applyClearedSession,
  maySync,
  sessionEndedAfterPass,
  sessionStateOf,
  signOut,
} from "./src/session/signOut";
import type { SignOutFailure } from "./src/session/signOut";
import { signOutCard } from "./src/session/signOutNotice";
import type { SignOutAction } from "./src/session/signOutNotice";
import { SignOutSheet } from "./app/SignOutSheet";
import {
  assessFreshness,
  defaultUnitPrice,
  masterNotice,
  mayStartBill,
} from "./src/master/freshness";
import { dailyScreen } from "./src/reports/dailyView";
import type { DailyScreen as DailyScreenModel } from "./src/reports/dailyView";
import { readTokenRole } from "./src/session/deviceRole";
import type { DeviceRole } from "./src/session/deviceRole";
import { signInAndRecord } from "./src/session/signInIdentity";
import { buildLocalBill } from "./src/sync/createBill";
import { SyncEngine } from "./src/sync/engine";
import type { AccountState, SessionState } from "./src/sync/parkedReason";
import { assessQueue } from "./src/sync/queueHealth";
import type { QueueHealth } from "./src/sync/queueHealth";
import { systemClock } from "./src/sync/systemClock";
import type { LocalBill, SyncState } from "./src/sync/types";
import { isMasterDataBlocked, isVoided, isVoidRefused } from "./src/sync/types";
import type { Product, Seller } from "./app/api";
import { fetchDailyReport, fetchProducts, fetchSellers, isUnauthorized, login } from "./app/api";
import { BillsPanel } from "./app/BillsPanel";
import { CartScreen } from "./app/CartScreen";
import { DailyScreen } from "./app/DailyScreen";
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
  /*
   * THE LIST ON DISK BELONGS TO ANOTHER SHOP. Separate from the two stamps above
   * because it answers a different question: those say WHEN, this says WHOSE, and
   * the screen needs both to tell the operator which remedy to reach for.
   * Decided in SqliteMasterStore and carried here untouched — App computes
   * nothing about tenancy, and must not start.
   */
  const [productsNotThisShop, setProductsFromOtherShop] = useState(false);
  const [sellersNotThisShop, setSellersFromOtherShop] = useState(false);
  /** Minute-granular clock driving the cache ages. See nowMinuteIso. */
  const [nowMinute, setNowMinute] = useState(nowMinuteIso);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bills, setBills] = useState<LocalBill[]>([]);
  const [latest, setLatest] = useState<LocalBill | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [billsOpen, setBillsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  /*
   * CARTS ON THIS DEVICE THAT THIS PERSON MAY NOT CONTINUE — a count, from the
   * loader, never computed here. Read once at boot: nothing on this screen can
   * change whose a draft is, so there is no event that would move it. It goes
   * back to zero at the next boot after the owner signs in, which is the only
   * thing that releases one.
   */
  const [draftsWithheld, setDraftsWithheld] = useState(0);

  /*
   * THE DAY'S MONEY. Three pieces of state and no more.
   *
   * `dailyDate` is the WIRE date being asked for, and null means "whatever the
   * server calls today" — the normal case, and the one where the client never
   * computes a date at all. That is deliberate: the server decides the day from
   * `now()` inside the request transaction, the same clock that stamps
   * server_received_at, so omitting the parameter is the only way to ask that
   * cannot be wrong. Stepping to another day sets it from a value the SERVER
   * sent, never from this handset's clock.
   *
   * `daily` is the rendered screen, or null while a request is in flight — so a
   * spinner is a state rather than the absence of one. It is NOT cached across
   * openings: a stale total on a money screen is the same class of mistake as a
   * stale price, and this one has no marker to show its age.
   */
  const [dailyOpen, setDailyOpen] = useState(false);
  const [dailyDate, setDailyDate] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyScreenModel | null>(null);
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
    () =>
      assessFreshness({
        productsFetchedAt,
        sellersFetchedAt,
        productsNotThisShop,
        sellersNotThisShop,
        now: nowMinute,
      }),
    [
      productsFetchedAt,
      sellersFetchedAt,
      productsNotThisShop,
      sellersNotThisShop,
      nowMinute,
    ],
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
  // The expression moved to src/session/signOut.ts so the proof runs THIS code
  // rather than a copy: "a sign-out renders signed_out, never expired" is one of
  // R1b's claims, and it cannot be proven against a re-derivation in a test.
  const session: SessionState = sessionStateOf({ token, sessionEnded });

  /*
   * WHAT THE SERVER HAS REFUSED THIS ACCOUNT. Set by a 403 on a SEND, cleared by
   * a sign-in and by any successful send.
   *
   * Held exactly like sessionEnded and for the same reason: it is a fact about
   * the server's last answer, and a stored one would be a guess about its next.
   * A relaunch re-derives it at the cost of one refused request — which is also
   * the only way the app can ever learn the owner has fixed the role, so it is
   * the mechanism, not the leak.
   */
  const [submitRefused, setSubmitRefused] = useState(false);
  const account: AccountState = submitRefused ? "submit_refused" : "ok";

  /*
   * THE ROLE THIS DEVICE IS SIGNED IN AS, read out of the token's claims.
   *
   * Advisory and courtesy-only: it decides whether ยกเลิกบิลนี้ is OFFERED. The
   * server re-reads the role from the users row on every request and refuses
   * regardless, so a stale claim here can only cost one refusal — which the 403
   * path now explains in plain Thai. Null (unreadable, or a token from an older
   * build) means "unknown", and unknown OFFERS the button; see
   * src/session/deviceRole.ts on why this one fails open.
   */
  const [role, setRole] = useState<DeviceRole>(null);

  /*
   * SIGN-OUT (R1b). The sheet's open flag, and the failure of the LAST attempt.
   *
   * `signOutFailure` is state rather than a local because it must survive the
   * await inside the handler and be on screen afterwards: a sign-out that could
   * not clear the keystore leaves the operator SIGNED IN, and that is the one
   * thing they must not have to guess about while handing over a phone. Cleared
   * when the sheet is opened afresh and on a sign-in.
   */
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signOutFailure, setSignOutFailure] = useState<SignOutFailure | null>(null);

  const [online, setOnline] = useState<boolean | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  /** Bills whose void the server refused (403). See refresh(). */
  const [voidsRefusedCount, setVoidsRefusedCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [health, setHealth] = useState<QueueHealth | null>(null);

  const billStoreRef = useRef<SqliteLocalStore | null>(null);
  const draftStoreRef = useRef<SqliteDraftStore | null>(null);
  /*
   * WHO THIS DEVICE IS SIGNED IN AS. Written by signIn below and by nothing
   * else. Nothing READS it yet — the owner columns exist and are left NULL
   * (P1.7 stamps them next pass), so this is the store filling ahead of the
   * writers, deliberately, because an identity that starts being recorded only
   * when the first stamp lands leaves every earlier bill unattributable.
   */
  const identityStoreRef = useRef<SqliteIdentityStore | null>(null);
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
  /*
   * THE SYNC TICK IS PAUSED. Set true BEFORE sign-out touches the keystore, so
   * no pass can be in flight with a token that is about to be forgotten, and
   * left true afterwards.
   *
   * A ref, not state: syncOnce reads it inside a 4-second interval closure, and
   * a state value would be captured at the moment the interval was created. The
   * same reason tokenRef exists beside `token`.
   *
   * It is the SECOND of two guards after a successful sign-out — tokenRef.current
   * is null by then, which already makes syncOnce return. Two guards, because
   * "no request may be issued with no session" is a security claim and not a
   * performance one, and because the pause has to exist for its own sake in the
   * window before the keystore answers.
   */
  const syncPausedRef = useRef(false);

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
        // These rows were just written under the CURRENT identity, so whatever
        // shop the previous ones belonged to is no longer on disk. Cleared per
        // LIST and not for the pair: the other fetch may still fail below,
        // leaving that list another shop's — which is the half-refresh case.
        setProductsFromOtherShop(false);
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
        // Per list — see the note on the product half above.
        setSellersFromOtherShop(false);
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
        // The SAME driver, so the identity shares the transaction boundary and
        // the file lifetime of the bills it will one day be stamped onto. No
        // open() of its own: the table is created by initConnection, which the
        // three stores above have already run through this driver.
        const identityStore = new SqliteIdentityStore(driver);
        if (cancelled) return;
        billStoreRef.current = billStore;
        draftStoreRef.current = draftStore;
        masterStoreRef.current = masterStore;
        identityStoreRef.current = identityStore;

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
        // The loader now decides WHETHER this person may have the draft; what
        // comes back is the one they own, plus how many were kept back.
        const loaded = await draftStore.load();
        const restored = loaded.draft;

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
        setProductsFromOtherShop(cache.productsNotThisShop);
        setSellersFromOtherShop(cache.sellersNotThisShop);
        tokenRef.current = token;
        setToken(token);
        // Read off the RESTORED token, before any network call — the whole point
        // of taking it from the claims rather than asking /whoami is that a cold
        // start with the server unreachable still knows not to offer a button
        // that cannot work. Unreadable reads as null, which offers it.
        setRole(readTokenRole(token));

        setDraft(restored);
        setDraftsWithheld(loaded.withheld);
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
    /*
     * THIS COUNT INCLUDES OTHER ACCOUNTS' BILLS, AND AS OF THIS COMMIT THAT IS
     * WRONG FOR THE PERSON READING IT. The behaviour is deliberately unchanged
     * here; what follows is what they now experience, recorded where the number
     * is made rather than only in a queue file.
     *
     * listByState carries its OWN predicate — `sync_state = ?` — and does not
     * draw on the QUEUED constant, so it never gained the owner filter the send
     * queue did. It therefore totals every owner's unsent bills. The send queue
     * no longer selects another person's rows, so the two numbers on this screen
     * now disagree by design: pendingQueueSnapshot counts what CAN send, this
     * counts what EXISTS.
     *
     * WHAT THAT MEANS AT THE SCALE. The strip (see the `pending` prop below) and
     * the sign-out refusal both read THIS number. So the operator is shown a
     * count of unsent bills that includes bills belonging to someone else, and
     * it will not go down however long they wait — there is nothing they can do
     * to release another person's rows, and no connection will drain them. It
     * reads as a bad signal or a stuck queue, and they will stand there
     * expecting it to clear. The sign-out refusal inherits the same fault: it
     * can refuse to sign out over bills the person in front of it does not own
     * and cannot send.
     *
     * NOT FIXED HERE ON PURPOSE. The resolution is P1.7's status-strip step,
     * which splits the parked-for-another-account count from the ordinary unsent
     * count — ROADMAP.md section P1.7, "THE PARKED COUNT MUST BE SEPARATE FROM
     * THE OWNER-MISMATCH COUNT". That step decides what the operator is told;
     * changing the number here would settle that decision and implement it in
     * the same pass, in a commit whose subject is a SQL predicate.
     */
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
    /*
     * Counted over EVERY bill, not over the 30 shown. This number is the size of
     * a disagreement about money — purchases the yard believes are cancelled and
     * the server still holds as live — and a count that quietly stopped at the
     * end of one screen would understate it on exactly the busy day it matters.
     */
    setVoidsRefusedCount(all.filter(isVoidRefused).length);
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
    // Paused checked FIRST: during a sign-out the token may still be present
    // (the keystore has not answered yet) and no request may go out under a
    // session that is being ended. After a successful sign-out tokenRef is null
    // as well, so both guards hold.
    if (!maySync({ paused: syncPausedRef.current, token: tokenRef.current })) return;
    if (!engine) return;
    const r = await engine.runOnce();

    /*
     * THE SESSION MAY HAVE ENDED WHILE THIS PASS WAS IN FLIGHT.
     *
     * The guard above gates the ENTRY of a tick; it cannot reach a pass already
     * past it. So a sign-out that lands mid-flight leaves this continuation
     * running with a result belonging to a session that no longer exists, and
     * without this second check it would write that result onto a screen that
     * says signed out. Proven in proveSignOut S4b, which stages exactly this
     * ordering rather than arguing it from the code.
     *
     * WHAT IS DROPPED AND WHAT IS NOT — the boundary is the whole point:
     *
     *   KEPT. Everything engine.runOnce() already wrote to SQLite. The bill was
     *   marked synced INSIDE that call, and that write stays, because it is a
     *   fact about the SHOP'S DATA: the bill really did reach the server, it
     *   really does have a doc_no, and a sign-out cannot un-happen it. Throwing
     *   it away would re-send a bill the server has already accepted.
     *
     *   DROPPED. Only what is about the SESSION — setOnline, setSessionEnded,
     *   setSubmitRefused below. Those are claims about a caller that has left,
     *   and re-derived within seconds of the next sign-in by the next pass.
     *
     * refresh() is not called here for a different reason: it is not owned by
     * this function at all. A 400 ms interval (see below) re-reads the bill
     * store unconditionally, so pendingCount, failedCount, lastSyncedAt, health
     * and the bill list are never more than 400 ms stale regardless of what
     * this pass does.
     */
    if (!maySync({ paused: syncPausedRef.current, token: tokenRef.current })) return;

    // THE SESSION ENDED — checked FIRST and above `attempted === 0`, because a
    // pass that sent no bills can still have tried to push a void and been told
    // 401. It is also the reason `online` is set TRUE here: the server answered,
    // promptly, so calling this an outage was never anything but wrong.
    if (r.sessionExpired > 0) {
      // The VALUE is decided in src/session/signOut.ts, where a proof can drive
      // it from a real run; this line only applies it. The updater form is used
      // rather than reading `sessionEnded` out of the closure, which would put
      // it in this callback's dependency array and restart the 4 s interval
      // every time the flag moved.
      setSessionEnded((was) => sessionEndedAfterPass(was, r));
      setOnline(true);
      return;
    }

    /*
     * A REFUSAL ABOUT WHO IS ASKING (403). Checked here, beside the session case
     * and above `attempted === 0`, because a pass that sent no bills can still
     * have tried a VOID and been refused — which is the path a staff phone
     * actually takes, since creating bills is open to staff and unwinding one is
     * not.
     *
     * online = true, unconditionally: the server answered, immediately and
     * definitively. Calling this an outage is the same mistake the 401 path made,
     * and it would put "จะส่งให้เองเมื่อเน็ตกลับมา" on a screen where waiting
     * achieves nothing at all.
     *
     * Only the SEND refusal sets device-global state. A refused void is recorded
     * on its own row by the engine and is counted in refresh() — one bill's
     * cancellation not happening is not a claim about what the phone may do next.
     */
    if (r.forbidden > 0) {
      setSubmitRefused(true);
      setOnline(true);
    }
    if (r.voidsForbidden > 0) setOnline(true);
    if (r.forbidden > 0 || r.voidsForbidden > 0) {
      await refresh();
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
      // Same applier as the expiry branch above, same one decision in src/.
      setSessionEnded((was) => sessionEndedAfterPass(was, r));
      // A bill that went through is DIRECT evidence this account may submit —
      // the only evidence there is, and stronger than the flag. It happens after
      // a sign-in as a different user, or after the owner fixes the role and the
      // engine's own gate is lifted by that sign-in.
      setSubmitRefused(false);
    } else if (r.retryable > 0) setOnline(false);
  }, [refresh]);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => void syncOnce(), 4000);
    return () => clearInterval(t);
  }, [ready, syncOnce]);

  /* ------------------------------------------------------- daily money -- */

  /**
   * Read the day's money from the server and render it.
   *
   * NO TOKEN IS A CASE, NOT A GUARD. A signed-out device gets the screen that
   * says so and carries a sign-in button, rather than a spinner that never ends
   * or a silently empty modal — the classification lives in dailyView, so this
   * function only has to hand it the right outcome.
   *
   * A 401 here ALSO ends the device session, exactly like a 401 on a send or on a
   * master-data refresh: it is one fact about the caller, and three screens
   * telling three different stories about it is what the 401 lesson is for.
   * `online` is set true on any answer at all — the server replied, so calling it
   * an outage was never anything but wrong.
   *
   * WHAT IT DELIBERATELY DOES NOT DO is touch `submitRefused`. A 403 here says
   * this account may not READ the day's money; it says nothing about whether it
   * may submit bills, and staff submitting bills is the normal arrangement. The
   * two are different permissions and conflating them would gate the yard's whole
   * send loop on the owner opening a report.
   */
  const loadDaily = useCallback(
    async (date: string | null): Promise<void> => {
      const t = tokenRef.current;
      if (t === null) {
        setDaily(dailyScreen({ kind: "no_token" }));
        return;
      }
      setDaily(null);
      const result = await fetchDailyReport(t, date);
      setDaily(dailyScreen(result));
      if (result.kind === "unreachable") {
        setOnline(false);
        return;
      }
      setOnline(true);
      if (result.kind === "http" && result.status === 401) setSessionEnded(true);
      else if (result.kind === "ok") setSessionEnded(false);
    },
    [],
  );

  const openDaily = useCallback(() => {
    setDailyOpen(true);
    // Always the server's own today when the screen is opened. A day the owner
    // stepped to twenty minutes ago is not what they mean by "open the takings".
    setDailyDate(null);
    void loadDaily(null);
  }, [loadDaily]);

  const pickDay = useCallback(
    (wireDate: string | null) => {
      setDailyDate(wireDate);
      void loadDaily(wireDate);
    },
    [loadDaily],
  );

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

  /* ----------------------------------------------------------- row owner -- */

  /**
   * WHO THIS DEVICE IS SIGNED IN AS, read from the store at the moment a row is
   * written. Every local write that records ownership goes through this.
   *
   * READ LIVE, NOT CACHED IN A REF. The store is the only thing that knows, and
   * a ref would be a second copy that can disagree with it — stale after a
   * sign-in, or holding a person who has since been replaced. The read is one
   * indexed single-row SELECT on a connection this call is about to write to
   * anyway.
   *
   * NOT DERIVED FROM THE TOKEN, and this is the part that looks like a missing
   * step rather than a decision. A token can be expired, revoked, or simply
   * absent on an offline morning while the person at the scale is exactly who
   * they were yesterday — and the claims inside it are the server's, signed
   * with a key this client cannot verify. Ownership has to survive all of that,
   * so it comes from what a successful login RECORDED and from nothing else.
   *
   * NULL MEANS UNKNOWN AND IS NEVER A GUESS. It is returned when no login has
   * ever been recorded on this device, and when the store is not open yet — a
   * boot race the sign-in path already guards at its own call site. The one
   * thing it must never become is "probably the last person", which would
   * manufacture provenance that reads exactly like the real thing.
   */
  const currentOwner = useCallback(
    async (): Promise<LocalIdentity | null> => ownerForNewRow(identityStoreRef.current),
    [],
  );

  /* ------------------------------------------------------ draft persistence */

  const flushDraft = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const d = pendingDraft.current;
    pendingDraft.current = null;
    if (d && draftStoreRef.current) {
      await draftStoreRef.current.save(d, await currentOwner());
    }
  }, [currentOwner]);

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
    /*
     * A PRE-FLIGHT GUARD, BEFORE THE REQUEST — and the ordering is the point.
     *
     * The local database is opened by the boot effect, and every sign-in button
     * on this screen is behind `ready`, which is set after it. StatusStrip's is
     * not obviously behind it, so the race is reachable rather than merely
     * theoretical. Refusing BEFORE the network call, instead of after, is what
     * keeps a good token from being minted and then thrown away: nothing is
     * asked of the server, so no login has failed, and pressing again a moment
     * later works. The window is the few milliseconds a file open takes.
     */
    const identityStore = identityStoreRef.current;
    if (identityStore === null) {
      setStatus("กำลังเปิดฐานข้อมูลในเครื่อง — ลองอีกครั้ง");
      return;
    }
    setBusy(true);
    try {
      // signInAndRecord runs the attempt and, ONLY on success, records who
      // signed in. The ordering lives in src/session/signInIdentity.ts because
      // this file cannot be reached by a headless proof; see its header.
      const { accessToken: t } = await signInAndRecord(
        () => login(DEMO.tenantId, DEMO.username, DEMO.password),
        DEMO.tenantId,
        identityStore,
      );
      tokenRef.current = t;
      setToken(t);
      setRole(readTokenRole(t));
      // A sign-out (successful or not) may have left the tick paused and a
      // failure notice on the sheet. Both are facts about the session that has
      // just been replaced.
      syncPausedRef.current = false;
      setSignOutFailure(null);
      // A sign-in is the ONE event on this device that can change who the caller
      // is, so it is the only thing that retracts a 403. If the same account
      // signs back in, the retry is refused once and lands straight back here —
      // one request, not a loop. engine.resumeAfterSignIn does the same for the
      // per-bill void refusals below.
      setSubmitRefused(false);
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
   * END THE SESSION ON THIS DEVICE (R1b).
   *
   * The DECISION and the ORDER live in src/session/signOut.ts, which is pure and
   * proven; this handler is the wiring. It does exactly three things with the
   * outcome, and the split matters:
   *
   *   refused_pending -> nothing happened. The sheet re-renders from the counts
   *                      and says why, and the session is untouched.
   *   failed          -> STILL SIGNED IN. Record the failure so the sheet says
   *                      so. Do NOT clear anything: the keystore still holds a
   *                      working token, and rendering the login screen over it
   *                      would state a fact the device contradicts — the next
   *                      cold start would sign the departed user back in.
   *   signed_out      -> apply CLEARED_SESSION, every value at once.
   *
   * The master-data cache, the products and sellers lists and the open draft are
   * deliberately NOT cleared. That is shop data, and dropping it would strand
   * the next offline morning with nothing to weigh against — the same argument
   * this file already makes for keeping an expired token rather than deleting it.
   *
   * AND THE LOCAL IDENTITY IS NOT CLEARED EITHER — the one absence here that is
   * NOT permanent, so it is written down rather than left to be inferred.
   * SqliteIdentityStore.clear() exists, it belongs to a deliberate sign-out, and
   * it is called from nowhere at this commit. Calling it now would strand rows:
   * the refusal that has to guard the clearing — a sign-out that will not
   * proceed while unsent bills carry an owner this device is about to forget —
   * does not exist yet, and `refused_pending` above counts bills, not owners.
   * So the identity outlives the session on purpose until that guard lands.
   */
  const onSignOut = useCallback(async () => {
    setBusy(true);
    try {
      const outcome = await signOut({
        pending: pendingCount,
        failed: failedCount,
        setSyncPaused: (paused) => {
          syncPausedRef.current = paused;
        },
        tokens: tokenStoreRef.current,
        engine: engineRef.current,
      });

      if (outcome.kind === "refused_pending") return;
      if (outcome.kind === "failed") {
        setSignOutFailure(outcome.failure);
        return;
      }

      // EVERY session-derived value, applied from the one list in src/. Adding a
      // value to ClearedSession makes this call a compile error until a setter
      // is supplied for it — which is the point of passing setters rather than
      // writing ten assignments here where one can quietly go missing.
      tokenRef.current = null;
      applyClearedSession({
        token: setToken,
        role: setRole,
        sessionEnded: setSessionEnded,
        submitRefused: setSubmitRefused,
        online: setOnline,
        lastSyncedAt: setLastSyncedAt,
        health: setHealth,
        daily: setDaily,
        dailyDate: setDailyDate,
        dailyOpen: setDailyOpen,
      });
      setSignOutFailure(null);
      setSignOutOpen(false);
      setStatus(`${API_BASE_URL} · ออกจากระบบแล้ว`);
    } finally {
      setBusy(false);
    }
  }, [failedCount, pendingCount]);

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
          // The one save of this draft that INSERTS, so the one that records an
          // owner — every later save updates and the columns are excluded from
          // the DO UPDATE list. This pair therefore means "who opened the cart",
          // and it is stamped here because here is where the cart opens.
          await draftStore.save(fresh, await currentOwner());
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
    [applySellerChange, currentOwner, draft, freshness.asOf, locks, tierResolver],
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

        // Read HERE, at the save, and not inherited from the draft row. This is
        // the person who handed over the cash, and the server records whoever
        // SENDS a bill as its creator — so the owner that gates the send has to
        // be this one, not whoever happened to pick the seller hours earlier.
        await draftStore.promoteToBill(draft, bill, await currentOwner());

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
  }, [currentOwner, draft, refresh, seller, syncOnce]);

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
          <View style={styles.headerRow}>
            <Text style={styles.h1}>รับซื้อของเก่า</Text>
            {/*
              OFFERED TO EVERY ACCOUNT, unlike ยกเลิกบิลนี้ — and the difference
              is worth stating because the two look like the same decision.

              The void button is hidden from a staff token because pressing it
              performs an ACTION that will be refused, leaving a bill claiming a
              cancellation that never happened. Opening a read-only report costs
              one refused GET and produces one plain sentence.

              And the token's role is ADVISORY and up to an hour stale, while the
              server re-reads it from the users row on every request — so a staff
              user promoted this morning is admin to the server and still `staff`
              in their token. Gating this on the claim would lock the owner out of
              their own takings until the token expired. The server is the
              authority; the 403 path is proven; the button stays.
            */}
            <Pressable style={styles.dailyBtn} onPress={openDaily}>
              <Text style={styles.dailyBtnText}>ยอดวันนี้ ›</Text>
            </Pressable>
            {/*
              SIGN OUT (R1b). Offered only while there IS a session — with no
              token the login button is already the whole screen, and a sign-out
              button beside it would be an action with nothing to act on.

              It opens a sheet rather than signing out on the tap. The sheet is
              where the queue gate is explained and where the operator is told,
              BEFORE committing, that signing back in needs a connection —
              which is the one consequence they cannot discover by trying, since
              discovering it means already being signed out.
            */}
            {token !== null ? (
              <Pressable
                style={styles.dailyBtn}
                onPress={() => {
                  setSignOutFailure(null);
                  setSignOutOpen(true);
                }}
              >
                <Text style={styles.dailyBtnText}>ออกจากระบบ</Text>
              </Pressable>
            ) : null}
          </View>
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
          /*
            What the server has refused this ACCOUNT, and how many voids it
            refused. Two separate inputs because they are two different facts:
            one is about what this phone may do from now on, the other is a fixed
            set of purchases already in disagreement with the server.
          */
          account={account}
          voidsRefused={voidsRefusedCount}
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
              A CART IS BEING KEPT THAT THIS PERSON MAY NOT CONTINUE. Without
              this line the screen above is byte-identical to an ordinary morning
              with nothing in progress, so somebody who left half a cart last
              night would read "it is gone". The sentence and the decision to
              show nothing about WHOSE it is live in src/cart/draftNotice.ts,
              where a proof can reach them; this is only its render.
            */}
            {withheldDraftNotice(draftsWithheld) !== null && (
              <Text style={styles.withheldDraft}>
                {withheldDraftNotice(draftsWithheld)}
              </Text>
            )}
            {/*
              NO USABLE MASTER DATA, SO NO BILL. Two ways to get here and the
              button cannot tell them apart, which is correct — a device that has
              never fetched, and a device whose cached lists are not this shop's
              (P1.7). Either way there is no customer to file the bill to and no
              product to weigh. The DECISION is mayStartBill in
              src/master/freshness.ts, where a proof can reach it; this is only
              its render.

              The button is disabled rather than opening an empty picker, because
              a picker that says "no sellers" reads as "this shop has no
              customers", which is a different and alarming claim. The strip above
              already says which list is missing and what fixes it — and says it
              differently for the two cases; this only stops the dead end.
            */}
            <Pressable
              style={[styles.loginBtn, (busy || !mayStartBill(freshness)) && styles.dim]}
              disabled={busy || !mayStartBill(freshness)}
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

        {/*
          The sheet is rendered from the CURRENT counts every time, not from a
          value captured when it opened: a queue that drains while it is on
          screen turns the refusal into the confirmation by itself, with no tap.
        */}
        <SignOutSheet
          visible={signOutOpen}
          busy={busy}
          card={signOutCard({
            pending: pendingCount,
            failed: failedCount,
            failure: signOutFailure,
            /*
              R2b: WHY the queue is stuck, not merely that it is. Already derived
              at the top of this component and already handed to StatusStrip and
              BillsPanel, so the three renderers of one fact read one value.
            */
            session,
          })}
          onAction={(action: SignOutAction) => {
            switch (action.kind) {
              case "dismiss":
                setSignOutOpen(false);
                setSignOutFailure(null);
                return;

              /*
                R2b. THE SAME FUNCTION THE STRIP'S BUTTON REACHES. `signIn` is the
                one act on this device that ends an expired session, and it
                already clears the sync pause, the failure notice and the 403,
                then resumes the queue and kicks a pass. A second sign-in path
                written here would be a copy of that, free to drift from it.

                The sheet closes first: the operator pressed sign in, not sign
                out, and leaving a refusal on screen over a session that is about
                to work would be the same class of defect as the sentence this
                phase is removing.
              */
              case "sign_in":
                setSignOutOpen(false);
                void signIn();
                return;

              // confirm_sign_out and retry_sign_out are the same act; they differ
              // only in the label, because the second one follows a failure.
              case "confirm_sign_out":
              case "retry_sign_out":
                void onSignOut();
                return;

              /*
                A FIFTH MEMBER IS A COMPILE ERROR HERE, and that is the whole
                reason this is a switch. It was `if (dismiss) ... else
                onSignOut()`, which would have taken `sign_in` silently down the
                sign-out path — where the gate refuses it — producing a green
                button that does nothing. Worse than the defect being fixed.
              */
              default: {
                const never: never = action;
                throw new Error(`unhandled sign-out action: ${JSON.stringify(never)}`);
              }
            }
          }}
        />

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
            within a minute of the JUST_FETCHED_WINDOW_MS boundary (5 min, the
            BANNER threshold — not PRICE_DEFAULT_CUTOFF_MS, which is 12 h and
            gates the money), suppresses this line entirely. Understating is the
            direction that hides things on a
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

        <DailyScreen
          visible={dailyOpen}
          screen={daily}
          onClose={() => setDailyOpen(false)}
          /* Retry means the SAME day again — not "go back to today", which would
             quietly change which number the owner is looking at. */
          onRetry={() => void loadDaily(dailyDate)}
          onSignIn={() => {
            void (async () => {
              await signIn();
              await loadDaily(dailyDate);
            })();
          }}
          onPickDay={pickDay}
        />

        <BillsPanel
          visible={billsOpen}
          bills={bills}
          busy={busy}
          session={session}
          account={account}
          // Courtesy only: it decides whether ยกเลิกบิลนี้ is offered. The server
          // re-reads the role on every request and refuses regardless.
          role={role}
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h1: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  status: { fontSize: 10, color: "#94a3b8" },
  // A quiet teal chip, not a primary action: the yard's job is weighing, and this
  // is the owner's screen sitting where they can reach it without hunting.
  dailyBtn: {
    minHeight: 36, paddingHorizontal: 12, borderRadius: 8, justifyContent: "center",
    backgroundColor: "#ccfbf1",
  },
  dailyBtnText: { fontSize: 13, fontWeight: "800", color: "#0f766e" },

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
  /*
   * Amber, and NOT the red `block` tone the master strip uses. Nothing is
   * broken and nothing is stopped — a bill can be started normally — so this
   * must not read as a refusal. It is information about work being held.
   * Not numberOfLines-clamped: a truncated "it has not been deleted" is the
   * half of the sentence that matters going missing.
   */
  withheldDraft: {
    fontSize: 13, color: "#78350f", backgroundColor: "#fef3c7",
    textAlign: "center", fontWeight: "700", marginBottom: 14,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
  },
  dim: { opacity: 0.4 },
});
