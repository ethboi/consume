// Read-only checks of a deployed site: E2E_BASE_URL, or https://consume.cash.
// Run with `node e2e/run.mjs live`. Nothing here connects a wallet, signs or
// sends: it loads pages, and asks the site's MCP server what the contract holds.
//
// The figures change while the tests run (prices are posted every few minutes
// and anyone may feed), so where the page is compared with the contract the
// test allows a small difference and says how much.

import { expect, test, type APIRequestContext } from "@playwright/test";
import { HERESIES } from "../src/lib/heresies";

type Overview = {
  network: string;
  contract: string;
  intents_contract: string;
  stomach_usd: number;
  total_fed_usd: number;
  bonds_minted: number;
  prices: { oldest_price_age_seconds: number; feedings_refused_when_older_than_seconds: number; fresh: boolean };
};
type Memecoin = { symbol: string; token_id: string; open_for_feeding: boolean; price_usd: number; in_stomach_usd: number };
type FeedQuote = { memecoin: string; accepted: string; value_usd: number; tithe_usd: number; consume_in_the_bond: string };
type Call = { receiver_id: string; method: string; args: Record<string, unknown>; deposit_yocto: string; gas_tgas: number; why: string };
type Prepared = { signs_nothing: string; summary: string; quote: FeedQuote; calls: Call[]; near_cli: string[] };
type Totals = { consume_minted: string; consume_burned: string; consume_forfeited: string };
type LedgerAnswer = { contract_totals: Totals; entries_add_up_to: Totals; listed_totals_match_contract: boolean; entries_found: number };

async function ask(request: APIRequestContext, name: string, args: object = {}) {
  const res = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
  expect(res.status(), `${name} answered ${res.status()}`).toBe(200);
  const body = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
  return { text: body.result.content[0].text, failed: body.result.isError ?? false };
}
async function tool<T>(request: APIRequestContext, name: string, args: object = {}): Promise<T> {
  const { text, failed } = await ask(request, name, args);
  expect(failed, text).toBe(false);
  return JSON.parse(text) as T;
}
const dollars = (text: string) => Number(text.replace(/[$,]/g, ""));

test("the site opens, joined to a contract, and its own scripts throw nothing", async ({ page }) => {
  const thrown: string[] = [];
  page.on("pageerror", (e) => thrown.push(e.message));
  await page.goto("/");
  await expect(page).toHaveTitle("CONSUME: the memecoin that eats memecoins, on NEAR");
  await expect(page.locator("h1")).toContainText("The memecoin that eats memecoins.");
  await expect(page.getByText("A preview with sample figures")).toHaveCount(0);
  await expect(page.locator('input[name="meme"]')).toHaveCount(10);
  await expect(page.locator("#crucible .stomach-total strong")).toHaveText(/^\$[\d,]+$/);
  // the wallet button is offered; this test never presses it
  await expect(page.locator("header .sign-button")).toBeEnabled();
  await expect(page.locator("header .sign-button")).toHaveAccessibleName("Connect wallet");
  await page.locator("#ledger").scrollIntoViewIfNeeded();
  await expect(page.locator("#ledger")).toBeVisible();
  expect(thrown).toEqual([]);
});

test("the Stomach on the page is the Stomach the contract reports", async ({ page, request }) => {
  await page.goto("/");
  const shown = page.locator("#crucible .stomach-total strong");
  await expect(shown).toHaveText(/^\$[\d,]+$/);
  // within 2% and a dollar: a price posted between the two readings moves it a little
  await expect(async () => {
    const o = await tool<Overview>(request, "overview");
    const onPage = dollars(await shown.innerText());
    expect(Math.abs(onPage - o.stomach_usd)).toBeLessThanOrEqual(1 + o.stomach_usd * 0.02);
  }).toPass({ timeout: 60_000, intervals: [2_000, 5_000, 10_000] });
});

