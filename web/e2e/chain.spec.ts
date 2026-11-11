// The whole of CONSUME, end to end, on a NEAR sandbox: the contract as it is
// built from contracts/, the site as it is built from web/, and a browser with
// a test wallet. One story, told in order, by one page.
//
// Every step is checked twice: what the page shows, and what the contract
// itself answers when asked directly. Nothing here stubs the contract or the
// site's reading of it. See e2e/README.md for what is a stand-in and why.

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { compact, fromRaw, toRaw, usd, usdValue } from "../src/lib/format";
import { bySymbol, type Heresy } from "../src/lib/heresies";
import type { LedgerEntry } from "../src/lib/ledger";
import type { MealQuote, RedeemQuote, Stats, Tribe, VestView } from "../src/lib/near";
import { ALICE, BOB, CONSUME, INTENTS, ONE_YOCTO, TGAS, events, giveWallet, roads, send, sentHashes, stayLocal, view, type TestWallet, type Transaction } from "./chain";

test.describe.configure({ mode: "serial" });

const PEPE = bySymbol("PEPE")!;
const KAT = bySymbol("NearKat")!;
const DOGE = bySymbol("DOGE")!;
const E18 = BigInt(10) ** BigInt(18);
const ZERO = BigInt(0);
const big = (v: string | number | bigint) => BigInt(v);
/** One test deposit, as the stage sets it: about $100 of the memecoin. */
const drip = (h: Heresy) => big(h.faucetWhole) * BigInt(10) ** big(h.decimals);
const intents = (h: { mainnet: string }) => `nep141:${h.mainnet}`;

type MealEvent = { vest_id: string | number; eater: string; tribe: string; eaten: string; meal_usd: string; tithe_usd: string; consume: string; bonus: boolean; via_intents: boolean };
type ClaimEvent = { vest_id: string | number; owner: string; amount: string };
type ExitEvent = { vest_id: string | number; owner: string; payout: string; forfeited: string };
type RedeemEvent = { account: string; burned: string; shares: [string, string][] };
type Split = { builder: number; others: number };
type Ledger = { entries: LedgerEntry[]; discovery_limits_reached: boolean; history_completeness: string; builder: string | null; feedings: Split; feeders: Split };

const stats = () => view<Stats>(CONSUME, "get_stats");
const tribes = () => view<[string, Tribe][]>(CONSUME, "get_tribes");
const bond = (id: string) => view<VestView | null>(CONSUME, "get_vest", { token_id: id });
const consumeOf = async (account: string) => big(await view<string>(CONSUME, "ft_balance_of", { account_id: account }));
const heldOnIntents = async (account: string, h: { mainnet: string }) => big(await view<string>(INTENTS, "mt_balance_of", { account_id: account, token_id: intents(h) }));
const stomachOf = async (h: { mainnet: string }) => big((await tribes()).find(([id]) => id === h.mainnet)![1].stomach);
const stomachUsd = async () => (await tribes()).reduce((a, [, t]) => a + usdValue(t.stomach, t.decimals, t.price_e18), ZERO);

// What backs each $CONSUME, kept as an exact fraction after every change:
// the Stomach at the posted prices, over every $CONSUME minted or still locked.
const trail: { after: string; stomach: bigint; claims: bigint }[] = [];
async function mark(after: string) {
  const [s, all] = await Promise.all([stats(), tribes()]);
  const stomach = all.reduce((a, [, t]) => a + big(t.stomach) * big(t.price_e18) * BigInt(10) ** big(24 - t.decimals), ZERO);
  trail.push({ after, stomach, claims: big(s.consume_supply) + big(s.total_unvested) });
}

let context: BrowserContext;
let page: Page;
let wallet: TestWallet;
let refused: string[];
const pageErrors: string[] = [];
const consoleErrors: string[] = [];

const signButton = () => page.locator("header .sign-button");
const feedSheet = () => page.locator("dialog.feeding:not(.collecting)");
const collectSheet = () => page.locator("dialog.feeding.collecting");
const bondCard = (id: number) => page.locator("#bonds article.ind").filter({ has: page.locator("h3", { hasText: new RegExp(`№ ${id}$`) }) });
const pick = (symbol: string) => page.locator(`label:has(input[name="meme"][value="${symbol}"])`).click();
const toast = () => page.locator(".toast");

async function mcp<T>(name: string, args: object = {}): Promise<T> {
  const res = await page.request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
  expect(res.ok(), `${name} answered ${res.status()}`).toBe(true);
  const body = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
  expect(body.result.isError ?? false, body.result.content[0].text).toBe(false);
  return JSON.parse(body.result.content[0].text) as T;
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  refused = await stayLocal(page);
  await roads(page);
  wallet = await giveWallet(page, ALICE);
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach("page", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  }
});

test.afterAll(async () => {
  await context?.close();
});

test("a fresh launch: nothing fed, nothing minted, and the site says so", async () => {
  const s = await stats();
  expect([s.total_eaten_usd, s.consume_supply, s.total_unvested, s.total_forfeited, s.total_redeemed, s.vests_minted]).toEqual(["0", "0", "0", "0", "0", "0"]);

  await page.goto("/");
  await expect(page.locator("h1")).toContainText("The memecoin that eats memecoins.");
  // this build is joined to a contract, so it shows no sample figures
  await expect(page.getByText("A preview with sample figures")).toHaveCount(0);
  await expect(page.locator("#crucible .stomach-total strong")).toHaveText("$0");
  await expect(page.locator('input[name="meme"]')).toHaveCount(10);
  await expect(page.locator('input[name="meme"]:enabled')).toHaveCount(10);
  await expect(page.locator("#bonds h2")).toHaveText("Bonds");
  await expect(page.locator("#ledger")).toContainText("Nothing has been fed yet. The first feeding will be written here.");
  await expect(signButton()).toHaveAccessibleName("Connect wallet");
});

