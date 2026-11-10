#!/usr/bin/env node
// Four small bots for CONSUME. Each one reads the contract, decides, and
// prints the calls it would make. Nothing is signed unless you add --send.
//
//   node agents/bots.mjs herald
//       Reads only. The state of the Stomach, the Feast race and what needs
//       attention (old prices, a close race, a week about to end).
//
//   node agents/bots.mjs collector --as you.testnet [--min 100]
//       Collects the $CONSUME your Bonds have released, for every Bond with
//       at least --min ready (default 1).
//
//   node agents/bots.mjs feeder --as you.testnet --usd 25 [--symbol PEPE] [--max-tithe 5] [--bring]
//       Feeds a set dollar amount. With no --symbol it feeds the memecoin
//       that is feasting (no tithe), or else the one you hold most of.
//       --max-tithe skips the feeding while the tithe is above that percent.
//       --bring (testnet) first takes test memecoins from the stand-in.
//
//   node agents/bots.mjs kingmaker --as you.testnet --symbol SHITZU --budget 50 [--within 6] [--now] [--bring]
//       Plays the Feast race. In the last --within hours of the week (default
//       6) it feeds just enough of one memecoin to put it in the lead, if
//       that fits the budget. Earlier than that it waits, since a lead taken
//       early only tells rivals what to beat. --now feeds at once.
//
// Every bot takes --every <seconds> to keep running, --json for one JSON
// object per round, and --contract, --intents, --network and --rpc (or
// CONSUME_CONTRACT, CONSUME_INTENTS, CONSUME_NETWORK, CONSUME_RPC) to point
// at another deployment. The default is the public testnet one.
//
// --send signs with the `near` CLI and the key in your local keychain, the
// same way scripts/assayer.mjs does. No key is read or stored here. On
// mainnet --send also needs --mainnet, so real funds are never moved by a
// forgotten flag.

import { execFileSync } from "node:child_process";
import { flags } from "../scripts/launch-args.mjs";
import { account, feastRace, memecoins, nearCliArgs, netFrom, overview, planCollect, planFeed } from "../web/src/lib/mcp.ts";

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const span = (seconds) => {
  const h = seconds / 3600;
  return h >= 48 ? `${Math.round(h / 24)} days` : h >= 2 ? `${Math.round(h)} hours` : `${Math.max(1, Math.round(seconds / 60))} minutes`;
};
const quoted = (words) => words.map((w) => (/^[A-Za-z0-9._:\/-]+$/.test(w) ? w : `'${w.replace(/'/g, `'\\''`)}'`)).join(" ");

/** Stops a round with a plain reason. Not an error: the bot looked and chose to do nothing. */
class Idle extends Error {}
const idle = (why) => {
  throw new Idle(why);
};

function need(opts, name, what) {
  if (opts[name] === undefined || opts[name] === true) throw new Error(`--${name} is needed: ${what}`);
  return String(opts[name]);
}

function positive(opts, name, what) {
  const n = Number(need(opts, name, what));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a number above zero`);
  return n;
}

/**
 * Prints a plan and, with --send, signs its calls in order through the near CLI.
 * A plan that carries a warning is never sent: the warning says why it would fail.
 */
function carryOut(ctx, who, plan) {
  const { net, opts, log } = ctx;
  log(plan.summary);
  plan.calls.forEach((c, i) => log(`  ${i + 1}. ${c.method} on ${c.receiver_id}: ${c.why}`));
  plan.warnings.forEach((w) => log(`  warning: ${w}`));
  if (!opts.send) {
    log("  dry run, nothing signed. Add --send to sign, or run:");
    plan.calls.forEach((c) => log(`    near ${quoted(nearCliArgs(net, who, c))}`));
    return { sent: false, calls: plan.calls };
  }
  if (plan.warnings.length) {
    log("  not sent, because of the warning above.");
    return { sent: false, calls: plan.calls };
  }
  for (const c of plan.calls) {
    execFileSync("near", nearCliArgs(net, who, c), { stdio: ["ignore", "ignore", "inherit"] });
    log(`  signed by ${who}: ${c.method} on ${c.receiver_id}`);
  }
  return { sent: true, calls: plan.calls };
}

// ---------- herald: reads only ----------

