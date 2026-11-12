import { test } from "node:test";
import assert from "node:assert/strict";
import { base58, encodeTransaction, loadKey, newKey, signTransaction } from "./signing.ts";
import { GUEST_NAME, GUEST_PREFIX, IN_TOTAL, PER_VISITOR, REGISTRAR, SPONSORED_YOCTO, WINDOW_MS, createCall, limiter, readSecretKey, validGuestName, validPublicKey } from "./sponsor.ts";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

test("the sponsor pays only for a name the guest wallet makes, with an ed25519 key", () => {
  assert.ok(validGuestName("consume-guest-ab12.testnet"));
  assert.ok(validGuestName(`${GUEST_PREFIX}0z9a.testnet`));
  for (const no of [
    "consume-guest-ab12.near",
    "consume-guest-ab12.testnet.evil.testnet",
    "x.consume-guest-ab12.testnet",
    "consume-guest-abc.testnet",
    "consume-guest-abcde.testnet",
    "consume-guest-AB12.testnet",
    "consumecash.testnet",
    "glutton.consumecash.testnet",
    "",
    null,
    42,
  ]) {
    assert.equal(validGuestName(no), false, String(no));
  }
  assert.equal(GUEST_NAME.source.startsWith(`^${GUEST_PREFIX}`), true);

  const key = `ed25519:${base58(Uint8Array.from({ length: 32 }, (_, i) => i + 1))}`;
  assert.ok(validPublicKey(key));
  for (const no of [
    `ed25519:${base58(new Uint8Array(31).fill(7))}`,
    `ed25519:${base58(new Uint8Array(33).fill(7))}`,
    `secp256k1:${base58(new Uint8Array(32).fill(7))}`,
    base58(new Uint8Array(32).fill(7)),
    "ed25519:0OIl",
    `ed25519:${"2".repeat(80)}`,
    "",
    null,
    {},
  ]) {
    assert.equal(validPublicKey(no), false, String(no));
  }
});

test("the one call the sponsor signs is create_account on testnet, with 1 NEAR", () => {
  const call = createCall("consume-guest-ab12.testnet", "ed25519:abc");
  assert.deepEqual(call, {
    methodName: "create_account",
    args: { new_account_id: "consume-guest-ab12.testnet", new_public_key: "ed25519:abc" },
    gas: "30000000000000",
    deposit: "1000000000000000000000000",
  });
  assert.equal(REGISTRAR, "testnet");
  assert.equal(BigInt(SPONSORED_YOCTO), BigInt(10) ** BigInt(24));
  // and it is written into a transaction like any other call
  const bytes = encodeTransaction({
    signerId: "sponsor.testnet",
    publicKey: new Uint8Array(32),
    nonce: BigInt(1),
    receiverId: REGISTRAR,
    blockHash: new Uint8Array(32),
    actions: [call],
  });
  assert.ok(Buffer.from(bytes).includes(Buffer.from('{"new_account_id":"consume-guest-ab12.testnet","new_public_key":"ed25519:abc"}')));
});

test("a NEAR secret key is read into the key WebCrypto signs with", async () => {
  // a key WebCrypto made, written the way NEAR writes a secret key: the seed, then the public key
  const made = await newKey();
  const seed = made.pkcs8.slice(made.pkcs8.length - 32);
  const secret = `ed25519:${base58(Uint8Array.from([...seed, ...made.publicKey]))}`;

  const read = readSecretKey(secret);
  assert.equal(hex(read.pkcs8), hex(made.pkcs8));
  assert.equal(hex(read.publicKey), hex(made.publicKey));

  // a transaction signed with it verifies under the public half
  const tx = {
    signerId: "sponsor.testnet",
    publicKey: read.publicKey,
    nonce: BigInt(7),
    receiverId: REGISTRAR,
    blockHash: new Uint8Array(32).fill(3),
    actions: [createCall("consume-guest-ab12.testnet", `ed25519:${base58(new Uint8Array(32).fill(9))}`)],
  };
  const { signed } = await signTransaction(tx, await loadKey(read.pkcs8));
  const body = encodeTransaction(tx);
  const signature = signed.slice(body.length + 1);
  const publicKey = await crypto.subtle.importKey("raw", read.publicKey, "Ed25519", false, ["verify"]);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body));
  assert.equal(await crypto.subtle.verify("Ed25519", publicKey, signature, digest), true);

  // anything else is refused, in words that do not repeat the key
  for (const bad of [secret.slice("ed25519:".length), `ed25519:${base58(seed)}`, `secp256k1:${base58(new Uint8Array(64))}`]) {
    assert.throws(
      () => readSecretKey(bad),
      (e: Error) => /sponsor's key/.test(e.message) && !e.message.includes(base58(seed)),
    );
  }
});

test("guests are counted for each visitor and in all, over an hour", () => {
  const limits = limiter();
  const t0 = 1_000_000;
  for (let i = 0; i < PER_VISITOR; i++) assert.equal(limits.take("a", t0 + i), null);
  assert.equal(limits.take("a", t0 + 10), "visitor");
  // another visitor is not held back by the first
  assert.equal(limits.take("b", t0 + 11), null);

  // in all
  for (let i = PER_VISITOR + 1; i < IN_TOTAL; i++) assert.equal(limits.take(`v${i}`, t0 + 20 + i), null);
  assert.equal(limits.take("new", t0 + 100), "total");
  // a refusal is not counted, and the hour passes
  assert.equal(limits.take("new", t0 + WINDOW_MS - 1), "total");
  assert.equal(limits.take("a", t0 + WINDOW_MS + 2), null);
  assert.equal(limits.take("new", t0 + WINDOW_MS + 3), null);

  const small = limiter({ perVisitor: 1, inTotal: 2, windowMs: 10 });
  assert.deepEqual([small.take("x", 0), small.take("x", 1), small.take("y", 2), small.take("z", 3), small.take("z", 11)], [null, "visitor", null, "total", null]);
});