test("connect through the site's own wallet picker", async () => {
  // closing the picker without choosing leaves the page as it was (the last test checks it raised no error)
  await signButton().click();
  await expect(page.locator(".hot-connector-popup .connect-item", { hasText: "Test wallet" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".hot-connector-popup")).toHaveCount(0);
  await expect(signButton()).toHaveAccessibleName("Connect wallet");

  await signButton().click();
  await page.locator(".hot-connector-popup .connect-item", { hasText: "Test wallet" }).click();
  await expect(signButton()).toHaveText(ALICE);
  await expect(page.locator("#bonds h2")).toHaveText("Your Bonds");
  await expect(page.locator("#bonds")).toContainText("You hold no Bonds yet. Feed the Serpent to receive one.");

  // the session is the wallet connector's own: a reload keeps it
  await page.reload();
  await expect(signButton()).toHaveText(ALICE);
  expect(wallet.signed, "connecting signs nothing").toHaveLength(0);
});

test("bring test PEPE from Ethereum into the NEAR Intents balance", async () => {
  await pick("PEPE");
  await expect(page.locator(".verdict-line")).toContainText("You have no PEPE to feed yet.");
  await page.getByRole("button", { name: "Bring test PEPE from Ethereum" }).click();
  await expect(toast()).toContainText("20,000,000 test PEPE arrived in your NEAR Intents balance from Ethereum.");

  expect(wallet.signed).toHaveLength(1);
  const [tx] = wallet.last().transactions;
  expect(tx.receiverId).toBe(INTENTS);
  expect(tx.actions.map((a) => [a.params.methodName, a.params.args, a.params.deposit])).toEqual([["simulate_deposit", { token_id: intents(PEPE), from_chain: "Ethereum" }, "0"]]);

  expect(await heldOnIntents(ALICE, PEPE)).toBe(drip(PEPE));
  await expect(page.locator(".meal-hold")).toContainText("You have 20,000,000 PEPE, worth $100.00");
});

test("the quote on the page is the contract's own quote", async () => {
  await page.locator("label.meal-usd input").fill("50");
  await expect(page.locator("#amount")).toHaveValue("10000000");
  const offered = toRaw(await page.locator("#amount").inputValue(), PEPE.decimals)!;
  const q = await view<MealQuote>(CONSUME, "quote_meal", { token_id: PEPE.mainnet, amount: offered.toString() });
  // the launch rate is 1,000 $CONSUME to the dollar and the tithe starts at 1%
  expect([q.meal_usd, q.tithe_usd, q.consume, q.refund]).toEqual(["50000000", "500000", (BigInt(49_500) * E18).toString(), "0"]);
  await expect(page.locator(".yield-amount")).toHaveText(`${fromRaw(q.consume, 18, 0)} $CONSUME`);
  await expect(page.locator(".yield-sub")).toContainText(`after a ${usd(q.tithe_usd)} tithe`);

  // the marks under the slider stop at what the account holds
  await page.getByRole("button", { name: "Feed 10 dollars of PEPE" }).click();
  await expect(page.locator("#amount")).toHaveValue("2000000");
  await page.getByRole("button", { name: "Feed all your PEPE" }).click();
  await expect(page.locator("#amount")).toHaveValue("20000000");
  await expect(page.locator(".yield-amount")).toBeVisible();

  // more than is held is never offered to the wallet
  await page.locator("#amount").fill("20000001");
  await expect(page.locator(".verdict-line")).toContainText("That is more PEPE than you hold.");
  await expect(page.getByRole("button", { name: "Feed the Serpent" })).toBeDisabled();
});

test("a signature turned down in the wallet sends nothing", async () => {
  const before = await sentHashes();
  await page.locator("label.meal-usd input").fill("50");
  await expect(page.locator(".yield-amount")).toHaveText("49,500 $CONSUME");
  wallet.refuseNext();
  await page.getByRole("button", { name: "Feed the Serpent" }).click();

  await expect(feedSheet()).toHaveAttribute("data-stage", "refused");
  await expect(feedSheet().locator("#feeding-h")).toHaveText("It refused the feeding");
  await expect(feedSheet().locator("p.error")).toHaveText("The wallet did not sign, so nothing was sent.");
  await feedSheet().locator(".actions button", { hasText: "Close" }).click();
  await expect(feedSheet()).toHaveCount(0);

  expect(await sentHashes()).toEqual(before);
  expect((await stats()).vests_minted).toBe("0");
  expect(await heldOnIntents(ALICE, PEPE)).toBe(drip(PEPE));
});

test("feed $50 of PEPE: the Stomach holds it and Bond 1 is minted", async () => {
  const offered = BigInt(10_000_000) * E18;
  const q = await view<MealQuote>(CONSUME, "quote_meal", { token_id: PEPE.mainnet, amount: offered.toString() });
  await expect(page.locator("#amount")).toHaveValue("10000000");
  await page.getByRole("button", { name: "Feed the Serpent" }).click();
  await expect(feedSheet()).toHaveAttribute("data-stage", "bond");
  await expect(feedSheet().locator("#feeding-h")).toHaveText("Bond № 1 is yours");

  // what the site asked the wallet for: storage credit, then the transfer that feeds
  const asked = wallet.last().transactions;
  expect(asked.map((t) => [t.receiverId, t.actions.map((a) => a.params.methodName)])).toEqual([
    [CONSUME, ["add_meal_credit"]],
    [INTENTS, ["mt_transfer_call"]],
  ]);
  expect(asked[0].actions[0].params.deposit).toBe("100000000000000000000000");
  const feed = asked[1].actions[0].params;
  expect(feed.deposit).toBe(ONE_YOCTO);
  expect(feed.gas).toBe(TGAS(150));
  expect(feed.args).toMatchObject({ receiver_id: CONSUME, token_id: intents(PEPE), amount: offered.toString() });
  const msg = JSON.parse(feed.args.msg as string) as { min_net_usd: string; deadline_ns: string };
  // the feeding is refused if it would count for under 99% of the quoted value after the tithe
  expect(msg.min_net_usd).toBe((((big(q.meal_usd) - big(q.tithe_usd)) * BigInt(99)) / BigInt(100)).toString());
  expect(big(msg.deadline_ns) > big(Date.now()) * BigInt(1_000_000)).toBe(true);

  // what the contract did
  const [meal] = events<MealEvent>(wallet.last().outcomes, "meal");
  expect(meal).toMatchObject({ eater: ALICE, tribe: PEPE.mainnet, eaten: offered.toString(), meal_usd: q.meal_usd, tithe_usd: q.tithe_usd, consume: q.consume, bonus: false, via_intents: true });
  expect(String(meal.vest_id)).toBe("1");
  const v = (await bond("1"))!;
  expect(v.owner_id).toBe(ALICE);
  expect(v.vest).toMatchObject({ tribe: PEPE.mainnet, eaten: offered.toString(), meal_usd: q.meal_usd, total: q.consume, released: "0", exited: false });
  expect(await heldOnIntents(ALICE, PEPE)).toBe(drip(PEPE) - offered);
  expect(await heldOnIntents(CONSUME, PEPE)).toBe(offered);
  expect(await stomachOf(PEPE)).toBe(offered);
  const s = await stats();
  // a feeding mints nothing: the $CONSUME is written into the Bond
  expect([s.total_eaten_usd, s.total_unvested, s.consume_supply, s.vests_minted]).toEqual([q.meal_usd, q.consume, "0", "1"]);
  const nft = await view<{ owner_id: string; metadata: { title: string } }>(CONSUME, "nft_token", { token_id: "1" });
  expect(nft.owner_id).toBe(ALICE);
  expect(nft.metadata.title).toBe("Bond #1: 10000000 PEPE");
  await mark("feeding PEPE");

  // and the page agrees
  await feedSheet().getByRole("button", { name: "See your Bonds" }).click();
  await expect(feedSheet()).toHaveCount(0);
  await expect(page.locator("#bonds article.ind")).toHaveCount(1);
  await expect(bondCard(1)).toContainText("10M PEPE fed, worth $50.00");
  await expect(bondCard(1)).toContainText("of 49,500 released");
  await expect(page.locator("#crucible .stomach-total strong")).toHaveText("$50");
  await expect(page.locator(".meal-hold")).toContainText("You have 10,000,000 PEPE, worth $50.00");
});

test("the Bond's picture is drawn from what the contract holds", async () => {
  const card = await page.request.get("/bond/1.svg");
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toContain("image/svg+xml");
  const svg = await card.text();
  expect(svg).toContain("<svg");
  expect(svg).toContain("PEPE");
  expect((await page.request.get("/bond/999.svg")).status()).toBe(404);
  expect((await page.request.get("/bond/abc.svg")).status()).toBe(400);
  // the card in the list is that same picture, and it loaded
  const img = bondCard(1).locator("img.ind-card");
  await expect(img).toHaveAttribute("src", /^\/bond\/1\.svg/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test("feed more NearKat than one feeding takes: the rest comes back", async () => {
  await pick("NearKat");
  await page.getByRole("button", { name: "Deposit test NearKat" }).click();
  await expect(toast()).toContainText("1,100,000 test NearKat arrived in your NEAR Intents balance.");
  expect(await heldOnIntents(ALICE, KAT)).toBe(drip(KAT));

  await page.getByRole("button", { name: "Feed it all" }).click();
  await expect(page.locator("#amount")).toHaveValue("1100000");
  const q = await view<MealQuote>(CONSUME, "quote_meal", { token_id: KAT.mainnet, amount: drip(KAT).toString() });
  // $100 is offered and NearKat takes $50 in one feeding: never more, and less only by the rounding of one unit
  expect(big(q.meal_usd) <= BigInt(50_000_000) && big(q.meal_usd) >= BigInt(49_999_999)).toBe(true);
  expect(big(q.accepted) + big(q.refund)).toBe(drip(KAT));
  expect(big(q.refund) > ZERO).toBe(true);
  await expect(page.locator(".verdict-line")).toHaveText(`Only ${fromRaw(q.accepted, KAT.decimals)} NearKat fits in one feeding; ${fromRaw(q.refund, KAT.decimals)} comes back to you.`);
  await expect(page.locator(".yield-amount")).toHaveText(`${fromRaw(q.consume, 18, 0)} $CONSUME`);

  await page.getByRole("button", { name: "Feed the Serpent" }).click();
  await expect(feedSheet()).toHaveAttribute("data-stage", "bond");
  await expect(feedSheet().locator("#feeding-h")).toHaveText("Bond № 2 is yours");

  // the whole balance was offered, the contract kept what fits and returned the rest
  const asked = wallet.last().transactions;
  expect(asked[asked.length - 1].actions[0].params.args).toMatchObject({ token_id: intents(KAT), amount: drip(KAT).toString() });
  const [meal] = events<MealEvent>(wallet.last().outcomes, "meal");
  expect(meal).toMatchObject({ eaten: q.accepted, meal_usd: q.meal_usd, consume: q.consume });
  const v = (await bond("2"))!;
  expect([v.owner_id, v.vest.eaten, v.vest.total]).toEqual([ALICE, q.accepted, q.consume]);
  expect(await heldOnIntents(ALICE, KAT)).toBe(drip(KAT) - big(q.accepted));
  expect(await heldOnIntents(CONSUME, KAT)).toBe(big(q.accepted));
  expect(await stomachOf(KAT)).toBe(big(q.accepted));
  // the second feeding earns at the backing, so it gets fewer $CONSUME for the same dollars
  expect(big(q.consume) < BigInt(49_500) * E18).toBe(true);
  await mark("feeding NearKat");

  await feedSheet().getByRole("button", { name: "See your Bonds" }).click();
  await expect(page.locator("#bonds article.ind")).toHaveCount(2);
  await expect(page.locator("#crucible .stomach-total strong")).toHaveText("$100");
});

test("Collect all: one transaction mints what both Bonds have released", async () => {
  // a Bond releases with the clock; wait until the contract counts something on both, then read the page again
  await expect.poll(async () => big((await bond("2"))!.claimable) > ZERO && big((await bond("1"))!.claimable) > ZERO, { timeout: 30_000 }).toBe(true);
  await page.reload();
  await expect(page.locator("#bonds .ind-all")).toContainText("from 2 Bonds");
  await page.getByRole("button", { name: "Collect all" }).click();
  await expect(collectSheet()).toHaveAttribute("data-stage", "received");
  await expect(collectSheet().locator("#collecting-h")).toHaveText("Collected");

  const { transactions, outcomes } = wallet.last();
  expect(transactions).toHaveLength(1);
  expect(transactions[0].receiverId).toBe(CONSUME);
  const claims = transactions[0].actions.filter((a) => a.params.methodName === "claim");
  expect(claims.map((a) => a.params.args.token_id).sort()).toEqual(["1", "2"]);
  expect(claims.every((a) => a.params.deposit === "0")).toBe(true);

  const paid = events<ClaimEvent>(outcomes, "claim");
  expect(paid.map((c) => String(c.vest_id)).sort()).toEqual(["1", "2"]);
  const sum = paid.reduce((a, c) => a + big(c.amount), ZERO);
  expect(sum > ZERO).toBe(true);
  // minted to the holder, and to nobody else
  expect(await consumeOf(ALICE)).toBe(sum);
  const s = await stats();
  expect(big(s.consume_supply)).toBe(sum);
  const [one, two] = [(await bond("1"))!, (await bond("2"))!];
  expect(big(one.vest.released) + big(two.vest.released)).toBe(sum);
  expect(big(s.total_unvested)).toBe(big(one.vest.total) + big(two.vest.total) - sum);
  await mark("collecting from both Bonds");

  await expect(collectSheet().locator(".collect-sum .sr-only")).toHaveText(fromRaw(sum, 18, 0));
  await collectSheet().getByRole("button", { name: "Done" }).click();
  await expect(collectSheet()).toHaveCount(0);
  await expect(page.locator("header .purse b")).toHaveText(fromRaw(sum, 18, 0));
});

test("Collect from one Bond", async () => {
  const before = (await bond("1"))!;
  const held = await consumeOf(ALICE);
  await expect.poll(async () => big((await bond("1"))!.claimable) >= E18, { timeout: 30_000 }).toBe(true);
  await page.reload();
  await bondCard(1).getByRole("button", { name: "Collect", exact: true }).click();
  await expect(collectSheet()).toHaveAttribute("data-stage", "received");
  await expect(collectSheet().locator("#collecting-h")).toHaveText("Collected");

  const { transactions, outcomes } = wallet.last();
  expect(transactions).toHaveLength(1);
  expect(transactions[0].actions.map((a) => [a.params.methodName, a.params.args])).toEqual([["claim", { token_id: "1" }]]);
  const [paid] = events<ClaimEvent>(outcomes, "claim");
  expect(String(paid.vest_id)).toBe("1");
  expect(paid.owner).toBe(ALICE);
  expect(await consumeOf(ALICE)).toBe(held + big(paid.amount));
  expect(big((await bond("1"))!.vest.released)).toBe(big(before.vest.released) + big(paid.amount));
  await mark("collecting from Bond 1");

  await expect(collectSheet().locator(".collect-sum .sr-only")).toHaveText(fromRaw(paid.amount, 18, 0));
  await collectSheet().getByRole("button", { name: "Done" }).click();
});

test("Break the seal: half of what is locked is paid, half is never minted", async () => {
  const before = (await bond("2"))!;
  const held = await consumeOf(ALICE);
  await bondCard(2).getByRole("button", { name: "Break the seal early" }).click();
  // it asks twice
  await expect(bondCard(2)).toContainText(/Take [\d,]+ now and forfeit [\d,]+\./);
  await bondCard(2).getByRole("button", { name: "Yes, break it" }).click();
  await expect(collectSheet()).toHaveAttribute("data-stage", "received");
  await expect(collectSheet().locator("#collecting-h")).toHaveText("Seal broken");

  const { transactions, outcomes } = wallet.last();
  expect(transactions).toHaveLength(1);
  expect(transactions[0].actions.map((a) => [a.params.methodName, a.params.args, a.params.deposit])).toEqual([["exit", { token_id: "2" }, ONE_YOCTO]]);
  const [left] = events<ExitEvent>(outcomes, "exit");
  expect(String(left.vest_id)).toBe("2");
  const payout = big(left.payout);
  const forfeited = big(left.forfeited);
  // everything the Bond ever held is accounted for: collected before, paid now, or forfeited
  expect(big(before.vest.released) + payout + forfeited).toBe(big(before.vest.total));
  // what is forfeited is half of what was still locked, so never more than the other half that was paid
  expect(forfeited > ZERO && forfeited <= payout).toBe(true);
  expect(forfeited * BigInt(2) <= big(before.locked) + BigInt(1)).toBe(true);
  expect(await consumeOf(ALICE)).toBe(held + payout);

  const after = (await bond("2"))!;
  expect(after.vest.exited).toBe(true);
  expect([after.claimable, after.locked]).toEqual(["0", "0"]);
  const s = await stats();
  expect(big(s.total_forfeited)).toBe(forfeited);
  // all that is still locked anywhere is what Bond 1 has yet to release
  const one = (await bond("1"))!;
  expect(big(s.total_unvested)).toBe(big(one.vest.total) - big(one.vest.released));
  await mark("breaking the seal of Bond 2");

  await expect(collectSheet()).toContainText(`You gave up ${fromRaw(forfeited, 18, 0)} $CONSUME that was still locked. It will never be minted.`);
  await collectSheet().getByRole("button", { name: "Done" }).click();
  await expect(bondCard(2)).toHaveClass(/broken/);
  await expect(bondCard(2)).toContainText("Seal broken");
  await expect(bondCard(2).getByRole("button")).toHaveCount(0);

  // a broken seal cannot be broken again, even by its holder
  const [again] = await send(ALICE, [{ receiverId: CONSUME, actions: [{ type: "FunctionCall", params: { methodName: "exit", args: { token_id: "2" }, gas: TGAS(50), deposit: ONE_YOCTO } }] }]);
  expect(events<ExitEvent>([again], "exit")).toHaveLength(0);
  expect(await consumeOf(ALICE)).toBe(held + payout);
});

test("Redeem: burn 1,000 $CONSUME for the same share of every memecoin in the Stomach", async () => {
  const burn = BigInt(1000) * E18;
  const held = await consumeOf(ALICE);
  expect(held > burn).toBe(true);
  const q = await view<RedeemQuote>(CONSUME, "quote_redeem", { amount: burn.toString() });
  const shares = q.shares.filter(([, v]) => big(v) > ZERO);
  expect(shares.map(([k]) => k).sort()).toEqual([PEPE.mainnet, KAT.mainnet].sort());
  const before = { s: await stats(), pepe: await heldOnIntents(ALICE, PEPE), kat: await heldOnIntents(ALICE, KAT), pepeIn: await stomachOf(PEPE), katIn: await stomachOf(KAT), usd: await stomachUsd() };
  // a share is counted against every $CONSUME, minted or still locked
  expect(big(q.denominator)).toBe(big(before.s.consume_supply) + big(before.s.total_unvested));
  for (const [k, v] of shares) {
    const inStomach = k === PEPE.mainnet ? before.pepeIn : before.katIn;
    expect(big(v)).toBe((inStomach * burn) / big(q.denominator));
  }

  await page.locator("#burn-amount").fill("1000");
  await expect(page.locator(".redeem-out .r-label")).toHaveText("You receive");
  await expect(page.locator(".redeem-out .basket li")).toHaveCount(2);
  for (const [k, v] of shares) {
    const h = k === PEPE.mainnet ? PEPE : KAT;
    await expect(page.locator(".redeem-out .basket li", { hasText: h.symbol })).toContainText(compact(v, h.decimals));
  }
  await page.getByRole("button", { name: "Burn and redeem" }).click();
  await expect(toast()).toContainText(/Redeemed 1,000 \$CONSUME for \$[\d.]+ of memecoins\./);

  const { transactions, outcomes } = wallet.last();
  const sent = transactions[transactions.length - 1];
  expect(sent.receiverId).toBe(CONSUME);
  const redeem = sent.actions[sent.actions.length - 1].params;
  expect([redeem.methodName, redeem.args, redeem.deposit]).toEqual(["redeem", { amount: burn.toString() }, ONE_YOCTO]);
  const [ev] = events<RedeemEvent>(outcomes, "redeem");
  expect(ev.account).toBe(ALICE);
  expect(big(ev.burned)).toBe(burn);
  expect(ev.shares.filter(([, v]) => big(v) > ZERO).sort()).toEqual([...shares].sort());

  const share = (h: { mainnet: string }) => big(shares.find(([k]) => k === h.mainnet)![1]);
  expect(await consumeOf(ALICE)).toBe(held - burn);
  expect(await heldOnIntents(ALICE, PEPE)).toBe(before.pepe + share(PEPE));
  expect(await heldOnIntents(ALICE, KAT)).toBe(before.kat + share(KAT));
  expect(await stomachOf(PEPE)).toBe(before.pepeIn - share(PEPE));
  expect(await stomachOf(KAT)).toBe(before.katIn - share(KAT));
  // the stand-in holds for CONSUME exactly what the Stomach says it holds
  expect(await heldOnIntents(CONSUME, PEPE)).toBe(await stomachOf(PEPE));
  expect(await heldOnIntents(CONSUME, KAT)).toBe(await stomachOf(KAT));
  const s = await stats();
  expect(big(s.total_redeemed)).toBe(burn);
  expect(big(s.consume_supply)).toBe(big(before.s.consume_supply) - burn);
  expect(s.total_unvested).toBe(before.s.total_unvested);
  expect(await view<unknown[]>(CONSUME, "get_owed", { account_id: ALICE })).toEqual([]);
  await mark("redeeming 1,000 $CONSUME");

  await expect(page.locator("#crucible .stomach-total strong")).toHaveText(usd(await stomachUsd(), 0));
  await expect(page.locator("#transmute .hint", { hasText: "You hold" })).toHaveText(`You hold ${fromRaw(held - burn, 18, 0)} $CONSUME.`);
});

test("an agent feeds DOGE with the calls the MCP server prepares, and its Bond is its own", async () => {
  type Call = { receiver_id: string; method: string; args: Record<string, unknown>; deposit_yocto: string; gas_tgas: number };
  type Prepared = { signs_nothing: string; warnings: string[]; calls: Call[]; near_cli: string[]; quote: { accepted: string; value_usd: number } };
  const sign = (calls: Call[]): Transaction[] =>
    calls.map((c) => ({ receiverId: c.receiver_id, actions: [{ type: "FunctionCall", params: { methodName: c.method, args: c.args, gas: TGAS(c.gas_tgas), deposit: c.deposit_yocto } }] }));

  // the server holds no key: it answers with unsigned calls, and here the sandbox signs them as bob
  const plan = await mcp<Prepared>("prepare_feed", { account_id: BOB, symbol: "DOGE", usd: "40", bring_test_memecoins: true });
  expect(plan.warnings).toEqual([]);
  expect(plan.calls.map((c) => [c.receiver_id, c.method])).toEqual([
    [INTENTS, "simulate_deposit"],
    [CONSUME, "add_meal_credit"],
    [INTENTS, "mt_transfer_call"],
  ]);
  expect(plan.near_cli).toHaveLength(3);
  expect(plan.quote.value_usd).toBeCloseTo(40, 4);
  const outcomes = await send(BOB, sign(plan.calls));
  const [meal] = events<MealEvent>(outcomes, "meal");
  expect(meal).toMatchObject({ eater: BOB, tribe: DOGE.mainnet });
  expect(String(meal.vest_id)).toBe("3");
  expect((await bond("3"))!.owner_id).toBe(BOB);
  expect(await heldOnIntents(BOB, DOGE)).toBe(drip(DOGE) - big(meal.eaten));
  await mark("bob feeding DOGE");

  // alice sees the feeding in the Stomach, and not the Bond among hers
  await page.reload();
  await expect(page.locator("#crucible .stomach-total strong")).toHaveText(usd(await stomachUsd(), 0));
  await expect(page.locator("#bonds article.ind")).toHaveCount(2);
  await expect(bondCard(3)).toHaveCount(0);
  expect((await page.request.get("/bond/3.svg")).status()).toBe(200);

  // only its holder can collect from a Bond
  await expect.poll(async () => big((await bond("3"))!.claimable) > ZERO, { timeout: 30_000 }).toBe(true);
  const held = await consumeOf(ALICE);
  const [stolen] = await send(ALICE, [{ receiverId: CONSUME, actions: [{ type: "FunctionCall", params: { methodName: "claim", args: { token_id: "3" }, gas: TGAS(50), deposit: "0" } }] }]);
  expect(events<ClaimEvent>([stolen], "claim")).toHaveLength(0);
  expect(await consumeOf(ALICE)).toBe(held);
  expect((await bond("3"))!.vest.released).toBe("0");

  // bob collects through the prepared call
  const collect = await mcp<Prepared>("prepare_collect", { account_id: BOB, bond_id: "3" });
  const [paid] = events<ClaimEvent>(await send(BOB, sign(collect.calls)), "claim");
  expect(paid.owner).toBe(BOB);
  expect(await consumeOf(BOB)).toBe(big(paid.amount));
  await mark("bob collecting from Bond 3");
});

test("what backs each $CONSUME never fell", async () => {
  expect(trail.length).toBeGreaterThanOrEqual(8);
  for (let i = 1; i < trail.length; i++) {
    const [a, b] = [trail[i - 1], trail[i]];
    // b.stomach / b.claims >= a.stomach / a.claims, with no rounding
    expect(b.stomach * a.claims >= a.stomach * b.claims, `backing fell after ${b.after}`).toBe(true);
  }
  // and two things raised it for certain: the tithe on the second feeding, and the forfeit of the broken seal
  const rose = (after: string) => {
    const i = trail.findIndex((t) => t.after === after);
    return trail[i].stomach * trail[i - 1].claims > trail[i - 1].stomach * trail[i].claims;
  };
  expect(rose("feeding NearKat")).toBe(true);
  expect(rose("breaking the seal of Bond 2")).toBe(true);
});

test("the Ledger lists every feeding, mint and burn, and adds up to the contract's totals", async () => {
  // the Ledger is read from an indexer and kept for half a minute, so a new entry can take that long
  let ledger: Ledger = { entries: [], discovery_limits_reached: false, history_completeness: "unknown", builder: null, feedings: { builder: 0, others: 0 }, feeders: { builder: 0, others: 0 } };
  await expect
    .poll(
      async () => {
        ledger = (await (await page.request.get("/api/ledger")).json()) as Ledger;
        return ledger.entries?.length ?? 0;
      },
      { timeout: 75_000, intervals: [2_000] },
    )
    .toBe(9);
  expect(ledger.discovery_limits_reached).toBe(false);
  expect(ledger.history_completeness).toBe("unknown");
  const count = (kind: string) => ledger.entries.filter((e) => e.kind === kind).length;
  expect([count("feed"), count("collect"), count("break"), count("redeem")]).toEqual([3, 4, 1, 1]);

  // every entry names a transaction that was really sent on this chain
  const sent = new Set(await sentHashes());
  for (const e of ledger.entries) expect(sent.has(e.tx), `${e.kind} names ${e.tx}`).toBe(true);
  // newest first
  expect(ledger.entries.map((e) => e.at)).toEqual([...ledger.entries.map((e) => e.at)].sort((a, b) => b - a));

  const sum = (k: "minted" | "burned" | "forfeited" | "locked") => ledger.entries.reduce((a, e) => a + big(e[k] || "0"), ZERO);
  const s = await stats();
  expect(sum("minted")).toBe(big(s.consume_supply) + big(s.total_redeemed));
  expect(sum("burned")).toBe(big(s.total_redeemed));
  expect(sum("forfeited")).toBe(big(s.total_forfeited));
  // all that was ever written into Bonds is what was minted, what was forfeited and what is still locked
  expect(sum("locked")).toBe(sum("minted") + sum("forfeited") + big(s.total_unvested));
  expect(ledger.entries.filter((e) => e.kind === "feed").map((e) => [e.account, e.bond]).reverse()).toEqual([
    [ALICE, "1"],
    [ALICE, "2"],
    [BOB, "3"],
  ]);

  await page.reload();
  await expect(page.locator("#ledger .roll-note")).toContainText("Checked against the contract.");
  const shows = page.locator("#ledger .roll-shows button");
  await expect(shows).toHaveText(["All 9", "Feedings 3", "Mints 5", "Burns 1"]);
  await expect(page.locator("#ledger ol.roll > li")).toHaveCount(9);
  const linked = await page.locator("#ledger a.roll-tx").evaluateAll((links) => links.map((a) => (a.getAttribute("aria-label") ?? "").replace("Transaction ", "")));
  expect(linked).toHaveLength(9);
  for (const hash of linked) expect(sent.has(hash)).toBe(true);
  await shows.filter({ hasText: "Burns" }).click();
  await expect(page.locator("#ledger ol.roll > li")).toHaveCount(1);
  await expect(page.locator("#ledger ol.roll > li")).toContainText(`${ALICE} redeemed for a share of the Stomach`);
  await expect(page.locator("#ledger ol.roll > li")).toContainText("1,000 burned");
  await shows.filter({ hasText: "All" }).click();

  // The builder's own accounts apart from everyone else. Every sandbox account
  // sits under test.near, so the run names Alice as the builder (e2e/run.mjs).
  expect(ledger.builder).toBe(ALICE);
  expect(ledger.feedings).toEqual({ builder: 2, others: 1 });
  expect(ledger.feeders).toEqual({ builder: 1, others: 1 });
  const others = ledger.entries.filter((e) => !e.by_builder);
  for (const e of ledger.entries) expect(e.by_builder === true, `${e.kind} by ${e.account}`).toBe(e.account === ALICE);
  expect(others.length).toBeGreaterThan(0);
  expect(others.length).toBeLessThan(9);
  const who = page.locator("#ledger .roll-who");
  await expect(who).toContainText("1 of 3 feedings came from one account outside the builder's own");
  await expect(who).toContainText(ALICE);
  await expect(page.locator("#ledger ol.roll .roll-own")).toHaveCount(9 - others.length);
  const leaveOut = who.getByLabel("Leave out the builder's accounts");
  await leaveOut.check();
  await expect(page.locator("#ledger ol.roll > li")).toHaveCount(others.length);
  await expect(page.locator("#ledger ol.roll .roll-own")).toHaveCount(0);
  await expect(page.locator("#ledger ol.roll > li").filter({ hasText: ALICE })).toHaveCount(0);
  await expect(shows.first()).toHaveText(`All ${others.length}`);
  await expect(shows.nth(1)).toHaveText("Feedings 1");
  // Alice made the only redemption, so with her left out there is none to show
  await shows.filter({ hasText: "Burns" }).click();
  await expect(page.locator("#ledger .empty")).toHaveText("Nothing here from outside the builder's accounts yet. The first will be written here.");
  await shows.filter({ hasText: "All" }).click();
  await leaveOut.uncheck();
  await expect(page.locator("#ledger ol.roll > li")).toHaveCount(9);
});

test("the MCP server answers from the same contract", async () => {
  type Overview = { contract: string; intents_contract: string; bonds_minted: number; total_fed_usd: number; consume_burned_by_redeeming: string; stomach_usd: number };
  type Account = Record<string, unknown>;
  const s = await stats();
  const o = await mcp<Overview>("overview");
  expect([o.contract, o.intents_contract, o.bonds_minted]).toEqual([CONSUME, INTENTS, 3]);
  expect(o.total_fed_usd).toBeCloseTo(Number(s.total_eaten_usd) / 1e6, 6);
  expect(o.stomach_usd).toBeCloseTo(Number(s.stomach_usd) / 1e6, 6);
  expect(Number(o.consume_burned_by_redeeming.replace(/,/g, ""))).toBe(1000);

  const b = await mcp<{ holder: string; seal_broken: boolean; fed: string }>("bond", { bond_id: "2" });
  expect([b.holder, b.seal_broken]).toEqual([ALICE, true]);
  expect(b.fed).toContain("NearKat");

  const a = await mcp<Account>("account", { account_id: ALICE });
  expect(JSON.stringify(a)).toContain(ALICE);

  const l = await mcp<{ listed_totals_match_contract: boolean; entries_found: number }>("ledger");
  expect([l.listed_totals_match_contract, l.entries_found]).toEqual([true, 9]);

  // an unknown Bond is an answer, not a crash
  const res = await page.request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "bond", arguments: { bond_id: "999" } } } });
  const body = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
  expect(body.result.isError).toBe(true);
  expect(body.result.content[0].text).toBe("There is no Bond 999");
});

