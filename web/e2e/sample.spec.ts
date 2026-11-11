// The site as it builds with no contract set: sample figures, and every button
// that would sign switched off. This is what a visitor sees before a launch,
// and what CI can check on every push without a chain.
//
// The page is kept on this machine, and each test ends by checking that the
// page threw nothing, logged no error, was refused nothing it asked for and
// reached for nothing outside. The one outside answer the page needs, which
// roads NEAR Intents has open, is given by the test (`roads` in local.ts).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test as base, type Browser, type Page } from "@playwright/test";
import { DEMO_LEDGER, DEMO_MINE, DEMO_SNAPSHOT, DEMO_TOKEN } from "../src/lib/demo";
import { feastOf, nextFeast } from "../src/lib/feast";
import { compact, fromRaw, toRaw, usd, usdValue } from "../src/lib/format";
import { HERESIES, bySymbol } from "../src/lib/heresies";
import type { LedgerEntry } from "../src/lib/ledger";
import { roads, watch, type Seen } from "./local";

const SAMPLE_NOTE = "A preview with sample figures. This build is not joined to a contract, so the buttons are off.";
const NOTHING_SENT = "A preview with sample figures. Nothing was sent.";
const ZERO = BigInt(0);
const MILLION = BigInt(1_000_000);
const big = (v: string | number | bigint) => BigInt(v);
const { stats, tribes, recent, fed } = DEMO_SNAPSHOT;
const tribe = (symbol: string) => tribes.find(([id]) => id === DEMO_TOKEN(symbol))![1];

const clean = (seen: Seen) => expect(seen, "the page raised no errors and stayed on this machine").toEqual({ pageErrors: [], consoleErrors: [], failed: [], refused: [] });

const test = base.extend<{ seen: Seen }>({
  seen: [
    async ({ page }, use) => {
      const seen = await watch(page);
      await roads(page);
      await use(seen);
      clean(seen);
    },
    { auto: true },
  ],
});

const pick = (page: Page, symbol: string) => page.locator(`label:has(input[name="meme"][value="${symbol}"])`).click();

/** What a feeding of this much earns, by the contract's rule: no tithe for the memecoin at its feast, and the rest earned at the backing. */
function earns(symbol: string, raw: bigint) {
  const t = tribe(symbol);
  const worth = usdValue(raw, t.decimals, t.price_e18);
  const tithe = feastOf(stats) === DEMO_TOKEN(symbol) ? ZERO : (worth * big(stats.tithe_bps)) / BigInt(10_000);
  return { worth, tithe, consume: ((worth - tithe) * big(stats.current_rate)) / MILLION };
}

test("the page opens with its headline and says its figures are samples", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("CONSUME: the memecoin that eats memecoins, on NEAR");
  await expect(page.locator("h1")).toContainText("The memecoin that eats memecoins.");
  await expect(page.locator(".demo-note")).toHaveText(SAMPLE_NOTE);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);

  // every part of the page can be reached from the top bar
  for (const id of ["crucible", "feast", "feed", "bonds", "transmute", "ledger"]) {
    await expect(page.locator(`header a[href="#${id}"]`)).toBeVisible();
    await expect(page.locator(`section#${id}`)).toHaveCount(1);
  }
  await expect(page.locator('footer a[href="/llms.txt"]')).toHaveText("For agents");
  await expect(page.locator("footer")).toContainText("Built at NEAR HACKATHON");
  expect(await page.locator("img:not([alt])").count(), "every picture says what it is, or that it is decoration").toBe(0);
});

test("the Stomach adds up, memecoin by memecoin", async ({ page }) => {
  await page.goto("/");
  const total = tribes.reduce((a, [, t]) => a + usdValue(t.stomach, t.decimals, t.price_e18), ZERO);
  await expect(page.locator("#crucible .stomach-total strong")).toHaveText(usd(total, 0));

  const rows = page.locator("#crucible table.ledger tbody tr");
  await expect(rows).toHaveCount(10);
  for (const h of HERESIES) {
    const t = tribe(h.symbol);
    const row = rows.filter({ has: page.getByText(h.symbol, { exact: true }) });
    await expect(row).toContainText(`from ${h.chain}`);
    await expect(row).toContainText(compact(t.stomach, t.decimals));
    await expect(row).toContainText(usd(usdValue(t.stomach, t.decimals, t.price_e18), 0));
  }
});

