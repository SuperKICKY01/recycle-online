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
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { ThemeProvider, useTheme, type ThemeTokens } from "./app/theme";

import { HttpTransport } from "./src/adapters/httpTransport";
import { HttpSellerTransport } from "./src/adapters/httpSellerTransport";
import { SqliteDraftStore } from "./src/adapters/sqlite/SqliteDraftStore";
import { SqliteDeviceStore } from "./src/adapters/sqlite/SqliteDeviceStore";
import { SqliteLocalSellerStore } from "./src/adapters/sqlite/SqliteLocalSellerStore";
import { SqliteIdentityStore } from "./src/adapters/sqlite/SqliteIdentityStore";
import type { LocalIdentity } from "./src/adapters/sqlite/SqliteIdentityStore";
import { ownerForNewRow } from "./src/session/rowOwner";
import { SqliteLocalStore } from "./src/adapters/sqlite/SqliteLocalStore";
import { SqliteMasterStore } from "./src/adapters/sqlite/SqliteMasterStore";
import { SqliteShopStore } from "./src/adapters/sqlite/SqliteShopStore";
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
import { mergeSellersForPicker } from "./src/cart/pickerSellers";
import type { Draft } from "./src/cart/types";
import { ExpoSqliteDriver } from "./src/device/expoSqliteDriver";
import { SecureTokenStore } from "./src/device/secureTokenStore";
import {
  applyClearedSession,
  maySync,
  sessionEndedAfterPass,
  mustShowSignIn,
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
import { reserveStripNotice } from "./src/master/reserveStrip";
import { statusNotice } from "./src/sync/statusNotice";
import type { StatusInput } from "./src/sync/statusNotice";
import { withClientVersion } from "./src/net/clientVersion";
import { outdatedAfterPass } from "./src/sync/outdatedState";
import { arrangeNotices, masterEntry, reserveEntry, statusEntry, type NoticeId } from "./src/ui/noticeStack";
import { NAV_ITEMS, type NavDest, type NavGate } from "./src/ui/navRow";
import { NoticeSheet } from "./app/NoticeSheet";
import {
  priceListScreen,
  priceRefreshScreen,
  priceSaveScreen,
} from "./src/master/priceEdit";
import type { CacheRefresh, PriceProduct, PriceScreen, PriceWrite } from "./src/master/priceEdit";
import { dailyScreen } from "./src/reports/dailyView";
import type { DailyScreen as DailyScreenModel } from "./src/reports/dailyView";
import {
  dashboardScreen,
  mayShowDashboardEntry,
  readMoneyVisible,
} from "./src/dashboard/dashboardView";
import { selectCustom, selectPreset } from "./src/dashboard/period";
import type { PeriodSelection, PresetKind } from "./src/dashboard/period";
import { STAFF_MONEY_HIDDEN, summaryScreen } from "./src/dashboard/summaryView";
import type { SummaryScreen } from "./src/dashboard/summaryView";
import { unsentLine } from "./src/dashboard/unsentLine";
import type { UnsentLine } from "./src/dashboard/unsentLine";
import { sellerHistoryScreen } from "./src/sellerHistory/sellerHistoryView";
import type { SellerHistoryScreen } from "./src/sellerHistory/sellerHistoryView";
import { mayEditPrices, mayManageProducts, mayManageUsers, readTokenRole, readTokenUserId } from "./src/session/deviceRole";
import type { DeviceRole } from "./src/session/deviceRole";
import {
  formScreen,
  readShopSettings,
  shopSaveResult,
  shopSettingsScreen,
  unreadableSettingsScreen,
} from "./src/settings/shopSettings";
import type { ShopFetch, ShopPatch, ShopSettings, ShopSettingsScreen } from "./src/settings/shopSettings";
import {
  readGradeTiers,
  tierActionOutcome,
  tierAdminScreen,
} from "./src/settings/gradeTierAdmin";
import type {
  AdminGradeTier,
  GradeTierCreateBody,
  GradeTierFetch,
  TierAdminRow,
  TierAdminScreen,
} from "./src/settings/gradeTierAdmin";
import { userWriteOutcome, usersScreenState } from "./src/users/usersAdmin";
import type {
  UserCreateBody,
  UserFetch,
  UserRow,
  UsersScreenState,
} from "./src/users/usersAdmin";
import { productsScreenState, productWriteOutcome } from "./src/products/productsAdmin";
import type {
  AdminProduct,
  EntityCreateBody,
  EntityKind,
  ProductCreateBody,
  ProductFetch,
  ProductPatchBody,
  ProductsScreenState,
} from "./src/products/productsAdmin";
import { accountProfile, passwordChangeResult, readWhoAmI } from "./src/settings/account";
import type {
  AccountProfile,
  PasswordChangeOutcome,
  PasswordChangeRequest,
} from "./src/settings/account";
import { shopCodeNotice } from "./src/session/shopCode";
import { signInAndRecord, signInNotice } from "./src/session/signInIdentity";
import { buildLocalBill } from "./src/sync/createBill";
import type { BillSeller } from "./src/sync/createBill";
import type {
  CreateLocalSellerResult,
  LocalSeller,
  LocalSellerDraft,
} from "./src/sync/localSeller";
import { SyncEngine } from "./src/sync/engine";
import { NOTHING_OWED, totalOwed } from "./src/sync/outbox";
import type { OwedByKind } from "./src/sync/outbox";
import type { AccountState, SessionState } from "./src/sync/parkedReason";
import { assessQueue } from "./src/sync/queueHealth";
import type { QueueHealth } from "./src/sync/queueHealth";
import { systemClock } from "./src/sync/systemClock";
import type { LocalBill, SyncState } from "./src/sync/types";
import { isMasterDataBlocked, isVoided, isVoidRefused } from "./src/sync/types";
import type { GradeTier, Product, Seller } from "./app/api";
import {
  changeOwnPassword,
  createGradeTier,
  fetchDailyReport,
  fetchGradeTiers,
  fetchGradeTiersAdmin,
  fetchProducts,
  fetchSellerHistory,
  fetchSellers,
  fetchShop,
  fetchSummary,
  patchGradeTier,
  reorderGradeTiers,
  fetchUsers,
  createUser,
  deactivateUser,
  activateUser,
  resetUserPassword,
  fetchProductsAdmin,
  createProduct,
  patchProduct,
  deactivateProduct,
  activateProduct,
  fetchCategoriesAdmin,
  createCategory,
  renameCategory,
  deactivateCategory,
  activateCategory,
  fetchUomsAdmin,
  createUom,
  renameUom,
  deactivateUom,
  activateUom,
  fetchWhoAmI,
  isUnauthorized,
  login,
  patchShop,
  resolveShopCode,
  setProductPrice,
} from "./app/api";
import { AddSellerSheet } from "./app/AddSellerSheet";
import { BillsPanel } from "./app/BillsPanel";
import { CartScreen } from "./app/CartScreen";
import { DashboardScreen } from "./app/DashboardScreen";
import type { DashboardCustom } from "./app/DashboardScreen";
import { SettingsScreen } from "./app/SettingsScreen";
import { AccountScreen } from "./app/AccountScreen";
import { SellerHistorySheet } from "./app/SellerHistorySheet";
import { TierActionsSheet } from "./app/TierActionsSheet";
import { UsersScreen } from "./app/UsersScreen";
import { UserActionsSheet } from "./app/UserActionsSheet";
import { ProductsScreen } from "./app/ProductsScreen";
import { ProductActionsSheet } from "./app/ProductActionsSheet";
import { Button, EmptyState } from "./app/Kit";
import { Icon, type IconName } from "./app/Icon";
import { Touchable } from "./app/Press";
import { display } from "./src/money/format";
import { ConfirmSaveDialog } from "./app/ConfirmSaveDialog";
import { ConfirmSellerChangeDialog } from "./app/ConfirmSellerChangeDialog";
import { API_BASE_URL } from "./app/config";
import { LoginScreen } from "./app/LoginScreen";
import { deviceIds } from "./app/ids";
import { MasterDataStrip } from "./app/MasterDataStrip";
import { ReserveStrip } from "./app/ReserveStrip";
import { PricesSheet } from "./app/PricesSheet";
import { SellerPicker } from "./app/SellerPicker";
/*
 * THE ONE MODAL. Every sheet below is a plain view now and none of them presents
 * itself; the stack in src/ui/sheetStack.ts says which one is inside this host.
 * See app/SheetHost.tsx for why a second Modal anywhere is the defect returning.
 */
import { SheetHost } from "./app/SheetHost";
import type { SheetAnimation } from "./app/SheetHost";
import { StatusStrip } from "./app/StatusStrip";
import { applySheetTransition, NO_SHEETS, topSheet } from "./src/ui/sheetStack";
import type { SheetStack, SheetTransition } from "./src/ui/sheetStack";

const ALL_STATES: SyncState[] = ["pending", "syncing", "synced", "failed"];

const STATE_TH: Record<SyncState, string> = {
  pending: "รอส่ง",
  syncing: "กำลังส่ง",
  synced: "ส่งแล้ว",
  failed: "ผิดพลาด",
};

function makeStateColor(t: ThemeTokens): Record<SyncState, string> {
  return {
    pending: t.color.warning,
    syncing: t.color.infoStrong,
    synced: t.color.success,
    failed: t.color.danger,
  };
}

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
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function AppInner() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const stateColor = useMemo(() => makeStateColor(theme), [theme]);
  const [status, setStatus] = useState("กำลังเปิดฐานข้อมูล…");
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  /**
   * THE SHOP'S ACTIVE GRADE TIERS (S16 / P1.24), a third cached master list. The
   * set that used to be the hardcoded `GRADES` A-D; per-tenant now, so it is
   * fetched and cached beside products and sellers. The price screen lists these
   * to set a price for each; the picker and cart read a tier's NAME from them.
   * Empty until the first fetch — a missing name degrades to the raw code, it
   * never stops a bill (the price default lives on products, not here).
   */
  const [gradeTiers, setGradeTiers] = useState<GradeTier[]>([]);
  /**
   * The local sellers this device created that the server has not sent back yet.
   * Read from `listForPicker`, refreshed whenever the cache does (the effect
   * below). The add-seller sheet writes these (P1.8b); the picker's union offers
   * them alongside the cache under their LOCAL ids, and the send-time resolution
   * swaps a local id for the server id once the seller settles.
   */
  const [localSellers, setLocalSellers] = useState<LocalSeller[]>([]);
  /**
   * THE DEVICE'S RESERVED-CODE HOLDING, for the continuous reserve strip and the
   * add-seller refusal. `spendable` and `held` are LOCAL counts; `target` and
   * `targetAt` are the shop's target and when it last arrived from a refill —
   * null together until a refill has ever succeeded (NEVER PROVISIONED), never
   * defaulted. Read by `readReserve` at boot, after every sync pass (a refill may
   * have moved it), and after a create. The strip decides for itself whether
   * `target` is fresh enough to trust (`src/master/reserveStrip.ts`); this holds
   * the raw values.
   */
  const [reserve, setReserve] = useState<{
    spendable: number;
    held: number;
    target: number | null;
    targetAt: string | null;
  }>({ spendable: 0, held: 0, target: null, targetAt: null });
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
  /**
   * WHEN the grade tiers were last fetched, or null for NEVER. The price screen's
   * gate: it cannot list a tier set it has not downloaded. Deliberately NOT fed
   * into freshness.ts's price-default gate — tiers carry no money, so their age
   * does not decide whether a bill may start.
   */
  const [gradeTiersFetchedAt, setGradeTiersFetchedAt] = useState<string | null>(null);
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
  /*
   * WHICH SHEET IS OVER THE APP — ONE VALUE FOR ALL SEVEN.
   *
   * This replaced seven independent booleans (confirmOpen, billsOpen,
   * pickerOpen, addSellerOpen, dailyOpen, signOutOpen, and pendingChange's
   * null-ness), each of which drove its own Modal. Two of them could be true at
   * once and the platform cannot present two modals from one parent, so the
   * add-seller button did nothing on a real handset. With one stack there is
   * nothing to be inconsistent: `topSheet` returns one value or null, and
   * app/SheetHost renders that and nothing else.
   *
   * It is a STACK and not a single slot because closing a sheet has to return to
   * what was under it — the add-seller form sits over the picker, and cancelling
   * it must put the operator back on the search box rather than on the cart.
   * `src/ui/sheetStack.ts` holds the transitions and the reasons.
   */
  const [sheets, setSheets] = useState<SheetStack>(NO_SHEETS);
  /**
   * THE ONLY WAY THE STACK MOVES. Named transitions, declared in
   * `src/ui/sheetStack.ts` and nowhere else — so `npm run prove:sheets` walks the
   * table this app actually dispatches rather than a copy of it, and a new
   * transition cannot be invented at a call site.
   */
  const sheet = useCallback((name: SheetTransition): void => {
    setSheets((s) => applySheetTransition(s, name));
  }, []);
  /*
   * CARTS ON THIS DEVICE THAT THIS PERSON MAY NOT CONTINUE — a count, from the
   * loader, never computed here. Read once at boot: nothing on this screen can
   * change whose a draft is, so there is no event that would move it. It goes
   * back to zero at the next boot after the owner signs in, which is the only
   * thing that releases one.
   */
  const [draftsWithheld, setDraftsWithheld] = useState(0);
  /*
   * WHICH SHOP THIS DEVICE IS. Null until setup. Read once at boot from
   * local_shop and changed only by a successful code exchange — it outlives the
   * token and every sign-out, because the device stays with the yard.
   */
  const [shop, setShop] = useState<string | null>(null);
  /** The last setup or sign-in failure, already worded. Cleared on success. */
  const [signInNoticeText, setSignInNotice] = useState<string | null>(null);

  /*
   * THE OWNER'S DASHBOARD (P1.23 item 4 unit 3). It absorbed the standalone daily
   * screen (S24): the ยอดวันนี้ entry opens THIS, and the day's per-bill list is now
   * the today view's list rather than a screen of its own.
   *
   * `dashModel` is the rendered model, or null while a request is in flight so a
   * spinner is a state and not a guess. It is NOT cached across openings: a stale
   * total on a money screen is the same class of mistake as a stale price.
   *
   * `dashSelection`/`dashBy`/`dashState` are the current period × dimension × state.
   * The period is computed on the CLIENT from the handset clock (period.ts) —
   * unlike the daily route, the summary route takes an explicit range, so a preset
   * like "this month" is a range the client must name.
   *
   * `dashDaily` is the /reports/daily result the today view renders as its per-bill
   * list (admin only); null when not the today view or while loading. `moneyVisible`
   * is the shop's `staff_money_visible`, read once via GET /shop and updated by the
   * summary's own answer, used to gate the header entry for staff (E2).
   */
  const [dashSummary, setDashSummary] = useState<SummaryScreen | null>(null);
  const [dashUnsent, setDashUnsent] = useState<UnsentLine | null>(null);
  const [dashSelection, setDashSelection] = useState<PeriodSelection>(() =>
    selectPreset("today", new Date()),
  );
  const [dashBy, setDashBy] = useState<string>("product");
  const [dashState, setDashState] = useState<string>("live");
  const [dashDaily, setDashDaily] = useState<DailyScreenModel | null>(null);
  const [dashCustom, setDashCustom] = useState<DashboardCustom>({ from: "", to: "", error: null });
  const [moneyVisible, setMoneyVisible] = useState<boolean | null>(null);
  /*
   * THE SHOP SETTINGS SCREEN (P1.23). `settingsScreen` is the rendered model, or
   * null while a request is in flight so a spinner is a state and not a guess.
   * `settingsShop` is the row a save DIFFS against — after a save it is the
   * server's re-read (the witnessed state), never what was sent. Neither is cached
   * across openings: a stale setting read as current is the same class of mistake
   * as a stale price, and settings has no offline write to cache for.
   */
  const [settingsScreen, setSettingsScreen] = useState<ShopSettingsScreen | null>(null);
  const [settingsShop, setSettingsShop] = useState<ShopSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  /*
   * THE GRADE-TIER ADMIN (S16 / P1.24), part of the settings sheet. `settingsTiers`
   * is the parsed list a create validates a duplicate against and the form derives
   * its active tiers from; `settingsTierScreen` is the rendered list; `tierRefusal`
   * is the last write's readable refusal (the deactivation count, a duplicate),
   * cleared on the next load; `tierBusy` disables the controls during a write. Not
   * cached: the tiers are read live with the shop, for the reason settings is not an
   * outbox kind.
   */
  const [settingsTiers, setSettingsTiers] = useState<AdminGradeTier[] | null>(null);
  const [settingsTierScreen, setSettingsTierScreen] = useState<TierAdminScreen | null>(null);
  const [settingsTierRefusal, setSettingsTierRefusal] = useState<string | null>(null);
  const [settingsTierBusy, setSettingsTierBusy] = useState(false);
  /**
   * THE TIER THE ⋯ MENU ACTS ON (P1.23 item 3 phase D). PAYLOAD, NOT VISIBILITY —
   * written WITH the `open_tier_actions` dispatch (`openTierMenu`) and by nothing
   * else, the same rule `pendingChange` states for the seller-change dialog: the
   * `tier_actions` sheet renders null when this is null, so a stack asking for the
   * menu with no target cannot draw actions for no tier.
   */
  const [tierMenuTarget, setTierMenuTarget] = useState<TierAdminRow | null>(null);
  /*
   * USER MANAGEMENT (P3.7), opened from an admin-only row inside settings.
   * `usersScreen` is the roster-or-message the read produced; `usersRefusal` is the
   * last write's readable refusal (a duplicate username, the last-active-admin lock,
   * an outage), cleared on the next load; `usersBusy` disables the controls during a
   * write; `userMenuTarget` is the row the ⋯ acts on — PAYLOAD, written WITH the
   * `open_user_actions` dispatch and by nothing else, the tier-menu rule. Not cached:
   * the roster is read live, for the reason user management is not offline work.
   */
  const [usersScreen, setUsersScreen] = useState<UsersScreenState | null>(null);
  const [usersRefusal, setUsersRefusal] = useState<string | null>(null);
  const [usersBusy, setUsersBusy] = useState(false);
  const [userMenuTarget, setUserMenuTarget] = useState<UserRow | null>(null);
  /*
   * PRODUCT MASTER DATA (P1.15, homed on the phone), opened from an admin-only row
   * inside settings. `productsScreen` is the three-list-or-message the read produced;
   * `productsRefusal` is the last write's readable refusal (a duplicate code, an
   * outage), cleared on the next load; `productsBusy` disables the controls during a
   * write; `productMenuTarget` is the product the ⋯ acts on — PAYLOAD, written WITH
   * the `open_product_actions` dispatch and by nothing else, the tier/user-menu rule.
   * Not cached: the admin list is read live (it must show the retired rows the yard
   * cache excludes), for the reason product management is not offline work.
   */
  const [productsScreen, setProductsScreen] = useState<ProductsScreenState | null>(null);
  const [productsRefusal, setProductsRefusal] = useState<string | null>(null);
  const [productsBusy, setProductsBusy] = useState(false);
  const [productMenuTarget, setProductMenuTarget] = useState<AdminProduct | null>(null);
  /*
   * THE ACCOUNT SCREEN (P1.23). `accountProfileState` is the profile (username +
   * role from /whoami, shop name from GET /shop), null while loading.
   * `passwordOutcome` is the result of the last password change, or null before
   * one — a successful one ends the session (see changePassword).
   */
  const [accountProfileState, setAccountProfile] = useState<AccountProfile | null>(null);
  const [passwordOutcome, setPasswordOutcome] = useState<PasswordChangeOutcome | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  /**
   * THE OUTCOME OF THE LAST PRICE SAVE, or null while the LIST is what the
   * prices sheet shows (P1.9).
   *
   * PAYLOAD, NOT VISIBILITY — the same rule `pendingChange` states below.
   * Whether the sheet is on screen is the stack's business; this only says
   * which of its two faces is drawn.
   *
   * IT IS CLEARED ON EVERY OPEN, never cached across them. An outcome sentence
   * is true about one write at one moment, and the one it would be wrong about
   * is the dangerous one: `stale` says "do not open a bill with this price yet",
   * which is a claim about a refresh that a later, successful one has already
   * fixed. A stale warning left on screen trains the yard to ignore it.
   */
  const [priceOutcome, setPriceOutcome] = useState<PriceScreen | null>(null);
  const [priceBusy, setPriceBusy] = useState(false);
  /**
   * A seller change the operator has been warned about but not yet confirmed.
   *
   * THIS IS PAYLOAD, NOT VISIBILITY. Whether the dialog is on screen is the
   * stack's business; this only carries what it says. The two are written
   * TOGETHER by `askSellerChange` and `dropSellerChange` below and by nothing
   * else, because a stack asking for the dialog while this is null would render a
   * seller change from "-" to "-".
   */
  const [pendingChange, setPendingChange] = useState<
    { to: Seller; impact: SellerChangeImpact } | null
  >(null);

  /** Show the seller-change warning. The ONE writer that sets it non-null. */
  const askSellerChange = useCallback(
    (to: Seller, impact: SellerChangeImpact): void => {
      setPendingChange({ to, impact });
      sheet("ask_seller_change");
    },
    [sheet],
  );

  /**
   * Put the warning away, confirmed or cancelled. The ONE writer that clears it.
   *
   * `ask_seller_change` is a REPLACE, so the stack under this dialog is empty and
   * closing it lands on the cart — not back on the picker. That is the product
   * decision: the operator has already chosen somebody, and what is being asked
   * is whether to move the lines. Popping back to the picker would make ยกเลิก
   * look like it did nothing to a person with a truck on the weighbridge.
   */
  const dropSellerChange = useCallback((): void => {
    setPendingChange(null);
    sheet("close_top");
  }, [sheet]);

  /*
   * THE bill's seller — derived, never stored twice. draft.seller_id is the
   * single source of truth (it is what survives a force-quit and what goes on
   * the wire); this only resolves it to something displayable. May be null if
   * the id is not in the fetched list, which CartScreen treats as "cannot save".
   */
  /**
   * The seller picker's list — the cache unioned with the local rows this device
   * created that the server has not sent back yet, resolved at read time
   * (`cart/pickerSellers.ts`). `options` is what the picker searches; `localIds`
   * flags which rows are not yet on the server. A local row is offered under its
   * LOCAL id, so a bill weighed against it carries that id and the send path
   * resolves it. `options` is structurally `Seller[]`, so it feeds the picker and
   * resolves the draft's seller exactly as the raw cache did.
   */
  const pickerSellers = useMemo(
    () =>
      mergeSellersForPicker(
        sellers,
        localSellers.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          phone: s.phone,
          grade: s.grade,
          server_seller_id: s.server_seller_id,
        })),
      ),
    [sellers, localSellers],
  );

  /**
   * Read the reserved-code holding for the strip and the add-seller refusal:
   * spendable and held counts (LOCAL), and the shop's `target` with when it last
   * arrived — null together until a refill has ever succeeded (never provisioned),
   * never defaulted. Called at boot, after every sync pass (a refill may have
   * moved it) and after a create. Stable (`[]`), so it never loops an effect.
   */
  const readReserve = useCallback(async () => {
    const store = sellerStoreRef.current;
    if (!store) return;
    const [spendable, reservations, target] = await Promise.all([
      store.spendableCount(),
      store.listReservations(),
      store.loadReserveTarget(),
    ]);
    setReserve({
      spendable,
      held: reservations.length,
      target: target?.target ?? null,
      targetAt: target?.target_at ?? null,
    });
  }, []);

  /**
   * Re-read the local sellers whenever the cache changes — boot (the cache loads)
   * and every refresh. A settle without a refresh needs no re-read: the row stays
   * `synced` and `listForPicker` keeps returning it, so the picker goes on
   * offering it (the window) until a refresh carries the server row into `sellers`
   * and the union drops it. Keyed on `sellers`, never on `localSellers`, so it
   * cannot loop; the reserve is read here too, and again after each pass/create.
   */
  useEffect(() => {
    const store = sellerStoreRef.current;
    if (!store) return;
    let cancelled = false;
    void (async () => {
      const rows = await store.listForPicker();
      if (!cancelled) setLocalSellers(rows);
    })();
    void readReserve();
    return () => {
      cancelled = true;
    };
  }, [sellers, readReserve]);

  const seller = useMemo(
    () => pickerSellers.options.find((s) => s.id === draft?.seller_id) ?? null,
    [pickerSellers.options, draft?.seller_id],
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
   * THE BUILD IS TOO OLD (426), device-global and STICKY: once the server has
   * refused this build's API version, nothing on this device makes it new again —
   * only an update, which is a new process that starts this back at false. So it
   * is never set back to false here, unlike sessionEnded/submitRefused which any
   * server answer clears. It is what the status strip turns into the calm "update
   * to continue" state, and it is NOT the sign-out path (see the pass handler).
   */
  const [appOutdated, setAppOutdated] = useState(false);
  // Mirror of `appOutdated` for `syncOnce` to read without taking it as a
  // dependency (which would restart the 4 s interval every time the flag moved).
  const appOutdatedRef = useRef(false);
  useEffect(() => {
    appOutdatedRef.current = appOutdated;
  }, [appOutdated]);

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
  // `signOutOpen` is gone for the reason the sheet stack's comment gives: it is
  // `topSheet(sheets) === "sign_out"` now, one value with the other six.
  const [signOutFailure, setSignOutFailure] = useState<SignOutFailure | null>(null);

  const [online, setOnline] = useState<boolean | null>(null);
  /**
   * THIS PERSON'S unsent bills — what they are waiting on a connection for.
   * Owner-filtered since P1.7 step 7; it used to be every account's.
   */
  const [pendingCount, setPendingCount] = useState(0);
  /**
   * Bills belonging to a known person who is not signed in here. They leave when
   * that person signs in on this handset, and never before — so this number is
   * NOT part of `pendingCount` and must never be added to it.
   */
  const [parkedForAnother, setParkedForAnother] = useState(0);
  /**
   * Bills whose owner is unknown. No sign-in releases them; separate from the
   * line above because the two need opposite instructions.
   */
  const [parkedUnknownOwner, setParkedUnknownOwner] = useState(0);
  /**
   * EVERY KIND OF WORK THIS PERSON STILL OWES THE SERVER, off the registry.
   *
   * THE ONE VALUE THE SIGN-OUT GATE AND THE SIGN-OUT SHEET BOTH READ, and
   * deliberately not the one the strip's `pending` line reads.
   *
   * The refusal exists because an unsynced bill is cash already out of the till
   * and a load already tipped on the pile, so the person who wrote it should not
   * walk away from it. That argument reaches every bill THEY are responsible
   * for, parked or not — which is why `bill_send`'s count is `mine + mineBlocked`
   * while `pendingCount` above is `mine` alone. It reaches no further: another
   * account's rows cannot drain under this person and never could, so refusing
   * over them would strand the device without protecting anything, and every
   * kind's `owed`/`owedCount` carries its own owner filter.
   *
   * ---------------------------------------------------------------------------
   * IT WAS `ownUnsentCount`, ONE NUMBER OFF `unsentBreakdown`, AND TWO THINGS
   * WERE WRONG WITH IT
   * ---------------------------------------------------------------------------
   * It counted `local_bills` and nothing else, so once `seller_create` landed a
   * device owing a seller create and no bills signed out cleanly and left the
   * work behind. And the SHEET was handed `pendingCount` while the GATE was
   * handed this — two different numbers for one decision, so a single bill
   * parked on missing master data drew the confirmation card with a working-
   * looking ออกจากระบบ button over a gate that answered `refused_pending`,
   * which `onSignOut` below handles with a bare return. Nothing on the screen.
   *
   * Both are fixed by there being ONE value with ONE producer: the runner walks
   * the registry, and no site here sums it.
   */
  const [owed, setOwed] = useState<OwedByKind>(NOTHING_OWED);
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
  /** Which shop this device belongs to. A different lifetime — see the store. */
  const shopStoreRef = useRef<SqliteShopStore | null>(null);
  const masterStoreRef = useRef<SqliteMasterStore | null>(null);
  /**
   * The SAME `SqliteLocalSellerStore` instance the engine holds, captured so the
   * picker can read its rows (`listForPicker`) and the bill build can ask whether
   * a chosen seller is a local one (`getLocalSeller`). One instance on one
   * driver — a second would be a second connection able to see a different
   * committed state than the queue that drains it.
   */
  const sellerStoreRef = useRef<SqliteLocalSellerStore | null>(null);
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
   *
   * ---------------------------------------------------------------------------
   * IT NOW REPORTS WHAT HAPPENED TO THE PRODUCT LIST (P1.9), AND THE THIRD VALUE
   * IS THE POINT
   * ---------------------------------------------------------------------------
   * Every caller before P1.9 was a fire-and-forget `void refreshMaster(t)`: the
   * cache getting newer is a background convenience and a failed refresh is
   * already visible as a growing age on the strip. The price screen is the one
   * caller for which that is not true. A price the server has taken and this
   * device has NOT re-read means the next bill written here is priced from the
   * old number and stamped by the server with the new one — `unit_price !=
   * list_price`, byte-identical to a deliberate override and unrecoverable
   * afterwards (lessons/cached-master-data-is-a-price-claim.md).
   *
   * `skipped` is a REAL case and not a defensive third arm: the guard on the
   * next line returns immediately when a refresh is already in flight, which is
   * ordinary — the picker, the boot path and the draft path all start one. A
   * save landing inside that window would otherwise report success over a list
   * that was never re-read, silently, which is the exact shape this whole file
   * spends its comments refusing.
   *
   * NOTHING ELSE CHANGES. The existing callers ignore the value, the two lists
   * are still fetched and saved independently, and a failure is still never
   * destructive.
   */
  const refreshMaster = useCallback(async (token: string): Promise<CacheRefresh> => {
    const store = masterStoreRef.current;
    if (!store || refreshingRef.current) return "skipped";
    refreshingRef.current = true;
    /*
     * THE PRODUCT HALF ONLY. `answered` below is true if EITHER list came back,
     * which is right for the online/offline decision and wrong for this one:
     * prices live on products, and a successful seller fetch says nothing about
     * whether the tier map on this device is current.
     */
    let productsRefreshed = false;
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
        // Set AFTER the store write, never before it: what the price screen
        // needs to know is that the rows are on disk, not that a fetch returned.
        productsRefreshed = true;
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
      /*
       * THE THIRD LIST (S16 / P1.24). Fetched and saved on its own, like the two
       * above and for the same reason: an independent request that can fail
       * alone. It does NOT touch `productsRefreshed` — that signal is about the
       * price MAP being current after a save, which lives on products; the tier
       * SET is a different thing and a stale one degrades a label, not a price.
       * A success still counts as `answered` (the server replied), and a 401 is
       * still the session ending.
       */
      try {
        const gt = await fetchGradeTiers(token);
        const at = nowIso();
        await store.saveGradeTiers(gt, at);
        setGradeTiers(gt);
        setGradeTiersFetchedAt(at);
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
      return productsRefreshed ? "refreshed" : "failed";
    }
    if (answered) {
      setOnline(true);
      setSessionEnded(false);
      return productsRefreshed ? "refreshed" : "failed";
    }
    if (failed) setOnline(false);
    return "failed";
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
        const shopStore = new SqliteShopStore(driver);
        if (cancelled) return;
        billStoreRef.current = billStore;
        draftStoreRef.current = draftStore;
        masterStoreRef.current = masterStore;
        identityStoreRef.current = identityStore;
        shopStoreRef.current = shopStore;

        // Created ONCE, on the SAME driver, and captured so the picker and the
        // bill build read the exact rows the engine's queue drains.
        const sellerStore = SqliteLocalSellerStore.open(driver);
        sellerStoreRef.current = sellerStore;

        engineRef.current = new SyncEngine({
          store: billStore,
          transport: new HttpTransport({
            baseUrl: API_BASE_URL,
            getToken: () => Promise.resolve(tokenRef.current),
            // Every bill send and void carries the API-contract version header,
            // so the server can refuse a too-old build with 426 instead of
            // silently accepting a request it no longer means the same way.
            fetchImpl: withClientVersion((input, init) => fetch(input, init)),
          }),
          /*
           * THE SELLER KIND, wired to the SAME driver as the bill store —
           * these are two tables in one file, and a second driver would be a
           * second connection able to see a different committed state.
           *
           * NO open() OF ITS OWN, for the reason the identity store above
           * gives: the tables are created by initConnection, which the three
           * stores above have already run through this driver.
           *
           * WHAT THIS TURNS ON. The engine drains a local seller and tops the
           * code holding up, the picker OFFERS the local rows (the union below),
           * and the add-seller sheet CREATES them — `createSeller` above writes a
           * `local_sellers` row and enqueues the `seller_create` kind (P1.8b),
           * with no online path beside it.
           */
          sellerStore,
          /*
           * WHICH INSTALLATION THIS IS, on the SAME driver again — the identity
           * and the codes reserved against it are two tables in one file, and a
           * device that read its id through a second connection could see a
           * different committed state from the holding that id owns.
           *
           * `ensure` is called by the pass, not here: minting on boot would put
           * a device id in the database of every handset that opens the app,
           * including ones that never reach a server.
           */
          deviceStore: new SqliteDeviceStore(driver, deviceIds),
          sellerTransport: new HttpSellerTransport({
            baseUrl: API_BASE_URL,
            getToken: () => Promise.resolve(tokenRef.current),
            // The seller-create and reservation requests carry the version header
            // too — the whole client identifies itself, not just the bill path.
            fetchImpl: withClientVersion((input, init) => fetch(input, init)),
          }),
          clock: systemClock,
          backoffBaseMs: 2000,
          backoffMaxMs: 30000,
        });

        const recovered = await engineRef.current.recoverInterrupted();
        // A map keyed by kind since P1.18 stage 3 — the boot sweeps THROUGH
        // the registry. The toast counts every kind's rows.
        //
        // SUPERSEDED 2026-08-25: this said "today only the send kind has
        // durable in-flight state to sweep", which stopped being true the day
        // `seller_create` landed. That kind's `claim` writes `syncing` to disk
        // and its queue reads only `pending`, so it sweeps for real — and a
        // stranded local seller is counted here exactly as a stranded bill is.
        const recoveredCount = Object.values(recovered).reduce(
          (n, ids) => n + ids.length,
          0,
        );
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
        setGradeTiers(cache.gradeTiers);
        setProductsFetchedAt(cache.productsFetchedAt);
        setSellersFetchedAt(cache.sellersFetchedAt);
        setGradeTiersFetchedAt(cache.gradeTiersFetchedAt);
        setProductsFromOtherShop(cache.productsNotThisShop);
        setSellersFromOtherShop(cache.sellersNotThisShop);
        // Which shop this device is. Read before the token, because with no
        // shop there is nothing to sign in TO and the setup screen is what the
        // operator must be shown.
        setShop((await shopStore.load())?.tenant_id ?? null);
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
        // The API base URL is DIAGNOSTIC, not operator information (P1.23 item 3 phase C);
        // it moved to the settings screen's diagnostics. What is left is operator-facing.
        setStatus(
          `ในเครื่อง: สินค้า ${String(cache.products.length)} · ผู้ขาย ${String(cache.sellers.length)} ราย` +
            (recoveredCount > 0 ? ` · กู้คืน ${String(recoveredCount)} บิลที่ค้าง` : "") +
            (restored ? ` · พบบิลค้างไว้ ${String(restored.lines.length)} รายการ` : ""),
        );

        // Only NOW does the network get involved, and nothing above depends on
        // it. A failure here leaves the cache exactly as it was and says so.
        if (token !== null) void refreshMaster(token);
        // Seed the money-visibility toggle for the header entry gate (E2). Offline
        // it stays null, which hides the dashboard entry for a staff session.
        if (token !== null) void refreshMoneyVisible();
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
     * THE UNSENT TOTAL IS NOW FOUR NUMBERS, AND THE ONE THE OPERATOR READS IS
     * THEIRS ALONE — P1.7 step 7.
     *
     * It was `listByState('pending') + listByState('syncing')`, which carries
     * its own `sync_state = ?` predicate and never gained the owner filter the
     * send queue did. So the strip and the sign-out refusal both showed a count
     * including bills belonging to somebody else: a number that would not go
     * down however long the operator waited, because nothing they could do
     * released another person's rows and no connection drained them. It read as
     * a bad signal or a stuck queue and they stood there expecting it to clear.
     *
     * `unsentBreakdown` splits the same rows by WHAT EACH IS WAITING FOR, in one
     * statement so the parts reconcile with the whole. `pendingCount` is now
     * `mine` only. `mineBlocked` continues to be surfaced through
     * waitingOnMasterData below, which already had its own sentence and its own
     * retry.
     *
     * listByState is still called here, and now only for the LISTS — the bill
     * cards, the latest bill, the void-refusal count. Those are about what
     * EXISTS on the device and are correct unfiltered: a bill the operator can
     * see on the card list is a bill they may need to look at, whoever owns it.
     */
    const unsent = await store.unsentBreakdown();
    setPendingCount(unsent.mine);
    setParkedForAnother(unsent.otherAccount);
    setParkedUnknownOwner(unsent.unknownOwner);
    /*
     * THE WHOLE DEBT, OFF THE REGISTRY, ONCE PER TICK.
     *
     * `unsentBreakdown` above is the bill store's answer about the bill store,
     * and since `seller_create` landed it is no longer the whole answer — the
     * completeness its own type claims is scoped to `local_bills` and says so.
     * The gate, the sheet and the strip all take THIS value, so the three
     * renderers of one fact read one number rather than three that can drift.
     *
     * Before the boot block has built the engine there is nothing to ask, and
     * the map stays NOTHING_OWED. That window is the one the app already has
     * for every count here: the ticker below is gated on `ready`, which the
     * boot sets AFTER the engine, so nothing renders a gate decision from it.
     */
    const engine = engineRef.current;
    if (engine) setOwed(await engine.owedByKind());
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
    // RE-PROBE while the build is flagged too old (findings 4-5): a 426 halted
    // every kind, so retract the halts before this pass so it re-attempts. It
    // either re-halts (still 426) or drains (a floor lowered after a bad raise) —
    // and outdatedAfterPass below clears the flag on that drain. The queued work
    // is untouched either way. Read from a ref so this callback is not re-created
    // when the flag moves (which would restart the 4 s interval).
    if (appOutdatedRef.current) engine.retractOutdatedHalt();
    const r = await engine.runOnce();
    // A pass tops the holding up (topUpReservations) and persists the target, so
    // refresh the reserve for the strip and the add-seller refusal.
    void readReserve();

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

    /*
     * THE BUILD IS TOO OLD (426) — checked ABOVE the session case, because a 426
     * refuses even the sign-in the session case would offer. STICKY and never
     * cleared: nothing on this device makes an old build new, only an update (a
     * new process). NOT setSessionEnded and NOT the sign-out path — signing in
     * returns the same too-old build. online = true, because the server answered
     * promptly; calling this an outage would be the 401/403 mistake again. The
     * queued bills are untouched (markClientOutdated left them pending) and send
     * unchanged once the app is updated.
     */
    // THE BUILD-TOO-OLD FLAG, DERIVED EVERY PASS (findings 4-5), not a sticky
    // latch: a 426 sets it, a definitive non-426 answer clears it, no answer keeps
    // it. This is what lets a device recover when a bad floor raise is rolled back
    // — the derivation and its defence live in outdatedAfterPass.
    setAppOutdated((was) => outdatedAfterPass(was, r));
    if (r.clientOutdated > 0) {
      // Every request 426s: nothing else this pass matters. online = true (the
      // server answered), and NOT setSessionEnded — a 426 is not a session end.
      setOnline(true);
      return;
    }

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
  }, [refresh, readReserve]);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => void syncOnce(), 4000);
    return () => clearInterval(t);
  }, [ready, syncOnce]);

  /* ------------------------------------------------------- the dashboard -- */

  /*
   * THE DASHBOARD MODEL IS DERIVED, never stored. It is the pure builder's answer
   * over (role, the selected period, the summary the server returned, the unsent
   * line) — so tapping the custom chip re-frames the screen with no fetch, and a
   * refresh of any input fixes the whole screen at once. Null while the summary is
   * in flight (dashSummary null) so a spinner is a state, not a guess.
   */
  const dashModel = useMemo(
    () =>
      dashSummary === null
        ? null
        : dashboardScreen({
            role,
            selection: dashSelection,
            summary: dashSummary,
            unsent: dashUnsent,
          }),
    [role, dashSelection, dashSummary, dashUnsent],
  );

  /**
   * The `total_amount` of every unsent bill on THIS device (`sync_state` pending or
   * syncing) — the SAME predicate `unsentBreakdown` partitions, not a new count. The
   * unsent line (E4) counts and Decimal-sums these; both come from one list so they
   * reconcile. No store change: `listByState` already exists and refresh() uses it.
   */
  const readUnsentAmounts = useCallback(async (): Promise<(string | null)[]> => {
    const store = billStoreRef.current;
    if (!store) return [];
    const [pending, syncing] = await Promise.all([
      store.listByState("pending"),
      store.listByState("syncing"),
    ]);
    return [...pending, ...syncing].map((b) => b.payload.total_amount);
  }, []);

  /**
   * Read the shop's `staff_money_visible` once, for the header entry gate (E2). A
   * failed or absent read leaves it as it was — offline it stays null, which HIDES
   * the entry for staff (treated as OFF). Nothing is authorised on it: the route
   * re-checks the toggle on every request; this only decides whether to draw a
   * control a staff session would otherwise be refused.
   */
  const refreshMoneyVisible = useCallback(async (): Promise<void> => {
    const t = tokenRef.current;
    if (t === null) {
      setMoneyVisible(null);
      return;
    }
    const r = await fetchShop(t);
    if (r.kind === "ok") setMoneyVisible(readMoneyVisible(r.body));
  }, []);

  /**
   * READ THE PERIOD SUMMARY AND, ON THE TODAY VIEW, THE DAY'S BILL LIST.
   *
   * The unsent line is LOCAL and available offline; the summary and the bill list
   * are the server's. A 401 ends the session and offline sets `online` false, as the
   * daily read did. `submitRefused` is NOT touched: reading a summary is not
   * submitting a bill (the 403 lesson). The toggle is learned from the summary's own
   * answer — a `staff_money_hidden` 403 means OFF (so the entry drops next menu
   * draw), a successful STAFF summary means the owner turned it ON.
   */
  const loadDashboard = useCallback(
    async (selection: PeriodSelection, by: string, state: string): Promise<void> => {
      const t = tokenRef.current;
      const unsent = unsentLine(await readUnsentAmounts());
      setDashUnsent(unsent);
      if (t === null) {
        setDashDaily(null);
        setDashSummary(summaryScreen({ kind: "no_token" }));
        return;
      }
      setDashSummary(null); // spinner while the summary is in flight
      setDashDaily(null);
      const result = await fetchSummary(t, {
        from_date: selection.from_date,
        to_date: selection.to_date,
        by,
        state,
      });
      const summary = summaryScreen(result);
      setDashSummary(summary);

      if (result.kind === "unreachable") {
        setOnline(false);
        return;
      }
      setOnline(true);
      if (result.kind === "http" && result.status === 401) setSessionEnded(true);
      else if (result.kind === "ok") setSessionEnded(false);
      if (result.kind === "http" && result.status === 403 && result.code === STAFF_MONEY_HIDDEN) {
        setMoneyVisible(false);
      } else if (result.kind === "ok" && role === "staff") {
        setMoneyVisible(true);
      }

      // The today view (admin/unknown) also shows the day's per-bill list, from the
      // daily route — which has no own-bills variant, so staff never reach here
      // (dashboardView.billListSlot returns staff_unavailable for them).
      if (summary.kind === "summary" && selection.isToday && role !== "staff") {
        const dailyResult = await fetchDailyReport(t, null);
        setDashDaily(dailyScreen(dailyResult));
      }
    },
    [role, readUnsentAmounts],
  );

  const openDashboard = useCallback(() => {
    // Always today × product × live when opened. A period the owner switched to
    // earlier is not what they mean by "open the takings".
    const selection = selectPreset("today", new Date());
    setDashSelection(selection);
    setDashBy("product");
    setDashState("live");
    setDashCustom({ from: "", to: "", error: null });
    sheet("open_dashboard");
    void loadDashboard(selection, "product", "live");
  }, [loadDashboard, sheet]);

  const pickPreset = useCallback(
    (preset: PresetKind) => {
      if (preset === "custom") {
        // Show the date inputs and wait for ดูช่วงนี้; do not fetch until a valid
        // range is entered. The derived model reflects the custom chip at once.
        setDashSelection((s) => ({ ...s, preset: "custom" }));
        return;
      }
      const selection = selectPreset(preset, new Date());
      setDashSelection(selection);
      setDashCustom({ from: "", to: "", error: null });
      void loadDashboard(selection, dashBy, dashState);
    },
    [loadDashboard, dashBy, dashState],
  );

  const pickBy = useCallback(
    (by: string) => {
      setDashBy(by);
      void loadDashboard(dashSelection, by, dashState);
    },
    [loadDashboard, dashSelection, dashState],
  );

  const pickState = useCallback(
    (state: string) => {
      setDashState(state);
      void loadDashboard(dashSelection, dashBy, state);
    },
    [loadDashboard, dashSelection, dashBy],
  );

  const applyCustom = useCallback(() => {
    const selection = selectCustom(dashCustom.from.trim(), dashCustom.to.trim(), new Date());
    if ("kind" in selection) {
      setDashCustom((c) => ({ ...c, error: selection.reason }));
      return;
    }
    setDashCustom((c) => ({ ...c, error: null }));
    setDashSelection(selection);
    void loadDashboard(selection, dashBy, dashState);
  }, [loadDashboard, dashCustom.from, dashCustom.to, dashBy, dashState]);

  /* ------------------------------------------------------------ prices -- */

  /**
   * THE PRICE LIST AS THE SHEET DRAWS IT, from the cache this device already
   * holds. P1.9.
   *
   * NO FETCH. Opening this screen asks the server nothing, and that is a
   * decision rather than an omission: these are the exact rows the cart screen
   * prices bills from, so showing anything else would put a number on the
   * prices screen that the bill screen disagrees with. The AGE of the list is
   * already the master-data strip's job, and the refresh after a save is where
   * currency is bought.
   *
   * `haveProducts` distinguishes "this device has never downloaded a product
   * list" from "this shop has no products" — the same distinction the picker's
   * `neverFetched` draws, and for the same reason: they are the same empty
   * screen with opposite fixes.
   *
   * THE TIERS COME FROM the shop's fetched grade tiers (S16 / P1.24) and not from
   * the keys of `prices`, which is what makes an UNPRICED tier visible at all.
   * Iterating the map would omit a tier nobody has priced, and the screen would
   * then be silent about the one state that stops a bill (424 product_price_unset).
   * The set is per-tenant now — it used to be the hardcoded `GRADES` — so
   * `haveGradeTiers` gates the screen the way `haveProducts` does: a tier set this
   * device has not fetched cannot be listed. `grade` on the row is the tier CODE,
   * which is the price-map key; the shop's display NAME is applied by the surfaces
   * that read a seated seller, not here.
   */
  const priceList = useMemo<PriceScreen>(() => {
    const rows: PriceProduct[] = products.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      tiers: gradeTiers.map((t) => ({
        grade: t.code,
        name: t.name,
        // ?? null, never ?? "0.00" and never another tier: an absent row is an
        // absent price. lessons/fallback-default-is-a-wrong-number.md.
        price: p.prices[t.code] ?? null,
      })),
    }));
    return priceListScreen({
      role,
      products: rows,
      haveProducts: freshness.haveProducts,
      haveGradeTiers: gradeTiersFetchedAt !== null,
    });
  }, [products, gradeTiers, gradeTiersFetchedAt, role, freshness.haveProducts]);

  const openPrices = useCallback(() => {
    // Cleared BEFORE the transition, so the list is what the sheet mounts on
    // and no previous outcome is ever the first thing read.
    setPriceOutcome(null);
    sheet("open_prices");
  }, [sheet]);

  /* ---------------------------------------------------- shop settings (P1.23) -- */

  /**
   * READ THE SHOP'S SETTINGS. Online only — settings is not an outbox kind and has
   * no cache of its own, so with no network the screen says so and draws no field
   * (shopSettingsScreen's unreachable branch). A 401 ends the session, exactly as
   * the daily read does.
   */
  const loadSettings = useCallback(async (): Promise<void> => {
    const t = tokenRef.current;
    if (t === null) {
      setSettingsShop(null);
      setSettingsTiers(null);
      setSettingsTierScreen(null);
      setSettingsScreen(shopSettingsScreen({ kind: "no_token" }, role, []));
      return;
    }
    setSettingsScreen(null);
    setSettingsShop(null);
    setSettingsTierScreen(null);
    setSettingsTierRefusal(null);
    /*
     * TWO READS OVER ONE SESSION (S16 / P1.24). The /shop form needs the shop's
     * ACTIVE tiers — its default-grade options and the F2 one-tier decision — and
     * the tier list needs ALL of them, so the settings screen is a MESSAGE unless
     * BOTH reads land and both parse. A partial settings screen is a claim the data
     * cannot back, exactly what this surface refuses offline.
     */
    const [shopResult, tierResult] = await Promise.all([fetchShop(t), fetchGradeTiersAdmin(t)]);
    const tiers = tierResult.kind === "ok" ? readGradeTiers(tierResult.body) : null;

    if (shopResult.kind === "ok" && tiers !== null) {
      const active = tiers.filter((x) => x.is_active).map((x) => ({ code: x.code, name: x.name }));
      setSettingsShop(readShopSettings(shopResult.body));
      setSettingsTiers(tiers);
      setSettingsScreen(shopSettingsScreen(shopResult, role, active));
      setSettingsTierScreen(tierAdminScreen(tiers, role));
      setOnline(true);
      setSessionEnded(false);
      return;
    }

    // A failure, worded from whichever read failed. The shop read ranks first; a
    // tier read that answered 200 with an unreadable body is the "cannot read"
    // server screen (there is no transport failure to word).
    setSettingsTiers(null);
    if (shopResult.kind === "ok" && tierResult.kind === "ok") {
      setSettingsScreen(unreadableSettingsScreen());
      setOnline(true);
      setSessionEnded(false);
      return;
    }
    const governing: ShopFetch =
      shopResult.kind !== "ok"
        ? shopResult
        : tierResult.kind === "http"
          ? { kind: "http", status: tierResult.status, code: null }
          : tierResult; // unreachable | no_token (no_token unreachable here — token checked)
    setSettingsScreen(shopSettingsScreen(governing, role, []));
    if (governing.kind === "unreachable") {
      setOnline(false);
      return;
    }
    setOnline(true);
    if (governing.kind === "http" && governing.status === 401) setSessionEnded(true);
  }, [role]);

  const openSettings = useCallback(() => {
    setSettingsSaving(false);
    sheet("open_settings");
    void loadSettings();
  }, [loadSettings, sheet]);

  /**
   * SAVE, THEN RENDER WHAT CAME BACK. PATCH /shop returns the re-read row, so a
   * success re-renders the form from the RESPONSE — the witnessed state, never the
   * request (shopSaveResult). A refusal or outage shows its message; a 401 ends the
   * session. NOTHING queues: a settings write is not offline work.
   */
  const saveSettings = useCallback(
    async (patch: ShopPatch): Promise<void> => {
      const t = tokenRef.current;
      if (t === null) {
        setSettingsScreen(shopSettingsScreen({ kind: "no_token" }, role, []));
        setSessionEnded(true);
        return;
      }
      setSettingsSaving(true);
      const result = await patchShop(t, patch);
      setSettingsSaving(false);
      const saved = shopSaveResult(result);
      if (saved.kind === "saved") {
        // A /shop save does not change the tier SET, so the form re-reads from the
        // tiers already held — no second round trip for a list that did not move.
        const active = (settingsTiers ?? [])
          .filter((x) => x.is_active)
          .map((x) => ({ code: x.code, name: x.name }));
        setSettingsShop(saved.shop);
        setSettingsScreen(formScreen(saved.shop, role, active));
        setOnline(true);
        setSessionEnded(false);
        return;
      }
      setSettingsScreen(saved.screen);
      if (result.kind === "unreachable") setOnline(false);
      else {
        setOnline(true);
        if (result.kind === "http" && result.status === 401) setSessionEnded(true);
      }
    },
    [role, settingsTiers],
  );

  /**
   * ONE TIER WRITE — declare, rename, or (de)activate. The server is authoritative,
   * so on success the WHOLE list is re-read (loadSettings) rather than patched in
   * place: a create shifts sort order, and a deactivate changes which tier may be
   * deactivated next. A refusal (the F4 count, a duplicate, an outage) shows as a
   * readable sentence in the tier section; a 401 ends the session. NOTHING queues —
   * tier admin is not offline work, the same as the /shop save.
   */
  const runTierAction = useCallback(
    async (action: (token: string) => Promise<GradeTierFetch>): Promise<void> => {
      const t = tokenRef.current;
      if (t === null) {
        setSessionEnded(true);
        return;
      }
      setSettingsTierBusy(true);
      setSettingsTierRefusal(null);
      const result = await action(t);
      const outcome = tierActionOutcome(result);
      setSettingsTierBusy(false);
      if (outcome.kind === "ok") {
        setOnline(true);
        setSessionEnded(false);
        await loadSettings();
        return;
      }
      if (outcome.kind === "session") {
        setSessionEnded(true);
        return;
      }
      if (result.kind === "unreachable") setOnline(false);
      else setOnline(true);
      setSettingsTierRefusal(outcome.message);
    },
    [loadSettings],
  );

  const addTier = useCallback(
    (body: GradeTierCreateBody) => void runTierAction((t) => createGradeTier(t, body)),
    [runTierAction],
  );
  const renameTier = useCallback(
    (id: string, name: string) => void runTierAction((t) => patchGradeTier(t, id, { name })),
    [runTierAction],
  );
  const deactivateTier = useCallback(
    (id: string) => void runTierAction((t) => patchGradeTier(t, id, { is_active: false })),
    [runTierAction],
  );
  const reactivateTier = useCallback(
    (id: string) => void runTierAction((t) => patchGradeTier(t, id, { is_active: true })),
    [runTierAction],
  );
  const reorderTiers = useCallback(
    (order: readonly string[]) => void runTierAction((t) => reorderGradeTiers(t, order)),
    [runTierAction],
  );
  /**
   * OPEN THE ⋯ MENU for a tier row (P1.23 item 3 phase D). The ONE writer of
   * `tierMenuTarget`, setting it WITH the dispatch so the sheet always has its tier.
   * The sheet's own actions (rename / retire) call the tier handlers above and close;
   * the reorder ↑ ↓ stay on the row and never reach here.
   */
  const openTierMenu = useCallback(
    (row: TierAdminRow) => {
      setTierMenuTarget(row);
      sheet("open_tier_actions");
    },
    [sheet],
  );

  /* ------------------------------------------------- user management (P3.7) -- */

  /**
   * READ THE ROSTER. Online only — like settings, this surface has no offline cache
   * and no outbox, so with no network it says so and draws no list. The self id
   * (`readTokenUserId`) marks the signed-in row and keeps its destructive actions
   * off it; a token this build cannot parse marks no self, which the server still
   * backs (cannot_deactivate_self). A 401 ends the session.
   */
  const loadUsers = useCallback(async (): Promise<void> => {
    const t = tokenRef.current;
    if (t === null) {
      setUsersScreen(usersScreenState({ kind: "no_token" }, role, null));
      return;
    }
    setUsersScreen(null);
    setUsersRefusal(null);
    const result = await fetchUsers(t);
    setUsersScreen(usersScreenState(result, role, readTokenUserId(t)));
    if (result.kind === "unreachable") {
      setOnline(false);
      return;
    }
    setOnline(true);
    if (result.kind === "http" && result.status === 401) setSessionEnded(true);
  }, [role]);

  const openUsers = useCallback(() => {
    setUsersBusy(false);
    setUsersRefusal(null);
    sheet("open_users");
    void loadUsers();
  }, [loadUsers, sheet]);

  /**
   * ONE USER WRITE — create, deactivate, activate, or reset a password. The server
   * is authoritative, so on success the WHOLE roster is re-read (loadUsers) rather
   * than patched in place: a create adds a row, a deactivate changes which rows may
   * be deactivated next. A refusal (a duplicate username, the last-active-admin
   * lock, an outage) shows as a readable sentence; a 401 ends the session. NOTHING
   * queues — user management is not offline work, the same as the /shop save.
   */
  const runUserAction = useCallback(
    async (action: (token: string) => Promise<UserFetch>): Promise<void> => {
      const t = tokenRef.current;
      if (t === null) {
        setSessionEnded(true);
        return;
      }
      setUsersBusy(true);
      setUsersRefusal(null);
      const result = await action(t);
      const outcome = userWriteOutcome(result);
      setUsersBusy(false);
      if (outcome.kind === "ok") {
        setOnline(true);
        setSessionEnded(false);
        await loadUsers();
        return;
      }
      if (outcome.kind === "session") {
        setSessionEnded(true);
        return;
      }
      if (result.kind === "unreachable") setOnline(false);
      else setOnline(true);
      setUsersRefusal(outcome.message);
    },
    [loadUsers],
  );

  const addUser = useCallback(
    (body: UserCreateBody) => void runUserAction((t) => createUser(t, body)),
    [runUserAction],
  );
  const deactivateUserAccount = useCallback(
    (id: string) => void runUserAction((t) => deactivateUser(t, id)),
    [runUserAction],
  );
  const reactivateUserAccount = useCallback(
    (id: string) => void runUserAction((t) => activateUser(t, id)),
    [runUserAction],
  );
  const resetUserAccountPassword = useCallback(
    (id: string, newPassword: string) =>
      void runUserAction((t) => resetUserPassword(t, id, { new_password: newPassword })),
    [runUserAction],
  );
  /**
   * OPEN THE ⋯ MENU for a roster row (P3.7). The ONE writer of `userMenuTarget`,
   * setting it WITH the dispatch so the sheet always has its user, the tier-menu rule.
   */
  const openUserMenu = useCallback(
    (row: UserRow) => {
      setUserMenuTarget(row);
      sheet("open_user_actions");
    },
    [sheet],
  );

  /* ------------------------------------------ product master data (P1.15) -- */

  /**
   * READ THE THREE LISTS — products, categories, units — over one session. Online
   * only, like settings and users: this surface has no offline cache and no outbox,
   * AND it must show the RETIRED rows the yard cache deliberately excludes, so with
   * no network it says so and draws no list. The screen is a MESSAGE unless all three
   * land (productsScreenState), because a product list cannot be grouped without its
   * categories nor add one without a unit. A 401 ends the session.
   */
  const loadProducts = useCallback(async (): Promise<void> => {
    const t = tokenRef.current;
    if (t === null) {
      setProductsScreen(
        productsScreenState({ kind: "no_token" }, { kind: "no_token" }, { kind: "no_token" }, role),
      );
      return;
    }
    setProductsScreen(null);
    setProductsRefusal(null);
    const [pr, cr, ur] = await Promise.all([
      fetchProductsAdmin(t),
      fetchCategoriesAdmin(t),
      fetchUomsAdmin(t),
    ]);
    setProductsScreen(productsScreenState(pr, cr, ur, role));
    // The device-global flags follow the FIRST read that failed (products, then
    // categories, then units), the same ranking productsScreenState words the screen by.
    const governing: ProductFetch = pr.kind !== "ok" ? pr : cr.kind !== "ok" ? cr : ur;
    if (governing.kind === "unreachable") {
      setOnline(false);
      return;
    }
    setOnline(true);
    if (governing.kind === "http" && governing.status === 401) setSessionEnded(true);
  }, [role]);

  const openProducts = useCallback(() => {
    setProductsBusy(false);
    setProductsRefusal(null);
    sheet("open_products");
    void loadProducts();
  }, [loadProducts, sheet]);

  /**
   * ONE PRODUCT-AREA WRITE — create/edit/deactivate a product, or add/rename/(de)activate
   * a category or unit. The server is authoritative, so on success the WHOLE admin
   * list is re-read (loadProducts). AND `refreshMaster` runs, so THIS device's yard
   * cart reflects the new/edited product at once — the price-save flow's move
   * (savePrice). It does NOTHING for ANOTHER handset: device B sees the change only at
   * its next refreshMaster (boot / sign-in / a price write), never immediately — there
   * is no push. A refusal (a duplicate code, an outage) shows as a readable sentence; a
   * 401 ends the session. NOTHING queues — product management is not offline work.
   */
  const runProductAction = useCallback(
    async (action: (token: string) => Promise<ProductFetch>): Promise<void> => {
      const t = tokenRef.current;
      if (t === null) {
        setSessionEnded(true);
        return;
      }
      setProductsBusy(true);
      setProductsRefusal(null);
      const result = await action(t);
      const outcome = productWriteOutcome(result);
      setProductsBusy(false);
      if (outcome.kind === "ok") {
        setOnline(true);
        setSessionEnded(false);
        await Promise.all([loadProducts(), refreshMaster(t)]);
        return;
      }
      if (outcome.kind === "session") {
        setSessionEnded(true);
        return;
      }
      if (result.kind === "unreachable") setOnline(false);
      else setOnline(true);
      setProductsRefusal(outcome.message);
    },
    [loadProducts, refreshMaster],
  );

  const createProductAction = useCallback(
    (body: ProductCreateBody) => void runProductAction((t) => createProduct(t, body)),
    [runProductAction],
  );
  const editProductAction = useCallback(
    (id: string, body: ProductPatchBody) => void runProductAction((t) => patchProduct(t, id, body)),
    [runProductAction],
  );
  const deactivateProductAction = useCallback(
    (id: string) => void runProductAction((t) => deactivateProduct(t, id)),
    [runProductAction],
  );
  const reactivateProductAction = useCallback(
    (id: string) => void runProductAction((t) => activateProduct(t, id)),
    [runProductAction],
  );
  const createEntityAction = useCallback(
    (kind: EntityKind, body: EntityCreateBody) =>
      void runProductAction((t) => (kind === "category" ? createCategory(t, body) : createUom(t, body))),
    [runProductAction],
  );
  const renameEntityAction = useCallback(
    (kind: EntityKind, id: string, name: string) =>
      void runProductAction((t) =>
        kind === "category" ? renameCategory(t, id, { name }) : renameUom(t, id, { name }),
      ),
    [runProductAction],
  );
  const deactivateEntityAction = useCallback(
    (kind: EntityKind, id: string) =>
      void runProductAction((t) => (kind === "category" ? deactivateCategory(t, id) : deactivateUom(t, id))),
    [runProductAction],
  );
  const reactivateEntityAction = useCallback(
    (kind: EntityKind, id: string) =>
      void runProductAction((t) => (kind === "category" ? activateCategory(t, id) : activateUom(t, id))),
    [runProductAction],
  );
  /**
   * OPEN THE ⋯ MENU for a product row (P1.15). The ONE writer of `productMenuTarget`,
   * setting it WITH the dispatch so the sheet always has its product, the tier/user-menu
   * rule. The sheet's edit/deactivate call the handlers above and close.
   */
  const openProductMenu = useCallback(
    (product: AdminProduct) => {
      setProductMenuTarget(product);
      sheet("open_product_actions");
    },
    [sheet],
  );

  /* ---------------------------------------------------------- account (P1.23) -- */

  /**
   * READ THE PROFILE — /whoami for username and the server-resolved role, GET /shop
   * for the name. A 401 on either ends the session. If /whoami cannot be read this
   * launch the screen still opens (the password change does not depend on it),
   * showing the token's role and a placeholder name.
   */
  const loadAccount = useCallback(async (): Promise<void> => {
    const t = tokenRef.current;
    setAccountProfile(null);
    setPasswordOutcome(null);
    if (t === null) return;
    const [whoResult, shopResult] = await Promise.all([fetchWhoAmI(t), fetchShop(t)]);
    const who = whoResult.kind === "ok" ? readWhoAmI(whoResult.body) : null;
    const shopRow = shopResult.kind === "ok" ? readShopSettings(shopResult.body) : null;
    setAccountProfile(
      accountProfile(who ?? { username: "ยังอ่านชื่อผู้ใช้ไม่ได้", role }, shopRow?.name ?? null),
    );
    if (whoResult.kind === "unreachable" || shopResult.kind === "unreachable") setOnline(false);
    else {
      setOnline(true);
      const unauth =
        (whoResult.kind === "http" && whoResult.status === 401) ||
        (shopResult.kind === "http" && shopResult.status === 401);
      if (unauth) setSessionEnded(true);
    }
  }, [role]);

  const openAccount = useCallback(() => {
    setPasswordBusy(false);
    sheet("open_account");
    void loadAccount();
  }, [loadAccount, sheet]);

  /**
   * CHANGE THIS ACCOUNT'S OWN PASSWORD. On success the server has already ended the
   * session (it bumped token_version and returned no new token), so this REUSES the
   * expired path: it sets `sessionEnded` — the login screen becomes the body — and
   * KEEPS the token and the queue. The sign-out gate is NOT involved and the outbox
   * is NOT drained (hard rule 8): owed work sends under whoever signs in next. The
   * account sheet shows the "changed — sign in" notice, naming the kept work.
   */
  const changePassword = useCallback(
    async (request: PasswordChangeRequest): Promise<void> => {
      const t = tokenRef.current;
      const owedCount = totalOwed(owed);
      if (t === null) {
        setPasswordOutcome(passwordChangeResult({ kind: "no_token" }, owedCount));
        setSessionEnded(true);
        return;
      }
      setPasswordBusy(true);
      const result = await changeOwnPassword(t, request);
      setPasswordBusy(false);
      const outcome = passwordChangeResult(result, owedCount);
      setPasswordOutcome(outcome);
      if (outcome.kind === "changed") {
        setOnline(true);
        // Reuse the expired path. Token and queue KEPT; login takes over.
        setSessionEnded(true);
      } else if (result.kind === "unreachable") {
        setOnline(false);
      } else {
        setOnline(true);
        if (outcome.kind === "session") setSessionEnded(true);
      }
    },
    [owed],
  );

  /**
   * ONE TIER, WRITTEN, AND THEN THIS DEVICE'S OWN LIST RE-READ.
   *
   * THE ORDER IS THE WHOLE FUNCTION. The write is what the shop decided; the
   * refresh is what this handset knows about it. They are separate facts, they
   * can disagree, and the sentence on screen is built from BOTH — a save that
   * the server took and this phone did not re-read reports as `stale`, with the
   * instruction not to open a bill yet, and never as success
   * (lessons/cached-master-data-is-a-price-claim.md).
   *
   * THE REFRESH IS THE WHOLE-LIST ONE, deliberately, and NOT a patch of the
   * edited row from the route's response — which does return the full product.
   * `SqliteMasterStore.saveProducts` is delete-all + insert-all + stamp in ONE
   * transaction precisely so a list can never wear a timestamp describing data
   * other than the data that is there; writing one row outside that transaction
   * would put a fresh stamp on a list that is half old, which its own header
   * calls strictly worse than no cache at all.
   *
   * NOTHING IS QUEUED. A price write is not offline work. The outbox exists for
   * money already promised at a weighbridge; a price change applied hours later,
   * after bills have been written at the old number, is worse than one that
   * plainly did not happen. `unreachable` therefore says "unchanged, try again".
   */
  const savePrice = useCallback(
    async (productId: string, grade: string, price: string): Promise<void> => {
      const t = tokenRef.current;
      if (t === null) {
        setPriceOutcome(priceSaveScreen({ write: { kind: "no_token" }, refresh: "skipped" }));
        return;
      }
      setPriceBusy(true);
      let write: PriceWrite;
      let refresh: CacheRefresh = "skipped";
      try {
        write = await setProductPrice(t, productId, grade, price);
        // ONLY after a 2xx. Re-reading the list after a refusal would be honest
        // but pointless, and it would let a successful refresh dress a failed
        // write in a reassuring second sentence.
        if (write.kind === "ok") refresh = await refreshMaster(t);
      } finally {
        setPriceBusy(false);
      }
      setPriceOutcome(priceSaveScreen({ write, refresh }));
      /*
       * The device-global session state, on the same axes every other caller
       * uses. A 401 is the caller, not the network
       * (lessons/401-is-about-the-caller-not-the-bill.md); a 403 is neither and
       * deliberately touches nothing — this account may not move a price, which
       * says nothing about whether it may weigh and send bills.
       */
      if (write.kind === "unreachable") {
        setOnline(false);
        return;
      }
      setOnline(true);
      if (write.kind === "http" && write.status === 401) setSessionEnded(true);
      else if (write.kind === "ok") setSessionEnded(false);
    },
    [refreshMaster],
  );

  /**
   * THE ACTION ON A PRICE OUTCOME THAT IS NOT A RETRY OF THE WRITE.
   *
   * Every `retry` this screen offers means "re-read the list", never "send that
   * price again" — a 404, a 5xx and a stale cache are all resolved by knowing
   * what the server currently holds, and re-sending a price whose fate is
   * unknown is how one edit becomes two. On success the outcome is cleared and
   * the LIST comes back, which is the honest answer to "what is the price now".
   */
  const retryPriceRefresh = useCallback(() => {
    const t = tokenRef.current;
    if (t === null) {
      setPriceOutcome(priceSaveScreen({ write: { kind: "no_token" }, refresh: "skipped" }));
      return;
    }
    setPriceBusy(true);
    void (async () => {
      try {
        /*
         * `priceRefreshScreen`, NOT `priceSaveScreen`. This button re-reads the
         * list; it sends no price. Reporting it through the save screen means
         * passing a `PriceWrite` this code does not have, and the only value to
         * hand is `ok` — which on a failed refresh renders "saved on the
         * server" over a write that may have been REFUSED. See the defect note
         * at priceRefreshScreen.
         *
         * null means the re-read landed: the outcome is cleared and the LIST
         * comes back, now carrying the values just fetched.
         */
        setPriceOutcome(priceRefreshScreen(await refreshMaster(t)));
      } finally {
        setPriceBusy(false);
      }
    })();
  }, [refreshMaster]);

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

  const signIn = useCallback(async (username: string, password: string) => {
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
      /*
       * THE SHOP COMES FROM THE DEVICE, THE ACCOUNT FROM THE PERSON. Neither is
       * a constant any more. The tenant is what the SERVER resolved from a code
       * typed once at setup — never typed here, never guessed — and it is the
       * value the identity is recorded against, so a bill's owner names a shop
       * this device was admitted to rather than one it asserted.
       */
      const shopTenantId = shop;
      if (shopTenantId === null) {
        setSignInNotice("ยังไม่ได้ตั้งค่าร้านในเครื่องนี้");
        return;
      }
      const result = await signInAndRecord(
        () => login(shopTenantId, username, password),
        shopTenantId,
        identityStore,
      );
      /*
       * THE FOUR OUTCOMES ARE NOW FOUR, AND THEY USED TO BE ONE.
       *
       * Every failure — a refused password, an unreachable server, a 503 from
       * the clock guard, a 200 with no token — arrived in a single `catch` that
       * set `online = false` and printed the raw error. So the operator was told
       * they were offline when the server had just answered them in
       * milliseconds, and at five in the morning that sends them to the router
       * instead of to the keyboard. The decision now comes from
       * src/session/signInIdentity.ts, where a proof can drive it; this only
       * routes it.
       *
       * `online` is set from whether the SERVER ANSWERED, not from whether the
       * login succeeded — a refusal is an answer, and the same rule
       * lessons/401-is-about-the-caller-not-the-bill.md already applies on the
       * send path.
       */
      if (result.kind !== "ok") {
        setOnline(result.kind !== "unreachable");
        setSignInNotice(signInNotice(result));
        return;
      }
      setSignInNotice(null);
      const t = result.accessToken;
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
      // Seed the money-visibility toggle for the new session's header entry gate (E2).
      void refreshMoneyVisible();
      // Every backoff on the queue was computed while there was no usable
      // session, which says nothing about the network. Without this the yard
      // signs in, the sign-in succeeds, and then nothing visibly happens for up
      // to 30 seconds — which reads as "signing in did not work".
      const freed = (await engineRef.current?.resumeAfterSignIn()) ?? 0;
      if (freed > 0) void syncOnce();
      // NO draft is created here any more. A bill starts when a seller is
      // picked, so signing in never silently opens one for whoever happened to
      // come back first from /sellers.
      setStatus("เข้าสู่ระบบแล้ว");
    } catch (err) {
      /*
       * STILL HERE, AND IT NO LONGER CARRIES THE REFUSALS. `login()` returns
       * every transport outcome as a value, so what can still land here is a
       * fault in the steps AFTER the token arrives — the keystore, the master
       * refresh, the engine. Those are not the credentials and not the network,
       * so this says neither; it keeps `describe(err)` because at this point the
       * cause genuinely is unclassified, and inventing a class for it would be
       * the defect this commit removed, pointed the other way.
       */
      setSignInNotice(`เข้าสู่ระบบไม่สำเร็จหลังรับสิทธิ์แล้ว: ${describe(err)}`);
    } finally {
      setBusy(false);
    }
  }, [refreshMaster, shop, syncOnce]);

  /**
   * SETUP: a typed shop code exchanged for the shop, once.
   *
   * The identifier stored is the SERVER'S answer and never anything typed. A
   * device that took a tenant from the keyboard would stamp every row it writes
   * with a shop nobody admitted it to — and on a handset nobody can open
   * afterwards (ARCHITECTURE.md section 11) that is invisible for ever.
   *
   * A failure here NEVER speaks about credentials: no account has been named
   * yet, and the operator has not been asked for one.
   */
  const setupShop = useCallback(async (code: string) => {
    const shopStore = shopStoreRef.current;
    if (shopStore === null) {
      setSignInNotice("กำลังเปิดฐานข้อมูลในเครื่อง — ลองอีกครั้ง");
      return;
    }
    setBusy(true);
    try {
      const result = await resolveShopCode(code);
      if (result.kind !== "ok") {
        setOnline(result.kind !== "unreachable");
        setSignInNotice(shopCodeNotice(result));
        return;
      }
      await shopStore.save({ tenant_id: result.tenant_id });
      setShop(result.tenant_id);
      setSignInNotice(null);
      setOnline(true);
    } finally {
      setBusy(false);
    }
  }, []);

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
   * CONFIRMED ON A HANDSET 2026-08-12 — Android only, on this project's own
   * DEBUG build (`9d2eb22`, `dev.chutipon.recycle`), one vivo 1938, never Expo
   * Go. After a real sign-out and a cold start, `master_cache` still held its
   * two stamps and the screen still carried them: the strip read
   * `อัปเดตล่าสุด 12/08/2569 01:21`, a timestamp older than the sign-out. The
   * whole local database was byte-identical across the sign-out, so this
   * handler wrote to the keystore and to nothing else — which is also the
   * measurement behind the local_identity sentence below. The product and
   * seller LISTS were empty on that tenant, so what was observed surviving is
   * the CACHE STAMP; a non-empty list has not been through a device sign-out.
   * NOT confirmed on iOS, and no release build exists on either platform.
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
        // THIS PERSON'S owed work, of every kind, not the device's. It was the
        // unfiltered total, so a sign-out could be refused over bills the person
        // in front of it neither owned nor could send — and no action of theirs
        // would ever clear it, which is a device nobody can hand over. Every
        // kind's own count carries that filter now.
        //
        // THE SAME OBJECT the sheet is rendered from, twenty lines further down:
        // not a copy, not a recomputation, the same value.
        owed,
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
        // The two legacy report slots now clear the DASHBOARD's rendered state
        // (P1.23 item 4 unit 3 absorbed the daily screen — S24). Their names stay
        // because renaming reaches `ClearedSession` and proveSignOut's EXPECTED map,
        // which is out of this phase; `applyClearedSession` still calls each exactly
        // once. `daily`'s setter clears the today bill list; `dailyDate` clears the
        // summary and the unsent line together — every dashboard render value gone.
        daily: setDashDaily,
        dailyDate: () => {
          setDashSummary(null);
          setDashUnsent(null);
        },
        /*
         * THE APP NO LONGER HOLDS A `dailyOpen` BOOLEAN, so this field's setter is
         * the stack's. It closes EVERY sheet and not only the report, which is
         * wider than the field's name and is the correct act: with no token the
         * login screen is the body of the app, and any sheet left on top of it is
         * one the operator cannot get out of — the sign-out sheet they are
         * standing in included.
         *
         * The field keeps its name because renaming it reaches `ClearedSession`
         * and `proveSignOut`'s EXPECTED map, which is not this phase's change.
         * `applyClearedSession` still calls it exactly once, and the mapped type
         * still makes an ELEVENTH value a compile error here.
         */
        dailyOpen: () => sheet("close_every_sheet"),
      });
      setSignOutFailure(null);
      // No separate close for the sign-out sheet: the setter above emptied the
      // whole stack, and this sheet was in it.
      setStatus("ออกจากระบบแล้ว");
    } finally {
      setBusy(false);
    }
  }, [failedCount, pendingCount, sheet]);

  /**
   * CREATE A SELLER LOCALLY (P1.8b). Writes the row and binds one reserved code
   * in ONE transaction (`SqliteLocalSellerStore.createLocalSeller`), then kicks a
   * sync pass so the `seller_create` outbox drains it — immediately when online.
   * No network call happens here: hard rule 8, and the ONE mechanism S14 asks
   * for, not a second online path beside the offline one.
   *
   * `currentOwner()` is read HERE, at the create, so the row records WHO created
   * the seller — origin, written once and never rewritten. A store that is not
   * ready throws rather than returning `no_code`: a not-yet-open database is a
   * "try again", not an empty reserve, and the sheet leaves the form for a retry.
   */
  const createSeller = useCallback(
    async (draft: LocalSellerDraft): Promise<CreateLocalSellerResult> => {
      const store = sellerStoreRef.current;
      if (!store) throw new Error("seller store not ready");
      const result = await store.createLocalSeller(
        draft,
        await currentOwner(),
        deviceIds.newId(),
        systemClock.now(),
      );
      // A successful create spent a reserved code, so refresh the holding — the
      // strip and any next refusal must reflect the drop. Reading after a no_code
      // refusal changes nothing and is cheap.
      void readReserve();
      // Kick the pass so the create is sent now if we are online. A no_code
      // refusal wrote nothing, so there is nothing to drain.
      if (result.kind === "created") void syncOnce();
      return result;
    },
    [currentOwner, readReserve, syncOnce],
  );

  /**
   * Open the seller picker, and re-read master data while it is open.
   *
   * The refresh is fired and NOT waited on: the picker opens immediately with
   * whatever is cached, and the list simply updates underneath if the network
   * answers. Blocking the picker on a request would put a spinner between the
   * operator and a customer standing at the scale, and would fail hardest
   * offline — which is the case this phase exists for.
   */
  // ── P1.21: seller history at the weighbridge ───────────────────────────────
  // Opened from the cart's seller header (a body control), for the chosen seller.
  // The response's own `money_included` is the authority for whether prices show —
  // the app never infers it (moneyVisible is unreliable here). ONLINE ONLY: there
  // is no local history store, so this simply reads the server each time.
  const [historySeller, setHistorySeller] = useState<Seller | null>(null);
  const [historyScreen, setHistoryScreen] = useState<SellerHistoryScreen | null>(null);

  const loadSellerHistory = useCallback(async (s: Seller): Promise<void> => {
    const t = tokenRef.current;
    if (t === null) {
      setHistoryScreen(sellerHistoryScreen({ kind: "no_token" }));
      return;
    }
    setHistoryScreen(null); // spinner while the read is in flight
    const result = await fetchSellerHistory(t, s.id);
    setHistoryScreen(sellerHistoryScreen(result));
    // Keep the app's online/session state consistent, exactly as the dashboard
    // read does; a history read is a read, so submitRefused is NOT touched.
    if (result.kind === "unreachable") setOnline(false);
    else setOnline(true);
    if (result.kind === "http" && result.status === 401) setSessionEnded(true);
    else if (result.kind === "ok") setSessionEnded(false);
  }, []);

  const openSellerHistory = useCallback(() => {
    if (seller === null) return; // the control is only drawn when a seller is chosen
    setHistorySeller(seller);
    setHistoryScreen(null);
    sheet("open_seller_history");
    void loadSellerHistory(seller);
  }, [seller, loadSellerHistory, sheet]);

  const openPicker = useCallback(() => {
    sheet("open_seller_picker");
    const t = tokenRef.current;
    if (t !== null) void refreshMaster(t);
  }, [refreshMaster, sheet]);

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
      /*
       * THE PICKER'S JOB IS DONE, and so is the add-seller form if it was over it:
       * the operator has chosen somebody. This is where the same-commit
       * dismiss-and-present used to be — the old code set `pickerOpen` false and
       * `pendingChange` non-null in one render, which asks iOS to dismiss one
       * modal and present another in a single turn. Both calls still happen in
       * this handler; what changed is that they move ONE stack behind ONE Modal
       * that is already presented, so nothing is dismissed and nothing is
       * presented at that moment.
       */
      sheet("close_every_sheet");
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
      askSellerChange(s, preview.impact);
    },
    [
      applySellerChange,
      askSellerChange,
      currentOwner,
      draft,
      freshness.asOf,
      locks,
      sheet,
      tierResolver,
    ],
  );

  /**
   * A SELLER WAS JUST CREATED LOCALLY, AND THE TRUCK IS ON THE WEIGHBRIDGE
   * (P1.8b).
   *
   * IT GOES INTO `localSellers` — the LOCAL side of the picker union — and NEVER
   * into `sellers`, the server cache. `saveSellers` runs an unconditional
   * `DELETE FROM cached_sellers`, so a local row placed there would be destroyed
   * by the next refresh; a local seller lives in its own table (`local_sellers`),
   * and `mergeSellersForPicker` unions the two at read time
   * (`cart/pickerSellers.ts`). Adding it to the state here makes the picker offer
   * it at once, under its LOCAL id, and `seller` (the useMemo near the top)
   * resolves the draft's `seller_id` out of the UNION, so the bill can be saved.
   *
   * NO `refreshMaster` HERE. The server has never heard of this seller, so a
   * refresh cannot carry it down and cannot drop the local row — the union keeps
   * offering it until it has SETTLED and the server's row has arrived. A bill
   * weighed against it carries the local id and PARKS; the send path swaps in the
   * server id once the seller settles (`sync/resolveParkedSeller.ts`), so the
   * local id never reaches `POST /bills`.
   */
  const onSellerCreated = useCallback(
    (created: LocalSeller) => {
      setLocalSellers((prev) =>
        prev.some((s) => s.id === created.id) ? prev : [...prev, created],
      );
      // The operator pressed เลือกผู้ขายรายนี้; this is that pick, under the
      // seller's LOCAL id, going through the one function that starts or changes a
      // bill. `chooseSeller` empties the whole sheet stack — this form AND the
      // picker under it — in one act, so there is no ordering between two closes
      // to get wrong. Five fields, named one by one — a `LocalSeller` also carries
      // id_number, address, vehicle_no, a reservation token and the owner pair,
      // and none of them belongs in the picker.
      chooseSeller({
        id: created.id,
        code: created.code,
        name: created.name,
        phone: created.phone,
        grade: created.grade,
      });
    },
    [chooseSeller],
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
    sheet("close_top");
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

        /*
         * WHICH KIND OF SELLER THIS BILL NAMES — the question `BillSeller` refuses
         * to let a caller skip. The draft carries a bare `seller_id`; the store is
         * asked whether it is a LOCAL row this device created. It is authoritative
         * where `pickerSellers.localIds` (a render-time value) is not: a seller
         * that settled and refreshed out of the union since it was picked is gone
         * from `localIds` but still in `local_sellers`, and a bill weighed against
         * its local id must still carry `local` — the send path resolves it. A
         * seller the store does not hold is the cache's, and the bill is `server`,
         * exactly as every bill was before the picker offered anything else.
         */
        const localSeller = await sellerStoreRef.current?.getLocalSeller(draft.seller_id);
        const billSeller: BillSeller =
          localSeller != null
            ? { kind: "local", local_seller_id: draft.seller_id }
            : { kind: "server", seller_id: draft.seller_id };

        const bill = buildLocalBill(
          { clock: systemClock, ids: deviceIds },
          {
            // The DRAFT's seller, not a component variable: it is what was
            // persisted, and it is what the operator confirmed in the dialog.
            seller: billSeller,
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
  }, [currentOwner, draft, refresh, seller, sheet, syncOnce]);

  /**
   * WHAT THE SIGN-OUT SHEET'S BUTTONS DO. Hoisted out of the JSX so the sheet and
   * Android's back gesture reach one function rather than two copies of it.
   */
  const onSignOutAction = useCallback(
    (action: SignOutAction): void => {
      switch (action.kind) {
        case "dismiss":
          sheet("close_top");
          setSignOutFailure(null);
          return;

        /*
          R2b. THE SAME FUNCTION THE STRIP'S BUTTON REACHES. `signIn` is the one
          act on this device that ends an expired session, and it already clears
          the sync pause, the failure notice and the 403, then resumes the queue
          and kicks a pass. A second sign-in path written here would be a copy of
          that, free to drift from it.

          The sheet closes first: the operator pressed sign in, not sign out, and
          leaving a refusal on screen over a session that is about to work would
          be the same class of defect as the sentence R2b removed.
        */
        case "sign_in":
          // Closing the sheet IS the action now: with no usable session the login
          // screen is the body underneath it. See the strip's onSignIn — nothing
          // here can supply credentials.
          sheet("close_top");
          return;

        // confirm_sign_out and retry_sign_out are the same act; they differ only
        // in the label, because the second one follows a failure.
        case "confirm_sign_out":
        case "retry_sign_out":
          void onSignOut();
          return;

        /*
          A FIFTH MEMBER IS A COMPILE ERROR HERE, and that is the whole reason this
          is a switch. It was `if (dismiss) ... else onSignOut()`, which would have
          taken `sign_in` silently down the sign-out path — where the gate refuses
          it — producing a green button that does nothing. Worse than the defect
          being fixed.
        */
        default: {
          const never: never = action;
          throw new Error(`unhandled sign-out action: ${JSON.stringify(never)}`);
        }
      }
    },
    [onSignOut, sheet],
  );

  /* ----------------------------------------------------------------- view -- */

  /*
   * THE SIGN-OUT CARD, hoisted out of the JSX because two things read it: the
   * sheet, and the back-gesture handler below, which has to reach the same
   * `dismiss` action the button does.
   *
   * Rendered from the CURRENT counts every time, not from a value captured when
   * it opened: a queue that drains while it is on screen turns the refusal into
   * the confirmation by itself, with no tap.
   */
  const signOutSheetCard = signOutCard({
    /*
     * THE VALUE THE GATE READS, and it was not, until P1.8b. This said
     * `pending: pendingCount` — `UnsentBreakdown.mine` — while `onSignOut`
     * above passed `mine + mineBlocked`, so one bill parked on missing master
     * data rendered the CONFIRMATION card, with its ออกจากระบบ button, over a
     * gate that was going to answer `refused_pending`. One value now, read by
     * both, and a proof asserts the equality in one render.
     */
    owed,
    failed: failedCount,
    failure: signOutFailure,
    /*
      R2b: WHY the queue is stuck, not merely that it is. Already derived at the
      top of this component and already handed to StatusStrip and BillsPanel, so
      the three renderers of one fact read one value.
    */
    session,
    // The BUILD-too-old fact (426), the same device-global value the strip reads,
    // so the sheet says "update" instead of "wait for a send" that cannot happen.
    appOutdated,
  });

  /*
   * ─────────────────────────────────────────────────────────────────────────
   * THE ONE SHEET ON SCREEN.
   * ─────────────────────────────────────────────────────────────────────────
   * Seven components used to render seven sibling Modals here, each with its own
   * `visible`. That is the defect: iOS presents every Modal from the same parent
   * view controller and will not present a second one, so `+ เพิ่มผู้ขาย` inside
   * the picker did nothing on a real handset. Now there is one host and this
   * switch says what is inside it.
   *
   * EXHAUSTIVE ON `SheetKind`, and that is the guard rather than a convention: a
   * member added to `SHEET_KINDS` is a COMPILE ERROR in the `never` arm below
   * until it is rendered here. Somebody adding an eighth screen the obvious way
   * — a component with no Modal of its own, a kind, and a transition — cannot
   * reintroduce this. Somebody adding a Modal instead can, and that is what
   * `npm run prove:sheets` scans this directory for.
   *
   * `animation` is the sheet's own presentation style, and it matters only for
   * the presentation that OPENS the host and the dismissal that CLOSES it — a
   * switch from one sheet to another does not animate any more, because there is
   * no longer a presentation to animate. See app/SheetHost.tsx.
   *
   * `back` is Android's back gesture, routed to the same handler as the sheet's
   * own close control. The default is "close the top one"; the sign-out sheet
   * overrides it because its dismissal is one of the card's own actions and the
   * caller must not close it behind the notice's back.
   */
  const closeTopSheet = (): void => {
    sheet("close_top");
  };
  // Read ONCE into a const: the `never` arm below narrows a variable, and a second
  // call to topSheet() in that position narrows nothing — the exhaustiveness check
  // would compile while proving nothing.
  // ── P1.23 item 3 phase C: the notice arrangement, and the header nav mapping ──
  // The three alert notices (session/sync, stale prices, seller-code reserve) are
  // ranked by src/ui/noticeStack.ts: the one blocking notice stays inline, the rest
  // collapse behind a count that opens the notices sheet. The last-bill strip is a
  // navigation card, not one of these. statusNotice is computed here for its tone;
  // StatusStrip re-derives it from the same input, which is pure and cheap.
  const statusInput: StatusInput = {
    appOutdated,
    session,
    account,
    voidsRefused: voidsRefusedCount,
    online,
    pending: pendingCount,
    parkedForAnother,
    parkedUnknownOwner,
    failed: failedCount,
    blocked: health?.alarm
      ? { behind: health.behind, forMs: health.poisonedForMs, attempts: health.serverErrorAttempts }
      : null,
    waitingOnMasterData: health?.masterDataBlocked ?? 0,
    masterDataCodes,
    owed,
  };
  const statusValue = statusNotice(statusInput);
  const reserveValue = reserveStripNotice({ ...reserve, now: nowIso(), appOutdated });
  const noticeArrangement = arrangeNotices([
    statusEntry(statusValue.tone, mustShowSignIn({ token, sessionEnded })),
    masterEntry(masterMessage),
    reserveEntry(reserveValue),
  ]);
  // The count control's dot takes the highest collapsed severity's colour, so the
  // chip itself says whether what is hidden is urgent (collapsed is sorted, top first).
  const noticeCountColor =
    noticeArrangement.collapsed[0]?.severity === "blocking"
      ? theme.color.danger
      : noticeArrangement.collapsed[0]?.severity === "attention"
        ? theme.color.warning
        : theme.color.info;
  const noticeStripFor = (id: NoticeId): ReactNode => {
    switch (id) {
      case "session":
        return (
          <StatusStrip
            {...statusInput}
            lastSyncedAt={lastSyncedAt}
            onSignIn={() => sheet("close_every_sheet")}
            onRetryMasterData={retryMasterData}
          />
        );
      case "prices":
        return <MasterDataStrip notice={masterMessage} />;
      case "reserve":
        return <ReserveStrip notice={reserveValue} />;
      default: {
        const never: never = id;
        throw new Error(`unrendered notice: ${JSON.stringify(never)}`);
      }
    }
  };
  const navGateOpen = (gate: NavGate): boolean => {
    switch (gate) {
      /*
        DASHBOARD (P1.23 item 4 unit 3). A staff session sees ยอดวันนี้ only when the
        shop's `staff_money_visible` is on — the money toggle is a per-shop setting the
        server enforces DETERMINISTICALLY, so a staff+off session WOULD be refused (403
        staff_money_hidden). It FAILS OPEN on an unknown role (admin and an unparseable
        token both get it): the server re-reads the role every request and a
        wrongly-offered READ lands on a calm 403, while failing closed would hide an
        owner's own takings over a token this build merely failed to parse. Offline
        `moneyVisible` is null, which hides the entry for staff (treated as OFF).
      */
      case "dashboard_entry":
        return mayShowDashboardEntry(role, moneyVisible);
      /*
        PRICES (P1.9). The ยกเลิกบิลนี้ rule, not the ยอดวันนี้ one: this opens a screen
        whose purpose is a WRITE `require_admin` refuses, and a staff session must not
        learn its account cannot price by watching a save fail. `mayEditPrices` is the
        SAME predicate the sheet's own render uses, so the button and the screen cannot
        disagree; it fails OPEN on an unknown role onto priceSaveScreen's calm 403 branch.
      */
      case "edit_prices":
        return token !== null && mayEditPrices(role);
      /*
        SETTINGS and ACCOUNT (P1.23). Offered to every signed-in account: GET /shop and
        /whoami are READS a staff session may make, the settings screen renders read-only
        for staff (the write is admin-only, refused with a plain 403 it words), and the
        account is every user's own. With no token the login screen is already the body.
      */
      case "signed_in":
        return token !== null;
      default: {
        const never: never = gate;
        throw new Error(`unhandled nav gate: ${JSON.stringify(never)}`);
      }
    }
  };
  const navHandler = (dest: NavDest): (() => void) => {
    switch (dest) {
      case "dashboard":
        return openDashboard;
      case "prices":
        return openPrices;
      case "settings":
        return openSettings;
      case "account":
        return openAccount;
      default: {
        const never: never = dest;
        throw new Error(`unhandled nav dest: ${JSON.stringify(never)}`);
      }
    }
  };

  const onScreen = topSheet(sheets);
  const sheetSlot: { content: ReactNode; animation: SheetAnimation; back: () => void } = ((): {
    content: ReactNode;
    animation: SheetAnimation;
    back: () => void;
  } => {
    switch (onScreen) {
      case null:
        return { content: null, animation: "fade", back: closeTopSheet };

      case "sign_out": {
        const dismiss = signOutSheetCard.actions.find((a) => a.kind === "dismiss");
        return {
          animation: "fade",
          back: () => {
            if (dismiss) onSignOutAction(dismiss);
          },
          content: (
            <SignOutSheet busy={busy} card={signOutSheetCard} onAction={onSignOutAction} />
          ),
        };
      }

      case "seller_picker":
        return {
          animation: "slide",
          back: closeTopSheet,
          content: (
            <SellerPicker
              sellers={pickerSellers.options}
              tiers={gradeTiers}
              localIds={pickerSellers.localIds}
              platesBySeller={platesBySeller}
              currentSellerId={draft?.seller_id ?? null}
              changing={draft !== null}
              /* Tells "this device has never downloaded the list" apart from "the
                 office has not added anyone" — same empty screen, opposite fixes. */
              neverFetched={!freshness.haveSellers}
              onAddSeller={() => sheet("open_add_seller")}
              onClose={closeTopSheet}
              onPick={chooseSeller}
            />
          ),
        };

      /*
        OVER THE PICKER — the pair that was observed broken, and the reason this
        host exists. It no longer carries its own sign-in exit for the old reason
        (that the status strip was physically under two Modals); it carries one
        because the strip is under the HOST, which is just as unreachable.
      */
      case "add_seller":
        return {
          animation: "slide",
          back: closeTopSheet,
          content: (
            <AddSellerSheet
              create={createSeller}
              held={reserve.held}
              onPick={onSellerCreated}
              onClose={closeTopSheet}
            />
          ),
        };

      /*
        PAYLOAD GUARD, not belt-and-braces: `pendingChange` and this stack entry
        are written together by askSellerChange, and if they ever disagree the
        honest thing on screen is nothing at all — a dialog offering to change the
        seller from "-" to "-" is worse than a closed sheet.
      */
      case "confirm_seller_change":
        return pendingChange === null
          ? { content: null, animation: "fade", back: closeTopSheet }
          : {
              animation: "fade",
              back: dropSellerChange,
              content: (
                <ConfirmSellerChangeDialog
                  from={seller}
                  to={pendingChange.to}
                  tiers={gradeTiers}
                  impact={pendingChange.impact}
                  onCancel={dropSellerChange}
                  onConfirm={() => {
                    applySellerChange(pendingChange.to);
                    dropSellerChange();
                  }}
                />
              ),
            };

      /*
        THE SAME GUARD THE OLD `visible` EXPRESSION CARRIED — it read
        `confirmOpen && draft !== null && seller !== null`. Kept exactly: a
        confirm dialog quoting a total for a bill that no longer has a draft, or
        a seller this device cannot resolve, is a screen about nothing.
      */
      case "confirm_save":
        return draft === null || seller === null
          ? { content: null, animation: "fade", back: closeTopSheet }
          : {
              animation: "fade",
              back: closeTopSheet,
              content: (
                <ConfirmSaveDialog
                  lineCount={draft.lines.length}
                  total={cartTotal(draft)}
                  sellerName={seller.name}
                  sellerGrade={seller.grade}
                  tiers={gradeTiers}
                  vehicleNo={cleanVehicleNo(draft.vehicle_no)}
                  busy={busy}
                  /*
                    The last screen before cash leaves the drawer, so it is the
                    last chance to say the prices came from data this old.
                    Computed from the DRAFT's stamp, not from the current
                    freshness: what matters is the data these numbers were priced
                    against.

                    NOT nowMinute. That value is rounded DOWN to the minute for
                    the freshness strip (see nowMinuteIso), so it sits up to 59
                    seconds behind the truth — which UNDERSTATES the age by up to
                    a minute and, within a minute of the JUST_FETCHED_WINDOW_MS
                    boundary (5 min, the BANNER threshold — not
                    PRICE_DEFAULT_CUTOFF_MS, which is 12 h and gates the money),
                    suppresses this line entirely. Understating is the direction
                    that hides things on a money marker
                    (lessons/cached-master-data-is-a-price-claim.md Rule 4), and
                    this is the screen where it matters most. The honest value is
                    the real instant the operator is deciding at, which is also
                    what the bill's own device_created_at will be stamped with a
                    moment later.
                  */
                  pricedFrom={{ master_as_of: draft.master_as_of, device_created_at: nowIso() }}
                  onCancel={closeTopSheet}
                  onConfirm={doSaveBill}
                />
              ),
            };

      case "dashboard":
        return {
          animation: "slide",
          back: closeTopSheet,
          content: (
            <DashboardScreen
              model={dashModel}
              daily={dashDaily}
              custom={dashCustom}
              onClose={closeTopSheet}
              /* Retry re-reads the SAME period; nothing here writes, so nothing replays. */
              onRetry={() => void loadDashboard(dashSelection, dashBy, dashState)}
              /*
               * Closes to reveal the login screen. It cannot sign in itself, and it
               * deliberately does NOT reload afterwards: the operator may sign in as
               * somebody else, and a dashboard that reloaded on its own would put one
               * person's takings on screen because another had just opened the app.
               */
              onSignIn={closeTopSheet}
              onPickPreset={pickPreset}
              onPickBy={pickBy}
              onPickState={pickState}
              onCustomFrom={(v) => setDashCustom((c) => ({ ...c, from: v }))}
              onCustomTo={(v) => setDashCustom((c) => ({ ...c, to: v }))}
              onApplyCustom={applyCustom}
            />
          ),
        };

      /*
        THE PRICE LIST (P1.9), or the outcome of the last save. `priceOutcome`
        is payload and this stack entry is visibility, exactly like
        `pendingChange` above — but the guard is the opposite way round and
        there is no null case to defend: a null outcome is the NORMAL state and
        means "show the list", which is a screen about something.
      */
      case "prices":
        return {
          animation: "slide",
          back: closeTopSheet,
          content: (
            <PricesSheet
              screen={priceOutcome ?? priceList}
              busy={priceBusy}
              onClose={closeTopSheet}
              /* Every retry on this screen re-reads the LIST. It never re-sends
                 a price whose fate is unknown — see retryPriceRefresh. */
              onRetry={retryPriceRefresh}
              /*
               * Closes the sheet to reveal the login screen, exactly as the
               * daily report does. It cannot sign in itself, and it must not
               * re-send the price afterwards: the person who signs back in may
               * be somebody else, and a write that replayed on their session
               * would attribute a price change to an account that never made one.
               */
              onSignIn={closeTopSheet}
              /* Drop the outcome and show the list again, WITHOUT closing the
                 sheet: an owner repricing four tiers should not have to reopen
                 the screen between each one. The list it comes back to is the
                 refreshed one, because the refresh already ran. */
              onBack={() => setPriceOutcome(null)}
              onSave={(productId, grade, price) => void savePrice(productId, grade, price)}
            />
          ),
        };

      case "settings":
        return {
          animation: "slide",
          back: closeTopSheet,
          content: (
            <SettingsScreen
              screen={settingsScreen}
              shop={settingsShop}
              saving={settingsSaving}
              tierScreen={settingsTierScreen}
              tierRefusal={settingsTierRefusal}
              tierBusy={settingsTierBusy}
              onClose={closeTopSheet}
              /* Retry re-READS the shop; a settings write never replays on its own. */
              onRetry={() => void loadSettings()}
              /* Closes the sheet to reveal the login screen; it cannot sign in
                 itself, and must not re-read afterwards (a different person may sign
                 in). Same rule as the daily and prices screens. */
              onSignIn={closeTopSheet}
              onSave={(patch) => void saveSettings(patch)}
              onAddTier={addTier}
              onReorderTiers={reorderTiers}
              onTierMenu={openTierMenu}
              /* ADMIN-ONLY (P3.7): null for a staff session, so the จัดการผู้ใช้งาน
                 row is not drawn — the dashboard-entry-gate shape. mayManageUsers
                 fails open, and the server refuses every user route regardless. */
              onManageUsers={mayManageUsers(role) ? openUsers : null}
              /* ADMIN-ONLY (P1.15): null for a staff session, so the จัดการสินค้า
                 row is not drawn — the same entry-gate shape as จัดการผู้ใช้งาน.
                 mayManageProducts fails open; the server refuses every write regardless. */
              onManageProducts={mayManageProducts(role) ? openProducts : null}
            />
          ),
        };

      case "account":
        return {
          animation: "slide",
          back: closeTopSheet,
          content: (
            <AccountScreen
              profile={accountProfileState}
              outcome={passwordOutcome}
              busy={passwordBusy}
              onClose={closeTopSheet}
              /* The sign-in exit after a password change. sessionEnded is already
                 set, so closing this sheet reveals the login screen the body has
                 become. */
              onSignIn={closeTopSheet}
              onSubmit={(request) => void changePassword(request)}
            />
          ),
        };

      case "bills":
        return {
          animation: "slide",
          back: closeTopSheet,
          content: (
            <BillsPanel
              bills={bills}
              busy={busy}
              session={session}
              account={account}
              // Courtesy only: it decides whether ยกเลิกบิลนี้ is offered. The server
              // re-reads the role on every request and refuses regardless.
              role={role}
              blockerId={health?.blockerId ?? null}
              onClose={closeTopSheet}
              onVoid={voidBill}
            />
          ),
        };

      case "seller_history":
        return {
          animation: "slide",
          back: closeTopSheet,
          content: (
            <SellerHistorySheet
              sellerName={historySeller?.name ?? ""}
              screen={historyScreen}
              onClose={closeTopSheet}
              /* Retry re-reads the SAME seller; nothing here writes, so nothing replays. */
              onRetry={() => {
                if (historySeller !== null) void loadSellerHistory(historySeller);
              }}
              /* Closes to reveal the login screen; it cannot sign in itself and does
                 not reload afterwards (the next person to sign in may be someone else). */
              onSignIn={closeTopSheet}
            />
          ),
        };

      /* P1.23 item 3 phase C. The collapsed notices, in full — the reference's
         "notices behind a count". App.tsx builds each notice's own strip element;
         this only lays them out over a dimmed backdrop with a grab handle. */
      case "notices":
        return {
          animation: "fade",
          back: closeTopSheet,
          content: (
            <NoticeSheet
              notices={noticeArrangement.collapsed.map((e) => noticeStripFor(e.id))}
              onClose={closeTopSheet}
            />
          ),
        };

      /* P1.23 item 3 phase D. The tier ... menu on a grade-tier row — OVER the settings
         sheet (the stack settings>tier_actions), through this one host. Rename and the
         destructive deactivate moved off the row so a wet thumb cannot hit retire beside
         the reorder arrows. Payload-guarded: a null target or an unloaded tier screen
         renders nothing, the pendingChange rule. */
      case "tier_actions":
        return tierMenuTarget === null || settingsTierScreen === null
          ? { content: null, animation: "fade", back: closeTopSheet }
          : {
              animation: "fade",
              back: closeTopSheet,
              content: (
                <TierActionsSheet
                  row={tierMenuTarget}
                  nameMaxLength={settingsTierScreen.nameMaxLength}
                  busy={settingsTierBusy}
                  /* Fire the tier action (the SAME handlers the inline row used), then
                     close to the tier list; a refusal shows there, revealed on close. */
                  onRename={(id, name) => {
                    renameTier(id, name);
                    closeTopSheet();
                  }}
                  onDeactivate={(id) => {
                    deactivateTier(id);
                    closeTopSheet();
                  }}
                  onReactivate={(id) => {
                    reactivateTier(id);
                    closeTopSheet();
                  }}
                  onClose={closeTopSheet}
                />
              ),
            };

      /* P3.7. The shop's people — the roster, add-a-user, and the row that opens the
         actions sheet. OVER the settings sheet (the stack settings>users), reached
         only from the admin-only row; a staff session never gets here. */
      case "users":
        return {
          animation: "slide",
          back: closeTopSheet,
          content: (
            <UsersScreen
              state={usersScreen}
              refusal={usersRefusal}
              busy={usersBusy}
              onClose={closeTopSheet}
              /* Retry re-READS the roster; a user write never replays on its own. */
              onRetry={() => void loadUsers()}
              /* Closes the sheet to reveal the login screen; it cannot sign in itself
                 and must not re-read afterwards (a different person may sign in). */
              onSignIn={closeTopSheet}
              onCreate={addUser}
              onUserMenu={openUserMenu}
            />
          ),
        };

      /* P3.7. The ⋯ actions on one roster row — reset / deactivate / reactivate —
         OVER the users sheet (settings>users>user_actions), through this one host.
         Payload-guarded: a null target renders nothing, the pendingChange rule. The
         signed-in row's only move is onGoToAccount, which clears the stack and opens
         the account screen cleanly (open_account is reachable from the app's own
         screen), where own-password change lives. */
      case "user_actions":
        return userMenuTarget === null
          ? { content: null, animation: "fade", back: closeTopSheet }
          : {
              animation: "fade",
              back: closeTopSheet,
              content: (
                <UserActionsSheet
                  row={userMenuTarget}
                  busy={usersBusy}
                  /* Fire the action, then close to the roster; a refusal shows there,
                     revealed on close. */
                  onReset={(id, pw) => {
                    resetUserAccountPassword(id, pw);
                    closeTopSheet();
                  }}
                  onDeactivate={(id) => {
                    deactivateUserAccount(id);
                    closeTopSheet();
                  }}
                  onReactivate={(id) => {
                    reactivateUserAccount(id);
                    closeTopSheet();
                  }}
                  onGoToAccount={() => {
                    sheet("close_every_sheet");
                    openAccount();
                  }}
                  onClose={closeTopSheet}
                />
              ),
            };

      /* P1.15. The shop's products, categories and units — one segmented management
         screen, OVER the settings sheet (the stack settings>products), reached only
         from the admin-only row; a staff session never gets here. */
      case "products":
        return {
          animation: "slide",
          back: closeTopSheet,
          content: (
            <ProductsScreen
              state={productsScreen}
              refusal={productsRefusal}
              busy={productsBusy}
              onClose={closeTopSheet}
              /* Retry re-READS the three lists; a write never replays on its own. */
              onRetry={() => void loadProducts()}
              /* Closes the sheet to reveal the login screen; it cannot sign in itself
                 and must not re-read afterwards (a different person may sign in). */
              onSignIn={closeTopSheet}
              onCreateProduct={createProductAction}
              onProductMenu={openProductMenu}
              onCreateEntity={createEntityAction}
              onRenameEntity={renameEntityAction}
              onDeactivateEntity={deactivateEntityAction}
              onReactivateEntity={reactivateEntityAction}
            />
          ),
        };

      /* P1.15. The ⋯ actions on one product row — edit / deactivate / reactivate —
         OVER the products sheet (settings>products>product_actions), through this one
         host. Payload-guarded: a null target renders nothing, the pendingChange rule.
         The edit form's pickers offer the ACTIVE categories and units only (the server
         refuses a retired one). */
      case "product_actions":
        return productMenuTarget === null || productsScreen === null || productsScreen.kind !== "ready"
          ? { content: null, animation: "fade", back: closeTopSheet }
          : {
              animation: "fade",
              back: closeTopSheet,
              content: (
                <ProductActionsSheet
                  product={productMenuTarget}
                  categories={productsScreen.categories.filter((c) => c.is_active)}
                  units={productsScreen.units.filter((u) => u.is_active)}
                  busy={productsBusy}
                  /* Fire the action, then close to the product list; a refusal shows
                     there, revealed on close. */
                  onEdit={(id, body) => {
                    editProductAction(id, body);
                    closeTopSheet();
                  }}
                  onDeactivate={(id) => {
                    deactivateProductAction(id);
                    closeTopSheet();
                  }}
                  onReactivate={(id) => {
                    reactivateProductAction(id);
                    closeTopSheet();
                  }}
                  onClose={closeTopSheet}
                />
              ),
            };

      default: {
        const never: never = onScreen;
        throw new Error(`unrendered sheet: ${JSON.stringify(never)}`);
      }
    }
  })();

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
        <StatusBar style={theme.statusBar} />
        <View style={styles.header}>
          {/*
            THE FIXED TOP BAR (P1.23 item 3 phase C). Wordmark leading; ออกจากระบบ
            trailing and spatially separated, because it is destructive. The navigation
            destinations moved OUT of this row — they overlapped the title and clipped
            the last chip at the frame — into the horizontal scroll row below.
          */}
          <View style={styles.topBar}>
            <Text style={styles.wordmark} numberOfLines={1}>
              รับซื้อของเก่า
            </Text>
            {/*
              SIGN OUT (R1b). Offered only while there IS a session — with no token the
              login button is already the whole screen. It opens a sheet rather than
              signing out on the tap: the sheet explains the queue gate and warns, before
              committing, that signing back in needs a connection — the one consequence
              the operator cannot discover by trying.
            */}
            {token !== null ? (
              <Touchable
                style={styles.signOut}
                onPress={() => {
                  setSignOutFailure(null);
                  sheet("open_sign_out");
                }}
                accessibilityLabel="ออกจากระบบ"
              >
                <Icon name="logout" size={16} color={theme.color.danger} />
                <Text style={styles.signOutText}>ออกจากระบบ</Text>
              </Touchable>
            ) : null}
          </View>
          {/*
            THE NAVIGATION, a horizontal scroll row built from NAV_ITEMS by .map
            (src/ui/navRow.ts) — so a destination cannot be silently dropped by the
            layout. Each chip's gate is navGateOpen above, where the per-destination
            rationale lives. An overflowing next chip peeks as its own rounded card (the
            affordance; never a chip sliced flat), the leading item ยอดวันนี้ is the
            most-used and shows at rest, and a horizontal scroll never captures a
            vertical drag. Every chip clears TAP_MIN.
          */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.navRow}
          >
            {NAV_ITEMS.map((item) =>
              navGateOpen(item.gate) ? (
                <Touchable
                  key={item.dest}
                  style={styles.navChip}
                  onPress={navHandler(item.dest)}
                  accessibilityLabel={item.label}
                >
                  <Icon name={navIcon(item.dest)} size={16} color={theme.color.textMuted} />
                  <Text style={styles.navChipText}>{item.label}</Text>
                </Touchable>
              ) : null,
            )}
          </ScrollView>
          {status !== "" ? (
            <Text style={styles.status} numberOfLines={1}>
              {status}
            </Text>
          ) : null}
        </View>

        {/*
          THE NOTICE ZONE (P1.23 item 3 phase C). The three alert notices — session/sync,
          stale prices, seller-code reserve — are ranked by src/ui/noticeStack.ts: the one
          that BLOCKS work stays inline as a card; the rest collapse behind a count that
          opens the notices sheet, each keeping its own tone and text, unchanged (the three
          strips still DECIDE their own wording — this only arranges the built elements).
          The last-bill strip is a navigation CARD here, not one of the ranked notices.
          When nothing blocks and nothing else is active, this whole zone is empty — the
          clean screen the reference reads as current, not a stack of four equal bars.
        */}
        {noticeArrangement.inline !== null || noticeArrangement.count > 0 || bills.length > 0 ? (
          <View style={styles.noticeZone}>
            {noticeArrangement.inline !== null ? noticeStripFor(noticeArrangement.inline.id) : null}
            {noticeArrangement.count > 0 ? (
              <Touchable
                style={styles.noticeCount}
                onPress={() => sheet("open_notices")}
              >
                <View style={[styles.noticeDot, { backgroundColor: noticeCountColor }]} />
                <Text style={styles.noticeCountNum}>{String(noticeArrangement.count)}</Text>
                <Icon name="chevron" size={18} color={theme.color.textSubtle} />
              </Touchable>
            ) : null}
            {bills.length > 0 ? (
              <Touchable style={styles.latest} onPress={() => sheet("open_bills")} accessibilityLabel="บิลล่าสุด">
                {latest !== null ? (
                  <>
                    <Text
                      style={[styles.latestBadge, { backgroundColor: stateColor[latest.sync_state] }]}
                    >
                      {STATE_TH[latest.sync_state]}
                    </Text>
                    <Text style={styles.latestDoc}>
                      บิลล่าสุด {latest.doc_no ?? "ยังไม่มีเลขที่บิล"}
                    </Text>
                    <Text style={styles.latestTotal}>
                      {latest.payload.total_amount !== null ? display(latest.payload.total_amount) : "-"} ({latest.payload.items.length})
                    </Text>
                  </>
                ) : (
                  <Text style={styles.latestDoc}>ไม่มีบิลที่ยังไม่ถูกยกเลิก</Text>
                )}
                <View style={styles.latestOpenWrap}>
                  <Text style={styles.latestOpen}>ดู/ยกเลิก</Text>
                  <Icon name="chevron" size={16} color={theme.color.primary} />
                </View>
              </Touchable>
            ) : null}
          </View>
        ) : null}

        {!ready ? (
          <ActivityIndicator style={styles.spinner} size="large" />
        ) : mustShowSignIn({ token, sessionEnded }) ? (
          /*
           * NO USABLE SESSION — and that is NOT the same test as "no token".
           *
           * This read `token === null` until P1.7 step 6. A token that EXISTS
           * and has EXPIRED is not null, so the screen carried on drawing the
           * cart: the operator could weigh a full load against a session the
           * server would refuse, and the one control that fixes it — signing in
           * again — was not on the screen at all. `sessionStateOf` already
           * distinguishes the three states and is proven in
           * src/session/signOut.ts; this uses it rather than re-deriving a
           * fourth opinion about what "signed in" means.
           *
           * lessons/401-is-about-the-caller-not-the-bill.md states the same
           * rule from the other end: the sign-in control must be reachable on
           * exactly the states where signing in is what fixes things, and
           * `token === null` is precisely false when a token has expired.
           */
          <LoginScreen
            shopTenantId={shop}
            busy={busy}
            notice={signInNoticeText}
            onSetup={(code) => void setupShop(code)}
            onSignIn={(u, p) => void signIn(u, p)}
          />
        ) : draft === null ? (
          /* No bill in progress. It starts with WHO, not with what. */
          <View style={styles.center}>
            <EmptyState icon="seller">ยังไม่มีบิลที่กำลังทำอยู่</EmptyState>
            {/*
              A CART IS BEING KEPT THAT THIS PERSON MAY NOT CONTINUE. Without this
              line the screen above is byte-identical to an ordinary morning with
              nothing in progress; the sentence, and the decision to show nothing
              about WHOSE it is, live in src/cart/draftNotice.ts where a proof can
              reach them — this is only its render.
            */}
            {withheldDraftNotice(draftsWithheld) !== null ? (
              <View style={styles.withheldDraft}>
                <Text style={styles.withheldDraftText}>{withheldDraftNotice(draftsWithheld)}</Text>
              </View>
            ) : null}
            {/*
              NO USABLE MASTER DATA, SO NO BILL. The button is disabled rather than
              opening an empty picker — a picker that says "no sellers" reads as
              "this shop has no customers", which is a different and alarming claim.
              The DECISION is mayStartBill in src/master/freshness.ts, where a proof
              reaches it; this only renders it.
            */}
            <Button
              label="เลือกผู้ขาย เพื่อเริ่มบิลใหม่"
              icon="seller"
              onPress={openPicker}
              disabled={busy || !mayStartBill(freshness)}
            />
          </View>
        ) : (
          <CartScreen
            products={products}
            tiers={gradeTiers}
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
            onViewHistory={openSellerHistory}
            onVehicleChange={onVehicleChange}
            onVehicleBlur={onVehicleBlur}
            onSubmit={() => sheet("open_confirm_save")}
          />
        )}

        {/*
          THE ONE MODAL IN THIS APP. Seven sibling Modals stood here, each with
          its own `visible`; iOS presents them all from the same parent view
          controller and refuses the second, which is why the add-seller button did
          nothing on a handset. `sheetSlot` above chooses what is inside this one.
        */}
        <SheetHost
          content={sheetSlot.content}
          animationType={sheetSlot.animation}
          onRequestClose={sheetSlot.back}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The nav chip's leading icon, by destination (P1.23 phase E). */
function navIcon(dest: NavDest): IconName {
  switch (dest) {
    case "dashboard":
      return "dashboard";
    case "prices":
      return "prices";
    case "settings":
      return "settings";
    case "account":
      return "account";
  }
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.color.background },
    center: { flex: 1, justifyContent: "center", paddingHorizontal: t.layout.screenPad, gap: t.space.x3 },
    spinner: { marginTop: t.space.x5 },
    // THE FIXED TOP BAR — surface chrome, distinct from the page below it.
    header: {
      backgroundColor: t.color.surface,
      borderBottomWidth: 1,
      borderBottomColor: t.color.borderSoft,
      paddingTop: t.space.sm,
      paddingBottom: t.space.sm,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: t.tapMin,
      paddingHorizontal: t.layout.screenPad,
    },
    wordmark: { flex: 1, fontSize: t.type.titleLg, fontWeight: "900", color: t.color.text },
    // Sign out — DESTRUCTIVE, so RED (P1.23 item 3 phase D, the reference's own
    // treatment: its sign-out and delete-account controls are red). danger on
    // `surface` (the header ground) is proven >=4.5:1 in both themes by prove:theme
    // (6.47 light / 5.29 dark).
    // It still sits alone in the trailing zone; the confirm sheet carries the rest.
    signOut: {
      minHeight: t.tapMin, paddingHorizontal: t.space.md, flexDirection: "row", gap: t.space.xs,
      justifyContent: "center", alignItems: "center",
    },
    signOutText: { fontSize: t.type.body, fontWeight: "700", color: t.color.danger },
    // The horizontal navigation scroll row.
    navRow: { flexDirection: "row", gap: t.space.md, paddingHorizontal: t.layout.screenPad, paddingBottom: t.space.sm },
    // Neutral pill chips — navigation, NOT the one accent. Every one clears TAP_MIN.
    navChip: {
      minHeight: t.tapMin, paddingHorizontal: t.space.xl, borderRadius: t.radius.pill,
      flexDirection: "row", alignItems: "center", gap: t.space.sm,
      justifyContent: "center", backgroundColor: t.color.surfaceAlt,
    },
    navChipText: { fontSize: t.type.bodyLg, fontWeight: "600", color: t.color.text },
    status: {
      fontSize: t.type.body, color: t.color.textSubtle,
      paddingHorizontal: t.layout.screenPad, paddingBottom: t.space.sm,
    },

    // THE NOTICE ZONE — an inset card page: one outer margin, one gap between cards.
    noticeZone: { paddingHorizontal: t.layout.screenPad, paddingTop: t.layout.cardGap, gap: t.layout.cardGap },
    // The count control: a neutral card whose dot carries the highest hidden severity.
    noticeCount: {
      flexDirection: "row", alignItems: "center", gap: t.space.md, minHeight: t.tapMin,
      paddingHorizontal: t.layout.cardPad, borderRadius: t.radius.card,
      backgroundColor: t.color.surface, borderWidth: 1, borderColor: t.color.borderSoft,
    },
    noticeDot: { width: 12, height: 12, borderRadius: t.radius.sm },
    noticeCountNum: { flex: 1, fontSize: t.type.subhead, fontWeight: "900", color: t.color.text },
    latestOpenWrap: { flexDirection: "row", alignItems: "center", gap: t.space.xs },

    // THE LATEST BILL — a navigation card (it was a full-bleed strip).
    latest: {
      flexDirection: "row", alignItems: "center", gap: t.space.md, minHeight: t.tapMin,
      paddingHorizontal: t.layout.cardPad, paddingVertical: t.space.md, borderRadius: t.radius.card,
      backgroundColor: t.color.surface, borderWidth: 1, borderColor: t.color.borderSoft,
    },
    latestBadge: {
      color: t.color.onPrimary, fontSize: t.type.body, fontWeight: "800", paddingHorizontal: t.space.sm,
      paddingVertical: t.space.xs, borderRadius: t.radius.sm, overflow: "hidden",
    },
    latestDoc: { flex: 1, fontSize: t.type.body, fontWeight: "800", color: t.color.text },
    latestTotal: { fontSize: t.type.body, color: t.color.textMuted, fontWeight: "700" },
    latestOpen: { fontSize: t.type.body, color: t.color.primary, fontWeight: "800" },

    /*
     * Amber, and NOT the red `block` tone the master strip uses. Nothing is
     * broken and nothing is stopped — a bill can be started normally — so this
     * must not read as a refusal. It is information about work being held.
     * Not clamped: a truncated "it has not been deleted" is the half that matters.
     */
    withheldDraft: {
      backgroundColor: t.color.warningBg, borderColor: t.color.warning, borderWidth: 1,
      paddingHorizontal: t.space.xl, paddingVertical: t.space.md, borderRadius: t.radius.md,
    },
    withheldDraftText: {
      fontSize: t.type.body, color: t.color.warningFg, textAlign: "center", fontWeight: "700",
    },
    dim: { opacity: 0.4 },
  });
}
