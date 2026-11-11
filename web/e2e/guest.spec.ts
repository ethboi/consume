// The guest wallet, on the sandbox: a visitor with no wallet presses one
// button, gets an account, and feeds the Serpent with it.
//
// The key is made in the page, by the site's own code, and every transaction
// here is signed in the page and sent by the page straight to the sandbox's
// RPC: no test wallet, and no key held by the stage. So the node accepting
// them is the proof that the site writes and signs a NEAR transaction
// correctly (src/lib/signing.ts).
//
// One stand-in: NEAR's testnet faucet, which makes the account on testnet,
// does not know this sandbox. The request the page sends it is answered by the
// harness, which makes the account the same way: that name, that key, some NEAR.

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { FAUCET_URL } from "../src/lib/guest";
import { bySymbol } from "../src/lib/heresies";
import type { Stats, VestView } from "../src/lib/near";
import { CONSUME, INTENTS, RPC_URL, createAccount, keysOf, note, roads, stayLocal, view } from "./chain";

test.describe.configure({ mode: "serial" });

const PEPE = bySymbol("PEPE")!;
const GUEST_NAME = /^consume-guest-[a-z0-9]{4}\.testnet$/;

type Sent = {
  status: Record<string, unknown>;
  transaction: { hash: string; signer_id: string; public_key: string; receiver_id: string; actions: { FunctionCall: { method_name: string } }[] };
  receipts_outcome: { outcome: { logs: string[]; status: Record<string, unknown> } }[];
};

let context: BrowserContext;
let page: Page;
let refused: string[];
let guest = "";
let bondId = "";
/** Whether the stand-in faucet answers. */
let faucetUp = false;
const faucetAsked: { newAccountId: string; newAccountPublicKey: string }[] = [];
/** Every transaction the page itself sent to the RPC and saw finished, oldest first. */
const sentByPage: Sent[] = [];
const pageErrors: string[] = [];

const signButton = () => page.locator("header .sign-button");
const offer = () => page.locator("#feed").getByRole("button", { name: "No wallet? Try as a guest" });
const feedSheet = () => page.locator("dialog.feeding:not(.collecting)");
const stats = () => view<Stats>(CONSUME, "get_stats");
const same = (a: string, b: string) => a.replace(/\/$/, "") === b.replace(/\/$/, "");

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  refused = await stayLocal(page);
  await roads(page);
  await page.route(FAUCET_URL, async (route) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const asked = route.request().postDataJSON() as { newAccountId: string; newAccountPublicKey: string };
    faucetAsked.push(asked);
    if (!faucetUp) return route.fulfill({ status: 503, headers: cors, body: "busy" });
    await createAccount(asked.newAccountId, asked.newAccountPublicKey);
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "{}" });
  });
  page.on("response", async (r) => {
    const req = r.request();
    if (req.method() !== "POST" || !same(r.url(), RPC_URL)) return;
    if ((req.postDataJSON() as { method?: string } | null)?.method !== "broadcast_tx_commit") return;
    const json = (await r.json().catch(() => null)) as { result?: Sent } | null;
    if (json?.result?.transaction) sentByPage.push(json.result);
  });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach("page", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  }
});

test.afterAll(async () => {
  await context?.close();
});

test("with no wallet, Try as a guest makes an account whose only key was made in this browser", async () => {
  await page.goto("/");
  await expect(signButton()).toHaveAccessibleName("Connect wallet");

  // a faucet that is busy is said in one line, and the offer stands
  await offer().click();
  await expect(page.locator("#feed .guest-trouble")).toHaveText("The testnet faucet could not make an account just now. Try again in a moment, or connect a wallet.");
  await expect(signButton()).toHaveAccessibleName("Connect wallet");
  expect(faucetAsked).toHaveLength(1);
  expect(await page.evaluate(() => window.localStorage.getItem("consume.guest")), "an account that was never made is not kept").toBeNull();

  faucetUp = true;
  await offer().click();
  await expect(signButton()).toHaveText(GUEST_NAME);
  guest = (await signButton().innerText()).trim();
  await expect(signButton()).toHaveAttribute("title", "Leave the guest wallet");
  await expect(page.locator("#feed .guest-trouble")).toHaveCount(0);
  await expect(page.locator("#bonds h2")).toHaveText("Your Bonds");

  // the faucet was told the name and the public key, and nothing else
  expect(faucetAsked).toHaveLength(2);
  expect(Object.keys(faucetAsked[1]).sort()).toEqual(["newAccountId", "newAccountPublicKey"]);
  expect(faucetAsked[1].newAccountId).toBe(guest);
  // the chain holds one key for the account: that one
  const keys = await keysOf(guest);
  expect(keys.map((k) => [k.public_key, k.access_key.permission])).toEqual([[faucetAsked[1].newAccountPublicKey, "FullAccess"]]);
  // and its other half is kept by the browser, under the same account
  const kept = JSON.parse((await page.evaluate(() => window.localStorage.getItem("consume.guest")))!) as { accountId: string; publicKey: string; pkcs8: string };
  expect([kept.accountId, kept.publicKey]).toEqual([guest, faucetAsked[1].newAccountPublicKey]);
  expect(kept.pkcs8.length).toBeGreaterThan(40);

  // a reload keeps the guest
  await page.reload();
  await expect(signButton()).toHaveText(guest);
  expect(sentByPage, "making the account signs nothing").toHaveLength(0);
});

