# Browser tests

Three sets of tests drive the site in a real browser (Playwright, Chromium by default or installed Chrome). One command builds and starts what a set needs and shuts it down afterwards:

```bash
cd web
node e2e/run.mjs            # sample, then chain
node e2e/run.mjs sample     # 21 tests, about a minute
node e2e/run.mjs chain      # 35 tests, a few minutes
node e2e/run.mjs live       # 8 tests, read-only, against https://consume.cash
```

`pnpm e2e`, `pnpm e2e:sample`, `pnpm e2e:chain` and `pnpm e2e:live` are the same commands.

| Set | File | What runs | What it shows |
| --- | --- | --- | --- |
| sample | `sample.spec.ts` | The site built with no contract set, so it shows its sample figures. No chain. | Every section renders from its data and adds up, the quote follows the contract's rule, every button that would sign is off, the previews play and send nothing, the Bond pictures are served, nothing runs off the side of a phone, and `llms.txt` names the MCP server's 14 tools. |
| chain | `chain.spec.ts` | A local NEAR sandbox, the CONSUME contract as built from `contracts/`, the NEAR Intents stand-in, the site built against them, and a browser with a test wallet. | The whole product in one story: connect, bring test memecoins, feed, a refused signature, the Bond and its picture, a feeding over the limit, Collect all, Collect, Break the seal, Redeem, an agent feeding through the MCP server, the Ledger, recipient validation, a rejected transfer signature, an atomic transfer with storage top-up, collection by the recipient, refusal of the former holder, and sign out. |
| chain | `transfer.spec.ts` | Fresh Bonds on the same sandbox, each checked through the page and directly on chain. | Credit one yocto above, at and below the transfer reserve; first-time recipient registration and collection; credit, ownership and wallet changes after review; a wallet switch during preflight; rollback of a bundled top-up when execution fails; RPC failure and recovery; and 64-character recipients at 320px and 390px. |
| live | `live.spec.ts` | Nothing local. It reads a deployed site. | The public site is up and joined to a contract, the page agrees with what the contract reports, prices are fresh, a prepared feeding names only the contract and its Intents account, and the Ledger adds up. |

## First run

```bash
cd web && pnpm install
pnpm exec playwright install chromium        # or use the Chrome already installed: E2E_CHANNEL=chrome
```

The chain set also needs the two contracts built, with Rust, the `wasm32-unknown-unknown` target and cargo-near (see the main README):

```bash
(cd contracts/consume && cargo near build non-reproducible-wasm)
(cd contracts/mock-intents && cargo near build non-reproducible-wasm)
```

Its first run downloads a NEAR sandbox node, as the sandbox tests in `contracts/integration-tests` do.

## How the chain set works

1. `run.mjs` writes a plan: the arguments of the contract's one `new` call, built by `scripts/launch-args.mjs` from the same memecoin list the site reads.
2. `contracts/integration-tests/examples/stage.rs` starts a sandbox, deploys the stand-in and the contract, launches the contract with that plan, posts a price for each memecoin, and creates Alice, Bob, Charlie and an account with a 64-character address. Charlie starts without a $CONSUME registration.
3. `harness.mjs` starts a small local server (described below).
4. The site is built and started with the sandbox's address and the contract's account.
5. Playwright opens the site. The page is given a test wallet that announces itself the way a browser-extension wallet does, so it appears in the site's own wallet picker and every signature goes through the site's real wallet code.

Each step of the story is checked twice: what the page shows, and what the contract answers when the test asks it directly over the sandbox's RPC. The test also keeps the backing of each $CONSUME as an exact fraction after every change and fails if it ever falls.

## What is a stand-in, said plainly

- **The wallet.** No real wallet is used. The test wallet passes what it is asked to sign to the stage, which signs as a sandbox account. Those keys exist only inside the sandbox. What the tests prove is the site's side: which transactions it asks for, with which arguments, deposits and gas, and what it does with the result or a refusal.
- **RPC faults.** Two transfer tests intercept the recipient lookup to delay it or return an RPC error. All ownership, credit, registration and transaction-result assertions still read the real sandbox. The rollback test changes ownership after preflight and lets the contract reject the actual transaction.
- **NEAR Intents.** The sandbox runs `contracts/mock-intents`, the same stand-in the testnet deployment uses. The real Intents contract is not in these tests.
- **The Ledger's source.** On a public network the Ledger reads transactions from an indexer (FastNEAR). A sandbox has none, so `harness.mjs` answers in the indexer's shape with the sandbox's own transactions, read unchanged from its RPC. The Ledger code that turns them into entries, `src/lib/ledger.ts`, is the real one.
- **The builder's account.** The Ledger tells the builder's accounts by name: the account the contract sits under, and every account under it. On a sandbox every account sits under `test.near`, so the run names `alice.test.near` as the builder (`CONSUME_BUILDER_ACCOUNT`), and the Ledger has both kinds of entry to show.
- **Two launch numbers are changed.** A Bond pays out over 30 minutes here, not 30 days, so a few seconds release something to collect. Prices stay valid for 24 hours, not 15 minutes, because no Assayer runs on the stage. Every other launch argument is the real one.
- **The wallet list.** The wallet connector fetches a list of public wallets from GitHub. The sample and chain sets answer that request with an empty list and refuse every other request to the outside, then check that none was made.
- **Open roads.** The site asks NEAR Intents which memecoins can travel right now. The site's own answer comes from the public 1Click API, so in the sample and chain sets the test gives the answer itself (all open; the sample set also tries one shut) and neither set needs an outside service.
- **The sample set proves no chain behaviour.** It checks the page against its sample data. Only the chain set runs the contract.

## The live set

It never connects a wallet, signs or sends. It loads pages and asks the site's MCP server what the contract holds. The figures move while it runs (prices are posted every few minutes), so where the page is compared with the contract the test allows 2% and one dollar. One check can fail for a reason outside the site: if the Assayer has stopped, prices go stale and the test says so. Point it at another deployment with `E2E_BASE_URL=https://... node e2e/run.mjs live`.

## Writing a test

```bash
node e2e/run.mjs chain --hold     # or: sample --hold
```

runs no tests: it keeps everything up and prints the addresses, until Ctrl-C. Anything after `--` goes to Playwright, for example `node e2e/run.mjs chain -- --headed`. Failures leave a screenshot and a trace under `e2e/.run/results`.

Run just the transfer regressions with `node e2e/run.mjs chain -- transfer.spec.ts`. They create their own Bonds and also run after the original chain story in the full suite.

The chain story is told in order on one chain, and a test deposit can be taken once an hour per memecoin, so each run starts a fresh sandbox.

## In CI

`.github/workflows/ci.yml` runs the sample set in the site job and the chain set in a job of its own, on every push. The live set is not in CI.

CI sets `E2E_CHANNEL=chrome` and uses the Chrome already installed on GitHub's Ubuntu runners. It checks that Chrome launches before running the same 21 sample and 35 sandbox tests. This avoids downloading a second browser and installing system packages through Ubuntu mirrors on every run. The browser check has a one-minute step limit and a 15-second launch timeout; sample tests have five minutes and sandbox browser tests eight minutes. The complete site and sandbox browser jobs are capped at ten and fifteen minutes respectively, allowing room for setup and a cold Rust build.

To reproduce the CI browser choice locally, install Chrome and run `E2E_CHANNEL=chrome node e2e/run.mjs sample chain`. Leaving `E2E_CHANNEL` unset continues to use Playwright's bundled Chromium.
