// What a wallet does, in as little as the guest wallet needs (lib/guest.ts):
// make an Ed25519 key in the browser, write a NEAR transaction of function
// calls in the chain's own binary form (borsh), and sign it. No library is
// used: the key and the signature come from the browser's WebCrypto, and the
// sandbox tests prove the bytes, since a node accepts a signature only over
// exactly the transaction it reads back.
//
// Nothing here reaches the network or imports anything, so `node --test`
// runs it as it is.

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Bytes as NEAR writes keys and hashes. */
export function base58(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] * 256;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    out += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

export function unbase58(text: string): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  for (const ch of text) {
    let carry = ALPHABET.indexOf(ch);
    if (carry < 0) throw new Error("Not base58");
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry % 256;
      carry = Math.floor(carry / 256);
    }
    while (carry > 0) {
      bytes.push(carry % 256);
      carry = Math.floor(carry / 256);
    }
  }
  for (const ch of text) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

export function to64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function from64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function join(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A whole number in `size` bytes, lowest byte first. */
function le(value: bigint, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let v = value;
  for (let i = 0; i < size; i++) {
    out[i] = Number(v % BigInt(256));
    v = v / BigInt(256);
  }
  if (value < BigInt(0) || v !== BigInt(0)) throw new Error(`${value} does not fit in ${size} bytes`);
  return out;
}

/** A string, or any run of bytes, with its length in front. */
const run = (bytes: Uint8Array) => [le(BigInt(bytes.length), 4), bytes];
const text = (s: string) => run(new TextEncoder().encode(s));

export type FunctionCall = {
  methodName: string;
  args: object;
  /** gas units */
  gas: string;
  /** yoctoNEAR */
  deposit: string;
};

export type Unsigned = {
  signerId: string;
  /** the signer's Ed25519 public key, 32 bytes */
  publicKey: Uint8Array;
  nonce: bigint;
  receiverId: string;
  /** a recent block's hash, 32 bytes */
  blockHash: Uint8Array;
  actions: FunctionCall[];
};

const ED25519 = Uint8Array.of(0);
const FUNCTION_CALL = Uint8Array.of(2);

/** The transaction in borsh, as the chain hashes it. */
export function encodeTransaction(tx: Unsigned): Uint8Array<ArrayBuffer> {
  if (tx.publicKey.length !== 32) throw new Error("An Ed25519 public key is 32 bytes");
  if (tx.blockHash.length !== 32) throw new Error("A block hash is 32 bytes");
  const parts: Uint8Array[] = [...text(tx.signerId), ED25519, tx.publicKey, le(tx.nonce, 8), ...text(tx.receiverId), tx.blockHash, le(BigInt(tx.actions.length), 4)];
  for (const a of tx.actions) {
    parts.push(FUNCTION_CALL, ...text(a.methodName), ...run(new TextEncoder().encode(JSON.stringify(a.args))), le(BigInt(a.gas), 8), le(BigInt(a.deposit), 16));
  }
  return join(parts);
}

/** The signed transaction, ready for the RPC, and the hash the chain will know it by. */
export async function signTransaction(tx: Unsigned, key: CryptoKey): Promise<{ hash: string; signed: Uint8Array }> {
  const body = encodeTransaction(tx);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body));
  const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", key, digest));
  return { hash: base58(digest), signed: join([body, ED25519, signature]) };
}

/** A new key made by the browser. The private half comes back in PKCS#8 so it can be kept and loaded again. */
export async function newKey(): Promise<{ publicKey: Uint8Array<ArrayBuffer>; pkcs8: Uint8Array<ArrayBuffer> }> {
  const pair = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
  return {
    publicKey: new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
    pkcs8: new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
  };
}

export const loadKey = (pkcs8: Uint8Array<ArrayBuffer>): Promise<CryptoKey> => crypto.subtle.importKey("pkcs8", pkcs8, "Ed25519", false, ["sign"]);