test("ten memecoins are offered, and one that is closed cannot be picked", async ({ page }) => {
  await page.goto("/");
  const coins = page.locator('input[name="meme"]');
  await expect(coins).toHaveCount(10);
  expect(await coins.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(HERESIES.map((h) => h.symbol));
  const closed = tribes.filter(([, t]) => !t.open).map(([id]) => HERESIES.find((h) => DEMO_TOKEN(h.symbol) === id)!.symbol);
  expect(closed).toEqual(["NearKat"]);
  await expect(page.locator('input[name="meme"]:disabled')).toHaveCount(1);
  await expect(page.locator('input[name="meme"][value="NearKat"]')).toBeDisabled();
});

test("an amount in dollars shows the Bond it would mint", async ({ page }) => {
  await page.goto("/");

  // DOGE pays the tithe
  await pick(page, "DOGE");
  await expect(page.locator(".verdict-line")).toHaveText("Slide the memecoin toward the jaws, or type an amount.");
  await page.locator("label.meal-usd input").fill("50");
  const doge = toRaw(await page.locator("#amount").inputValue(), bySymbol("DOGE")!.decimals)!;
  const d = earns("DOGE", doge);
  expect(d.worth >= BigInt(49_990_000) && d.worth <= BigInt(50_010_000), "the amount of DOGE is worth $50").toBe(true);
  expect(d.tithe > ZERO).toBe(true);
  await expect(page.locator(".yield-amount")).toHaveText(`${fromRaw(d.consume, 18, 0)} $CONSUME`);
  await expect(page.locator(".yield-sub")).toContainText(`after a ${usd(d.tithe)} tithe`);

  // PEPE is at its feast in the sample, so it pays none
  await pick(page, "PEPE");
  await page.getByRole("button", { name: "Feed 100 dollars of PEPE" }).click();
  await expect(page.locator("label.meal-usd input")).toHaveValue("100");
  const pepe = toRaw(await page.locator("#amount").inputValue(), bySymbol("PEPE")!.decimals)!;
  const p = earns("PEPE", pepe);
  expect(p.tithe).toBe(ZERO);
  await expect(page.locator(".yield-amount")).toHaveText(`${fromRaw(p.consume, 18, 0)} $CONSUME`);
  await expect(page.locator(".yield-sub")).toContainText("with no tithe at a feast");

  // an amount typed in the memecoin itself gives the same answer as its dollars
  await page.locator("#amount").fill("5000000");
  const typed = earns("PEPE", toRaw("5000000", 18)!);
  await expect(page.locator(".yield-amount")).toHaveText(`${fromRaw(typed.consume, 18, 0)} $CONSUME`);
});

test("more than one feeding takes: the page says what fits and what comes back", async ({ page }) => {
  await page.goto("/");
  const h = bySymbol("SHITZU")!;
  const t = tribe("SHITZU");
  await pick(page, "SHITZU");
  // twice the most one feeding of SHITZU may be worth
  const cap = big(t.max_meal_usd);
  const offered = (cap * BigInt(2) * BigInt(10) ** BigInt(12 + h.decimals)) / big(t.price_e18);
  await page.locator("#amount").fill(fromRaw(offered, h.decimals, 0).replaceAll(",", ""));
  const raw = toRaw(await page.locator("#amount").inputValue(), h.decimals)!;
  const worth = usdValue(raw, h.decimals, t.price_e18);
  const accepted = (raw * cap) / worth;
  await expect(page.locator(".verdict-line")).toHaveText(`Only ${fromRaw(accepted, h.decimals)} SHITZU fits in one feeding; ${fromRaw(raw - accepted, h.decimals)} comes back to you.`);
  const tithe = (cap * big(stats.tithe_bps)) / BigInt(10_000);
  await expect(page.locator(".yield-amount")).toHaveText(`${fromRaw(((cap - tithe) * big(stats.current_rate)) / MILLION, 18, 0)} $CONSUME`);
});

test("every button that would sign is off", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header .sign-button")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Connect wallet to feed" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Bring test PEPE from Ethereum" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Collect all" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Burn and redeem" })).toBeDisabled();
  for (const name of ["Collect", "Break the seal early"]) {
    const buttons = page.locator("#bonds article.ind").getByRole("button", { name, exact: true });
    await expect(buttons).toHaveCount(DEMO_MINE.length);
    for (const b of await buttons.all()) await expect(b).toBeDisabled();
  }
  // typing an amount does not switch anything on
  await page.locator("label.meal-usd input").fill("50");
  await expect(page.locator(".yield-amount")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect wallet to feed" })).toBeDisabled();
  await expect(page.locator(".hot-connector-popup")).toHaveCount(0);
});

test("four sample Bonds are shown, each with its picture drawn", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#bonds h2")).toHaveText("Your Bonds");
  const cards = page.locator("#bonds article.ind");
  await expect(cards).toHaveCount(DEMO_MINE.length);
  await expect(cards.locator("h3")).toHaveText(DEMO_MINE.map((id) => `Bond № ${id}`));
  await expect(page.locator("#bonds .ind-all")).toContainText(`from ${DEMO_MINE.length} Bonds`);
  for (const id of DEMO_MINE) {
    const img = cards.filter({ has: page.locator("h3", { hasText: `№ ${id}` }) }).locator("img.ind-card");
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveAttribute("src", new RegExp(`^/bond/${id}\\.svg`));
    await expect.poll(() => img.evaluate((e) => (e as HTMLImageElement).naturalWidth), `the picture of Bond ${id} loaded`).toBeGreaterThan(0);
  }
});

