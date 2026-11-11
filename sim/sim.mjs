#!/usr/bin/env node
// Sixty days of CONSUME under four kinds of behaviour.
//
//   node sim/sim.mjs
//
// It writes one CSV a scenario and a summary into sim/out/, two charts into
// sim/charts/, and the figures the site shows into web/src/lib/simulation.json. Every run gives the same numbers: the randomness comes from a
// fixed seed. The rules and the rounding are the contract's own (see model.mjs),
// and after every feeding, broken seal and redemption the run checks that the
// backing of each $CONSUME did not fall. If it ever did, the run stops.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLORS, smallMultiples } from "./charts.mjs";
import { Consume, DAY_NS, LAUNCH, MICRO_USD, ONE_CONSUME, afterTithe, amountForUsd, consumeAtFloor, titheAt } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DAYS = 60;

// The ten memecoins with the caps they were listed with (web/src/lib/heresies.ts)
// and their prices on 2026-11-09 (NEAR Intents 1Click quotes, web/src/lib/demo.ts).
// `crash` is what is left of the price after the fall in the fourth scenario.
const TOKENS = [
  { symbol: "DOGE", decimals: 8, priceE18: 70014000000000000n, maxMeal: 1000, dailyCap: 5000, crash: 0.4 },
  { symbol: "SHIB", decimals: 18, priceE18: 4460000000000n, maxMeal: 1000, dailyCap: 5000, crash: 0.35 },
  { symbol: "PEPE", decimals: 18, priceE18: 5130000000000n, maxMeal: 1000, dailyCap: 5000, crash: 0.3 },
  { symbol: "PENGU", decimals: 6, priceE18: 6386910000000000n, maxMeal: 1000, dailyCap: 5000, crash: 0.3 },
  { symbol: "SPX", decimals: 8, priceE18: 363978000000000000n, maxMeal: 1000, dailyCap: 5000, crash: 0.25 },
  { symbol: "TURBO", decimals: 18, priceE18: 710250000000000n, maxMeal: 500, dailyCap: 2500, crash: 0.25 },
  { symbol: "BOME", decimals: 6, priceE18: 614780000000000n, maxMeal: 500, dailyCap: 2500, crash: 0.2 },
  { symbol: "BLACKDRAGON", decimals: 24, priceE18: 6411000000n, maxMeal: 100, dailyCap: 300, crash: 0.15 },
  { symbol: "SHITZU", decimals: 18, priceE18: 1450420000000000n, maxMeal: 100, dailyCap: 300, crash: 0.2 },
  { symbol: "NearKat", decimals: 18, priceE18: 88220000000000n, maxMeal: 50, dailyCap: 150, crash: 0.1 },
];

const CALM = { breakSeal: 0.004, redeem: { chance: 0.02, part: 0.5 } };

// What people do, day by day. `feedings` is the average number a day; `chase` is
// the share of feeders who pick the Feast memecoin because it pays no tithe;
// `breakSeal` is the chance a Bond's seal is broken on a given day; `redeem` is
// the chance a holder redeems that day and how much of their $CONSUME they burn.
const SCENARIOS = [
  {
    key: "steady",
    title: "Steady feeding",
    what: "About 25 feedings a day for 60 days.",
    seed: 11,
    feedings: () => 25,
    ...flat(CALM),
    marks: [],
  },
  {
    key: "rush",
    title: "A rush, then quiet",
    what: "About 150 feedings a day for 10 days, then 3 a day.",
    seed: 23,
    feedings: (d) => (d < 10 ? 150 : 3),
    ...flat(CALM),
    marks: [{ x: 10, label: "feeding slows" }],
  },
  {
    key: "run",
    title: "A run for the exit",
    what: "Steady for 30 days. Then for 10 days, 12% of Bonds a day have their seal broken, a quarter of holders a day redeem everything, and feeding nearly stops.",
    seed: 37,
    feedings: (d) => (d < 30 ? 25 : d < 40 ? 2 : 6),
    breakSeal: (d) => (d >= 30 && d < 40 ? 0.12 : CALM.breakSeal),
    redeem: (d) => (d >= 30 && d < 40 ? { chance: 0.25, part: 1 } : CALM.redeem),
    marks: [
      { x: 30, label: "the run starts", before: true },
      { x: 40, label: "it ends" },
    ],
  },
  {
    key: "crash",
    title: "Memecoins fall about 70%",
    what: "Steady for 25 days. Then every price falls over five days to between 10% and 40% of where it was and stays there, with more broken seals and redemptions for ten days.",
    seed: 53,
    feedings: (d) => (d < 25 ? 25 : 10),
    breakSeal: (d) => (d >= 25 && d < 35 ? 0.03 : CALM.breakSeal),
    redeem: (d) => (d >= 25 && d < 35 ? { chance: 0.08, part: 1 } : CALM.redeem),
    // the fall is spread over five days, then prices stay down
    price: (d, t) => (d < 25 ? 1 : d >= 30 ? t.crash : t.crash ** ((d - 24) / 5)),
    marks: [{ x: 25, label: "prices fall" }],
  },
];
const CHASE = 0.3;
const MEAL_MEDIAN_USD = 60;
const MEAL_SPREAD = 1.0;

