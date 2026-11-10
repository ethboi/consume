// Runs the browser tests. From web/:
//
//   node e2e/run.mjs                 sample, then chain
//   node e2e/run.mjs sample          the site as it builds with no contract: sample figures
//   node e2e/run.mjs chain           a NEAR sandbox, the real contract, the site and a test wallet
//   node e2e/run.mjs live            read-only checks of a deployed site (E2E_BASE_URL, default https://consume.cash)
//
// Anything after `--` goes to Playwright, e.g. `node e2e/run.mjs chain -- --headed`.
// `--hold` with one of the first two runs no tests: it keeps everything up
// (for chain: the sandbox, the harness and the site) and prints the addresses,
// for writing new tests.
//
// Each of the first two builds the site itself, with every NEXT_PUBLIC_ value
// set here, so a local .env.local changes nothing. Neither of them touches a
// real network's contract, holds a real key or deploys anything. `chain` needs
// the contracts built first (see e2e/README.md).

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { startHarness } from "./harness.mjs";
import { launchArgs } from "../../scripts/launch-args.mjs";
import { HERESIES } from "../src/lib/heresies.ts";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const repo = join(web, "..");
const require = createRequire(import.meta.url);
const bin = (pkg, file) => join(dirname(require.resolve(`${pkg}/package.json`)), file);
const NEXT = bin("next", "dist/bin/next");
const PLAYWRIGHT = bin("@playwright/test", "cli.js");

const split = process.argv.indexOf("--");
const own = split < 0 ? process.argv.slice(2) : process.argv.slice(2, split);
const modes = own.filter((a) => !a.startsWith("-"));
const hold = own.includes("--hold");
const extra = split < 0 ? [] : process.argv.slice(split + 1);
const wanted = modes.length ? modes : ["sample", "chain"];
for (const m of wanted) if (!["sample", "chain", "live"].includes(m)) throw new Error(`Unknown mode "${m}": sample, chain or live`);

// every value the site reads at build time, so nothing is taken from a local .env file
const NO_CONTRACT = {
  NEXT_PUBLIC_NETWORK: "testnet",
  NEXT_PUBLIC_CONSUME_CONTRACT: "",
  NEXT_PUBLIC_MEME_PARENT: "",
  NEXT_PUBLIC_INTENTS_CONTRACT: "",
  NEXT_PUBLIC_RPC_URL: "",
  NEXT_PUBLIC_REPO_URL: "",
  CONSUME_INDEXER_URL: "",
};

const children = new Set();

// Ctrl-C (or a kill) stops whatever is running, and then every `finally` below
// shuts its server down in order. The sandbox is never killed outright: the
// stage is asked to close it.
let interrupted = false;
let release;
const stopped = new Promise((r) => (release = r));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interrupted = true;
    release();
    for (const child of children) if (!child.keepsSandbox) child.kill("SIGTERM");
  });
}

/** Run a command to its end; resolves to its exit code. */
function run(cmd, args, { cwd = web, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit" });
    children.add(child);
    child.on("error", reject);
    child.on("exit", (code) => {
      children.delete(child);
      resolve(code ?? 1);
    });
  });
}

async function build(env) {
  if ((await run(process.execPath, ["scripts/embed-fonts.mjs"])) !== 0) throw new Error("Could not embed the card fonts");
  if ((await run(process.execPath, [NEXT, "build"], { env })) !== 0) throw new Error("The site did not build");
}

/** `next start` on a port, resolved once it answers. */
async function serve(port, env) {
  const child = spawn(process.execPath, [NEXT, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: web,
    env: { ...process.env, ...env },
    stdio: ["ignore", "ignore", "inherit"],
  });
  children.add(child);
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`The site stopped (port ${port} taken?)`);
    if (await fetch(url).then((r) => r.ok, () => false)) return { url, stop: () => stop(child) };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("The site did not start");
}

function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.on("exit", resolve);
    child.kill("SIGTERM");
  });
}

const playwright = (project, env) => run(process.execPath, [PLAYWRIGHT, "test", "--config", "e2e/playwright.config.ts", "--project", project, ...extra], { env });

// ------------------------------------------------------------------ sample