test("the contract lists the ten memecoins, with prices fresh enough to feed", async ({ request }) => {
  const o = await tool<Overview>(request, "overview");
  expect(o.contract, "the site is joined to a contract").toMatch(/\.(testnet|near)$/);
  const coins = await tool<Memecoin[]>(request, "list_memecoins");
  expect(coins.map((c) => c.symbol)).toEqual(HERESIES.map((h) => h.symbol));
  expect(coins.map((c) => c.token_id)).toEqual(HERESIES.map((h) => h.mainnet));
  for (const c of coins) expect(c.price_usd, `${c.symbol} has a price`).toBeGreaterThan(0);
  const held = coins.reduce((a, c) => a + c.in_stomach_usd, 0);
  expect(Math.abs(held - o.stomach_usd), "the memecoins add up to the Stomach").toBeLessThanOrEqual(1 + o.stomach_usd * 0.02);
  // the contract refuses a feeding at a stale price, so an Assayer that has stopped shows here
  expect(o.prices.fresh, `the oldest price is ${o.prices.oldest_price_age_seconds} s old; feedings are refused past ${o.prices.feedings_refused_when_older_than_seconds} s`).toBe(true);
});

test("a prepared feeding matches its quote and names only the contract and its NEAR Intents account", async ({ request }) => {
  const o = await tool<Overview>(request, "overview");
  const open = (await tool<Memecoin[]>(request, "list_memecoins")).find((c) => c.open_for_feeding);
  test.skip(!open, "no memecoin is open for feeding just now");
  const q = await tool<FeedQuote>(request, "quote_feeding", { symbol: open!.symbol, usd: "10" });
  expect(q.memecoin).toBe(open!.symbol);
  expect(Math.abs(q.value_usd - 10)).toBeLessThan(0.01);
  expect(Number(q.consume_in_the_bond)).toBeGreaterThan(0);

  // an account that does not exist: the server prepares unsigned calls for whoever asks, and holds no key to sign them
  const p = await tool<Prepared>(request, "prepare_feed", { account_id: "nobody-e2e.testnet", symbol: open!.symbol, usd: "10" });
  expect(p.signs_nothing).toContain("unsigned calls");
  expect(p.calls.length).toBeGreaterThan(0);
  for (const c of p.calls) expect([o.contract, o.intents_contract], `${c.method} goes to ${c.receiver_id}`).toContain(c.receiver_id);
  const feed = p.calls[p.calls.length - 1];
  expect(feed.method).toBe("mt_transfer_call");
  expect(feed.args.receiver_id).toBe(o.contract);
  expect(feed.deposit_yocto).toBe("1");
  expect(p.near_cli).toHaveLength(p.calls.length);
});

test("the Ledger adds up to the contract's own totals", async ({ page, request }) => {
  const l = await tool<LedgerAnswer>(request, "ledger", { limit: 200 });
  test.skip(!l.listed_totals_match_contract, "the history could not be read in full just now, so there is nothing to add up");
  expect(l.entries_add_up_to).toEqual(l.contract_totals);

  await page.goto("/");
  await page.locator("#ledger").scrollIntoViewIfNeeded();
  if (l.entries_found > 0) await expect(page.locator("#ledger .roll-note")).toContainText("Checked against the contract.", { timeout: 60_000 });
});

test("a Bond's picture is served for a Bond that exists and refused for one that does not", async ({ request }) => {
  const o = await tool<Overview>(request, "overview");
  if (o.bonds_minted > 0) {
    const first = await request.get("/bond/1.svg");
    expect([first.status(), first.headers()["content-type"]]).toEqual([200, "image/svg+xml; charset=utf-8"]);
    expect((await first.text()).startsWith("<svg")).toBe(true);
    const b = await tool<{ bond_id: string; holder: string }>(request, "bond", { bond_id: "1" });
    expect(b.bond_id).toBe("1");
  }
  expect((await request.get(`/bond/${o.bonds_minted + 1000}.svg`)).status()).toBe(404);
  expect((await request.get("/bond/abc.svg")).status()).toBe(400);
  const none = await ask(request, "bond", { bond_id: String(o.bonds_minted + 1000) });
  expect(none.failed, none.text).toBe(true);
});

test("what agents and link previews read is served", async ({ request }) => {
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  expect((await llms.text()).startsWith("# CONSUME")).toBe(true);
  const res = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  const tools = ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools;
  expect(tools).toHaveLength(14);
  for (const path of ["/opengraph-image.png", "/twitter-image.png"]) {
    const img = await request.get(path);
    expect([img.status(), img.headers()["content-type"]], path).toEqual([200, "image/png"]);
  }
});

test("on a phone nothing runs off the side", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("#crucible .stomach-total strong")).toHaveText(/^\$[\d,]+$/);
  await page.locator("#ledger").scrollIntoViewIfNeeded();
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(scroll, "the page is no wider than the phone").toBeLessThanOrEqual(client);
  await context.close();
});