test("sending a Bond rejects invalid, self and nonexistent recipients before signing", async () => {
  await page.reload();
  const sent = wallet.signed.length;
  await bondCard(1).getByRole("button", { name: "Send this Bond" }).click();
  const form = page.getByRole("form", { name: "Send Bond 1", exact: true });
  for (const [recipient, message] of [["bad..account", "complete NEAR account"], [ALICE, "already hold this Bond"], ["missing.test.near", "does not exist"]]) {
    await form.getByLabel("Recipient’s NEAR account").fill(recipient);
    await form.getByRole("button", { name: "Review transfer" }).click();
    await expect(form.getByRole("alert")).toContainText(message);
  }
  expect(wallet.signed).toHaveLength(sent);
  expect((await bond("1"))!.owner_id).toBe(ALICE);
});

test("sending a Bond reviews costs, survives wallet refusal and funds the transfer atomically", async () => {
  // Force the same low-credit case a returning user can encounter.
  await send(ALICE, [{ receiverId: CONSUME, actions: [{ type: "FunctionCall", params: { methodName: "withdraw_meal_credit", args: {}, deposit: "0", gas: TGAS(30) } }] }]);
  expect(await view<string>(CONSUME, "get_meal_credit", { account_id: ALICE })).toBe("0");
  const before = (await bond("1"))!;
  const form = page.getByRole("form", { name: "Send Bond 1", exact: true });
  await form.getByLabel("Recipient’s NEAR account").fill(BOB);
  const sent = wallet.signed.length;
  await form.getByRole("button", { name: "Review transfer" }).click();
  await expect(form).toContainText(BOB);
  await expect(form).toContainText("0.01024 NEAR");
  await expect(form).toContainText("first adds 0.1 NEAR");
  expect(wallet.signed).toHaveLength(sent);
  wallet.refuseNext();
  await form.getByRole("button", { name: "Confirm and send Bond" }).click();
  await expect(form.getByRole("alert")).toContainText("The wallet did not sign");
  expect((await bond("1"))!.owner_id).toBe(ALICE);
  expect(await view<string>(CONSUME, "get_meal_credit", { account_id: ALICE })).toBe("0");

  await form.getByRole("button", { name: "Confirm and send Bond" }).click();
  await expect(toast()).toContainText(`Bond 1 sent to ${BOB}`);
  await expect(bondCard(1)).toHaveCount(0);
  const { transactions } = wallet.last();
  expect(transactions).toHaveLength(1);
  expect(transactions[0].receiverId).toBe(CONSUME);
  expect(transactions[0].actions.map((a) => [a.params.methodName, a.params.deposit])).toEqual([
    ["add_meal_credit", "100000000000000000000000"], ["nft_transfer", ONE_YOCTO],
  ]);
  expect(transactions[0].actions[1].params.args).toEqual({ receiver_id: BOB, token_id: "1" });
  expect(await view<string>(CONSUME, "get_meal_credit", { account_id: ALICE })).toBe("89760000000000000000000");
  const after = (await bond("1"))!;
  expect(after.owner_id).toBe(BOB);
  expect(after.vest).toEqual(before.vest);
});