async function sample() {
  await build(NO_CONTRACT);
  const site = await serve(3041, NO_CONTRACT);
  try {
    if (hold) {
      console.log(`HOLDING ${JSON.stringify({ E2E_BASE_URL: site.url })}`);
      await stopped;
      return 0;
    }
    return await playwright("sample", { E2E_BASE_URL: site.url });
  } finally {
    await site.stop();
  }
}

// ------------------------------------------------------------------- chain

const MINUTE_NS = 60n * 1_000_000_000n;

/** What the stage launches: the real launch arguments, with two numbers changed so a test can watch a Bond pay out. */
function plan() {
  const launch = launchArgs({ guardian: "owner.test.near", assayer: "owner.test.near", intents: "intents.test.near" });
  // a Bond pays out over thirty minutes here, not thirty days, so a few seconds release something to collect
  launch.config.vest_duration_ns = (30n * MINUTE_NS).toString();
  // no Assayer runs on the stage: the prices posted once at launch stay good for the whole run
  launch.config.max_price_age_ns = (24n * 60n * MINUTE_NS).toString();
  return {
    launch,
    // one test deposit of each memecoin is about $100, as on the live testnet stand-in
    drips: HERESIES.map((h) => [`nep141:${h.mainnet}`, (BigInt(h.faucetWhole) * 10n ** BigInt(h.decimals)).toString()]),
    prices: HERESIES.map((h) => [h.mainnet, (100n * 10n ** 18n / BigInt(h.faucetWhole)).toString()]),
  };
}

/** The sandbox with everything launched on it. Resolves once the stage says it is ready. */
function stage(planPath) {
  const child = spawn("cargo", ["run", "--quiet", "--example", "stage", "--", planPath], {
    cwd: join(repo, "contracts", "integration-tests"),
    stdio: ["pipe", "pipe", "inherit"],
    // its own process group, so a Ctrl-C in the terminal reaches it only through close() below
    detached: true,
  });
  child.keepsSandbox = true;
  children.add(child);
  const ready = new Promise((resolve, reject) => {
    createInterface({ input: child.stdout }).on("line", (line) => {
      if (line.startsWith("READY ")) resolve(JSON.parse(line.slice(6)));
      else console.log(line);
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`The stage stopped with code ${code}. Are the contracts built?`)));
  });
  // closing its input asks it to shut the sandbox down and leave
  const close = () =>
    new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.on("exit", resolve);
      child.stdin.end();
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    });
  return { ready, close };
}

async function chain() {
  mkdirSync(join(here, ".run"), { recursive: true });
  const planPath = join(here, ".run", "plan.json");
  writeFileSync(planPath, JSON.stringify(plan(), null, 2));

  const sandbox = stage(planPath);
  let harness, site;
  try {
    const on = await sandbox.ready;
    harness = await startHarness({ rpcUrl: on.rpc, control: on.control });
    const env = {
      ...NO_CONTRACT,
      NEXT_PUBLIC_CONSUME_CONTRACT: on.consume,
      NEXT_PUBLIC_INTENTS_CONTRACT: on.intents,
      NEXT_PUBLIC_RPC_URL: on.rpc,
      CONSUME_INDEXER_URL: harness.url,
    };
    await build(env);
    site = await serve(3042, env);
    const addresses = {
      E2E_BASE_URL: site.url,
      E2E_RPC_URL: on.rpc,
      E2E_HARNESS_URL: harness.url,
      E2E_CONSUME: on.consume,
      E2E_INTENTS: on.intents,
    };
    if (hold) {
      console.log(`HOLDING ${JSON.stringify(addresses)}`);
      await stopped;
      return 0;
    }
    return await playwright("chain", addresses);
  } finally {
    await site?.stop();
    await harness?.close();
    await sandbox.close();
  }
}

// -------------------------------------------------------------------- live

const live = () => playwright("live", { E2E_BASE_URL: process.env.E2E_BASE_URL || "https://consume.cash" });

// -------------------------------------------------------------------------

let failed = 0;
for (const mode of wanted) {
  if (interrupted) break;
  console.log(`\n=== ${mode} ===`);
  failed += (await { sample, chain, live }[mode]()) === 0 ? 0 : 1;
}
process.exit(failed || interrupted ? 1 : 0);