test("a Bond's picture is served for a Bond that exists and refused for one that does not", async ({ request }) => {
  for (const id of DEMO_MINE) {
    const bond = recent.find((v) => v.token_id === id)!;
    const symbol = HERESIES.find((h) => DEMO_TOKEN(h.symbol) === bond.vest.tribe)!.symbol;
    for (const path of [`/bond/${id}.svg`, `/bond/square/${id}`]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/svg+xml");
      const svg = await res.text();
      expect(svg.startsWith("<svg"), `${path} is an SVG`).toBe(true);
      expect(svg, `${path} names its memecoin`).toContain(symbol);
    }
  }
  const none = await request.get("/bond/999.svg");
  expect([none.status(), await none.text()]).toEqual([404, "No such Bond"]);
  const bad = await request.get("/bond/abc.svg");
  expect([bad.status(), await bad.text()]).toEqual([400, "Not a Bond number"]);
});

test("?preview=feeding plays a feeding through to its Bond and sends nothing", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") posts.push(`${r.method()} ${r.url()}`);
  });
  await page.goto("/?preview=feeding");
  const sheet = page.locator("dialog.feeding:not(.collecting)");
  await expect(sheet).toHaveAttribute("data-stage", "waiting");
  await expect(sheet).toHaveAttribute("data-stage", "bond");
  await expect(sheet.locator("#feeding-h")).toHaveText(/^Bond № \d+ is yours$/);
  const fedRaw = toRaw("50", 0)! * MILLION; // $50
  await expect(sheet).toContainText(`worth ${usd(fedRaw)}`);
  await expect(sheet).toContainText("a feeding cannot be taken back");
  await expect(sheet).toContainText(NOTHING_SENT);
  await sheet.getByRole("button", { name: "Feed again" }).click();
  await expect(sheet).toHaveCount(0);
  expect(posts, "the preview sent nothing").toEqual([]);
});

