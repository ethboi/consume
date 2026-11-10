// The Assayer: reads what each memecoin sells for through NEAR Intents and
// posts the prices to CONSUME with `set_prices`.
//
//   node scripts/assayer.mjs --contract consume.example.testnet               # print only
//   node scripts/assayer.mjs --contract ... --as assayer.testnet --send       # post once
//   node scripts/assayer.mjs --contract ... --as assayer.testnet --send --every 300
//
// Prices are read from the mainnet 1Click API (Intents has no testnet). The
// price of a memecoin is what $100 of it fetches in a dry quote, which moves
// nothing; if no quote comes back, the 1Click list price is used instead.
// A feeding needs a fresh price for everything in the Stomach, so all ten are
// posted every time. If one cannot be priced it is left out and feedings stop
// until it can: that is the safe way to fail.
//
// Signing uses the `near` CLI and the key in your local keychain. No key is
// read or stored by this script.

import { execFileSync } from "node:child_process";
import { HERESIES } from "../web/src/lib/heresies.ts";
import { flags } from "./launch-args.mjs";

const ONECLICK = "https://1click.chaindefuser.com/v0";
const USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const headers = { "Content-Type": "application/json", "User-Agent": "consume-assayer" };
/** A quote this far from the list price is reported, and the lower one is used. */
const DIVERGENCE = 0.05;

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
  });
  const json = await res.json().catch(() => null);
  return json?.quote ? Number(json.quote.amountOut) / 1e6 : null;
}

/** USD per whole token as the contract wants it: scaled by 1e18. */
const e18 = (price) =>
  // keep the digits of very small prices; large ones would pass what a double holds exactly
  (price * 1e18 < Number.MAX_SAFE_INTEGER ? BigInt(Math.round(price * 1e18)) : BigInt(Math.round(price * 1e12)) * 1_000_000n).toString();

export async function readPrices() {
  const tokens = await fetch(`${ONECLICK}/tokens`, { headers }).then((r) => r.json());
  const rows = await Promise.all(
    HERESIES.map(async (h) => {
      const assetId = `nep141:${h.mainnet}`;
      const listed = tokens.find((t) => t.assetId === assetId)?.price || null;
      if (!listed) return { symbol: h.symbol, token: h.mainnet, price: null, source: "not listed" };
      const whole = 100 / listed;
      const [i, f = ""] = whole.toFixed(Math.min(h.decimals, 12)).split(".");
      const raw = BigInt(i + (f + "0".repeat(h.decimals)).slice(0, h.decimals));
      const out = await dryQuoteUsd(assetId, raw).catch(() => null);
      if (out === null) return { symbol: h.symbol, token: h.mainnet, price: listed, source: "list price (no quote)" };
      const quoted = out / whole;
      const apart = Math.abs(quoted - listed) / listed;
      if (apart > DIVERGENCE) {
        return { symbol: h.symbol, token: h.mainnet, price: Math.min(quoted, listed), source: `quote and list ${(apart * 100).toFixed(1)}% apart, lower used` };
      }
      return { symbol: h.symbol, token: h.mainnet, price: quoted, source: "dry quote" };
    }),
  );
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

async function once(opts) {
  const rows = await readPrices();
  const priced = rows.filter((r) => r.price);
  for (const r of rows) console.log(`${r.symbol.padEnd(12)} ${r.price ? "$" + r.price.toPrecision(6) : "no price".padEnd(9)}  ${r.source}`);
  if (priced.length < rows.length) console.error("Some memecoins have no price. Feedings will stop once theirs is 15 minutes old.");
  const prices = priced.map((r) => [r.token, e18(r.price)]);
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
  await once(opts).catch((e) => console.error(`${new Date().toISOString()} ${e.message}`));
  if (every) await new Promise((r) => setTimeout(r, every * 1000));
} while (every);