async function herald(ctx) {
  const { net, opts, log } = ctx;
  const o = await overview(net);
  const race = await feastRace(net);
  const second = race.standings[1];
  const alerts = [];
  if (o.prices.fresh === false) {
    alerts.push(`Prices are ${span(o.prices.oldest_price_age_seconds)} old. Feedings are refused until the Assayer posts again. Redeeming stays open.`);
  }
  if (race.leading && second && second.fed_usd > 0 && second.behind_leader_usd <= Number(opts.margin ?? 25)) {
    alerts.push(`The race is close: ${second.symbol} is ${money(second.behind_leader_usd)} behind ${race.leading}.`);
  }
  if (o.seconds_until_week_ends <= Number(opts.within ?? 6) * 3600) {
    alerts.push(`The week ends in ${span(o.seconds_until_week_ends)}. ${race.leading ? `${race.leading} leads.` : "No memecoin has been fed yet."}`);
  }
  const toStep = o.tithe_rises_when_total_fed_reaches_usd === null ? null : o.tithe_rises_when_total_fed_reaches_usd - o.total_fed_usd;
  if (toStep !== null && toStep <= 500) alerts.push(`The tithe steps up from ${o.tithe_percent}% after ${money(toStep)} more is fed.`);

  log(`The Stomach holds ${money(o.stomach_usd)} on ${net.network} (${net.consume}).`);
  if (o.backing_usd_per_1000_consume !== null) log(`1,000 $CONSUME is backed by ${money(o.backing_usd_per_1000_consume)}. The tithe is ${o.tithe_percent}%.`);
  log(o.feast_now ? `${o.feast_now} is feasting: feeding it pays no tithe.` : "No memecoin is feasting this week.");
  const fed = race.standings.filter((r) => r.fed_usd > 0);
  log(
    fed.length
      ? `The race, ${span(race.seconds_until_week_ends)} left: ${fed.map((r) => `${r.symbol} ${money(r.fed_usd)}`).join(", ")}.`
      : `The race, ${span(race.seconds_until_week_ends)} left: nothing fed yet. The first feeding of $1 takes the lead.`,
  );
  if (alerts.length === 0) log("Nothing needs attention.");
  alerts.forEach((a) => log(`alert: ${a}`));
  return { overview: o, race, alerts };
}

// ---------- collector ----------

async function collector(ctx) {
  const { net, opts, log } = ctx;
  const who = need(opts, "as", "the account that holds the Bonds");
  const min = Number(opts.min ?? 1);
  const a = await account(net, { account_id: who });
  const ready = a.bonds.filter((b) => !b.seal_broken && Number(b.consume_ready_to_collect) >= min);
  if (ready.length === 0) idle(`${who} has ${a.bonds.length} Bond${a.bonds.length === 1 ? "" : "s"} and none has ${min} $CONSUME ready to collect.`);
  const done = [];
  for (const b of ready) {
    const p = await planCollect(net, { account_id: who, bond_id: b.bond_id });
    done.push({ bond_id: b.bond_id, ready: b.consume_ready_to_collect, ...carryOut(ctx, who, p.plan) });
  }
  return { account: who, collected: done };
}

// ---------- feeder ----------

async function feeder(ctx) {
  const { net, opts, log } = ctx;
  const who = need(opts, "as", "the account that feeds");
  const usd = positive(opts, "usd", "how many dollars to feed");
  const o = await overview(net);
  if (o.prices.fresh === false) idle(`Prices are ${span(o.prices.oldest_price_age_seconds)} old, so the contract would refuse a feeding.`);

  const before = await account(net, { account_id: who });
  let symbol = opts.symbol === undefined || opts.symbol === true ? null : String(opts.symbol);
  if (symbol) log(`Feeding ${symbol}, as asked.`);
  else if (o.feast_now) {
    symbol = o.feast_now;
    log(`Feeding ${symbol}: it is feasting, so this pays no tithe.`);
  } else {
    const most = [...before.memecoins_ready_to_feed].sort((x, y) => y.value_usd - x.value_usd)[0];
    if (!most) idle(`${who} holds no listed memecoin. Name one with --symbol${net.network === "testnet" ? " and add --bring to take test memecoins" : ""}.`);
    symbol = most.memecoin;
    log(`Feeding ${symbol}: no memecoin is feasting, and it is the one ${who} holds most of.`);
  }
  const feasting = !!o.feast_now && o.feast_now.toLowerCase() === symbol.toLowerCase();
  if (opts.maxTithe !== undefined && !feasting && o.tithe_percent > Number(opts.maxTithe)) {
    idle(`The tithe is ${o.tithe_percent}%, above the ${opts.maxTithe}% this bot was told to accept.`);
  }

  const p = await planFeed(net, { account_id: who, symbol, usd: String(usd), bring_test_memecoins: !!opts.bring });
  const out = carryOut(ctx, who, p.plan);
  if (!out.sent) return { account: who, quote: p.quote, ...out };
  // a transfer the contract refuses still succeeds as a transaction: the memecoins come back.
  // So look for the Bond.
  await pause(5000);
  const after = await account(net, { account_id: who });
  const minted = after.bonds.filter((b) => !before.bonds.some((x) => x.bond_id === b.bond_id));
  if (minted.length) log(`  Bond ${minted.map((b) => b.bond_id).join(", ")} minted: ${minted.map((b) => b.consume_total).join(", ")} $CONSUME over ${p.quote.released_over_days} days.`);
  else log("  No new Bond: the contract refused the feeding and returned the memecoins.");
  return { account: who, quote: p.quote, ...out, bonds_minted: minted.map((b) => b.bond_id) };
}

// ---------- kingmaker ----------

