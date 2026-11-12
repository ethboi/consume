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
//
// When the faucet will not, the page asks the site's own sponsor (/api/guest).
// This build has no sponsor set, so the route answers 503 and the page says the
// faucet's line, which the first test checks. The last test stands in for a
// sponsor that is set: on testnet it calls `create_account` on `testnet`, a
// contract this sandbox does not have, so the harness makes the account there
// too. What the route accepts and signs is unit-tested in src/lib/sponsor.test.ts.

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { FAUCET_URL, SPONSOR_URL } from "../src/lib/guest";
import { bySymbol } from "../src/lib/heresies";
import { TOUR } from "../src/lib/tour";
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
/** What the site's own sponsor route answered each time the page asked it. */
const sponsorAnswered: number[] = [];
/** Every transaction the page itself sent to the RPC and saw finished, oldest first. */
const sentByPage: Sent[] = [];
const pageErrors: string[] = [];

const signButton = () => page.locator("header .sign-button");
const offer = () => page.locator("#feed").getByRole("button", { name: "No wallet? Try as a guest" });
const feedSheet = () => page.locator("dialog.feeding:not(.collecting)");
const tourCard = () => page.getByRole("dialog", { name: "A tour of the page" });
/** Take the tour to its last stop, where a visitor with no wallet is offered a guest wallet. */
async function tourToTheEnd() {
  await page.getByRole("button", { name: "Take the tour" }).click();
  for (let i = 1; i < TOUR.length; i++) await tourCard().getByRole("button", { name: "Next", exact: true }).click();
  await expect(tourCard().locator(".tour-at")).toHaveText("VI of VI");
}
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
    if (req.method() === "POST" && new URL(r.url()).pathname === SPONSOR_URL) sponsorAnswered.push(r.status());
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

  // the tour ends by offering the guest wallet; a busy faucet is said in one line there, and the feeding is still one press away
  await tourToTheEnd();
  await expect(tourCard().getByRole("button", { name: "Have a wallet? Go to the feeding" })).toBeVisible();
  await tourCard().getByRole("button", { name: "Try as a guest" }).click();
  await expect(tourCard().getByRole("alert")).toHaveText("The testnet faucet could not make an account just now. Try again in a moment, or connect a wallet.");
  await expect(tourCard().getByRole("button", { name: "Try as a guest" })).toHaveCount(0);
  await tourCard().getByRole("button", { name: "Feed the Serpent" }).click();
  await expect(tourCard()).toHaveCount(0);
  await expect(page.locator("#feed")).toBeInViewport();
  await expect(signButton()).toHaveAccessibleName("Connect wallet");
  expect(faucetAsked).toHaveLength(1);

  // the same under the feeding panel, where the offer stands
  await offer().click();
  await expect(page.locator("#feed .guest-trouble")).toHaveText("The testnet faucet could not make an account just now. Try again in a moment, or connect a wallet.");
  await expect(signButton()).toHaveAccessibleName("Connect wallet");
  expect(faucetAsked).toHaveLength(2);
  // each time the faucet refused, the site's sponsor was asked next; this build has none, and its route said so
  expect(sponsorAnswered).toEqual([503, 503]);
  expect(await page.evaluate(() => window.localStorage.getItem("consume.guest")), "an account that was never made is not kept").toBeNull();

  faucetUp = true;
  await offer().click();
  await expect(signButton()).toHaveText(GUEST_NAME);
  guest = (await signButton().innerText()).trim();
  await expect(signButton()).toHaveAttribute("title", "Leave the guest wallet");
  await expect(page.locator("#feed .guest-trouble")).toHaveCount(0);
  await expect(page.locator("#bonds h2")).toHaveText("Your Bonds");

  // the faucet was told the name and the public key, and nothing else; it answered, so the sponsor was not asked
  expect(faucetAsked).toHaveLength(3);
  expect(sponsorAnswered).toHaveLength(2);
  expect(Object.keys(faucetAsked[2]).sort()).toEqual(["newAccountId", "newAccountPublicKey"]);
  expect(faucetAsked[2].newAccountId).toBe(guest);
  // the chain holds one key for the account: that one
  const keys = await keysOf(guest);
  expect(keys.map((k) => [k.public_key, k.access_key.permission])).toEqual([[faucetAsked[2].newAccountPublicKey, "FullAccess"]]);
  // and its other half is kept by the browser, under the same account
  const kept = JSON.parse((await page.evaluate(() => window.localStorage.getItem("consume.guest")))!) as { accountId: string; publicKey: string; pkcs8: string };
  expect([kept.accountId, kept.publicKey]).toEqual([guest, faucetAsked[2].newAccountPublicKey]);
  expect(kept.pkcs8.length).toBeGreaterThan(40);

  // a reload keeps the guest
  await page.reload();
  await expect(signButton()).toHaveText(guest);
  expect(sentByPage, "making the account signs nothing").toHaveLength(0);
});

