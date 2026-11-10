// Launches CONSUME on testnet with the NEAR Intents stand-in.
//
//   node scripts/testnet-launch.mjs --payer you.testnet --site https://your-site.example
//
// prints every command and sends nothing. Add --send to run them in order
// with the `near` CLI, signing with the payer's key from your local keychain.
// It stops at the first command that fails.
//
// What it does:
//   1. creates intents.<payer> and deploys contracts/mock-intents to it
//   2. sets the simulated deposit size for each of the ten memecoins
//   3. creates consume.<payer>, deploys CONSUME and launches it (`new`)
//   4. posts the first prices as the Assayer
//
// The payer is the guardian and the Assayer unless --guardian / --assayer say
// otherwise. --no-guardian launches with no guardian at all: nobody could then
// replace a broken Assayer, so prefer launching with one and renouncing later
// (the command is printed at the end). --prefix changes the sub-account names (consume2, intents2, ...),
// which you need for a second launch because the first can never be changed.
// Build the wasm files first (see the README).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HERESIES } from "../web/src/lib/heresies.ts";
import { flags, launchArgs } from "./launch-args.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const opts = flags();
if (!opts.payer) {
  console.error("--payer <account.testnet> is required: it pays for the two new accounts (about 12 NEAR).");
  process.exit(1);
}
const suffix = opts.prefix === undefined ? "" : String(opts.prefix);
const consume = `consume${suffix}.${opts.payer}`;
const intents = `intents${suffix}.${opts.payer}`;
const guardian = opts.noGuardian ? null : (opts.guardian ?? opts.payer);
const assayer = opts.assayer ?? opts.payer;
const site = typeof opts.site === "string" ? opts.site.replace(/\/$/, "") : null;
const NET = ["network-config", "testnet", "sign-with-legacy-keychain", "send"];
const wasm = (name) => join(root, "contracts/target/near", name, `${name}.wasm`);

const create = (account, near) => ["account", "create-account", "fund-myself", account, `${near} NEAR`, "autogenerate-new-keypair", "save-to-legacy-keychain", "sign-as", opts.payer, ...NET];
const deploy = (account, file, args) => ["contract", "deploy", account, "use-file", file, "with-init-call", "new", "json-args", JSON.stringify(args), "prepaid-gas", "100.0 Tgas", "attached-deposit", "0 NEAR", ...NET];
const call = (account, method, args, signer) => ["contract", "call-function", "as-transaction", account, method, "json-args", JSON.stringify(args), "prepaid-gas", "30.0 Tgas", "attached-deposit", "0 NEAR", "sign-as", signer, ...NET];

const steps = [
  ["Create the Intents stand-in account", create(intents, 3)],
  ["Deploy the Intents stand-in", deploy(intents, wasm("mock_intents"), { owner_id: opts.payer })],
  ...HERESIES.map((h) => [
    `Simulated deposits of ${h.symbol} credit ${h.faucetWhole}`,
    call(intents, "set_drip", { token_id: `nep141:${h.mainnet}`, amount: (BigInt(h.faucetWhole) * 10n ** BigInt(h.decimals)).toString() }, opts.payer),
  ]),
  ["Create the CONSUME account", create(consume, 8)],
  [
    "Deploy CONSUME and launch it. These numbers are final.",
    deploy(consume, wasm("consume"), launchArgs({ guardian, assayer, intents, mediaBase: site ? `${site}/bond/square` : null })),
  ],
];

const quote = (a) => (/^[\w./:=-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`);
for (const name of ["consume", "mock_intents"]) {
  if (!existsSync(wasm(name))) {
    console.error(`Missing ${wasm(name)}. Build the wasm files first.`);
    process.exit(1);
  }
}
if (!site) console.error("No --site given: Bonds will have no image in wallets, and that cannot be added later.\n");

for (const [what, argv] of steps) {
  console.log(`# ${what}\nnear ${argv.map(quote).join(" ")}\n`);
  if (opts.send) execFileSync("near", argv, { stdio: "inherit" });
}

const assayerCmd = `node scripts/assayer.mjs --contract ${consume} --as ${assayer} --send`;
console.log(`# Post the first prices, then keep them fresh (every five minutes)\n${assayerCmd}\n${assayerCmd} --every 300\n`);
if (opts.send) execFileSync("node", [join(root, "scripts/assayer.mjs"), "--contract", consume, "--as", assayer, "--send"], { stdio: "inherit" });

console.log(`# web/.env.local
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_CONSUME_CONTRACT=${consume}
NEXT_PUBLIC_INTENTS_CONTRACT=${intents}`);
if (guardian) {
  console.log(`\n# To give up the guardian role for good (cannot be undone; not run by this script)\nnear ${call(consume, "set_guardian", { guardian_id: null }, guardian).map(quote).join(" ")}`);
}
if (!opts.send) console.log("\nNothing was sent. Run again with --send to do it.");
