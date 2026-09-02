/**
 * WHICH SHEET IS ON SCREEN. One value, so the app cannot ask for two.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO MAKE IMPOSSIBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * App.tsx used to render seven `<Modal>` components as SIBLINGS, each with its
 * own `visible` boolean. On iOS every one of them presents a view controller
 * from the SAME parent — the app's root controller — and
 * `RCTModalHostViewComponentView.ensurePresentedOnlyIfNeeded`
 * (react-native 0.81.5, React/Fabric/Mounting/ComponentViews/Modal) calls
 * `[[self reactViewController] presentViewController:...]` with NO check for a
 * controller that is already presenting, and sets its own `_isPresented = YES`
 * BEFORE the call. A second presentation from one parent is therefore refused by
 * UIKit and recorded by React Native as a success, and neither
 * `didMoveToWindow` nor `didMoveToSuperview` will retry it — both are gated on
 * `!_isPresented`.
 *
 * The observed symptom, on a real handset, was `+ เพิ่มผู้ขาย` inside the seller
 * picker doing nothing.
 *
 * TWO SHAPES OF THE SAME DEFECT, and only the first is what people look for:
 *
 *   OVERLAP     — two `visible` booleans true in one committed render.
 *                 App.tsx set `addSellerOpen` from inside the picker and left
 *                 `pickerOpen` true.
 *   SAME-COMMIT — one goes false and another goes true in the SAME render, so
 *   SWAP          the platform is asked to dismiss and present in one turn.
 *                 `chooseSeller` did exactly this: picker false, seller-change
 *                 dialog true, one handler, one commit.
 *
 * A single `openSheet: SheetKind | null` state kills the first and RENAMES the
 * second — which is why this module is a STACK feeding ONE Modal host that
 * stays presented while its children change. Nothing is dismissed and nothing
 * is presented when the sheet on screen changes, so neither shape has anywhere
 * to happen.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE TRANSITIONS ARE DATA
 * ─────────────────────────────────────────────────────────────────────────────
 * `SHEET_TRANSITIONS` is the whole list, and App.tsx dispatches BY NAME. It
 * cannot build an action of its own, so the reachable-state enumeration in
 * `src/proof/proveSheets.ts` is a statement about the app rather than about a
 * copy of it. Adding a transition here changes that enumeration and reddens a
 * cell until the expectation is rewritten deliberately.
 *
 * THE HONEST LIMIT, stated here rather than discovered later: `from` is a claim
 * about WHERE App.tsx dispatches each transition, and nothing in the node
 * program can check it — App.tsx is not in `tsconfig.node.json`. So the proof
 * carries a cell that holds even if every `from` is wrong: over the reachable
 * states crossed with EVERY transition, ignoring `from` entirely, the reducer
 * still cannot produce a stack with two sheets on screen. The invariant does
 * not rest on this table being accurate.
 */

/**
 * Every sheet the app can put over itself. A member added here is a compile
 * error at the host's switch in App.tsx until it is rendered.
 */
export const SHEET_KINDS = [
  "sign_out",
  "seller_picker",
  "add_seller",
  "confirm_seller_change",
  "confirm_save",
  /**
   * P1.23 item 4 unit 3. The owner's dashboard — a period × dimension summary whose
   * TODAY view holds the day's per-bill list. It ABSORBED the standalone daily
   * screen (ROADMAP § What the owner has settled, S24), which is why there is no
   * `daily` kind any more: the ยอดวันนี้ entry opens this.
   */
  "dashboard",
  "bills",
  /** P1.9. The shop's own price list, and the one screen that MOVES it. */
  "prices",
  /** P1.23. The shop's own settings, and the account this device is signed in as. */
  "settings",
  "account",
  /** P1.21. A seller's recent bills, opened from the cart's seller header — what
   *  this seller last sold (when, what, how much). A read-only panel over the app. */
  "seller_history",
  /** P1.23 item 3 phase C. The collapsed notices, in full — opened from the main
   *  screen's notice count (the reference's "notices behind a count"). A leaf. */
  "notices",
  /**
   * P1.23 item 3 phase D. The grade-tier row's actions menu (rename / deactivate),
   * opened from the ... control on a tier row INSIDE the settings sheet. Opened OVER
   * `settings`, so the one two-deep stack besides `seller_picker>add_seller`;
   * closing it returns to the tier list. The destructive deactivate leaves the row
   * so a wet thumb at 5am cannot hit it beside the reorder arrows (the owner's
   * mis-tap reason). A leaf: nothing opens over it.
   */
  "tier_actions",
  /**
   * P3.7. The shop's people — the roster, add-a-user, and the per-row actions.
   * Opened from an ADMIN-ONLY row INSIDE the settings sheet (the tier list's
   * neighbour), so it stacks `settings>users`. A staff session never sees the row
   * (mayManageUsers), so it never reaches this sheet; the server refuses GET /users
   * for staff regardless.
   */
  "users",
  /**
   * P3.7. The ⋯ actions on one roster row — reset password, deactivate, reactivate
   * — opened OVER `users` (the stack `settings>users>user_actions`), the same
   * grab-handle leaf as `tier_actions`. The destructive deactivate leaves the row
   * and carries a confirmation; the signed-in row offers none. WHICH user it acts
   * on is App.tsx payload (`userMenuTarget`), written WITH the dispatch.
   */
  "user_actions",
] as const;