async function kingmaker(ctx) {
  const { net, opts, log } = ctx;
  const who = need(opts, "as", "the account that feeds");
  const want = need(opts, "symbol", "the memecoin to crown").toLowerCase();
  const budget = positive(opts, "budget", "the most dollars to spend on the crown");
  const within = Number(opts.within ?? 6);
  const o = await overview(net);
  const smallest = o.rules.smallest_feeding_usd ?? 1;
  const listed = (await memecoins(net)).find((m) => m.symbol.toLowerCase() === want);
  if (!listed) throw new Error(`CONSUME does not eat "${opts.symbol}"`);
  if (!listed.open_for_feeding) idle(`${listed.symbol} is closed for feeding.`);
  if (o.prices.fresh === false) idle(`Prices are ${span(o.prices.oldest_price_age_seconds)} old, so the contract would refuse a feeding.`);

  let spent = 0;
  let last = null;
  for (let round = 0; round < 40; round++) {
    const race = await feastRace(net);
    const me = race.standings.find((r) => r.symbol === listed.symbol);
    if (race.leading === me.symbol) {
      const next = race.standings[1];
      log(`${me.symbol} leads the race with ${money(me.fed_usd)}${next && next.fed_usd > 0 ? `, ${money(next.behind_leader_usd)} ahead of ${next.symbol}` : ""}. ${span(race.seconds_until_week_ends)} left.`);
      return { account: who, symbol: me.symbol, leads: true, spent_usd: spent };
    }
    if (last !== null && me.fed_usd <= last) idle(`The last feeding did not count (the day's cap for ${me.symbol} may be full). Stopping after ${money(spent)}.`);
    // two cents over, since each feeding is valued rounded down
    const gap = Math.max(smallest, me.behind_leader_usd + 0.02);
    const where = `${me.symbol} is ${money(me.behind_leader_usd)} behind ${race.leading ?? "an empty field"} with ${span(race.seconds_until_week_ends)} left.`;
    if (spent + gap > budget) idle(`${where} Taking the lead needs ${money(gap)}, over what is left of the ${money(budget)} budget.`);
    if (race.seconds_until_week_ends > within * 3600 && !opts.now) {
      idle(`${where} Taking the lead would cost ${money(gap)}. Waiting for the last ${within} hours of the week (--now feeds at once).`);
    }
    const bite = Math.min(gap, listed.largest_feeding_usd);
    const feedings = Math.ceil(gap / listed.largest_feeding_usd);
    log(`${where} Taking the lead needs ${money(gap)}${feedings > 1 ? `, in ${feedings} feedings of at most ${money(listed.largest_feeding_usd)}` : ""}.`);
    const p = await planFeed(net, { account_id: who, symbol: listed.symbol, usd: bite.toFixed(6), bring_test_memecoins: !!opts.bring });
    const out = carryOut(ctx, who, p.plan);
    if (!out.sent) return { account: who, symbol: me.symbol, leads: false, needs_usd: gap, feedings, quote: p.quote, ...out };
    spent += p.quote.value_usd;
    last = me.fed_usd;
    await pause(5000);
  }
  return { account: who, symbol: listed.symbol, leads: false, spent_usd: spent };
}

// ---------- running ----------

const BOTS = { herald, collector, feeder, kingmaker };

async function main() {
  const name = process.argv[2];
  const opts = flags(process.argv.slice(3));
  if (!Object.hasOwn(BOTS, name ?? "")) {
    console.error(`Usage: node agents/bots.mjs <${Object.keys(BOTS).join(" | ")}> [--as you.testnet] [--send] [--every seconds]\nThe top of this file says what each bot does. Without --send nothing is signed.`);
    process.exit(name ? 1 : 0);
  }
  const env = process.env;
  const net = netFrom({
    network: opts.network ?? env.CONSUME_NETWORK,
    consume: opts.contract ?? env.CONSUME_CONTRACT,
    intents: opts.intents ?? env.CONSUME_INTENTS,
    rpcUrl: opts.rpc ?? env.CONSUME_RPC,
  });
  if (opts.send && net.network === "mainnet" && !opts.mainnet) throw new Error("This would sign on mainnet with real funds. Add --mainnet if that is what you mean.");

  const every = Number(opts.every ?? 0);
  do {
    const said = [];
    const log = (line) => (opts.json ? said.push(line) : console.log(`${new Date().toISOString()} ${name}  ${line}`));
    const ctx = { net, opts, log };
    try {
      const result = await BOTS[name](ctx);
      if (opts.json) console.log(JSON.stringify({ at: new Date().toISOString(), bot: name, signed: !!opts.send, said, ...result }));
    } catch (e) {
      if (e instanceof Idle) {
        log(`Nothing to do. ${e.message}`);
        if (opts.json) console.log(JSON.stringify({ at: new Date().toISOString(), bot: name, signed: false, idle: e.message, said }));
      } else {
        // one bad round must not stop a bot that is meant to keep running
        console.error(`${new Date().toISOString()} ${name}  ${e.message}`);
        if (!every) process.exitCode = 1;
      }
    }
    if (every) await pause(every * 1000);
  } while (every);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