test("the recipient collects from the transferred Bond and the former holder cannot", async ({ browser }) => {
  const recipientContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  try {
    const recipientPage = await recipientContext.newPage();
    const blocked = await stayLocal(recipientPage);
    await roads(recipientPage);
    const recipientWallet = await giveWallet(recipientPage, BOB);
    await recipientPage.goto("/");
    await recipientPage.locator("header .sign-button").click();
    await recipientPage.locator(".hot-connector-popup .connect-item", { hasText: "Test wallet" }).click();
    const card = recipientPage.locator("#bonds article.ind").filter({ has: recipientPage.locator("h3", { hasText: /№ 1$/ }) });
    await expect(card).toBeVisible();
    const formerBalance = await consumeOf(ALICE);
    const recipientBalance = await consumeOf(BOB);
    const [refusedClaim] = await send(ALICE, [{ receiverId: CONSUME, actions: [{ type: "FunctionCall", params: { methodName: "claim", args: { token_id: "1" }, deposit: "0", gas: TGAS(50) } }] }]);
    expect(events<ClaimEvent>([refusedClaim], "claim")).toEqual([]);
    await card.getByRole("button", { name: "Collect", exact: true }).click();
    await expect(recipientPage.locator("dialog.collecting")).toHaveAttribute("data-stage", "received");
    const [paid] = events<ClaimEvent>(recipientWallet.last().outcomes, "claim");
    expect(paid.owner).toBe(BOB);
    expect(String(paid.vest_id)).toBe("1");
    expect(big(paid.amount)).toBeGreaterThan(ZERO);
    expect(await consumeOf(BOB)).toBe(recipientBalance + big(paid.amount));
    expect(await consumeOf(ALICE)).toBe(formerBalance);
    expect(blocked).toEqual([]);
  } finally {
    await recipientContext.close();
  }
});

test("sign out: the page goes back to what anyone sees", async () => {
  await signButton().click();
  await expect(signButton()).toHaveAccessibleName("Connect wallet");
  await expect(page.locator("#bonds h2")).toHaveText("Bonds");
  await expect(page.locator("#bonds")).toContainText("to see the Bonds you hold.");
  await expect(page.locator("header .purse")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect wallet to feed" })).toBeVisible();
  await page.reload();
  await expect(signButton()).toHaveAccessibleName("Connect wallet");
});

test("the page raised no errors, and reached for nothing outside this machine", async () => {
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(refused).toEqual([]);
});