export type SheetKind = (typeof SHEET_KINDS)[number];

/**
 * Bottom to top. The LAST element is what the operator is looking at; the ones
 * beneath it are what closing returns to.
 */
export type SheetStack = readonly SheetKind[];

/** The app's own screen, with nothing over it. */
export const NO_SHEETS: SheetStack = [];

export type SheetAction =
  /** Put `sheet` over whatever is open. Closing it comes back here. */
  | { readonly kind: "open"; readonly sheet: SheetKind }
  /** `sheet` alone: closing it returns to the app, not to what was open. */
  | { readonly kind: "replace"; readonly sheet: SheetKind }
  /** Close the top one and reveal what was under it. */
  | { readonly kind: "close" }
  /** Nothing over the app at all. */
  | { readonly kind: "close_all" };

/** The one sheet on screen, or null. */
export function topSheet(stack: SheetStack): SheetKind | null {
  return stack[stack.length - 1] ?? null;
}

/**
 * IS THIS SHEET ON SCREEN — the function App.tsx's host asks, and the one the
 * proof measures. It is deliberately `top ===` and not `includes`: a stack of
 * two exists on purpose (the add-seller form over the picker), and only the top
 * of it is rendered. Widen this to `includes` and two sheets are asked for at
 * once, which is the defect this module removes.
 */
export function sheetOnScreen(stack: SheetStack, kind: SheetKind): boolean {
  return topSheet(stack) === kind;
}

/** No sheet twice, and nothing in the stack that is not a declared kind. */
export function sheetStackValid(stack: SheetStack): boolean {
  const known: readonly string[] = SHEET_KINDS;
  return new Set(stack).size === stack.length && stack.every((k) => known.includes(k));
}

export function reduceSheets(stack: SheetStack, action: SheetAction): SheetStack {
  switch (action.kind) {
    case "open": {
      /*
       * ALREADY OPEN SOMEWHERE BELOW: come back DOWN to it rather than pushing a
       * second copy. A duplicate would make `close` return to the same sheet it
       * just closed, which on a screen with a truck waiting reads as a button
       * that does nothing — the symptom this whole module is about.
       */
      const at = stack.indexOf(action.sheet);
      if (at !== -1) return stack.slice(0, at + 1);
      return [...stack, action.sheet];
    }
    case "replace":
      // The sheets underneath are FINISHED, not suspended. See ask_seller_change.
      return [action.sheet];
    case "close":
      // slice(0, -1) of an empty array is an empty array: closing nothing is
      // not an error, because a stale handler firing after a close is normal.
      return stack.slice(0, -1);
    case "close_all":
      return NO_SHEETS;
    default: {
      const never: never = action;
      throw new Error(`unhandled sheet action: ${JSON.stringify(never)}`);
    }
  }
}

/**
 * ONE TRANSITION THE APP CAN MAKE.
 *
 * `from` names the tops it is reachable FROM — `null` meaning the app's own
 * screen, with no sheet over it. It is not enforcement; it is the declaration
 * the reachable-state enumeration walks. The physical enforcement is that a
 * sheet fills the screen, so a control in the body cannot be pressed while one
 * is open.
 */
export interface SheetTransitionSpec {
  readonly action: SheetAction;
  readonly from: readonly (SheetKind | null)[];
  /** Where App.tsx dispatches it, so the table can be checked by eye. */
  readonly site: string;
}

/**
 * EVERY SHEET TRANSITION IN THE APP. App.tsx dispatches these by name and has
 * no other way to move the stack.
 */
