// Boundary and failure tests use fresh Bonds on the real local contracts.
// Only the RPC outage/delay is intercepted; transaction outcomes are never faked.
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { VestView } from "../src/lib/near";
import {
  ALICE, BOB, CONSUME, RPC_URL, TGAS, call, events, giveWallet,
  roads, send, stayLocal, view, type TestWallet,
} from "./chain";

const RESERVE = BigInt("10240000000000000000000");
const TOP_UP = BigInt("100000000000000000000000");
const CHARLIE = "charlie.test.near";
const LONG_ACCOUNT = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzab.test.near";
const bond = (id: string) => view<VestView>(CONSUME, "get_vest", { token_id: id });
const credit = async () => BigInt(await view<string>(CONSUME, "get_meal_credit", { account_id: ALICE }));
const balance = async (account: string) => BigInt(await view<string>(CONSUME, "ft_balance_of", { account_id: account }));
const methods = (wallet: TestWallet) => wallet.last().transactions.flatMap((t) => t.actions.map((a) => a.params.methodName));
const card = (page: Page, id: string) => page.locator("#bonds article.ind").filter({ has: page.locator("h3", { hasText: new RegExp(`№ ${id}$`) }) });

async function setCredit(amount: bigint) {
  if (await credit() > BigInt(0)) await send(ALICE, [{ receiverId: CONSUME, actions: [call("withdraw_meal_credit", {})] }]);
  if (amount > BigInt(0)) await send(ALICE, [{ receiverId: CONSUME, actions: [call("add_meal_credit", {}, amount.toString())] }]);
  expect(await credit()).toBe(amount);
}

async function freshBond(page: Page): Promise<string> {
  const response = await page.request.post("/api/mcp", { data: {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "prepare_feed", arguments: { account_id: ALICE, symbol: "SHIB", usd: "1", bring_test_memecoins: true } },
  } });
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.result.isError ?? false, body.result.content[0].text).toBe(false);
  const plan = JSON.parse(body.result.content[0].text) as { calls: {
    receiver_id: string; method: string; args: Record<string, unknown>; deposit_yocto: string; gas_tgas: number;
  }[] };
  const outcomes = await send(ALICE, plan.calls.map((c) => ({ receiverId: c.receiver_id, actions: [call(c.method, c.args, c.deposit_yocto, TGAS(c.gas_tgas))] })));
  const meals = events<{ vest_id: string | number }>(outcomes, "meal");
  expect(meals, JSON.stringify(outcomes)).toHaveLength(1);
  return String(meals[0].vest_id);
}

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("header .sign-button").click();
  await page.locator(".hot-connector-popup .connect-item", { hasText: "Test wallet" }).click();
}

let wallet: TestWallet;
let id: string;
test.beforeEach(async ({ page }) => {
  await stayLocal(page);
  await roads(page);
  wallet = await giveWallet(page, ALICE);
  id = await freshBond(page);
  await setCredit(RESERVE);
  await connect(page);
});

async function review(page: Page, recipient = BOB): Promise<Locator> {
  await card(page, id).getByRole("button", { name: "Send this Bond" }).click();
  const form = page.getByRole("form", { name: `Send Bond ${id}`, exact: true });
  await form.getByLabel("Recipient’s NEAR account").fill(recipient);
  await form.getByRole("button", { name: "Review transfer" }).click();
  await expect(form.getByRole("button", { name: "Confirm and send Bond" })).toBeEnabled();
  return form;
}

async function confirm(page: Page, form: Locator, recipient = BOB) {
  await form.getByRole("button", { name: "Confirm and send Bond" }).click();
  await expect(page.locator(".toast")).toContainText(`Bond ${id} sent to ${recipient}`);
  expect((await bond(id)).owner_id).toBe(recipient);
  expect(wallet.last().transactions).toHaveLength(1);
  expect(wallet.requested.at(-1)?.signerId).toBe(ALICE);
}

