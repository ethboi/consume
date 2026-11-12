// POST /api/guest : the guest wallet's second road (see src/lib/sponsor.ts).
// The page asks here only after NEAR's public testnet faucet would not make
// its guest account. The body is the account's name and the public key the
// browser made: { accountId, publicKey }. The site's sponsor account then
// calls `create_account` on `testnet` with 1 test NEAR attached.
//
// The sponsor is named by CONSUME_GUEST_SPONSOR_ID and signs with the key in
// CONSUME_GUEST_SPONSOR_KEY. Both are set on the server only and neither is in
// the repository. With either one missing this answers 503 and the guest
// wallet has the faucet alone, as before. Testnet only.

import { DEMO, NETWORK, accountExists, rpc } from "@/lib/near";
import { boundedBody } from "@/lib/request-body";
import { base58, loadKey, signTransaction, to64, unbase58 } from "@/lib/signing";
import { REGISTRAR, createCall, limiter, readSecretKey, validGuestName, validPublicKey } from "@/lib/sponsor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = 1024;
const limits = limiter();

const answer = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function sponsor(): { id: string; key: string } | null {
  const id = process.env.CONSUME_GUEST_SPONSOR_ID?.trim();
  const key = process.env.CONSUME_GUEST_SPONSOR_KEY?.trim();
  return id && key ? { id, key } : null;
}

/** Whether the chain shows this key on this account yet. */
async function holdsKey(accountId: string, publicKey: string): Promise<boolean> {
  const json = await rpc("query", { request_type: "view_access_key", finality: "optimistic", account_id: accountId, public_key: publicKey });
  return typeof json.result?.nonce === "number";
}

// One sponsor key, so one transaction at a time: two at once would share a nonce and one would be refused.
let line: Promise<unknown> = Promise.resolve();
let lastNonce = 0;
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const mine = line.then(job, job);
  line = mine.catch(() => undefined);
  return mine;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sign and send the one call, and wait until the chain shows the new account's key. Resolves to the transaction's hash. */
async function create(by: { id: string; key: string }, accountId: string, publicKey: string): Promise<string> {
  const secret = readSecretKey(by.key);
  const signerKey = `ed25519:${base58(secret.publicKey)}`;
  const at = await rpc("query", { request_type: "view_access_key", finality: "final", account_id: by.id, public_key: signerKey });
  if (typeof at.result?.nonce !== "number") throw new Error("The sponsor's key is not on its account");
  const nonce = Math.max(at.result.nonce, lastNonce) + 1;
  lastNonce = nonce;
  const { hash, signed } = await signTransaction(
    {
      signerId: by.id,
      publicKey: secret.publicKey,
      nonce: BigInt(nonce),
      receiverId: REGISTRAR,
      blockHash: unbase58(at.result.block_hash),
      actions: [createCall(accountId, publicKey)],
    },
    await loadKey(secret.pkcs8),
  );
  const sent = await rpc("broadcast_tx_commit", [to64(signed)], { each: 30_000, all: 35_000 }).catch(() => null);
  if (sent?.error && sent.error.cause?.name !== "TIMEOUT_ERROR") throw new Error("NEAR refused the sponsor's transaction");
  // the call can finish and still have made nothing (the name was taken meanwhile), so the account itself is the proof
  for (let i = 0; i < 12; i++) {
    if (await holdsKey(accountId, publicKey).catch(() => false)) return hash;
    await pause(800);
  }
  throw new Error("The account was not made");
}

export async function POST(request: Request) {
  if (NETWORK !== "testnet" || DEMO) return answer(404, { error: "The guest wallet is for testnet only." });
  let body: { accountId?: unknown; publicKey?: unknown };
  try {
    body = JSON.parse(await boundedBody(request, MAX_BODY));
  } catch {
    return answer(400, { error: "Send { accountId, publicKey } as JSON." });
  }
  const { accountId, publicKey } = body ?? {};
  if (!validGuestName(accountId)) return answer(400, { error: "Only a guest wallet's own name is made here." });
  if (!validPublicKey(publicKey)) return answer(400, { error: "The public key must be ed25519: and 32 bytes in base58." });

  const by = sponsor();
  if (!by) return answer(503, { error: "This site has no guest sponsor." });

  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const refused = limits.take(visitor, Date.now());
  if (refused) return answer(429, { error: refused === "visitor" ? "That is enough guest wallets for an hour." : "The sponsor has made enough guest wallets for this hour." });

  try {
    if (await accountExists(accountId)) return answer(409, { error: "That name is taken." });
    const transaction = await inTurn(() => create(by, accountId, publicKey));
    return answer(200, { accountId, transaction });
  } catch (e) {
    // never the key, and nothing a caller could learn the sponsor's state from beyond this line
    console.error("guest sponsor:", e instanceof Error ? e.message : String(e));
    return answer(502, { error: "The sponsor could not make the account just now." });
  }
}
