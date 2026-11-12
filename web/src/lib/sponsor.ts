// The guest wallet's second road. NEAR's public testnet faucet makes a guest's
// account (lib/guest.ts); when it will not, the site's own sponsor account
// does, from the server (app/api/guest/route.ts): one call to `create_account`
// on `testnet`, the contract that makes every `.testnet` name, with 1 test
// NEAR attached. The name and the key are the browser's, as on the first road,
// so the sponsor never holds a guest's key.
//
// This file is the part with no network in it: what the route will accept, how
// often, how the sponsor's key is read and the call it signs. It imports
// nothing but lib/signing.ts, so `node --test` runs it as it is.

import { unbase58, type FunctionCall } from "./signing.ts";

/** Every guest account starts with this, so a guest is plain to see on an explorer and in the Ledger. */
export const GUEST_PREFIX = "consume-guest-";

/** The only names the sponsor will pay for: the ones the site's own guest wallet makes. */
export const GUEST_NAME = /^consume-guest-[a-z0-9]{4}\.testnet$/;

/** The contract that makes `.testnet` accounts for anyone who attaches the NEAR. */
export const REGISTRAR = "testnet";

/** What a sponsored guest starts with: enough for several feedings (a first one needs about 0.2 NEAR). */
export const SPONSORED_YOCTO = "1000000000000000000000000";

/** In an hour, for each server instance: guests one visitor may ask for, and guests in all. The sponsor's balance is the hard limit. */
export const PER_VISITOR = 2;
export const IN_TOTAL = 20;
export const WINDOW_MS = 60 * 60_000;

/** "ed25519:" and 32 bytes in base58, and nothing else. */
export function validPublicKey(publicKey: unknown): publicKey is string {
  if (typeof publicKey !== "string" || publicKey.length > 60 || !publicKey.startsWith("ed25519:")) return false;
  try {
    return unbase58(publicKey.slice("ed25519:".length)).length === 32;
  } catch {
    return false;
  }
}

export function validGuestName(accountId: unknown): accountId is string {
  return typeof accountId === "string" && GUEST_NAME.test(accountId);
}

/** The one call the sponsor signs. */
export function createCall(accountId: string, publicKey: string): FunctionCall {
  return {
    methodName: "create_account",
    args: { new_account_id: accountId, new_public_key: publicKey },
    gas: "30000000000000",
    deposit: SPONSORED_YOCTO,
  };
}

// An Ed25519 private key in PKCS#8 is these sixteen bytes and then the 32-byte seed.
const PKCS8_HEAD = Uint8Array.of(0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20);

/**
 * A NEAR secret key ("ed25519:" and 64 bytes in base58: the seed, then the
 * public key) as WebCrypto loads it, with its public half.
 */
export function readSecretKey(secret: string): { pkcs8: Uint8Array<ArrayBuffer>; publicKey: Uint8Array<ArrayBuffer> } {
  if (!secret.startsWith("ed25519:")) throw new Error("The sponsor's key is not an ed25519 key");
  const bytes = unbase58(secret.slice("ed25519:".length));
  if (bytes.length !== 64) throw new Error("The sponsor's key is not 64 bytes");
  const pkcs8 = new Uint8Array(PKCS8_HEAD.length + 32);
  pkcs8.set(PKCS8_HEAD);
  pkcs8.set(bytes.subarray(0, 32), PKCS8_HEAD.length);
  return { pkcs8, publicKey: bytes.slice(32) };
}

/**
 * Counts guests asked for in the last hour. `take` answers null and counts the
 * request, or says why it is refused and counts nothing.
 */
export function limiter({ perVisitor = PER_VISITOR, inTotal = IN_TOTAL, windowMs = WINDOW_MS } = {}) {
  const taken: { visitor: string; at: number }[] = [];
  return {
    take(visitor: string, now: number): "visitor" | "total" | null {
      while (taken.length && taken[0].at <= now - windowMs) taken.shift();
      if (taken.length >= inTotal) return "total";
      if (taken.filter((t) => t.visitor === visitor).length >= perVisitor) return "visitor";
      taken.push({ visitor, at: now });
      return null;
    },
  };
}