test("the guest brings test PEPE and feeds it: each transaction signed in the page, and the Bond is the guest's", async () => {
  const before = await stats();
  const key = faucetAsked[1].newAccountPublicKey;

  await page.locator('label:has(input[name="meme"][value="PEPE"])').click();
  await page.getByRole("button", { name: "Bring test PEPE from Ethereum" }).click();
  await expect(page.locator(".toast")).toContainText("20,000,000 test PEPE arrived in your NEAR Intents balance from Ethereum.");
  const held = BigInt(await view<string>(INTENTS, "mt_balance_of", { account_id: guest, token_id: `nep141:${PEPE.mainnet}` }));
  expect(held).toBe(BigInt(PEPE.faucetWhole) * BigInt(10) ** BigInt(PEPE.decimals));

  await page.locator("label.meal-usd input").fill("50");
  await expect(page.locator(".yield-amount")).toBeVisible();
  await page.getByRole("button", { name: "Feed the Serpent" }).click();
  await expect(feedSheet()).toHaveAttribute("data-stage", "bond");
  bondId = String(Number(before.vests_minted) + 1);
  await expect(feedSheet().locator("#feeding-h")).toHaveText(`Bond № ${bondId} is yours`);

  // three transactions left the page, each in the guest's name under the key the browser made
  await expect.poll(() => sentByPage.length).toBe(3);
  expect(sentByPage.map((o) => [o.transaction.signer_id, o.transaction.public_key, o.transaction.receiver_id, o.transaction.actions.map((a) => a.FunctionCall.method_name)])).toEqual([
    [guest, key, INTENTS, ["simulate_deposit"]],
    [guest, key, CONSUME, ["add_meal_credit"]],
    [guest, key, INTENTS, ["mt_transfer_call"]],
  ]);
  for (const o of sentByPage) expect(o.status, `${o.transaction.hash} went through`).toHaveProperty("SuccessValue");

  // what the contract did with them
  const bond = (await view<VestView | null>(CONSUME, "get_vest", { token_id: bondId }))!;
  expect(bond.owner_id).toBe(guest);
  expect(bond.vest).toMatchObject({ tribe: PEPE.mainnet, released: "0", exited: false });
  const after = await stats();
  expect(after.vests_minted).toBe(bondId);
  expect(BigInt(after.total_eaten_usd) - BigInt(before.total_eaten_usd)).toBe(BigInt(bond.vest.meal_usd));
  const left = BigInt(await view<string>(INTENTS, "mt_balance_of", { account_id: guest, token_id: `nep141:${PEPE.mainnet}` }));
  expect(held - left).toBe(BigInt(bond.vest.eaten));

  // the stand-in indexer hears of them, so the sandbox's Ledger still lists every feeding
  for (const o of sentByPage) await note(o.transaction.hash, guest);
});

test("leaving the guest wallet signs out, and trying again brings the same account back", async () => {
  await page.reload();
  await expect(signButton()).toHaveText(guest);
  await signButton().click();
  await expect(signButton()).toHaveAccessibleName("Connect wallet");
  await expect(page.locator("#bonds h2")).toHaveText("Bonds");
  await page.reload();
  await expect(signButton()).toHaveAccessibleName("Connect wallet");

  // the key was kept: the faucet is asked for nothing, and the Bond is still on the shelf
  await offer().click();
  await expect(signButton()).toHaveText(guest);
  expect(faucetAsked).toHaveLength(2);
  await expect(page.locator("#bonds article.ind").filter({ has: page.locator("h3", { hasText: new RegExp(`№ ${bondId}$`) }) })).toBeVisible();

  expect(sentByPage).toHaveLength(3);
  expect(refused, "the page reached for nothing outside this machine").toEqual([]);
  expect(pageErrors).toEqual([]);
});