/** A collection preview, played to its end; `tail` is the line that says what the Bonds still hold. */
async function collectionPreview(page: Page, query: string, tail: string) {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") posts.push(`${r.method()} ${r.url()}`);
  });
  await page.goto(`/?preview=${query}`);
  const sheet = page.locator("dialog.feeding.collecting");
  await expect(sheet).toHaveAttribute("data-stage", "waiting");
  await expect(sheet).toHaveAttribute("data-stage", "received");
  await expect(sheet.locator("#collecting-h")).toHaveText("Collected");
  await expect(sheet.locator(".collect-sum .sr-only")).toHaveText("4,812");
  await expect(sheet).toContainText(tail);
  await expect(sheet).toContainText(NOTHING_SENT);
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toHaveCount(0);
  expect(posts, "the preview sent nothing").toEqual([]);

}
test("?preview=collect plays a collection and sends nothing", async ({ page }) => {
  await collectionPreview(page, "collect", `Bond № ${DEMO_MINE[0]} holds about 44,469 more`);
});
test("?preview=collect-all plays a collection and sends nothing", async ({ page }) => {
  await collectionPreview(page, "collect-all", "Your 3 Bonds hold about 44,469 more");
});

test("Redeem shows the same share of every memecoin in the Stomach", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".redeem-out .r-label")).toHaveText("For example, 100,000 $CONSUME takes");
  await page.locator("#burn-amount").fill("1000");
  await expect(page.locator(".redeem-out .r-label")).toHaveText("You receive");
  const burn = BigInt(1000) * BigInt(10) ** BigInt(18);
  // a share is counted against every $CONSUME, minted or still locked in a Bond
  const all = big(stats.consume_supply) + big(stats.total_unvested);
  const lines = page.locator(".redeem-out .basket li");
  await expect(lines).toHaveCount(10);
  let worth = ZERO;
  for (const h of HERESIES) {
    const t = tribe(h.symbol);
    const share = (big(t.stomach) * burn) / all;
    worth += usdValue(share, t.decimals, t.price_e18);
    await expect(lines.filter({ has: page.getByText(h.symbol, { exact: true }) })).toContainText(compact(share, t.decimals));
  }
  await expect(page.locator(".redeem-out")).toContainText(usd(worth));
  await expect(page.getByRole("button", { name: "Burn and redeem" })).toBeDisabled();
});

test("the Feast shows this week's race, who feasts now, and that it cannot win again", async ({ page }) => {
  await page.goto("/");
  const symbolOf = (token: string) => HERESIES.find((h) => DEMO_TOKEN(h.symbol) === token)!.symbol;
  const race = fed!.now
    .filter(([, micro]) => big(micro) > ZERO)
    .sort((a, b) => (big(b[1]) > big(a[1]) ? 1 : -1))
    .map(([token, micro]) => ({ token, symbol: symbolOf(token), micro }));
  const places = page.locator("#feast ol.race > li");
  await expect(places).toHaveCount(race.length);
  for (const [i, r] of race.entries()) {
    await expect(places.nth(i).locator(".race-name")).toContainText(r.symbol);
    await expect(places.nth(i).locator(".race-fed")).toHaveText(usd(r.micro, 0));
  }

  // the sample's feasting memecoin is fed the most this week, and still cannot win
  const feastToken = feastOf(stats)!;
  const feasting = symbolOf(feastToken);
  expect(race[0].token).toBe(feastToken);
  await expect(places.first()).toContainText("feasting now, so it cannot win this week");
  await expect(places.first().locator(".race-place")).toHaveText("");
  // so the lead, and the count of places, start with the next most fed
  const leader = symbolOf(nextFeast(fed!.now, stats)!);
  expect(leader).toBe(race[1].symbol);
  await expect(places.nth(1)).toContainText("in the lead");
  await expect(places.nth(1).locator(".race-place")).toHaveText("1");
  await expect(places.nth(2)).toContainText(`${usd(big(race[1].micro) - big(race[2].micro))} behind`);
  await expect(page.locator("#feast .feast-ends")).toContainText(`If it ended now, ${leader} would feast next week.`);
  await expect(page.locator("#feast .feast-ends")).toContainText(`${feasting} is feasting now, and no memecoin feasts two weeks running.`);

  await expect(page.locator("#feast .feast-who")).toContainText(feasting);
  await expect(page.locator("#feast .feast-now")).toContainText(`feeding ${feasting} pays no tithe. Every other memecoin pays ${stats.tithe_bps / 100}%.`);
  await expect(page.locator("#feast > header")).toContainText("None feasts two weeks running.");
});