export const SHEET_TRANSITIONS = {
  /** Header ออกจากระบบ. Under every sheet, so only reachable from the app. */
  open_sign_out: {
    action: { kind: "open", sheet: "sign_out" },
    from: [null],
    site: "App.tsx header, the ออกจากระบบ Pressable",
  },
  /** Start or change the bill's seller. Both callers are in the body. */
  open_seller_picker: {
    action: { kind: "open", sheet: "seller_picker" },
    from: [null],
    site: "App.tsx openPicker, from the start-bill button and CartScreen",
  },
  /** `+ เพิ่มผู้ขาย`, INSIDE the picker. The pair that was observed broken. */
  open_add_seller: {
    action: { kind: "open", sheet: "add_seller" },
    from: ["seller_picker"],
    site: "App.tsx SellerPicker onAddSeller",
  },
  /** CartScreen's save button, in the body. */
  open_confirm_save: {
    action: { kind: "open", sheet: "confirm_save" },
    from: [null],
    site: "App.tsx CartScreen onSubmit",
  },
  /**
   * Header ยอดวันนี้ (P1.23 item 4 unit 3). The SAME entry, label and position as
   * before; it now opens the DASHBOARD, whose today view carries the day's totals,
   * the dimension bars and the per-bill list the standalone daily screen used to
   * show (S24 — absorbed). In the body's header, so a sheet covers it and it is
   * reachable only from the app's own screen.
   */
  open_dashboard: {
    action: { kind: "open", sheet: "dashboard" },
    from: [null],
    site: "App.tsx openDashboard, from the ยอดวันนี้ Pressable",
  },
  /** The บิลล่าสุด strip. */
  open_bills: {
    action: { kind: "open", sheet: "bills" },
    from: [null],
    site: "App.tsx the latest-bill Pressable",
  },
  /**
   * Header ราคารับซื้อ (P1.9). In the BODY's header, so it is reachable only
   * from the app's own screen — a sheet covers it, exactly like ยอดวันนี้ and
   * ออกจากระบบ beside it.
   *
   * THE CONTROL IS NOT ALWAYS DRAWN, and that is not what `from` records. It is
   * hidden from a definite `staff` role (`mayEditPrices`), so the transition is
   * reachable from `null` for the sessions that HAVE the button and from
   * nowhere for the ones that do not. `from` is a claim about WHICH SHEET is on
   * screen when a control is pressed, not about who may press it — the honest
   * home for the role gate is the render, where the proof asserts its absence.
   */
  open_prices: {
    action: { kind: "open", sheet: "prices" },
    from: [null],
    site: "App.tsx header, the ราคารับซื้อ Pressable",
  },
  /**
   * Header ตั้งค่าร้าน (P1.23). In the BODY's header like ยอดวันนี้ and
   * ราคารับซื้อ, so a sheet covers it and it is reachable only from the app's own
   * screen. Drawn for every signed-in session; the WRITE is admin-only and the
   * screen renders read-only for staff (src/settings/shopSettings.ts), which is
   * about who may edit, not which sheet is on screen — so `from` is `[null]`.
   */
  open_settings: {
    action: { kind: "open", sheet: "settings" },
    from: [null],
    site: "App.tsx header, the ตั้งค่าร้าน Pressable",
  },
  /** Header บัญชีของฉัน (P1.23). The account this device holds — profile and the
   *  one password it may change. In the header, so reachable from the app only. */
  open_account: {
    action: { kind: "open", sheet: "account" },
    from: [null],
    site: "App.tsx header, the บัญชีของฉัน Pressable",
  },
  /**
   * P1.21. The seller-history panel, opened from the cart's SELLER HEADER (in the
   * body), so a sheet covers it and it is reachable only from the app's own screen.
   * The header holds the chosen seller for the draft's life; the picker was NOT
   * chosen for it — a single-tap-commit search list over many sellers. A leaf:
   * nothing opens over it, so it adds exactly one reachable stack.
   */
  open_seller_history: {
    action: { kind: "open", sheet: "seller_history" },
    from: [null],
    site: "App.tsx openSellerHistory, from CartScreen's seller header ดูประวัติ control",
  },
  /**
   * P1.23 item 3 phase C. The notice-count control on the main screen. A leaf opened
   * from the app's own screen, listing the collapsed notices in full.
   */
  open_notices: {
    action: { kind: "open", sheet: "notices" },
    from: [null],
    site: "App.tsx the notice-count control, from the arranged notice stack",
  },
  /**
   * P1.23 item 3 phase D. The ⋯ menu on a grade-tier row. Opened from the SETTINGS
   * sheet — the tier list lives inside it — so `from: ["settings"]` and the reached
   * stack is `settings>tier_actions`, a two-deep leaf exactly like
   * `seller_picker>add_seller`. WHICH tier it acts on is App.tsx payload
   * (`tierMenuTarget`), written WITH this dispatch and never inferred by the sheet,
   * the same rule `pendingChange` states for the seller-change dialog.
   */
  open_tier_actions: {
    action: { kind: "open", sheet: "tier_actions" },
    from: ["settings"],
    site: "App.tsx onTierMenu, the ⋯ control on a SettingsScreen tier row",
  },
  /**
   * P3.7. The ADMIN-ONLY จัดการผู้ใช้งาน row inside the settings sheet. Opened from
   * `settings`, so the stack is `settings>users` and closing it returns to settings
   * — the same shape as the tier list living inside settings. The row is hidden
   * from a definite staff session (mayManageUsers), which is about who may open it,
   * not which sheet is on screen, so `from` is `["settings"]`.
   */
  open_users: {
    action: { kind: "open", sheet: "users" },
    from: ["settings"],
    site: "App.tsx onManageUsers, the จัดการผู้ใช้งาน row on SettingsScreen",
  },
  /**
   * P3.7. The ⋯ menu on a roster row. Opened from the USERS sheet, so
   * `from: ["users"]` and the reached stack is `settings>users>user_actions`, a
   * three-deep leaf. WHICH user it acts on is App.tsx payload (`userMenuTarget`),
   * written WITH this dispatch and never inferred, the tier-menu rule.
   */
  open_user_actions: {
    action: { kind: "open", sheet: "user_actions" },
    from: ["users"],
    site: "App.tsx onUserMenu, a roster row on UsersScreen",
  },
  /**
   * A DIFFERENT SELLER WAS PICKED FOR A CART THAT ALREADY HAS LINES.
   *
   * `replace`, and that is a product decision rather than a convenience:
   * cancelling this dialog returns the operator to the CART with the seller
   * they already had, NOT to the picker. Picking a seller is finished — they
   * picked one — and what is being asked is whether to move the lines. Popping
   * back to the picker would make ยกเลิก look like it did nothing, and a person
   * with a truck on the weighbridge would tap it again.
   *
   * Reachable from the add-seller form as well as the picker: creating a seller
   * ends in `onSellerCreated`, which picks that seller through the same
   * function.
   */
  ask_seller_change: {
    action: { kind: "replace", sheet: "confirm_seller_change" },
    from: ["seller_picker", "add_seller"],
    site: "App.tsx chooseSeller, the draft.lines.length > 0 branch",
  },
  /** Every sheet's own close, and Android's back gesture. */
  close_top: {
    action: { kind: "close" },
    from: [...SHEET_KINDS],
    site: "App.tsx sheetBack and every sheet's onClose/onCancel",
  },
  /**
   * THE SESSION ENDED, OR A SELLER WAS CHOSEN. Both mean nothing that was open
   * is still the right thing to look at: after a sign-out the login screen is
   * the body of the app, and after a pick the cart is.
   */
  close_every_sheet: {
    action: { kind: "close_all" },
    from: [null, "sign_out", "seller_picker", "add_seller"],
    site: "App.tsx chooseSeller, onSignOut via applyClearedSession, StatusStrip onSignIn, AddSellerSheet onSignIn",
  },
} as const satisfies Record<string, SheetTransitionSpec>;

