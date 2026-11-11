
import { test } from "node:test";
import assert from "node:assert/strict";
import { readLedger } from "./ledger.ts";

for (const failLate of [false, true]) {
  test(`ledger cache eviction preserves results and bounds partial failures (fail=${failLate})`, async (t) => {
    const contract = `cache-${failLate}.testnet`;
    const holders = Array.from({ length: 21 }, (_, i) => `holder${i}.testnet`);
    let phase = 0;
    let batches = 0;
    const fetchedAgain: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (url.endsWith("/v0/account")) {
        const i = holders.indexOf(body.account_id);
        const hashes = i < 0 ? [] : phase === 1 ? ["h0-0"] : Array.from({ length: 200 }, (_, n) => `h${i}-${n}`);
        return Response.json({ account_txs: hashes.map((hash) => ({ transaction_hash: hash, is_success: true })) });
      }
      if (phase === 0 && ++batches === 210 && failLate) throw new Error("late indexer failure");
      if (phase === 1) fetchedAgain.push(...body.tx_hashes);
      return Response.json({ transactions: body.tx_hashes.map((hash: string) => ({
        transaction: { hash },
        receipts: [{ execution_outcome: { block_timestamp: "1000000", outcome: {
          executor_id: contract, status: { SuccessValue: "" }, logs: ["EVENT_JSON:" + JSON.stringify({
            standard: "consume", event: "meal", data: [{ eater: "holder0.testnet", vest_id: hash, tribe: "pepe.testnet", eaten: "1", meal_usd: "1", tithe_usd: "0", consume: "1" }],
          })],
        } } }],
      })) });
    });
    if (failLate) {
      await assert.rejects(readLedger({ network: "testnet", consume: contract }, holders), /late indexer failure/);
      phase = 1;
      await readLedger({ network: "testnet", consume: contract }, [holders[0]]);
      assert.ok(fetchedAgain.includes("h0-0"), "the oldest partial result must be evicted even after failure");
    } else {
      const ledger = await readLedger({ network: "testnet", consume: contract }, holders);
      assert.equal(ledger.entries.length, 4200, "bounded global cache must not truncate this request's result");
    }
  });
}


test("finishing discovered pages cannot prove history completeness after Bond transfers", async (t) => {
  const contract = "review-ledger.testnet";
  const searched: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url.endsWith("/v0/account")) {
      searched.push(body.account_id);
      // Bob's real claim exists, but he passed the Bond to Carol and is no
      // longer discoverable from the current holder list or the feeding.
      const hash = body.account_id === "bob.testnet" ? "claim-hash"
        : [contract, "alice.testnet"].includes(body.account_id) ? "feed-hash" : null;
      return Response.json({ account_txs: hash ? [{ transaction_hash: hash, is_success: true }] : [] });
    }
    return Response.json({ transactions: body.tx_hashes.map((hash: string) => ({
      transaction: { hash },
      receipts: [{ execution_outcome: {
        block_timestamp: "1000000",
        outcome: { executor_id: contract, status: { SuccessValue: "" }, logs: ["EVENT_JSON:" + JSON.stringify({
          standard: "consume", event: hash === "feed-hash" ? "meal" : "claim",
          data: hash === "feed-hash" ? [{ eater: "alice.testnet", vest_id: "1", tribe: "pepe.testnet", eaten: "10", meal_usd: "10", tithe_usd: "0", consume: "10" }]
            : [{ owner: "bob.testnet", vest_id: "1", amount: "5" }],
        })] },
      } }],
    })) });
  });
  const ledger = await readLedger({ network: "testnet", consume: contract }, ["carol.testnet"]);
  assert.deepEqual(ledger.entries.map((entry) => entry.kind), ["feed"]);
  assert.ok(!searched.includes("bob.testnet"));
  assert.equal(ledger.discovery_limits_reached, false);
  assert.equal(ledger.history_completeness, "unknown");
  assert.ok(!("complete" in ledger));
});