test("the roads show what NEAR Intents answered, open or shut", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".roads-status")).toContainText("All ten roads are open");
  await expect(page.locator(".town-coin .out.shut")).toHaveCount(0);

  await page.unroute("**/api/routes");
  await roads(page, ["BOME"]);
  await page.reload();
  await expect(page.locator(".roads-status")).toContainText("Nine of ten roads are open");
  await expect(page.locator(".town-coin", { hasText: "BOME" }).locator(".out")).toHaveText("no road");
  await expect(page.locator(".town-coin .out.shut")).toHaveCount(1);
});

// The Ledger opens on its newest six entries. Press "Show more" until every entry is listed.
const allRows = async (page: Page) => {
  const more = page.locator("#ledger .roll-more");
  while (await more.isVisible()) await more.click();
};

test("the Ledger lists the sample entries, and its filters add up", async ({ page, request }) => {
  const count = (kinds: LedgerEntry["kind"][]) => DEMO_LEDGER.entries.filter((e) => kinds.includes(e.kind)).length;
  const all = DEMO_LEDGER.entries.length;
  const [feedings, mintings, burns] = [count(["feed"]), count(["collect", "break"]), count(["redeem"])];
  expect(feedings + mintings + burns).toBe(all);

  await page.goto("/");
  await expect(page.locator("#ledger .roll-note")).toHaveText("Sample entries. On a live contract each one links to its transaction.");
  // sample figures have no builder to tell apart
  await expect(page.locator("#ledger .roll-who")).toHaveCount(0);
  await expect(page.locator("#ledger .roll-own")).toHaveCount(0);
  // and name nobody as the Assayer or the guardian
  await expect(page.locator(".seals li")).toHaveCount(3);
  await expect(page.locator(".seals .seal-who")).toHaveCount(0);
  // and no Assayer, so no price round
  await expect(page.locator("details.round-fold")).toHaveCount(0);
  const shows = page.locator("#ledger .roll-shows button");
  await expect(shows).toHaveText([`All ${all}`, `Feedings ${feedings}`, `Mints ${mintings}`, `Burns ${burns}`]);
  const rows = page.locator("#ledger ol.roll > li");
  // the newest six first, the rest behind one button
  expect(all).toBeGreaterThan(6);
  await expect(rows).toHaveCount(6);
  await expect(page.locator("#ledger .roll-more")).toHaveText(`Show ${Math.min(20, all - 6)} more`);
  await allRows(page);
  await expect(rows).toHaveCount(all);
  // a sample entry has no transaction to link to
  await expect(page.locator("#ledger a.roll-tx")).toHaveCount(0);
  for (const [i, n] of [feedings, mintings, burns].entries()) {
    await shows.nth(i + 1).click();
    await allRows(page);
    await expect(rows).toHaveCount(n);
  }
  await expect(rows.first()).toContainText("redeemed for a share of the Stomach");
  await shows.first().click();
  await allRows(page);
  await expect(rows).toHaveCount(all);

  // the same entries are what the site's own Ledger address gives an agent
  const res = await request.get("/api/ledger");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { entries: LedgerEntry[]; discovery_limits_reached: boolean; history_completeness: string };
  expect(body.discovery_limits_reached).toBe(false);
  expect(body.history_completeness).toBe("unknown");
  for (const batch of [[], Array.from({ length: 21 }, () => ({ jsonrpc: "2.0", id: 1, method: "ping" }))]) {
    const reply = await request.post("/api/mcp", { data: batch });
    expect(reply.status()).toBe(400);
  }
  const oversized = await request.post("/api/mcp", { data: "💰".repeat(17_000) });
  expect(oversized.status()).toBe(413);
  expect(body.entries.map((e) => e.id)).toEqual(DEMO_LEDGER.entries.map((e) => e.id));
});

