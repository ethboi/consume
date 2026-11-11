// The guest wallet: a testnet account made for a visitor who has no wallet.
// The browser makes the key (lib/signing.ts), NEAR's public testnet faucet
// makes and funds the account, and the key stays in this browser's storage.
// It signs the same calls a connected wallet would be asked to sign, and sends
// them to the same RPC. Testnet only: `guestOffered` is false anywhere else.

import { DEMO, NETWORK, accountExists, cleanError, rpc } from "./near";
import { base58, from64, loadKey, newKey, signTransaction, to64, unbase58, type FunctionCall } from "./signing";

/** NEAR's own helper for testnet: it makes the named account with the given key and some test NEAR. */
export const FAUCET_URL = "https://helper.nearprotocol.com/account";

export const guestOffered = NETWORK === "testnet" && !DEMO;

/** Every guest account starts with this, so a guest is plain to see on an explorer and in the Ledger. */
export const GUEST_PREFIX = "consume-guest-";

export type Guest = {
  accountId: string;
  /** "ed25519:" and the key in base58 */
  publicKey: string;
  /** the private half in PKCS#8, base64 */
  pkcs8: string;
};

const KEY = "consume.guest";
const FAUCET_TROUBLE = "The testnet faucet could not make an account just now. Try again in a moment, or connect a wallet.";

type Kept = Guest & { on: boolean };

function kept(): Kept | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    return v && typeof v.accountId === "string" && typeof v.publicKey === "string" && typeof v.pkcs8 === "string" ? (v as Kept) : null;
  } catch {
    return null;
  }
}

function keep(guest: Guest, on: boolean) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ accountId: guest.accountId, publicKey: guest.publicKey, pkcs8: guest.pkcs8, on }));
  } catch {
    // storage is off (a private window): the guest lasts as long as the page
  }
}

/** The guest this browser was using when the page was last open, if it had not left. */
export function activeGuest(): Guest | null {
  const k = kept();
  return guestOffered && k?.on ? k : null;
}

/** Stop using the guest. Its key stays, so "Try as a guest" brings the same account back. */
export function leaveGuest() {
  const k = kept();
  if (k) keep(k, false);
}

/** The key's nonce and the block it was read at, or null when the chain has no such key. */
async function keyNow(guest: Guest, finality: "optimistic" | "final"): Promise<{ nonce: number; blockHash: string } | null> {
  const json = await rpc("query", { request_type: "view_access_key", finality, account_id: guest.accountId, public_key: guest.publicKey });
  if (typeof json.result?.nonce === "number") return { nonce: json.result.nonce, blockHash: json.result.block_hash };
  const said = JSON.stringify(json.error ?? json.result ?? "");
  if (/UNKNOWN_ACCESS_KEY|UNKNOWN_ACCOUNT|does not exist/.test(said)) return null;
  throw new Error("Could not reach NEAR just now. Try again in a moment.");
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The guest account for this browser: the one it already has, or a new one from the faucet. */
export async function makeGuest(): Promise<Guest> {
  if (!guestOffered) throw new Error("The guest wallet is for testnet only.");
  const before = kept();
  if (before && (await keyNow(before, "optimistic"))) {
    keep(before, true);
    return before;
  }

  const key = await newKey();
  // four letters keep the whole name short enough to be shown in full; a name already taken is passed over
  let accountId = "";
  for (let i = 0; i < 6 && !accountId; i++) {
    const name = `${GUEST_PREFIX}${[...crypto.getRandomValues(new Uint8Array(4))].map((b) => (b % 36).toString(36)).join("")}.testnet`;
    if (!(await accountExists(name))) accountId = name;
  }
  if (!accountId) throw new Error(FAUCET_TROUBLE);
  const guest: Guest = { accountId, publicKey: `ed25519:${base58(key.publicKey)}`, pkcs8: to64(key.pkcs8) };
  const res = await fetch(FAUCET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: guest.accountId, newAccountPublicKey: guest.publicKey }),
    signal: AbortSignal.timeout(40_000),
  }).catch(() => null);
  if (!res?.ok) throw new Error(FAUCET_TROUBLE);

  // the faucet answers once its transaction is sent: wait until the chain shows the account's key
  for (let i = 0; i < 25; i++) {
    if (await keyNow(guest, "optimistic").catch(() => null)) {
      keep(guest, true);
      return guest;
    }
    await pause(800);
  }
  throw new Error(FAUCET_TROUBLE);
}

// ---------- sending ----------

export type GuestTransaction = { receiverId: string; actions: FunctionCall[] };

/** The last nonce each guest used on this page, so two transactions in a row never share one. */
const used = new Map<string, number>();

const finished = (r: unknown): boolean => {
  const status = (r as { status?: unknown } | null)?.status;
  return !!status && typeof status === "object" && ("SuccessValue" in status || "Failure" in status);
};

/** A refusal before anything ran, as a line a person can read. */
function refusal(error: unknown): string {
  const raw = JSON.stringify(error);
  const said = cleanError(raw);
  return said === raw ? "NEAR refused the transaction, so nothing changed." : said;
}

async function sendOne(guest: Guest, key: CryptoKey, t: GuestTransaction, again = true): Promise<unknown> {
  // the nonce as the newest block has it; the block hash from one that is final, so it cannot be dropped
  const [newest, final] = await Promise.all([keyNow(guest, "optimistic"), keyNow(guest, "final")]);
  const at = final ?? newest;
  if (!newest || !at) throw new Error("This guest wallet is no longer on testnet. Leave it and try as a guest again.");
  const nonce = Math.max(newest.nonce, used.get(guest.accountId) ?? 0) + 1;
  used.set(guest.accountId, nonce);
  const { hash, signed } = await signTransaction(
    {
      signerId: guest.accountId,
      publicKey: unbase58(guest.publicKey.slice("ed25519:".length)),
      nonce: BigInt(nonce),
      receiverId: t.receiverId,
      blockHash: unbase58(at.blockHash),
      actions: t.actions,
    },
    key,
  );

  // Sent and waited on to its end. Sending the same signed bytes twice is safe: they can only run once.
  const sent = await rpc("broadcast_tx_commit", [to64(signed)], { each: 30_000, all: 45_000 }).catch(() => null);
  if (finished(sent?.result)) return sent.result;
  if (sent?.error && sent.error.cause?.name !== "TIMEOUT_ERROR") {
    if (again && /InvalidNonce/.test(JSON.stringify(sent.error))) return sendOne(guest, key, t, false);
    throw new Error(refusal(sent.error.data ?? sent.error));
  }
  // the node stopped waiting, or could not be reached: the transaction may still be on its way, so ask after it
  for (let i = 0; i < 20; i++) {
    await pause(1_500);
    const asked = await rpc("tx", [hash, guest.accountId], { each: 15_000, all: 20_000 }).catch(() => null);
    if (finished(asked?.result)) return asked.result;
  }
  throw new Error("Could not reach NEAR just now. Try again in a moment.");
}

/**
 * Sign and send as the guest, one transaction after another. Resolves to each
 * finished transaction as the RPC tells it, which is what a wallet hands back.
 */
export async function guestSend(guest: Guest, transactions: GuestTransaction[]): Promise<unknown[]> {
  const key = await loadKey(from64(guest.pkcs8));
  const out: unknown[] = [];
  for (const t of transactions) out.push(await sendOne(guest, key, t));
  return out;
}