for (const [label, amount, topUp] of [
  ["above", RESERVE + BigInt(1), false],
  ["exactly at", RESERVE, false],
  ["one yocto below", RESERVE - BigInt(1), true],
] as const) {
  test(`credit ${label} the transfer reserve uses the reviewed funding`, async ({ page }) => {
    await setCredit(amount);
    const before = (await bond(id)).vest;
    const form = await review(page);
    await expect(form).toContainText(topUp ? "first adds 0.1 NEAR" : "existing credit covers");
    await confirm(page, form);
    expect(methods(wallet)).toEqual(topUp ? ["add_meal_credit", "nft_transfer"] : ["nft_transfer"]);
    expect(await credit()).toBe(amount + (topUp ? TOP_UP : BigInt(0)) - RESERVE);
    expect((await bond(id)).vest).toEqual(before);
  });
}

test("a fresh recipient's first Collect registers them and pays only them", async ({ page, browser }) => {
  expect(await view(CONSUME, "storage_balance_of", { account_id: CHARLIE })).toBeNull();
  await confirm(page, await review(page, CHARLIE), CHARLIE);
  const senderBalance = await balance(ALICE);
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  try {
    const recipientPage = await context.newPage();
    await stayLocal(recipientPage);
    await roads(recipientPage);
    const recipientWallet = await giveWallet(recipientPage, CHARLIE);
    await expect.poll(async () => BigInt((await bond(id)).claimable) > BigInt(0)).toBe(true);
    await connect(recipientPage);
    await card(recipientPage, id).getByRole("button", { name: "Collect", exact: true }).click();
    await expect(recipientPage.locator("dialog.collecting")).toHaveAttribute("data-stage", "received");
    expect(recipientWallet.last().transactions).toHaveLength(1);
    expect(methods(recipientWallet)).toEqual(["storage_deposit", "claim"]);
    const bounds = await view<{ min: string }>(CONSUME, "storage_balance_bounds");
    expect(recipientWallet.last().transactions[0].actions[0].params).toMatchObject({
      deposit: bounds.min, args: { registration_only: true },
    });
    expect(recipientWallet.requested[0].signerId).toBe(CHARLIE);
    expect(await view(CONSUME, "storage_balance_of", { account_id: CHARLIE })).not.toBeNull();
    const [paid] = events<{ owner: string; amount: string }>(recipientWallet.last().outcomes, "claim");
    expect(paid.owner).toBe(CHARLIE);
    expect(BigInt(paid.amount)).toBeGreaterThan(BigInt(0));
    expect(await balance(CHARLIE)).toBe(BigInt(paid.amount));
    expect(await balance(ALICE)).toBe(senderBalance);
  } finally { await context.close(); }
});

for (const initialTopUp of [false, true]) {
  test(`credit changing after review requires a new confirmation (${initialTopUp ? "funded" : "depleted"})`, async ({ page }) => {
    await setCredit(initialTopUp ? BigInt(0) : RESERVE);
    const form = await review(page);
    await setCredit(initialTopUp ? RESERVE : BigInt(0));
    await form.getByRole("button", { name: "Confirm and send Bond" }).click();
    await expect(form).toContainText(initialTopUp ? "existing credit covers" : "first adds 0.1 NEAR");
    expect(wallet.requested).toHaveLength(0);
    expect((await bond(id)).owner_id).toBe(ALICE);
    await confirm(page, form);
    expect(methods(wallet)).toEqual(initialTopUp ? ["nft_transfer"] : ["add_meal_credit", "nft_transfer"]);
  });
}

test("ownership changing after review prevents a signing request", async ({ page }) => {
  const form = await review(page);
  await send(ALICE, [{ receiverId: CONSUME, actions: [call("nft_transfer", { receiver_id: BOB, token_id: id }, "1")] }]);
  await form.getByRole("button", { name: "Confirm and send Bond" }).click();
  await expect(form.getByRole("alert")).toContainText("no longer holds");
  expect(wallet.requested).toHaveLength(0);
  expect((await bond(id)).owner_id).toBe(BOB);
  await expect(page.locator(".toast")).toHaveCount(0);
});

