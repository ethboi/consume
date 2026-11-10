// The Assayer: reads what each memecoin sells for through NEAR Intents and
// posts the prices to CONSUME with `set_prices`.
//
//   node scripts/assayer.mjs --contract consume.example.testnet               # print only
//   node scripts/assayer.mjs --contract ... --as assayer.testnet --send       # post once
//   node scripts/assayer.mjs --contract ... --as assayer.testnet --send --every 300
//
// Prices are read from the mainnet 1Click API (Intents has no testnet). The
// price of a memecoin is what $100 of it fetches in a dry quote, which moves
// nothing. The 1Click list price is only a check on that quote, never a price:
// a price that is too low on what the Stomach holds would mint a later feeder
// more than their share, so a doubtful price is worse than none.
//
// A round is posted only when all ten have a quote within 5% of the list
// price. Otherwise nothing is posted and the round is tried again a minute
// later. The contract refuses a feeding once a price is 15 minutes old, so a
// run of bad rounds stops feedings and leaves redeeming open: that is the
// safe way to fail.
//
// Signing uses the `near` CLI and the key in your local keychain. No key is
// read or stored by this script.

import { execFileSync } from "node:child_process";
import { HERESIES } from "../web/src/lib/heresies.ts";
import { flags } from "./launch-args.mjs";

const ONECLICK = "https://1click.chaindefuser.com/v0";
const USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const headers = { "Content-Type": "application/json", "User-Agent": "consume-assayer" };
/** A quote this far from the list price means one of the two is wrong: the round is not posted. */
const DIVERGENCE = 0.05;
/** How long 1Click gets to answer. */
const TIMEOUT_MS = 15_000;
/** After a round that was not posted, try again this soon (seconds). */
const RETRY_S = 60;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function dryQuoteUsd(assetId, raw) {
  const res = await fetch(`${ONECLICK}/quote`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      dry: true,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: assetId,
      depositType: "INTENTS",
      destinationAsset: USDC,
      amount: raw.toString(),
      refundTo: "test.near",
      refundType: "INTENTS",
      recipient: "test.near",
      recipientType: "INTENTS",
      deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => null);
  const out = json?.quote ? Number(json.quote.amountOut) / 1e6 : null;
  return out && Number.isFinite(out) && out > 0 ? out : null;
}

/** One quote, asked again once if it is refused: 1Click turns some away when busy. */
async function quoteTwice(assetId, raw) {
  const first = await dryQuoteUsd(assetId, raw).catch(() => null);
  if (first !== null) return first;
  await pause(1500);
  return dryQuoteUsd(assetId, raw).catch(() => null);
}

/** USD per whole token as the contract wants it: scaled by 1e18. */
const e18 = (price) =>
  // keep the digits of very small prices; large ones would pass what a double holds exactly
  (price * 1e18 < Number.MAX_SAFE_INTEGER ? BigInt(Math.round(price * 1e18)) : BigInt(Math.round(price * 1e12)) * 1_000_000n).toString();

/** One row per memecoin. `price` is null when it has no price that can be trusted. */
export async function readPrices() {
  const res = await fetch(`${ONECLICK}/tokens`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`1Click token list answered ${res.status}`);
  const tokens = await res.json();
  const one = async (h) => {
    const assetId = `nep141:${h.mainnet}`;
    const row = { symbol: h.symbol, token: h.mainnet, price: null };
    const listed = tokens.find((t) => t.assetId === assetId)?.price || null;
    if (!listed) return { ...row, source: "not listed on 1Click" };
    const whole = 100 / listed;
    const [i, f = ""] = whole.toFixed(Math.min(h.decimals, 12)).split(".");
    const raw = BigInt(i + (f + "0".repeat(h.decimals)).slice(0, h.decimals));
    const out = await quoteTwice(assetId, raw);
    if (out === null) return { ...row, source: "no quote after two tries" };
    const quoted = out / whole;
    const apart = Math.abs(quoted - listed) / listed;
    if (apart > DIVERGENCE) {
      return { ...row, source: `quote $${quoted.toPrecision(6)} and list price $${listed.toPrecision(6)} are ${(apart * 100).toFixed(1)}% apart` };
    }
    return { ...row, price: quoted, source: "dry quote" };
  };
  // four at a time: asked all at once, 1Click refuses the last few
  const rows = [];
  for (let i = 0; i < HERESIES.length; i += 4) rows.push(...(await Promise.all(HERESIES.slice(i, i + 4).map(one))));
  return rows;
}

function post(contract, signer, network, prices) {
  execFileSync(
    "near",
    ["contract", "call-function", "as-transaction", contract, "set_prices", "json-args", JSON.stringify({ prices }),
     "prepaid-gas", "30.0 Tgas", "attached-deposit", "0 NEAR", "sign-as", signer, "network-config", network,
     "sign-with-legacy-keychain", "send"],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}

/** Reads one round and posts it. Throws, posting nothing, unless every memecoin has a price. */
async function once(opts) {
  const rows = await readPrices();
  for (const r of rows) console.log(`${r.symbol.padEnd(12)} ${r.price ? "$" + r.price.toPrecision(6) : "no price".padEnd(9)}  ${r.source}`);
  const without = rows.filter((r) => !r.price);
  if (without.length > 0) {
    // the contract would refuse a round that leaves out a memecoin that is open or held
    throw new Error(`round not posted: no trusted price for ${without.map((r) => r.symbol).join(", ")}`);
  }
  const prices = rows.map((r) => [r.token, e18(r.price)]);
  if (!opts.send) {
    console.log(JSON.stringify({ prices }));
    return;
  }
  post(opts.contract, opts.as, opts.network ?? "testnet", prices);
  console.log(`${new Date().toISOString()} posted ${prices.length} prices to ${opts.contract}`);
}

const opts = flags();
if (opts.send && (!opts.contract || !opts.as)) {
  console.error("--send needs --contract <CONSUME account> and --as <the Assayer account>");
  process.exit(1);
}
const every = Number(opts.every ?? 0);
do {
  let posted = true;
  try {
    await once(opts);
  } catch (e) {
    posted = false;
    console.error(`${new Date().toISOString()} ${e.message}`);
    // a single run that posted nothing must say so to whatever started it
    if (!every) process.exitCode = 1;
  }
  if (every) await pause((posted ? every : Math.min(every, RETRY_S)) * 1000);
} while (every);
