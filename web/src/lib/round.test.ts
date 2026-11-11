import { test } from "node:test";
import assert from "node:assert/strict";
import { e18, latestRound, parseRound, roundArgs, type RoundTx } from "./round.ts";

const CONSUME = "consume.example.testnet";
const FEEDER = "assayer.example.testnet";
const ROWS = [
  { symbol: "DOGE", token: "doge.omft.near", price: 0.068355828003, listed: 0.0685 },
  { symbol: "BLACKDRAGON", token: "blackdragon.tkn.near", price: 6.647905463e-9, listed: 6.7e-9 },
  { symbol: "BIG", token: "big.near", price: 123456.789, listed: 123000 },
];
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64");
const txOf = (args: unknown, over: Partial<RoundTx["transaction"]> = {}): RoundTx => ({
  transaction: { hash: "HASH", signer_id: FEEDER, receiver_id: CONSUME, actions: [{ FunctionCall: { method_name: "set_prices", args: b64(args) } }], ...over },
  execution_outcome: { block_timestamp: "1794431293891847189" },
});

test("a price is scaled by 1e18 without losing the digits of a very small one", () => {
  assert.equal(e18(0.068355828003), "68355828003000000");
  assert.equal(e18(6.647905463e-9), "6647905463");
  assert.equal(e18(1), "1000000000000000000");
  assert.equal(e18(123456.789), "123456789000000000000000");
});

test("a round's arguments carry each price and the quote it came from", () => {
  const args = roundArgs(ROWS, new Date("2026-11-11T21:10:01.090Z"));
  assert.deepEqual(args.prices, ROWS.map((r) => [r.token, e18(r.price)]));
  assert.equal(args.round.read_at, "2026-11-11T21:10:01.090Z");
  assert.deepEqual(args.round.quotes[1], { symbol: "BLACKDRAGON", token: "blackdragon.tkn.near", quoted_usd: "6.647905463e-9", listed_usd: "6.7e-9" });
  // the text of a quote gives back the very number that was posted
  for (const [i, q] of args.round.quotes.entries()) assert.equal(e18(Number(q.quoted_usd)), args.prices[i][1]);
});

test("a round read back says each posted price is the quote, and how far the quote is from the list price", () => {
  const round = parseRound(txOf(roundArgs(ROWS, new Date("2026-11-11T21:10:01.090Z"))), CONSUME)!;
  assert.equal(round.tx, "HASH");
  assert.equal(round.feeder, FEEDER);
  assert.equal(round.at, "2026-11-11T21:08:13.891Z");
  assert.equal(round.with_quotes, true);
  assert.equal(round.read_at, "2026-11-11T21:10:01.090Z");
  assert.equal(round.prices.length, 3);
  for (const p of round.prices) assert.equal(p.posted_is_the_quote, true);
  assert.deepEqual(round.prices[0], {
    token: "doge.omft.near",
    symbol: "DOGE",
    posted_e18: "68355828003000000",
    posted_usd: 0.068355828003,
    quoted_usd: 0.068355828003,
    listed_usd: 0.0685,
    posted_is_the_quote: true,
    quote_from_list_percent: -0.21,
  });
});

test("a posted price that is not the quote beside it is told apart", () => {
  const args = roundArgs(ROWS, new Date());
  args.prices[0][1] = "70000000000000000";
  const round = parseRound(txOf(args), CONSUME)!;
  assert.equal(round.prices[0].posted_is_the_quote, false);
  assert.equal(round.prices[1].posted_is_the_quote, true);
});

test("a round sent without quotes, or with some missing, is read as prices only", () => {
  const args = roundArgs(ROWS, new Date());
  const plain = parseRound(txOf({ prices: args.prices }), CONSUME)!;
  assert.equal(plain.with_quotes, false);
  assert.equal(plain.read_at, null);
  assert.deepEqual(plain.prices[0], {
    token: "doge.omft.near",
    symbol: null,
    posted_e18: "68355828003000000",
    posted_usd: 0.068355828003,
    quoted_usd: null,
    listed_usd: null,
    posted_is_the_quote: null,
    quote_from_list_percent: null,
  });
  const short = parseRound(txOf({ prices: args.prices, round: { ...args.round, quotes: args.round.quotes.slice(1) } }), CONSUME)!;
  assert.equal(short.with_quotes, false);
  const bad = parseRound(txOf({ prices: args.prices, round: { ...args.round, quotes: args.round.quotes.map((q) => ({ ...q, quoted_usd: "-1" })) } }), CONSUME)!;
  assert.equal(bad.with_quotes, false);
});

test("what is not a price round for this contract is not read as one", () => {
  const args = roundArgs(ROWS, new Date());
  assert.equal(parseRound(txOf(args, { receiver_id: "other.testnet" }), CONSUME), null);
  assert.equal(parseRound(txOf(args, { actions: [{ FunctionCall: { method_name: "set_tribe_open", args: b64(args) } }] }), CONSUME), null);
  assert.equal(parseRound(txOf(args, { actions: [{ FunctionCall: { method_name: "set_prices", args: "not base64 json" } }] }), CONSUME), null);
  assert.equal(parseRound(txOf({ prices: [["doge.omft.near", "1.5"]] }), CONSUME), null);
  assert.equal(parseRound(txOf({ prices: [] }), CONSUME), null);
  assert.equal(parseRound(txOf(args, { actions: undefined }), CONSUME), null);
});

test("the latest round is the newest set_prices the feeder itself signed", async (t) => {
  const args = roundArgs(ROWS, new Date());
  const asked: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    asked.push(body);
    if (url.endsWith("/v0/account")) {
      return Response.json({
        account_txs: [
          { transaction_hash: "FAILED", is_success: false },
          { transaction_hash: "OTHER", is_success: true },
          { transaction_hash: "SOMEONE", is_success: true },
          { transaction_hash: "NEWEST", is_success: true },
          { transaction_hash: "OLDER", is_success: true },
        ],
      });
    }
    assert.deepEqual(body.tx_hashes, ["OTHER", "SOMEONE", "NEWEST", "OLDER"]);
    // the indexer answers in its own order
    return Response.json({
      transactions: [
        txOf(args, { hash: "OLDER" }),
        txOf(args, { hash: "NEWEST" }),
        txOf(args, { hash: "SOMEONE", signer_id: "someone.testnet" }),
        txOf(args, { hash: "OTHER", actions: [{ Transfer: { deposit: "1" } }] }),
      ],
    });
  });
  const net = { network: "testnet" as const, consume: CONSUME };
  const round = await latestRound(net, FEEDER);
  assert.equal(round?.tx, "NEWEST");
  assert.deepEqual(asked[0], { account_id: FEEDER, desc: true, limit: 10, is_signer: true });
  // kept for half a minute: a second reader asks the indexer nothing
  await latestRound(net, FEEDER);
  assert.equal(asked.length, 2);

  // none of these was signed by this account, so it has no round
  assert.equal(await latestRound(net, "nobody.example.testnet"), null);
});