function flat(c) {
  return { breakSeal: () => c.breakSeal, redeem: () => c.redeem };
}

// ---------- randomness with a fixed seed ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson(rng, mean) {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > limit);
  return k - 1;
}
const normal = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

// ---------- one run ----------

const usdOf = (micro) => Number(micro) / 1e6;
const consumeOf = (raw) => Number(raw / 10n ** 12n) / 1e6;

function run(scn) {
  const rng = mulberry32(scn.seed);
  const tokens = TOKENS.map((t) => ({
    ...t,
    maxMealUsd: BigInt(t.maxMeal) * MICRO_USD,
    dailyCapUsd: BigInt(t.dailyCap) * MICRO_USD,
  }));
  const c = new Consume(tokens);
  // start on the first day of a week, so the sixty days are whole weeks from the start
  const t0 = 3000n * LAUNCH.epochNs;
  const capTotal = TOKENS.reduce((a, t) => a + t.dailyCap, 0);
  const owners = [];
  const rows = [];
  const tally = { feedings: 0, refused: 0, sealsBroken: 0, redemptions: 0, feastWeeks: {}, fedUsd: 0n };

  for (let day = 0; day < DAYS; day++) {
    const dayStart = t0 + BigInt(day) * DAY_NS;
    for (const t of TOKENS) {
      const factor = scn.price ? scn.price(day, t) : 1;
      c.tribes.get(t.symbol).priceE18 = (t.priceE18 * BigInt(Math.round(factor * 1e6))) / 1_000_000n;
    }
    const feast = c.feast(dayStart);
    if (day % 7 === 0) tally.feastWeeks[feast ?? "none"] = (tally.feastWeeks[feast ?? "none"] ?? 0) + 1;

    // feedings, spread through the day
    const n = poisson(rng, scn.feedings(day));
    let fedToday = 0n;
    for (let i = 0; i < n; i++) {
      const now = dayStart + (DAY_NS * BigInt(i + 1)) / BigInt(n + 2);
      let symbol = feast;
      if (!feast || rng() >= CHASE) {
        // otherwise memecoins are picked in proportion to their daily caps
        let pick = rng() * capTotal;
        symbol = TOKENS.find((t) => (pick -= t.dailyCap) < 0).symbol;
      }
      const tribe = c.tribes.get(symbol);
      const usdWanted = Math.max(1.05, MEAL_MEDIAN_USD * Math.exp(MEAL_SPREAD * normal(rng)));
      const amount = amountForUsd(BigInt(Math.round(usdWanted * 1e6)), tribe.decimals, tribe.priceE18);
      const owner = owners.length === 0 || rng() < 0.6 ? owners.push(`feeder-${owners.length + 1}`) && owners[owners.length - 1] : owners[Math.floor(rng() * owners.length)];
      const res = c.feed(owner, symbol, amount, now);
      if (res.refused) tally.refused += 1;
      else {
        tally.feedings += 1;
        fedToday += res.bond.mealUsd;
      }
    }
    tally.fedUsd += fedToday;

    // the day's end: seals are broken, everyone else collects, some redeem
    const dusk = dayStart + DAY_NS - 1_000_000_000n;
    const pBreak = scn.breakSeal(day);
    for (const bond of c.bonds) {
      if (bond.exited || bond.released === bond.total) continue;
      const [, locked] = c.split(bond, dusk);
      if (locked > 0n && rng() < pBreak) {
        c.exit(bond, dusk);
        tally.sealsBroken += 1;
      } else c.claim(bond, dusk);
    }
    const { chance, part } = scn.redeem(day);
    for (const owner of owners) {
      const held = c.balances.get(owner) ?? 0n;
      if (held === 0n || rng() >= chance) continue;
      const burn = part >= 1 ? held : (held * BigInt(Math.round(part * 1000))) / 1000n;
      if (c.redeem(owner, burn)) tally.redemptions += 1;
    }

    const claims = c.claims();
    const stomach = c.stomachUsd();
    rows.push({
      day: day + 1,
      fed_usd: usdOf(fedToday),
      eaten_usd: usdOf(c.eatenUsd),
      tithe_pct: Number(c.titheNow()) / 100,
      feast: feast ?? "",
      supply: consumeOf(c.supply),
      locked: consumeOf(c.unvested),
      forfeited: consumeOf(c.forfeited),
      redeemed: consumeOf(c.redeemed),
      stomach_usd: usdOf(stomach),
      // dollars behind each 1,000 $CONSUME that has a claim, minted or still locked
      backing_per_1000: claims === 0n ? 1 : Number((stomach * ONE_CONSUME * 1000n) / claims) / 1e6,
    });
  }

  // which memecoin the Stomach ended up mostly made of
  const stomach = c.stomachUsd();
  const largest = [...c.tribes.values()]
    .map((t) => ({ symbol: t.symbol, usd: (t.stomach * t.priceE18) / (10n ** BigInt(t.decimals) * 10n ** 12n) }))
    .sort((a, b) => (a.usd < b.usd ? 1 : -1))[0];
  return {
    scn,
    rows,
    c,
    tally,
    largest: { symbol: largest.symbol, share: stomach === 0n ? 0 : Number((largest.usd * 1000n) / stomach) / 10 },
  };
}