test("the guest brings test PEPE and feeds it: each transaction signed in the page, and the Bond is the guest's", async () => {
  const before = await stats();
  const key = faucetAsked[2].newAccountPublicKey;

  await page.locator('label:has(input[name="meme"][value="PEPE"])').click();
  await expect(page.locator(".pick-foot")).toContainText("No PEPE yet?");
  await page.getByRole("button", { name: "Get free test PEPE" }).click();
  await expect(page.locator(".toast")).toContainText("20,000,000 test PEPE arrived in your NEAR Intents balance from Ethereum.");
  // holding some, the question goes and the button offers more
  await expect(page.getByRole("button", { name: "Get more test PEPE" })).toBeVisible();
  await expect(page.locator(".pick-foot")).not.toContainText("No PEPE yet?");
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

  // the key was kept, so the tour's last stop brings the same guest back and lands on the feeding:
  // the faucet is asked for nothing, and the Bond is still on the shelf
  await tourToTheEnd();
  await tourCard().getByRole("button", { name: "Try as a guest" }).click();
  await expect(signButton()).toHaveText(guest);
  await expect(tourCard()).toHaveCount(0);
  await expect(page.locator("#feed")).toBeInViewport();
  expect(faucetAsked).toHaveLength(3);

  // with a wallet in hand the tour ends as it always did
  await tourToTheEnd();
  await expect(tourCard().getByRole("button", { name: "Try as a guest" })).toHaveCount(0);
  await expect(tourCard().getByRole("button", { name: "Have a wallet? Go to the feeding" })).toHaveCount(0);
  await tourCard().getByRole("button", { name: "Feed the Serpent" }).click();
  await expect(tourCard()).toHaveCount(0);
  await expect(page.locator("#bonds article.ind").filter({ has: page.locator("h3", { hasText: new RegExp(`№ ${bondId}$`) }) })).toBeVisible();

  expect(sentByPage).toHaveLength(3);
  expect(refused, "the page reached for nothing outside this machine").toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("when the faucet will not, the site's sponsor is asked for the same account and told only its name and public key", async ({ browser, request }) => {
  // the route itself: it makes only a guest wallet's own name, with a whole ed25519 key, and this build has no sponsor
  const key = `ed25519:${"1".repeat(32)}`;
  for (const [data, status] of [
    [{ accountId: "alice.testnet", publicKey: key }, 400],
    [{ accountId: "consume-guest-ab12.testnet.evil.testnet", publicKey: key }, 400],
    [{ accountId: "consume-guest-ab12.testnet", publicKey: "ed25519:short" }, 400],
    [{ accountId: "consume-guest-ab12.testnet", publicKey: key }, 503],
  ] as const) {
    const res = await request.post(`${process.env.E2E_BASE_URL}${SPONSOR_URL}`, { data });
    expect(res.status(), JSON.stringify(data)).toBe(status);
  }

  // a visitor who has never been here, the faucet down, and a sponsor that answers
  const fresh = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  try {
    const visitor = await fresh.newPage();
    const errors: string[] = [];
    visitor.on("pageerror", (e) => errors.push(e.message));
    const reached = await stayLocal(visitor);
    await roads(visitor);
    let faucetRefused = 0;
    await visitor.route(FAUCET_URL, (route) => {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      faucetRefused++;
      return route.fulfill({ status: 503, headers: cors, body: "busy" });
    });
    const sponsorAsked: { accountId: string; publicKey: string }[] = [];
    await visitor.route(`**${SPONSOR_URL}`, async (route) => {
      const asked = route.request().postDataJSON() as { accountId: string; publicKey: string };
      sponsorAsked.push(asked);
      await createAccount(asked.accountId, asked.publicKey);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accountId: asked.accountId }) });
    });

    await visitor.goto("/");
    await visitor.locator("#feed").getByRole("button", { name: "No wallet? Try as a guest" }).click();
    const button = visitor.locator("header .sign-button");
    await expect(button).toHaveText(GUEST_NAME);
    const second = (await button.innerText()).trim();
    expect(second).not.toBe(guest);
    await expect(visitor.locator("#feed .guest-trouble")).toHaveCount(0);

    // the faucet was asked first and once; then the sponsor, with the name and the public key and nothing else
    expect(faucetRefused).toBe(1);
    expect(sponsorAsked).toHaveLength(1);
    expect(Object.keys(sponsorAsked[0]).sort()).toEqual(["accountId", "publicKey"]);
    expect(sponsorAsked[0].accountId).toBe(second);
    // the chain holds one key for the account, the one this browser made and kept
    const keys = await keysOf(second);
    expect(keys.map((k) => [k.public_key, k.access_key.permission])).toEqual([[sponsorAsked[0].publicKey, "FullAccess"]]);
    const kept = JSON.parse((await visitor.evaluate(() => window.localStorage.getItem("consume.guest")))!) as { accountId: string; publicKey: string; pkcs8: string };
    expect([kept.accountId, kept.publicKey]).toEqual([second, sponsorAsked[0].publicKey]);

    expect(reached, "the page reached for nothing outside this machine").toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await fresh.close();
  }
});
