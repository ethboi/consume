
import { test } from "node:test";
import assert from "node:assert/strict";
import { account, allAccountBonds, LIVE_TESTNET, planRedeem } from "./mcp.ts";
import { boundedBody } from "./request-body.ts";

const bond = (i: number) => ({
  token_id: String(i + 1), owner_id: "alice.testnet", claimable: i < 50 ? "0" : "1000000000000000000",
  locked: "0", exit_payout: "0",
  vest: { tribe: "pepe.testnet", eaten: "1", meal_usd: "1", total: "1000000000000000000",
    released: i < 50 ? "1000000000000000000" : "0", start_ns: "0", duration_ns: "1", exited: i < 50, bonus: false },
});
const result = (value: unknown) => Response.json({ result: { result: [...new TextEncoder().encode(JSON.stringify(value))] } });

for (const count of [0, 49, 50, 51, 101]) {
  test(`account enumerates all ${count} Bonds at one finalized block`, async (t) => {
    const pages: number[] = [];
    t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
      const { params } = JSON.parse(String(init.body));
      if (params.request_type === "view_account") return Response.json({ result: { amount: "0", block_hash: "fixed-block" } });
      const args = JSON.parse(atob(params.args_base64));
      switch (params.method_name) {
        case "get_tribes": return result([]);
        case "get_vests_for_owner":
          assert.equal(params.block_id, "fixed-block");
          assert.equal(params.finality, undefined);
          pages.push(args.from_index);
          return result(Array.from({ length: count }, (_, i) => bond(i)).slice(args.from_index, args.from_index + args.limit));
        case "get_owed": return result([]);
        default: return result("0");
      }
    });
    const got = await account(LIVE_TESTNET, { account_id: "alice.testnet" });
    assert.equal(got.bonds.length, count);
    assert.equal(new Set(got.bonds.map((b) => b.bond_id)).size, count);
    assert.deepEqual(pages, Array.from({ length: Math.floor(count / 50) + 1 }, (_, i) => i * 50));
    if (count > 50) assert.equal(got.bonds[50].consume_ready_to_collect, "1");
  });
}

test("a repeated RPC page is rejected instead of looping", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const { params } = JSON.parse(String(init.body));
    return params.request_type === "view_account"
      ? Response.json({ result: { block_hash: "fixed-block" } })
      : result(Array.from({ length: 50 }, (_, i) => bond(i)));
  });
  await assert.rejects(allAccountBonds(LIVE_TESTNET, "alice.testnet"), /repeated Bond page/);
});

for (const credit of ["0", "100000000000000000000000"]) {
  test(`redemption prepares storage only when needed (credit ${credit})`, async (t) => {
    t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
      const { params } = JSON.parse(String(init.body));
      switch (params.method_name) {
        case "get_tribes": return result([["pepe.testnet", { symbol: "PEPE", decimals: 18, price_e18: "1000000000000000000" }]]);
        case "quote_redeem": return result({ shares: [["pepe.testnet", "1000000000000000000"]], denominator: "1000000000000000000" });
        case "get_meal_credit": return result(credit);
        default: return result("1000000000000000000");
      }
    });
    const { plan } = await planRedeem({ ...LIVE_TESTNET, consume: `redemption-${credit}.testnet` }, { account_id: "alice.testnet", amount: "1" });
    assert.deepEqual(plan.calls.map((c) => c.method), credit === "0" ? ["add_meal_credit", "redeem"] : ["redeem"]);
    assert.ok(plan.calls.reduce((sum, c) => sum + c.gas_tgas, 0) <= 300);
    assert.equal(plan.calls.at(-1)?.deposit_yocto, "1");
  });
}

test("body limit counts UTF-8 bytes rather than characters", async () => {
  await assert.rejects(boundedBody(new Request("https://local.test", { method: "POST", body: "💰💰" }), 7), RangeError);
  assert.equal(await boundedBody(new Request("https://local.test", { method: "POST", body: "💰💰" }), 8), "💰💰");
});

test("oversized chunked bodies are cancelled before reading the rest", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(1024)); },
    cancel() { cancelled = true; },
  });
  const request = new Request("https://local.test", { method: "POST", body, duplex: "half" } as RequestInit);
  await assert.rejects(boundedBody(request, 1024), RangeError);
  assert.equal(cancelled, true);
});