for (const next of [BOB, null]) {
  test(`wallet ${next ? "switching accounts" : "disconnecting"} after review prevents signing`, async ({ page }) => {
    const form = await review(page);
    await wallet.switchAccount(next);
    await form.getByRole("button", { name: "Confirm and send Bond" }).click();
    await expect(form.getByRole("alert")).toContainText("wallet changed");
    expect(wallet.requested).toHaveLength(0);
    expect((await bond(id)).owner_id).toBe(ALICE);
    expect(await credit()).toBe(RESERVE);
    await wallet.switchAccount(ALICE);
    await confirm(page, form);
    expect(wallet.requested).toHaveLength(1);
  });
}

test("wallet switching while the confirmation preflight is pending prevents signing", async ({ page }) => {
  const form = await review(page);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const pending = new Promise<void>((resolve) => { entered = resolve; });
  await page.route(RPC_URL, async (route) => {
    const params = route.request().postDataJSON()?.params;
    if (params?.request_type === "view_account" && params.account_id === BOB) {
      entered();
      await gate;
    }
    await route.fallback();
  });
  await form.getByRole("button", { name: "Confirm and send Bond" }).click();
  await pending;
  try {
    await expect(form.getByRole("button", { name: "Checking or waiting for your wallet…" })).toBeDisabled();
    await wallet.switchAccount(BOB);
  } finally { release(); }
  await expect(form.getByRole("alert")).toContainText("wallet changed");
  expect(wallet.requested).toHaveLength(0);
  expect((await bond(id)).owner_id).toBe(ALICE);
});

test("execution failure rolls back the bundled top-up and never shows success", async ({ page }) => {
  await setCredit(BigInt(0));
  const form = await review(page);
  wallet.beforeNextSign(async () => {
    // Another session sends the Bond after preflight; leave no credit behind.
    await setCredit(RESERVE);
    await send(ALICE, [{ receiverId: CONSUME, actions: [call("nft_transfer", { receiver_id: BOB, token_id: id }, "1")] }]);
    expect(await credit()).toBe(BigInt(0));
  });
  await form.getByRole("button", { name: "Confirm and send Bond" }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  expect(wallet.signed).toHaveLength(1);
  expect(wallet.last().transactions).toHaveLength(1);
  expect(methods(wallet)).toEqual(["add_meal_credit", "nft_transfer"]);
  expect(wallet.last().outcomes[0].status).toHaveProperty("Failure");
  expect(await credit()).toBe(BigInt(0));
  expect((await bond(id)).owner_id).toBe(BOB);
  await expect(page.locator(".toast")).toHaveCount(0);
});

test("recipient RPC failure signs nothing and recovers on retry", async ({ page }) => {
  const form = await review(page);
  let fail = true;
  await page.route(RPC_URL, async (route) => {
    const params = route.request().postDataJSON()?.params;
    if (fail && params?.request_type === "view_account" && params.account_id === BOB) {
      await route.fulfill({ json: { jsonrpc: "2.0", id: "near", error: { cause: { name: "INTERNAL_ERROR" } } } });
    } else await route.fallback();
  });
  await form.getByRole("button", { name: "Confirm and send Bond" }).click();
  await expect(form.getByRole("alert")).toContainText("Could not check the recipient");
  expect(wallet.requested).toHaveLength(0);
  expect((await bond(id)).owner_id).toBe(ALICE);
  await expect(page.locator(".toast")).toHaveCount(0);
  fail = false;
  await confirm(page, form);
  expect(wallet.requested).toHaveLength(1);
});

for (const width of [320, 390]) {
  test(`the transfer form fits a ${width}px screen with a 64-character recipient`, async ({ page }) => {
    expect(LONG_ACCOUNT).toHaveLength(64);
    await page.setViewportSize({ width, height: 844 });
    const form = await review(page, LONG_ACCOUNT);
    await expect(form.locator(".bond-recipient")).toHaveText(LONG_ACCOUNT);
    for (const element of [form, form.locator(".bond-recipient"), ...await form.getByRole("button").all()]) {
      const box = await element.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(form).toHaveCount(0);
    expect(wallet.requested).toHaveLength(0);
    expect((await bond(id)).owner_id).toBe(ALICE);
  });
}