// the rows of the site's table, and the row of the simulation's own summary each one is
const SIM_ROWS: [string, string][] = [
  ["Fed into the Stomach", "Fed into the Stomach"],
  ["Feedings", "Feedings"],
  ["Memecoins paid out to redeemers", "Memecoins paid out"],
  ["$CONSUME burned by redeeming", "$CONSUME burned by redeeming"],
  ["$CONSUME forfeited, never minted", "$CONSUME forfeited, never minted"],
  ["Liquid $CONSUME", "Liquid $CONSUME on day 60"],
  ["Still locked in Bonds", "Locked in Bonds on day 60"],
  ["In the Stomach", "Stomach on day 60"],
  ["Backing of 1,000 $CONSUME (starts at $1.00)", "Backing of 1,000 $CONSUME, day 60 (starts at $1.00)"],
  ["Backing checks passed", "Backing checks passed"],
];

test("the simulation is marked as simulated and shows the figures `node sim/sim.mjs` wrote", async ({ page }) => {
  await page.goto("/");
  const sim = page.locator("#sim");
  await expect(sim.locator("header p")).toContainText("Every figure here is simulated.");

  // the table is folded under the findings; opened, it matches sim/out/summary.md cell for cell
  await expect(sim.locator(".sim-table")).toBeHidden();
  await sim.getByText("The figures for all four runs").click();
  await expect(sim.locator(".sim-table")).toBeVisible();
  const summary = new Map(
    readFileSync(fileURLToPath(new URL("../../sim/out/summary.md", import.meta.url)), "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split("|").slice(1, -1).map((c) => c.trim()))
      .map(([label, ...cells]) => [label, cells]),
  );
  const titles = summary.get("")!;
  expect(titles).toHaveLength(4);
  await expect(sim.locator(".sim-table thead th")).toHaveText(titles);
  const rows = sim.locator(".sim-table tbody tr");
  await expect(rows.locator("th")).toHaveText(SIM_ROWS.map(([onSite]) => onSite));
  for (const [i, [, inSummary]] of SIM_ROWS.entries()) await expect(rows.nth(i).locator("td")).toHaveText(summary.get(inSummary)!);

  // picking a scenario draws it: the charts end on that column's day 60
  const at = titles.indexOf("A run for the exit");
  const day60 = (label: string) => summary.get(label)![at];
  await sim.getByRole("button", { name: "A run for the exit" }).click();
  await expect(sim.getByRole("button", { name: "A run for the exit" })).toHaveAttribute("aria-pressed", "true");
  await expect(sim.locator(".sim-what")).toContainText("a quarter of holders a day redeem everything");
  const keys = sim.locator(".sim-key");
  await expect(keys.nth(0)).toHaveText(`Liquid ${day60("Liquid $CONSUME on day 60")}Locked in Bonds ${day60("Locked in Bonds on day 60")}day 60`);
  await expect(keys.nth(1)).toHaveText(`Backing ${day60("Backing of 1,000 $CONSUME, day 60 (starts at $1.00)")}day 60`);

  // the charts are read day by day, from the keyboard too
  const chart = sim.getByRole("slider", { name: "Supply of $CONSUME, day by day" });
  await chart.focus();
  await page.keyboard.press("Home");
  await expect(keys.nth(0)).toHaveText("Liquid 0Locked in Bonds 0day 0");
  await expect(keys.nth(1)).toHaveText("Backing $1.000day 0");
  await page.keyboard.press("PageUp");
  await expect(chart).toHaveAttribute("aria-valuenow", "7");
  await page.keyboard.press("End");
  await expect(keys.nth(1)).toContainText("day 60");
});

/** The whole page on a phone of this width: nothing may run off the side. */
async function fitsAPhone(browser: Browser, width: number) {
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const seen = await watch(page);
  await roads(page);
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator(".demo-note")).toBeVisible();
  // the whole page, top to bottom, with a quote and its Bond on show
  await page.locator("label.meal-usd input").fill("50");
  await expect(page.locator(".yield-amount")).toBeVisible();
  await page.locator("#ledger").scrollIntoViewIfNeeded();
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(scroll, "the page is no wider than the phone").toBeLessThanOrEqual(client);
  // every section stays inside the screen
  const wide = await page.locator("main section[id]").evaluateAll((els, w) => els.filter((e) => e.getBoundingClientRect().right > w + 1).map((e) => e.id), width);
  expect(wide).toEqual([]);
  clean(seen);
  await context.close();

}
test("on a phone 390 wide nothing runs off the side", async ({ browser }) => {
  await fitsAPhone(browser, 390);
});
test("on a phone 320 wide nothing runs off the side", async ({ browser }) => {
  await fitsAPhone(browser, 320);
});