export type SheetTransition = keyof typeof SHEET_TRANSITIONS;

export const SHEET_TRANSITION_NAMES = Object.keys(SHEET_TRANSITIONS) as readonly SheetTransition[];

/**
 * ONE TRANSITION, WIDENED.
 *
 * `SHEET_TRANSITIONS` is `as const`, which is what keeps `SheetTransition` a
 * union of the nine names — and it also makes every `from` a fixed-length tuple
 * of literals, so `from.includes(someKind)` is a type error and `from.length ===
 * 0` is "these types have no overlap". Read a spec through here and it is a
 * `SheetTransitionSpec`, which is what a caller walking the table needs.
 */
export function sheetTransition(name: SheetTransition): SheetTransitionSpec {
  return SHEET_TRANSITIONS[name];
}

/** Apply a named transition. The only way App.tsx moves the stack. */
export function applySheetTransition(stack: SheetStack, name: SheetTransition): SheetStack {
  return reduceSheets(stack, sheetTransition(name).action);
}

/**
 * EVERY STACK THE APP CAN REACH, breadth-first from `NO_SHEETS` over the
 * transitions ABOVE, honouring each one's `from`.
 *
 * Returned as sorted `a>b` strings so the proof can compare sets without
 * caring what order the walk found them in.
 */
export function reachableSheetStacks(): readonly string[] {
  const seen = new Set<string>();
  const queue: SheetStack[] = [NO_SHEETS];
  seen.add(stackKey(NO_SHEETS));

  while (queue.length > 0) {
    const stack = queue.shift();
    if (stack === undefined) break;
    const top = topSheet(stack);
    for (const name of SHEET_TRANSITION_NAMES) {
      const spec = sheetTransition(name);
      if (!spec.from.includes(top)) continue;
      const next = reduceSheets(stack, spec.action);
      const key = stackKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return [...seen].sort();
}

/** A stack as one comparable string. `-` is the empty stack, never "". */
export function stackKey(stack: SheetStack): string {
  return stack.length === 0 ? "-" : stack.join(">");
}
