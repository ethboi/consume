import { test } from "node:test";
import assert from "node:assert/strict";
import { base58, encodeTransaction, from64, loadKey, newKey, signTransaction, to64, unbase58, type Unsigned } from "./signing.ts";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

test("base58 writes and reads bytes the way NEAR does", () => {
  assert.equal(base58(new TextEncoder().encode("Hello World!")), "2NEpo7TZRRrLZSi2U");
  // 32 zero bytes: the public key the test wallet shows
  assert.equal(base58(new Uint8Array(32)), "1".repeat(32));
  assert.equal(hex(unbase58("2NEpo7TZRRrLZSi2U")), hex(new TextEncoder().encode("Hello World!")));
  assert.equal(unbase58("1".repeat(32)).length, 32);
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 5) % 256);
  assert.equal(hex(unbase58(base58(bytes))), hex(bytes));
  assert.equal(hex(unbase58(base58(Uint8Array.of(0, 0, 7)))), "000007");
  assert.throws(() => unbase58("0OIl"), /Not base58/);
  assert.equal(hex(from64(to64(bytes))), hex(bytes));
});

const TX: Unsigned = {
  signerId: "a.testnet",
  publicKey: Uint8Array.from({ length: 32 }, (_, i) => i),
  nonce: BigInt(258),
  receiverId: "b.testnet",
  blockHash: new Uint8Array(32).fill(0xee),
  actions: [{ methodName: "go", args: { n: 1 }, gas: "30000000000000", deposit: "1" }],
};

test("a transaction is written field by field in borsh", () => {
  const expected = [
    "09000000" + hex(new TextEncoder().encode("a.testnet")), // signer: length, then the name
    "00" + hex(TX.publicKey), // key kind 0 is Ed25519
    "0201000000000000", // nonce 258, eight bytes, lowest first
    "09000000" + hex(new TextEncoder().encode("b.testnet")),
    "ee".repeat(32),
    "01000000", // one action
    "02", // action kind 2 is a function call
    "02000000" + hex(new TextEncoder().encode("go")),
    "07000000" + hex(new TextEncoder().encode('{"n":1}')),
    "00e057eb481b0000", // 30 Tgas
    "01" + "00".repeat(15), // one yoctoNEAR in sixteen bytes
  ].join("");
  assert.equal(hex(encodeTransaction(TX)), expected);
});

test("a number that does not fit its field is refused, not cut short", () => {
  assert.throws(() => encodeTransaction({ ...TX, nonce: BigInt(2) ** BigInt(64) }), /does not fit/);
  assert.throws(() => encodeTransaction({ ...TX, actions: [{ ...TX.actions[0], deposit: "-1" }] }), /does not fit/);
  assert.throws(() => encodeTransaction({ ...TX, publicKey: new Uint8Array(31) }), /32 bytes/);
});

test("a new key signs the hash of the transaction, and the kept half loads again", async () => {
  const made = await newKey();
  assert.equal(made.publicKey.length, 32);
  const key = await loadKey(from64(to64(made.pkcs8)));
  const tx = { ...TX, publicKey: made.publicKey };
  const { hash, signed } = await signTransaction(tx, key);

  const body = encodeTransaction(tx);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body));
  assert.equal(hash, base58(digest));
  // the signed form: the transaction, the signature's kind, then 64 bytes of signature
  assert.equal(signed.length, body.length + 1 + 64);
  assert.equal(hex(signed.slice(0, body.length)), hex(body));
  assert.equal(signed[body.length], 0);
  const publicKey = await crypto.subtle.importKey("raw", made.publicKey, "Ed25519", false, ["verify"]);
  assert.equal(await crypto.subtle.verify("Ed25519", publicKey, signed.slice(body.length + 1), digest), true);
});