test("the share card, the coin sheet and the social pictures are served", async ({ page, request }) => {
  await page.goto("/card");
  await expect(page).toHaveTitle("Share card | CONSUME");
  await expect(page.locator("h1")).toHaveText("The memecoin that eats memecoins.");
  await page.goto("/coins");
  await expect(page).toHaveTitle("Coins | CONSUME");

  for (const path of ["/opengraph-image.png", "/twitter-image.png"]) {
    const res = await request.get(path);
    expect([res.status(), res.headers()["content-type"]], path).toEqual([200, "image/png"]);
    // a PNG, 1200 by 630
    const png = await res.body();
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  }
  const icon = await request.get("/icon.svg");
  expect([icon.status(), icon.headers()["content-type"]]).toEqual([200, "image/svg+xml"]);
});

test("llms.txt and the MCP server name the same fourteen tools", async ({ request }) => {
  const rpc = async (method: string, params: object = {}) => {
    const res = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method, params } });
    expect(res.status(), method).toBe(200);
    return (await res.json()) as { result: Record<string, unknown> };
  };
  const hello = await rpc("initialize");
  expect(hello.result.serverInfo).toMatchObject({ name: "consume", title: "CONSUME" });
  expect(hello.result.instructions).toContain("this server never holds a key, signs or sends");

  // only the list of tools is asked for here: a tool call on a build with no
  // contract set reads the public testnet deployment, which is outside this machine
  const tools = ((await rpc("tools/list")).result.tools as { name: string; description: string; inputSchema: object }[]) ?? [];
  expect(tools.map((t) => t.name)).toEqual([
    "overview",
    "list_memecoins",
    "feast_race",
    "quote_feeding",
    "quote_redeem",
    "account",
    "bond",
    "recent_feedings",
    "ledger",
    "prepare_feed",
    "prepare_collect",
    "prepare_break_seal",
    "prepare_redeem",
    "prepare_test_deposit",
  ]);
  for (const t of tools) expect(t.description.length, `${t.name} says what it does`).toBeGreaterThan(20);

  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  const text = await llms.text();
  expect(text.startsWith("# CONSUME")).toBe(true);
  for (const t of tools) expect(text, `llms.txt names ${t.name}`).toContain(`\`${t.name}\``);

  // the server speaks JSON-RPC over POST only
  expect((await request.get("/api/mcp")).status()).toBe(405);
});
test("source and demo guide are discoverable, and the guide fits a phone", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Source on GitHub", exact: true })).toHaveAttribute("href", "https://github.com/ethboi/consume");
  await page.getByRole("link", { name: "Demo: two-minute guide", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Feed. Pass the Bond. Redeem.");
  await expect(page.locator(".demo-steps > li")).toHaveCount(5);
  await expect(page.locator("main")).toContainText("no marketplace has listed a Bond");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
