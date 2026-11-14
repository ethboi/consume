# CONSUME

**A memecoin that eats other memecoins.** Built for NEAR HACKATHON and entered on 2026-11-11 in the **Memecoins With Mechanics**, **NFTs That Do Something** and **Open Innovation** tracks.

[![Live demo: consume.cash](https://img.shields.io/badge/live%20demo-consume.cash-8b1a1a)](https://consume.cash) [![Demo film: two minutes](https://img.shields.io/badge/demo%20film-two%20minutes-111111?logo=x)](https://x.com/EthBoi_/status/2120534208674447732) [![CI](https://github.com/ethboi/consume/actions/workflows/ci.yml/badge.svg)](https://github.com/ethboi/consume/actions/workflows/ci.yml) [![Track: Memecoins With Mechanics](https://img.shields.io/badge/track-Memecoins%20With%20Mechanics-5b2a86)](#what-the-tracks-prompt-asks-for) [![Contract keys: deleted](https://img.shields.io/badge/contract%20keys-deleted-2e6b30)](https://explorer.testnet.near.org/transactions/8LQwF4z3mxMiYo5uCcKwz5Q9vsfyiVGxFGhhi8WbsKN) [![Licence: AGPL-3.0-only](https://img.shields.io/badge/licence-AGPL--3.0--only-1f4e8c)](LICENSE)

[![The CONSUME site: the serpent ringed by the ten memecoins, the four steps, and the live figures from testnet](docs/site.png)](https://x.com/EthBoi_/status/2120534208674447732)

| Live page | Lead track | What NEAR does here | The mechanic in one line |
| --- | --- | --- | --- |
| [consume.cash](https://consume.cash) (NEAR testnet) | Memecoins With Mechanics (also NFTs That Do Something and Open Innovation) | NEAR Intents puts memecoins from Dogecoin, Ethereum and Solana in one account's balance, so one contract holds the cross-chain basket; $CONSUME is NEP-141 and every Bond a NEP-171 NFT, in the same contract ([How NEAR is used](docs/DETAILS.md#how-near-is-used)) | Feed DOGE, PEPE, SHIB and seven more from any chain via NEAR Intents; get a Bond NFT that vests $CONSUME over 30 days; burn $CONSUME any time for its share of the basket. |

## What makes it different

- **Backed by a redeemable basket of other chains' memecoins, not a tax jar or a bonding curve.** Every $CONSUME exists because someone fed a memecoin from Dogecoin, Ethereum, Solana or NEAR to the contract, and any $CONSUME can be burned for its share of everything in the Stomach, with no price, pool or buyer needed (`redeem.rs` `quote`, `redeem`).
- **Paid only through transferable vesting NFTs.** A feeding mints no $CONSUME. It mints a Bond, a NEP-171 NFT that releases $CONSUME over 30 days to whoever holds it, so the position can be sent or sold with its lock (`vest.rs` `claim`, `exit`).
- **A weekly Feast between communities.** The memecoin fed most in a week pays no tithe the next week, and no memecoin feasts two weeks running (`lib.rs` `feast_for`, `heaviest_tribe`).

**The limit, stated first: one account posts the prices.** A feeding is valued in USD at prices posted by the Assayer, an account that reads NEAR Intents 1Click quotes, and the contract puts no bound on how far a price may move, so a dishonest Assayer could let one feeding claim most of the Stomach, though it cannot take anything out and redeeming needs no price. On testnet the Assayer has its own account whose only key can call `set_prices` ([transaction](https://explorer.testnet.near.org/transactions/G1LAQEv9jzRMWFqL7BQzLHwv1bkm9JYF4uLBu9qEuZ31)), and the guardian that can replace it is a Sputnik DAO whose council is the builder's account alone ([handover](https://explorer.testnet.near.org/transactions/3PdUM8nJXgu2L4eb8fDMLyXSGjkuNtJ3LHSUroZqhpnC)), so one person still decides who posts prices: see [Trust assumptions](docs/DETAILS.md#trust-assumptions).

## Try it in two minutes

[Step-by-step demo guide](https://consume.cash/demo) · [Source](https://github.com/ethboi/consume)

Allow about two minutes **after funding a NEAR testnet wallet**. All memecoins here are free test tokens; cross-chain arrivals and withdrawals are simulated. A second existing testnet wallet you control lets you try the NFT ownership handoff.

1. **Connect and fund.** Open the site, connect a testnet wallet, and use [near-faucet.io](https://near-faucet.io/) if needed. Have at least **0.2 test NEAR** for a first feeding’s storage and gas. No wallet? Press **No wallet? Try as a guest** in the feeding panel instead: the site makes a key in your browser and asks NEAR’s testnet faucet for an account. Pick PEPE and press **Get free test PEPE**. Expect a test Intents balance; this is not a real bridge deposit.
2. **Feed $10.** Read the quote, tithe and Bond amount, then press **Feed the Serpent** and approve. Expect a numbered Bond and a transaction link. At unchanged prices a 1% tithe leaves $9.90 of claim value; the actual $CONSUME count depends on current backing.
3. **Pass the Bond.** In Bonds, press **Send this Bond**, enter your second testnet account, review and confirm. Expect the same NFT and schedule in the recipient’s wallet. The **0.01024 NEAR** reserve comes from the sender’s storage credit; the form adds **0.1 NEAR** credit if needed and discloses it before signing. This sends the NFT without collecting payment. A sale through an approved account is tested on a local sandbox ([how control passes](docs/DETAILS.md#how-control-passes-on-transfer-and-what-stops-the-seller)); no marketplace has listed a Bond on testnet.
4. **Collect or exit.** Switch to the recipient. Vesting is continuous over 30 days, so a brief wait makes a small amount collectible. Collect pays the current holder; its first $CONSUME registration is paid separately. To finish immediately, **Break the seal early** shows what you receive and the half of still-locked tokens you forfeit before confirmation.
5. **Redeem.** Burn some collected $CONSUME for the displayed basket. Expect test memecoins in your Intents balance and a burn in the Ledger. Redemption may add **0.1 NEAR** storage credit if low. Spent storage is not refundable; unused credit can be withdrawn from the feeding panel.

The guide and [demo notes](docs/DEMO.md) distinguish public testnet evidence from local browser tests. A two-minute demo film is in the [demo post on X](https://x.com/EthBoi_/status/2120534208674447732). Independent-user feedback is not yet available.

## What the track's prompt asks for

The memecoins track's own example prompt asks for five things. Each is here, and each has a section in [docs/DETAILS.md](docs/DETAILS.md):

| The track's prompt asks for | In CONSUME | Detail |
| --- | --- | --- |
| A NEP-141 token with the mechanic in the contract, not in a backend that can be switched off | The whole mechanic is one NEAR contract (`contracts/consume`). $CONSUME is NEP-141 with no premine: `new` mints nothing. It is minted only when a Bond pays out (`claim`, `exit`) and burned only by `redeem`, for a share of every memecoin in the Stomach. The site keeps no database. The one piece off the chain is the price feed, described above and under [Trust assumptions](docs/DETAILS.md#trust-assumptions). | [The mechanic, and where it lives](docs/DETAILS.md#the-mechanic-and-where-it-lives) |
| Parameters set at launch and readable by anyone, with no admin key that can change them | The memecoin list, caps, rates and periods are arguments to `new`, read back by `get_config` and `get_tribes`, and no method changes them. The contract account's only key was deleted on 2026-11-11 ([transaction](https://explorer.testnet.near.org/transactions/8LQwF4z3mxMiYo5uCcKwz5Q9vsfyiVGxFGhhi8WbsKN)), so the code cannot be replaced either. One role remains, the guardian, with exactly three methods: `set_tribe_open` (close a listed memecoin to new feedings, or reopen it), `set_price_feeder` (replace the Assayer) and `set_guardian` (pass the role on, or renounce it). It cannot mint, withdraw, list a memecoin or change a number. | [Every method that changes state](docs/DETAILS.md#every-method-that-changes-state), [Trust assumptions](docs/DETAILS.md#trust-assumptions) |
| Sybil limits, written plainly | Nothing in the contract counts accounts: no airdrop, no reward per account, no referral. Caps are per memecoin and shared by every account, and the Feast is won by dollars. The limit is that one account can use up a memecoin's whole day. | [Sybil limits, plainly](docs/DETAILS.md#sybil-limits-plainly) |
| A page with a log of every mint and burn | The Ledger on [consume.cash](https://consume.cash/#ledger), also JSON at `/api/ledger`. It is read from the events the contract emits, added up, and compared with the contract's own totals. It depends on a public indexer to find the transactions. | [Every mint and burn, logged](docs/DETAILS.md#every-mint-and-burn-logged) |
| 60 days of community behaviour simulated, with supply over time under a few scenarios | `node sim/sim.mjs`: four scenarios on a port of the contract's arithmetic, with the backing checked after every action. CI fails if the published table or charts differ from the run. | [Sixty days, simulated](docs/DETAILS.md#sixty-days-simulated) |

## Seen on testnet

**NFT handoff, 2026-11-11:** [Bond 26’s transfer and recipient collection](docs/DEMO.md#what-is-verified) show that ownership carries the payout. The public receipts and before/after JSON verify the unchanged schedule, the 0.01024 NEAR reserve and payment to the new holder. This proof used the NEAR CLI between builder-owned testnet accounts; the web flow is tested separately on a sandbox.

**The Assayer's own account, 2026-11-11:** [created with one key that can only call `set_prices`](https://explorer.testnet.near.org/transactions/G1LAQEv9jzRMWFqL7BQzLHwv1bkm9JYF4uLBu9qEuZ31), [named the price feeder by the guardian](https://explorer.testnet.near.org/transactions/3EeeVAGK8UhTaynQKyBTjuZgzpzRWuLKUFqmxMVtH1qS), and [the first round it signed](https://explorer.testnet.near.org/transactions/FRh7f8mzQNhJ73uwM619aL4dwwNgs73dApnP9v3jc3oK). What this does and does not change is under [Trust assumptions](docs/DETAILS.md#trust-assumptions).

**The guardian handed to a DAO, 2026-11-11:** [the DAO created](https://explorer.testnet.near.org/transactions/6DAJ6VXNPJBvyCNPQHR65Q4pbhrFLtXVrRmuCbvsM1Hv), [a rehearsal proposal approved and run](https://explorer.testnet.near.org/transactions/7ixFkz7CgEGSpYQyQ9iPBJAvQndNKurRcoT4Ym3un2Vb) (a read of `get_config`, to show the DAO can call the contract), [`set_guardian` naming the DAO](https://explorer.testnet.near.org/transactions/3PdUM8nJXgu2L4eb8fDMLyXSGjkuNtJ3LHSUroZqhpnC), and [the DAO using the role](https://explorer.testnet.near.org/transactions/n77wbaBQSXtMtzprBa8nYM2MnqFXJ6qXcmjTk6fsBU9): its proposal 1 called `set_price_feeder` with the same Assayer and the contract accepted it.

**The guest wallet on the live site, 2026-11-11:** at 23:30 UTC the builder pressed "No wallet? Try as a guest" on consume.cash. NEAR's faucet account `testnet` [made `consume-guest-vd75.testnet`](https://explorer.testnet.near.org/transactions/AUzGL473idNmMdCY67gRSbfBMs9WCcW4JNvnRGPNG91z) with 10 test NEAR and one key, the one that browser had just made. The page then wrote, signed and sent [the account's first transaction](https://explorer.testnet.near.org/transactions/CEa56ShBp53aCMFHWajrdbf2ABqBNeEL35gwxvMBVsrh) itself, which brought 20,000,000 test PEPE into its Intents balance. This account is the builder's own try and has fed nothing, so it adds no feeding to either side of the Ledger.

**The guest sponsor on the live site, 2026-11-12:** at 15:29 UTC the builder sent consume.cash's `/api/guest` a new guest name and a public key from a script. The sponsor, `guests.consumecash.testnet`, [called `create_account` on `testnet`](https://explorer.testnet.near.org/transactions/6p2Fw1V7XjfxZDyb8zNnCRZVcZ5Cctu2VCJbwib8YQjD) with 1 test NEAR, and `consume-guest-3ogh.testnet` then held 1 NEAR and that one key. The private half was not kept, so the account can sign nothing. This shows the route's own call; the page's step from a failed faucet to this route is run in the browser tests only.

**A price round with its quotes, 2026-11-11:** since 21:38 UTC the Assayer on testnet writes its quotes into every round it posts. [The first such round](https://explorer.testnet.near.org/transactions/9UV9xuVdts5R9snfe9Cw1pkiZpnRcAYiMiKnf5KQhUPt) set ten prices, each the quote written beside it at the precision the script posts (twelve decimal places for the larger prices), and each quote between 0.32% and 1.85% under the 1Click list price. The latest round is always at [consume.cash/api/round](https://consume.cash/api/round) and under "Who you trust" on the site's [How it works](https://consume.cash/how-it-works) page.

**The first Feast, 2026-11-12:** the first week ended at 00:00 UTC with PEPE the most fed ($135.40 to DOGE's $130.04), so PEPE feasts in the week that began then, week 2967 by the contract's count. `get_stats` names PEPE as `feast`, and `get_feast` answers the same for that week:

```bash
near contract call-function as-read-only consume.consumecash.testnet get_feast json-args '{"epoch":"2967"}' network-config testnet now
# "eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near" (PEPE)
```

At 05:50 UTC the builder's bot account `courtier.consumecash.testnet` [fed $3.00 of test PEPE and paid no tithe](https://explorer.testnet.near.org/transactions/FkQP1HL8duS1MvPrN68WpyoeYzbWUTAejRXhVZQcQpjs): the contract's `meal` event in that transaction reads `"tithe_usd":"0","bonus":true`, and `get_vest` shows Bond 60 with `"meal_usd": "3000000"` and `"bonus": true`. A feeding of another memecoin the same morning paid the usual 1% ([$5.00 of TURBO, tithe $0.05](https://explorer.testnet.near.org/transactions/8VvWAxbYu7atDUQkMQt2G3UvJbpBJ6xzoQ2zkxp9k3Kq)). PEPE cannot win the race now running, so it will not feast in the week that starts on 2026-11-19.

The following original economic actions were run on the live contract, [`consume.consumecash.testnet`](https://testnet.nearblocks.io/address/consume.consumecash.testnet), on 2026-11-10. Each row is a transaction anyone can open. All of them were sent by the builder's own account, `consumecash.testnet`; nobody else had used it then.

| Action | What happened | Transaction |
| --- | --- | --- |
| Feed | 20,000,000 test PEPE, worth $106.10, went into the Stomach through the Intents stand-in. Tithe $1.06. Bond 1 was minted holding 105,039.375 $CONSUME. | [`6ChNmb…k6mE`](https://testnet.nearblocks.io/txns/6ChNmbymCXFywR4C59mxu4WL7maDV9M8662Z26CEk6mE) |
| Collect | 24 minutes later Bond 1 had released 59.3791 $CONSUME, and collecting minted exactly that. | [`4kY1kL…7HdW`](https://testnet.nearblocks.io/txns/4kY1kLYctEqh3PydFC7TRMMpywEXcTyvyAdyQx8i7HdW) |
| Collect all | Four Bonds collected from in one transaction (four `claim` calls). | [`7L2jHM…PUrW`](https://testnet.nearblocks.io/txns/7L2jHMhhtAXwTBKeQxRVEQNJ2KS7tahqdWVdsQFhPUrW) |
| Redeem | 1,827.2215 $CONSUME burned, paid in the four memecoins the Stomach held: DOGE, PEPE, SHITZU and NearKat. | [`DXAdWj…Lbqi`](https://testnet.nearblocks.io/txns/DXAdWj3q2znRrq5n43UDAsis8LUCMn1JMBSsfEXQLbqi) |
| Break the seal | Bond 1 broken with 104,085.1177 $CONSUME still locked: 52,045.9623 minted (what had been released, plus half of the rest) and 52,042.5588 forfeited, never minted. | [`5JVYSQ…K4jV`](https://testnet.nearblocks.io/txns/5JVYSQ3tGoMJSaNFUXos9XFKPEojA64strYbQ9a6K4jV) |
| Redeem | The 52,045.9623 $CONSUME from the broken seal burned for its share of the four memecoins. | [`4ciLyc…cmt7`](https://testnet.nearblocks.io/txns/4ciLycPZENVUU7UejHfZShFKS1kjjsiRTJb72zD2cmt7) |

After these and the rest (22 entries: five feedings, fourteen collections, one broken seal, two redemptions), the Ledger's entries added up to the contract's own totals exactly: 53,949.6088 $CONSUME minted, 53,873.1838 burned, 52,042.5588 forfeited. Step 13 of [Reproduce the checks](docs/DETAILS.md#reproduce-the-checks) repeats that check against the live contract.

The site shows the Feast as a race, read from the contract, with the time left in the week:

![The Feast on testnet on 11 November 2026, six and a half hours before the first week ended: PEPE led DOGE by $8.36 and all ten memecoins had been fed](docs/feast.png)

## What to know before you trust it

- **Feeding costs the tithe, and the backing is paid in memecoins.** $CONSUME is earned at its backing, so $100 fed buys a claim on $100 of the Stomach less the tithe (1% at the start, up to 10%). Measured by what its $CONSUME could redeem, a feeding is down by at most the tithe from the moment it is made (the $CONSUME itself is released over 30 days): the tithe stays in the Stomach and is shared by every $CONSUME, yours included, so the first feeder gets all of theirs back and a $100 feeding into a $100 Stomach at a 10% tithe is worth about $94.74, not $90. The reason to feed is that you want the basket, a share of later tithes and broken seals, or you value $CONSUME above its backing. The backing is a share of ten memecoins, not a price in dollars: it falls when they fall.
- **Prices come from one off-chain account,** the Assayer, which reads NEAR Intents 1Click quotes and posts them, all in one call. A feeding is valued against every memecoin in the Stomach. The caps limit what a price that is too high on the memecoin being fed can cost. They do not limit a price that is too low on what the Stomach already holds: a feeding made then earns more than its share, whatever its size, and a dishonest Assayer could use that to take most of the Stomach. This is the largest trust in the design. See [Trust assumptions](docs/DETAILS.md#trust-assumptions).
- **Breaking the seal forfeits half of the $CONSUME still locked, which is less than half of its value.** The forfeited $CONSUME is never minted, so what it would have claimed is shared by all the $CONSUME that remains, the leaver's included. Someone holding nearly everything loses nearly nothing; someone holding a small part loses close to half of what was locked.
- **The basket is whatever people fed.** Shares of the Stomach follow deposits, so it can end up mostly one memecoin, and a redemption is paid in that mix.
- **A guardian exists.** It can stop a listed memecoin being eaten and replace the Assayer. It cannot do anything else, and it can be renounced. On testnet it is a Sputnik DAO, `consume-guardian.sputnikv2.testnet`, whose only council member is the builder's account, and it has not been renounced.
- **NEAR Intents has no testnet,** so the testnet flow uses a stand-in contract with the same calls (`contracts/mock-intents`). The route check in the site is the real mainnet API.
- **The guest wallet keeps its key in the browser.** A visitor with no wallet can press one button, under the feeding panel or at the last stop of "Take the tour": the site makes an Ed25519 key in the browser, asks NEAR's testnet faucet for an account holding it, and signs with it (`web/src/lib/guest.ts`, `web/src/lib/signing.ts`). The private half sits unencrypted in that browser's storage and goes nowhere else, so the site offers this on testnet only (`guestOffered`), and a guest account should hold nothing of value.
- **A second road for the guest wallet, paid by the site.** When the faucet will not make the account, the page asks the site's own route, `POST /api/guest`, and a sponsor account calls `create_account` on `testnet` for the same name and key, with 1 test NEAR (`web/src/lib/sponsor.ts`, `web/src/app/api/guest/route.ts`). The route is told the name and the public key and nothing else, and it pays only for names the guest wallet makes (`consume-guest-` and four characters). The sponsor's key is a full-access key kept in the server's environment, so whoever runs the site holds it, and what it can lose is that one account's balance. The route counts 2 guests an hour for a visitor and 20 an hour in all, in the memory of each server instance, which slows a script down and does not stop one: the sponsor's balance is the hard limit. With no sponsor set the route answers 503 and the faucet is the only road. On consume.cash the sponsor is `guests.consumecash.testnet`, an account made for this on 2026-11-12 with 20 test NEAR ([transaction](https://explorer.testnet.near.org/transactions/7bDgdQzpkUEhVhu9iAb26pQRkekT9LHVDx3pgjUMBxFj)). A sandbox has no `testnet` contract, so the browser tests use a stand-in for the route's call: the unit tests cover what it accepts and signs, and one live call is linked under [Seen on testnet](#seen-on-testnet).
- **The contract account holds no key.** Its only full-access key was deleted on 2026-11-11 ([transaction](https://explorer.testnet.near.org/transactions/8LQwF4z3mxMiYo5uCcKwz5Q9vsfyiVGxFGhhi8WbsKN)), so nobody, the builder included, can replace the code or fix a fault in it.

## Everything else, in docs/DETAILS.md

The full track tables, every method that changes state, the rules and their tests, the checks to reproduce, the simulation, the Ledger, the trust assumptions and the security notes:

- [Why participate?](docs/DETAILS.md#why-participate)
- [What the track asks for, and where the code answers](docs/DETAILS.md#what-the-track-asks-for-and-where-the-code-answers)
  - [The second track: NFTs That Do Something](docs/DETAILS.md#the-second-track-nfts-that-do-something)
  - [How control passes on transfer, and what stops the seller](docs/DETAILS.md#how-control-passes-on-transfer-and-what-stops-the-seller)
  - [The third track: Open Innovation](docs/DETAILS.md#the-third-track-open-innovation)
  - [Every method that changes state](docs/DETAILS.md#every-method-that-changes-state)
  - [The story's words, and the names in the code](docs/DETAILS.md#the-storys-words-and-the-names-in-the-code)
- [The mechanic, and where it lives](docs/DETAILS.md#the-mechanic-and-where-it-lives)
- [Reproduce the checks](docs/DETAILS.md#reproduce-the-checks)
- [Status](docs/DETAILS.md#status)
- [Sixty days, simulated](docs/DETAILS.md#sixty-days-simulated)
- [Sybil limits, plainly](docs/DETAILS.md#sybil-limits-plainly)
  - [Gaming the Feast](docs/DETAILS.md#gaming-the-feast)
- [Every mint and burn, logged](docs/DETAILS.md#every-mint-and-burn-logged)
- [For agents](docs/DETAILS.md#for-agents)
- [Against the judging criteria](docs/DETAILS.md#against-the-judging-criteria)
  - [Technical implementation](docs/DETAILS.md#technical-implementation)
  - [Innovation and creativity](docs/DETAILS.md#innovation-and-creativity)
  - [Track fit](docs/DETAILS.md#track-fit)
  - [Execution and completeness](docs/DETAILS.md#execution-and-completeness)
  - [Also, for the human jury](docs/DETAILS.md#also-for-the-human-jury)
- [The problem](docs/DETAILS.md#the-problem)
- [How it works](docs/DETAILS.md#how-it-works)
- [The ten memecoins](docs/DETAILS.md#the-ten-memecoins)
  - [NEAR Intents on testnet](docs/DETAILS.md#near-intents-on-testnet)
- [How NEAR is used](docs/DETAILS.md#how-near-is-used)
- [Trust assumptions](docs/DETAILS.md#trust-assumptions)
- [Security notes](docs/DETAILS.md#security-notes)
- [Try it](docs/DETAILS.md#try-it)
  - [Launch on testnet](docs/DETAILS.md#launch-on-testnet)
- [Repository layout](docs/DETAILS.md#repository-layout)

## Built with

near-sdk 5.30 and near-contract-standards, near-workspaces, the `uint` crate, Next.js 16.4, React 19.3 and TypeScript 6, @hot-labs/near-connect, and locally bundled @fontsource typefaces (UnifrakturMaguntia, IM Fell English, IM Fell English SC and Almendra capitals). All artwork (the serpent, the stomach's jars, the coins, the emblems) is drawn in code for this project; the coin designs are original heraldic devices, not the memecoins' logos.

**AI disclosure:** this project was written with AI coding assistance (Claude Code), and reviewed twice with a second model (OpenAI Codex). The release fixes and later demo/transfer work were also implemented with OpenAI Codex. Known limitations and the scope of verification are listed above and in [docs/DETAILS.md](docs/DETAILS.md#security-notes); this is not an independent professional audit.

## Also by this author

Second entry by the same builder, independent of and sharing no code with **OneUp** (https://oneup.markets), a perps DEX built for NEAR HACKATHON.

## License

Original CONSUME code and documentation are **AGPL-3.0-only**, matching OneUp: see [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party dependencies and materials retain their own terms.