// ---------- the port is checked against numbers the README states ----------

function selfCheck() {
  const eq = (got, want, what) => {
    if (got !== want) throw new Error(`${what}: got ${got}, expected ${want}`);
  };
  const L = LAUNCH;
  // one dollar into an empty Stomach mints 1,000 $CONSUME
  eq(consumeAtFloor(L.startRate, MICRO_USD, 0n, 0n), 1000n * ONE_CONSUME, "start rate");
  // the tithe: 1% at the start, a step each $10,000 eaten, never above 10%
  eq(titheAt(L.titheStepBps, L.maxTitheBps, L.famineUsd, 0n), 100n, "first tithe");
  eq(titheAt(L.titheStepBps, L.maxTitheBps, L.famineUsd, 25_000n * MICRO_USD), 300n, "tithe after $25,000");
  eq(titheAt(L.titheStepBps, L.maxTitheBps, L.famineUsd, 500_000n * MICRO_USD), 1000n, "tithe at its cap");
  // a feeding that crosses a step pays each part at its own rate: $50 at 1% and $50 at 2%
  eq(afterTithe(L.titheStepBps, L.maxTitheBps, L.famineUsd, 9_950n * MICRO_USD, 100n * MICRO_USD), 98_500_000n, "tithe across a step");
  // README: $100 into a $100 Stomach at a 10% tithe is worth about $94.74, not $90
  const claims = 100_000n * ONE_CONSUME;
  const minted = consumeAtFloor(L.startRate, 90n * MICRO_USD, claims, 100n * MICRO_USD);
  eq((200n * MICRO_USD * minted) / (claims + minted), 94_736_842n, "the $94.74 example");
}

// ---------- output ----------

const fmt = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const millions = (n) => (n === 0 ? "0" : `${fmt(n / 1e6, n >= 1e7 ? 0 : 1)}M`);

