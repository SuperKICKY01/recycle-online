/**
 * SHOP AND PEOPLE THROUGH THE REAL SCREENS (B6), against a scratch server, signed in as a per-run
 * OWNER (the only role holding roles.manage).
 *
 *   npm run prove:peopleflow
 *
 *   P1 the shop: the name is shown read-only; address and phone saved read back over HTTP; an emptied
 *      phone is null over HTTP
 *   P2 an account added on screen exists over HTTP with its role; its panel ticks equal its role's set;
 *      deactivated, it cannot sign in (HTTP); brought back, it can
 *   P3 ticks: the owner's column is ticked and locked, the roles.manage row locked; ticking
 *      money.view_own for staff and saving -> GET /roles holds it AND that new staff account's own
 *      token reads the summary (200); unticked -> refused (403) on its next request
 *   P4 no request loop: a screen left alone sends no GET /roles or GET /users for three seconds
 *   P5 the drawer: a shift opened with 1500 reads back "1500.00"; closed at 1450.5, the screen shows
 *      the SERVER's expected, counted and variance strings grouped; the reason saved reads back
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _electron, type ElectronApplication, type Page } from "playwright-core";

import { display } from "../shared/money";
import { check, DESKTOP_ROOT, finish, header } from "./harness";
import { http, startScratchServer } from "./scratchServer";

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env["RECYCLE_SHOT_DIR"];
  if (dir !== undefined && dir !== "") await page.screenshot({ path: join(dir, `${name}.png`) });
}

interface R { id: string; code: string; permissions: string[] }

void finish("PROVE_PEOPLEFLOW", async () => {
  header("P shop and people, screen to server");
  const userData = mkdtempSync(join(tmpdir(), "recycle-desktop-people-"));
  const server = await startScratchServer("owner");
  const { info } = server;
  const run = randomUUID().slice(0, 6).toLowerCase();
  let app: ElectronApplication | null = null;
  try {
    const login = async (u: string, p: string) => http(info.base, "POST", "/auth/login", undefined, { tenant_id: info.tenant_id, username: u, password: p });
    const token = ((await login(info.username, info.password)).json as { access_token: string }).access_token;
    // A shift left open on the dev copy would stand in the way of P5's open: close it first, by HTTP.
    const pre = await http(info.base, "GET", "/shifts/current", token);
    if (pre.status === 200) await http(info.base, "POST", `/shifts/${(pre.json as { id: string }).id}/close`, token, { counted_cash: "0" });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const executablePath = require("electron") as unknown as string;
    app = await _electron.launch({ executablePath, args: [DESKTOP_ROOT], env: { ...process.env, RECYCLE_USER_DATA: userData } as Record<string, string> });
    const page = await app.firstWindow();
    await page.fill('input[name="apiBase"]', info.base);
    await page.fill('input[name="shopCode"]', info.shop_code);
    await page.click('button[type="submit"]');
    await page.fill('input[name="username"]', info.username);
    await page.fill('input[name="password"]', info.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector(`[data-signed-in="${info.username}"]`, { timeout: 20_000 });
    await page.click('[data-nav="people"]');
    await page.waitForSelector("[data-shop-form]", { timeout: 20_000 });

    // P1
    const shopBefore = (await http(info.base, "GET", "/shop", token)).json as { name: string };
    const nameShown = await page.inputValue('input[name="shopName"]');
    const nameLocked = await page.locator('input[name="shopName"]').getAttribute("readonly");
    await page.fill('textarea[name="shopAddress"]', `99/9 ถนนทดสอบ ${run}`);
    await page.fill('input[name="shopPhone"]', "02-555-0100");
    await page.click("[data-shop-form] .btn-primary");
    await page.waitForSelector("[data-panel-saved]", { timeout: 15_000 });
    const s1 = (await http(info.base, "GET", "/shop", token)).json as { address: string | null; phone: string | null };
    await shot(page, "b6_shop");
    await page.fill('input[name="shopPhone"]', "");
    await page.click("[data-shop-form] .btn-primary");
    await page.waitForTimeout(1200);
    const s2 = (await http(info.base, "GET", "/shop", token)).json as { phone: string | null };
    check("P1 name shown and locked; address and phone read back; an emptied phone is null",
      nameShown === shopBefore.name && nameLocked !== null && s1.address === `99/9 ถนนทดสอบ ${run}` && s1.phone === "02-555-0100" && s2.phone === null,
      JSON.stringify({ nameShown, s1, s2 }));

    // P2
    const staffName = `st.${run}`;
    const staffPw = `pw-${randomUUID()}`;
    await page.click('[data-tab="users"]');
    await page.click('[data-add="users"]');
    const np = page.locator('[data-panel="new-user"]');
    await np.locator('input[name="username"]').fill(staffName);
    await np.locator('input[name="full_name"]').fill(`พนักงาน ${run}`);
    await np.locator('select[name="role"]').selectOption("staff");
    await np.locator('input[name="password"]').fill(staffPw);
    await np.locator("button", { hasText: "เพิ่มบัญชี" }).click();
    await page.waitForSelector('[data-panel="user"]', { timeout: 15_000 });
    const users = (await http(info.base, "GET", "/users?include_inactive=true", token)).json as { users: { user_id: string; username: string; role: string; is_active: boolean }[] };
    const made = users.users.find((u) => u.username === staffName);
    const roles = ((await http(info.base, "GET", "/roles", token)).json as { roles: R[] }).roles;
    const staffRole = roles.find((r) => r.code === "staff");
    const shownTicks = await page.locator("[data-user-ticks] [data-has]").evaluateAll((els) => els.map((e) => e.getAttribute("data-has")));
    const ticksAgree = staffRole !== undefined && JSON.stringify([...shownTicks].sort()) === JSON.stringify([...staffRole.permissions].sort());
    await shot(page, "b6_users");
    await page.click("[data-user-toggle]");
    await page.waitForSelector("[data-panel-saved]", { timeout: 15_000 });
    const refused = await login(staffName, staffPw);
    await page.click("[data-user-toggle]");
    await page.waitForFunction(() => document.querySelector("[data-user-toggle]")?.textContent === "ปิดใช้งานบัญชี", null, { timeout: 15_000 });
    const back = await login(staffName, staffPw);
    check("P2 the account exists with its role; its ticks are its role's; deactivated it cannot sign in; reactivated it can",
      made?.role === "staff" && ticksAgree && refused.status >= 400 && back.status === 200,
      JSON.stringify({ role: made?.role, ticksAgree, refused: refused.status, back: back.status }));

    // P3
    const staffToken = (back.json as { access_token: string }).access_token;
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const summary = () => http(info.base, "GET", `/reports/summary?from_date=${today}&to_date=${today}&by=day`, staffToken);
    await page.click('[data-tab="roles"]');
    await page.waitForSelector("[data-roles]", { timeout: 15_000 });
    // The saved line is cleared by any new tick, so its appearance is THIS save's answer.
    const saveTicks = async () => {
      await page.getByRole("button", { name: /^บันทึกสิทธิ์/ }).click();
      await page.waitForSelector("[data-panel-saved]", { timeout: 15_000 });
    };
    const ownerLocked = await page.locator('[data-tick^="owner:"]').evaluateAll((els) => els.every((e) => (e as HTMLInputElement).disabled && (e as HTMLInputElement).checked));
    const rmLocked = await page.locator('[data-tick$=":roles.manage"], [data-tick$=":users.manage"]').evaluateAll((els) => els.length >= 6 && els.every((e) => (e as HTMLInputElement).disabled));
    const had = staffRole?.permissions.includes("money.view_own") === true;
    if (had) { // start from "without" so the cell measures a change in BOTH directions
      await page.uncheck('[data-tick="staff:money.view_own"]');
      await saveTicks();
    }
    const before = await summary();
    await page.check('[data-tick="staff:money.view_own"]');
    await saveTicks();
    const afterOn = await summary();
    const rolesNow = ((await http(info.base, "GET", "/roles", token)).json as { roles: R[] }).roles;
    await shot(page, "b6_roles");
    await page.uncheck('[data-tick="staff:money.view_own"]');
    await saveTicks();
    const afterOff = await summary();
    check("P3 owner column and roles.manage locked; ticking money.view_own admits the staff token, unticking refuses it",
      ownerLocked && rmLocked && before.status === 403 && afterOn.status === 200 && afterOff.status === 403
        && rolesNow.find((r) => r.code === "staff")?.permissions.includes("money.view_own") === true,
      JSON.stringify({ ownerLocked, rmLocked, before: before.status, afterOn: afterOn.status, afterOff: afterOff.status }));
    // 3b (2026-10-17): the phone now resumes a restored permission by itself (app foreground or
    // ลองอีกครั้ง), so the role screen must no longer tell the owner to make the yard sign out and in.
    const hint = (await page.locator("[data-phone-hint]").innerText()).trim();
    check("P3b the role screen's phone note says the phone resumes by itself (foreground or ลองอีกครั้ง), no sign-out",
      hint.includes("ลองอีกครั้ง") && hint.includes("ไม่ต้องออกจากระบบ") && !hint.includes("ออกจากระบบแล้วเข้าใหม่"), hint);

    // P4
    const reads = () => (server.log().match(/GET \/(roles|users)[ ?]/g) ?? []).length;
    await page.click('[data-tab="users"]');
    await page.waitForSelector("[data-users]", { timeout: 15_000 });
    await page.waitForTimeout(800);
    const r0 = reads();
    await page.waitForTimeout(3000);
    const r1 = reads();
    check("P4 a screen left alone sends no reads", r1 === r0 && r0 > 0, `GET /roles|/users: ${String(r0)} -> ${String(r1)}`);

    // P5
    await page.click('[data-tab="drawer"]');
    await page.waitForSelector("[data-no-shift]", { timeout: 15_000 });
    await page.fill('input[name="openingFloat"]', "1500");
    await page.getByRole("button", { name: "เปิดกะ", exact: true }).click();
    await page.waitForSelector("[data-open-shift]", { timeout: 15_000 });
    const running = await page.locator("[data-running]").innerText({ timeout: 10_000 }).catch(() => "absent");
    const opened = (await http(info.base, "GET", "/shifts/current", token)).json as { id: string; opening_float: string };
    await shot(page, "b6_drawer_open");
    await page.fill('input[name="countedCash"]', "1450.5");
    await page.getByRole("button", { name: "ปิดกะ", exact: true }).click();
    await page.waitForSelector("[data-closed]", { timeout: 15_000 });
    const exp = await page.locator("[data-expected]").innerText();
    const cnt = await page.locator("[data-counted]").innerText();
    const vr = await page.locator("[data-variance]").innerText();
    await page.fill('textarea[name="varianceReason"]', `นับผิดตอนเปิดกะ ${run}`);
    await page.getByRole("button", { name: "บันทึกเหตุผล", exact: true }).click();
    await page.waitForSelector("[data-reason-saved]", { timeout: 15_000 });
    await shot(page, "b6_drawer_closed");
    const after = await http(info.base, "GET", "/shifts/current", token);
    // The closed shift is read back through the close's own answer on screen and the reason's write;
    // GET /shifts/current must now say no shift is open.
    check("P5 opened at 1500.00; closed at 1450.5 the screen shows the server's strings grouped; the reason saved; no shift open",
      opened.opening_float === "1500.00" && running === `${display("1500.00")} บาท` && exp === `${display("1500.00")} บาท` && cnt === `${display("1450.50")} บาท` && vr === `${display("-49.50")} บาท`
        && after.status === 404,
      JSON.stringify({ opened: opened.opening_float, running, exp, cnt, vr, after: after.status }));

    // P6 (widened 2026-10-19): an ADMIN looking at the OWNER's row is offered no account action --
    // every one would be refused (owner_*_owner_only) -- and sees why; the same admin on a staff row
    // still has them. A per-run admin is made by HTTP; a SECOND instance signs in as it.
    const adminName = `ad.${run}`;
    const adminPw = `pw-${randomUUID()}`;
    const madeAdmin = await http(info.base, "POST", "/users", token, { username: adminName, full_name: `ผู้ดูแล ${run}`, role: "admin", password: adminPw });
    const adminData = mkdtempSync(join(tmpdir(), "recycle-desktop-people-admin-"));
    const app2 = await _electron.launch({ executablePath, args: [DESKTOP_ROOT], env: { ...process.env, RECYCLE_USER_DATA: adminData } as Record<string, string> });
    try {
      const p2 = await app2.firstWindow();
      await p2.fill('input[name="apiBase"]', info.base);
      await p2.fill('input[name="shopCode"]', info.shop_code);
      await p2.click('button[type="submit"]');
      await p2.fill('input[name="username"]', adminName);
      await p2.fill('input[name="password"]', adminPw);
      await p2.click('button[type="submit"]');
      await p2.waitForSelector(`[data-signed-in="${adminName}"]`, { timeout: 20_000 });
      await p2.click('[data-nav="people"]');
      await p2.click('[data-tab="users"]');
      await p2.waitForSelector("[data-users]", { timeout: 15_000 });
      await p2.locator("tr", { hasText: info.username }).locator("button.link").click();
      await p2.waitForSelector(`[data-panel="user"][aria-label="บัญชี ${info.username}"]`, { timeout: 15_000 });
      const panel = p2.locator('[data-panel="user"]');
      const ownerNote = await panel.locator("[data-owner-locked]").count();
      const ownerButtons = await panel.locator(".void-actions button").count();
      const ownerPwField = await panel.locator('input[name="newPassword"]').count();
      await shot(p2, "b6_owner_row_as_admin");
      await p2.locator("tr", { hasText: staffName }).locator("button.link").click();
      await p2.waitForSelector(`[data-panel="user"][aria-label="บัญชี ${staffName}"]`, { timeout: 15_000 });
      const staffButtons = await p2.locator('[data-panel="user"] .void-actions button').count();
      const staffNote = await p2.locator('[data-panel="user"] [data-owner-locked]').count();
      check("P6 an admin on the OWNER's row: no account button, no password field, the owner note shown; on a staff row the buttons are there",
        madeAdmin.status === 201 && ownerNote === 1 && ownerButtons === 0 && ownerPwField === 0 && staffButtons >= 4 && staffNote === 0,
        JSON.stringify({ madeAdmin: madeAdmin.status, ownerNote, ownerButtons, ownerPwField, staffButtons, staffNote }));
    } finally {
      await app2.close().catch(() => undefined);
      rmSync(adminData, { recursive: true, force: true });
    }
  } finally {
    const dir = process.env["RECYCLE_SHOT_DIR"];
    if (app !== null && dir !== undefined && dir !== "") await (await app.firstWindow()).screenshot({ path: join(dir, "b6_last_state.png") }).catch(() => undefined);
    if (app !== null) await app.close().catch(() => undefined);
    server.proc.kill();
    rmSync(userData, { recursive: true, force: true });
  }
});