function main() {
  selfCheck();
  const runs = SCENARIOS.map(run);
  mkdirSync(join(HERE, "out"), { recursive: true });
  mkdirSync(join(HERE, "charts"), { recursive: true });

  for (const r of runs) {
    const cols = Object.keys(r.rows[0]);
    const csv = [cols.join(","), ...r.rows.map((row) => cols.map((k) => (typeof row[k] === "number" ? Number(row[k].toFixed(6)) : row[k])).join(","))];
    writeFileSync(join(HERE, "out", `${r.scn.key}.csv`), csv.join("\n") + "\n");
  }

  // every figure once, as text: the summary table and the site both print these
  const figures = [
    ["fed", "Fed into the Stomach", (r) => `$${fmt(usdOf(r.tally.fedUsd))}`],
    ["feedings", "Feedings", (r) => fmt(r.tally.feedings)],
    ["refused", "Feedings refused by a cap", (r) => fmt(r.tally.refused)],
    ["tithePaid", "Tithe paid to holders", (r) => `$${fmt(usdOf(r.c.tithePaid))}`],
    ["titheWaived", "Tithe not charged (Feast)", (r) => `$${fmt(usdOf(r.c.titheWaived))}`],
    ["seals", "Seals broken", (r) => fmt(r.tally.sealsBroken)],
    ["forfeited", "$CONSUME forfeited, never minted", (r) => millions(consumeOf(r.c.forfeited))],
    ["burned", "$CONSUME burned by redeeming", (r) => millions(consumeOf(r.c.redeemed))],
    ["paidOut", "Memecoins paid out", (r) => `$${fmt(usdOf(r.c.paidOutUsd))}`],
    ["liquid", "Liquid $CONSUME on day 60", (r) => millions(r.rows[DAYS - 1].supply)],
    ["locked", "Locked in Bonds on day 60", (r) => millions(r.rows[DAYS - 1].locked)],
    ["stomach", "Stomach on day 60", (r) => `$${fmt(r.rows[DAYS - 1].stomach_usd)}`],
    ["backing", "Backing of 1,000 $CONSUME, day 60 (starts at $1.00)", (r) => `$${fmt(r.rows[DAYS - 1].backing_per_1000, 3)}`],
    ["largest", "Largest memecoin in the Stomach", (r) => `${r.largest.symbol}, ${fmt(r.largest.share, 0)}%`],
    [
      "feast",
      "The Feast, week by week",
      (r) =>
        Object.entries(r.tally.feastWeeks)
          .map(([s, w]) => `${s} ${w}`)
          .join(", "),
    ],
    ["checks", "Backing checks passed", (r) => fmt(r.c.checks)],
  ].map(([key, label, cell]) => ({ key, label, cells: runs.map(cell) }));

  const line = (cells) => `| ${cells.join(" | ")} |`;
  const table = [
    line(["", ...runs.map((r) => r.scn.title)]),
    line(["---", ...runs.map(() => "---:")]),
    ...figures.map((f) => line([f.label, ...f.cells])),
  ].join("\n");
  writeFileSync(join(HERE, "out", "summary.md"), table + "\n");

  // the same run for the site (web/src/components/Simulation.tsx): a point a day and the figures above
  const site = {
    days: DAYS,
    scenarios: runs.map((r) => ({
      key: r.scn.key,
      title: r.scn.title,
      what: r.scn.what,
      marks: r.scn.marks,
      liquid: r.rows.map((x) => Math.round(x.supply)),
      locked: r.rows.map((x) => Math.round(x.locked)),
      backing: r.rows.map((x) => Number(x.backing_per_1000.toFixed(4))),
    })),
    figures,
  };
  writeFileSync(join(HERE, "..", "web", "src", "lib", "simulation.json"), JSON.stringify(site) + "\n");

  const marks = (r) => r.scn.marks;
  writeFileSync(
    join(HERE, "charts", "supply.svg"),
    smallMultiples({
      title: "Supply over sixty days",
      subtitle: "Millions of $CONSUME: what holders have collected, and what is still locked in Bonds.",
      note: "Simulated with the contract's own arithmetic and launch settings. Each panel is one fixed-seed run: node sim/sim.mjs",
      yFormat: (v) => millions(v),
      panels: runs.map((r) => ({
        title: r.scn.title,
        marks: marks(r),
        series: [
          { name: "Liquid $CONSUME", short: "liquid", color: COLORS.ink, points: [[0, 0], ...r.rows.map((x) => [x.day, x.supply])] },
          { name: "Locked in Bonds", short: "locked", color: COLORS.rubric, dashed: true, points: [[0, 0], ...r.rows.map((x) => [x.day, x.locked])] },
        ],
      })),
    }),
  );
  writeFileSync(
    join(HERE, "charts", "backing.svg"),
    smallMultiples({
      title: "Backing over sixty days",
      subtitle: "Dollars of memecoins in the Stomach behind each 1,000 $CONSUME, minted or still locked.",
      note: "Prices are held still in the first three panels, so those lines move only by the tithe and by broken seals.",
      yFormat: (v) => `$${v.toFixed(2)}`,
      panels: runs.map((r) => ({
        title: r.scn.title,
        marks: marks(r),
        series: [{ name: "Backing of 1,000 $CONSUME", color: COLORS.ink, points: [[0, 1], ...r.rows.map((x) => [x.day, x.backing_per_1000])] }],
      })),
    }),
  );

  console.log(table);
  console.log(`\nWrote ${runs.length} CSV files and summary.md to sim/out/, and supply.svg and backing.svg to sim/charts/.`);
  console.log("Wrote the same figures to web/src/lib/simulation.json for the site.");
}

main();
