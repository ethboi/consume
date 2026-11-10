# CONSUME

**A memecoin that eats other memecoins.** Built at NEAR HACKATHON, in the Memecoins With Mechanics track.

Feed it a memecoin from another chain (DOGE, PEPE, SHIB and seven more). It keeps the memecoin for good and pays you in $CONSUME through a **Bond**, an NFT that releases your $CONSUME over 30 days. Every $CONSUME can later be burned (**Redeem**) for its share of everything in its Stomach. So $CONSUME is a memecoin backed by a growing basket of other memecoins.

The whole mechanic is one NEAR contract (`contracts/consume`). Its memecoin list, caps, rates and periods are arguments to `new` and no method changes them afterwards.

> **Status, 2026-11-10.** Live on NEAR testnet: contract [`consume.consumecash.testnet`](https://testnet.nearblocks.io/address/consume.consumecash.testnet), site at [consume.cash](https://consume.cash) (also [consume-ivory.vercel.app](https://consume-ivory.vercel.app) while the domain settles). 50 unit tests and two end-to-end sandbox tests pass. No video yet. The contract account still holds its own full-access key, so its code could still be replaced; that key is to be deleted after a full run on testnet.

## Check it in five minutes

Every claim below can be checked from a clean clone. Prerequisites are under [Try it](#try-it).

| # | Run this, from the repository root | You should see |
| --- | --- | --- |
| 1 | `(cd contracts/consume && cargo test)` | `test result: ok. 50 passed; 0 failed` |
| 2 | `(cd contracts/mock-intents && cargo test)` | `test result: ok. 3 passed; 0 failed` |
| 3 | `for c in consume mock-meme mock-intents; do (cd contracts/$c && cargo near build non-reproducible-wasm); done` | three `.wasm` files under `contracts/target/near/` |
| 4 | `(cd contracts/integration-tests && cargo test --test flow)` | `test offering_claim_redeem ... ok`. On a real local NEAR node: feed, refund over the cap, Bond, collect, redeem with exact payouts, a failed payout kept as owed and paid on retry. It also asserts that `set_tribe`, `set_intents_id`, `set_media_base` and `set_owner` do not exist and that `new` cannot be called twice. |
| 5 | `(cd contracts/integration-tests && cargo test --test intents)` | `test feed_and_redeem_through_intents ... ok`. The same flow through the NEAR Intents stand-in: `mt_transfer_call` in, `mt_transfer` out. |
| 6 | `(cd web && pnpm install && pnpm dev)`, then open `http://localhost:3000` | The site, with a note that it is showing sample figures. Buttons that need a contract are off. |
| 7 | `curl http://localhost:3000/api/routes` | JSON with ten routes. These are live mainnet NEAR Intents (1Click) dry quotes, not samples: for each memecoin, whether $100 of it is routable right now and what comes out. The "From any chain" section of the site shows the same data. |
| 8 | open `http://localhost:3000/bond/209.svg` and `/bond/square/209.svg` | A Bond drawn as a tarot card from its state (amount fed, days released, seal intact or broken). |

Step 4 downloads a NEAR sandbox node and builds OpenSSL on first run, which takes a few minutes.

## The mechanic, and where it lives

The track asks for the mechanic to be in the contract and judged on the mechanic, not the chart. Each rule below is contract code with a test of the same name in `contracts/consume/src/tests.rs`.

| Rule | What the contract does | Code | Test |
| --- | --- | --- | --- |
| **Feed** | Takes a listed memecoin, values it at the posted price, keeps it in the Stomach, refunds anything over the cap, mints a Bond. | `meal.rs` `plan_meal`, `eat` | `a_feeding_mints_a_bond`, `over_the_meal_cap_is_refunded`, `daily_cap_holds`, `stale_price_refused`, `a_round_must_price_every_open_memecoin`, `a_zero_price_is_refused` |
| **Mint at the backing** | A feeding mints `fed value × $CONSUME with a claim ÷ Stomach value`, so $100 fed buys a claim on $100 of the Stomach, whenever you arrive. The first feeding sets the scale at 1000 $CONSUME per dollar. A feeding can never lower the backing per $CONSUME. | `math.rs` `consume_at_floor`, `lib.rs` `stomach_usd`, `claims` | `minting_at_the_floor_math`, `the_stomach_is_rounded_up_when_a_feeding_is_priced`, `a_feeding_never_lowers_the_floor`, `a_late_feeder_gets_what_they_fed_less_the_tithe` |
| **Famine** | Each feeding pays a tithe: a part of it that mints nothing and so belongs to everyone already holding. It is 1% at the start and grows by 1% with every $10,000 eaten, to 10% at most. A feeding that crosses a famine pays each tithe on its part on each side. | `math.rs` `tithe_at`, `after_tithe` | `famine_grows_the_tithe_to_its_cap` |
| **Feast** | The memecoin fed most (by USD) in a week pays no tithe the following week. | `lib.rs` `heaviest_tribe`, `meal.rs` `plan_meal` | `the_feast_waives_the_tithe_next_epoch` |
| **Bond** | An NFT that releases its $CONSUME linearly over 30 days to whoever holds it. | `vest.rs` `claim` | `claim_releases_linearly_to_the_current_holder` |
| **Break the seal** | Leave early with what has been released plus half of the rest. The other half is never minted. | `vest.rs` `exit` | `exit_forfeits_half_of_the_locked_part`, `a_broken_seal_raises_the_floor` |
| **Redeem** | Burn $CONSUME for a pro-rata share of every memecoin in the Stomach, counted against all $CONSUME including what is still locked in Bonds. | `redeem.rs` `redeem` | `redeem_pays_a_fair_share_counting_unvested`, `a_redemption_that_would_pay_nothing_is_refused`, `a_failed_payout_stays_owed_and_a_paid_one_is_cleared` |
| **From any chain** | Memecoins arrive from NEAR Intents balances and redemptions are paid back into them. | `intents.rs` `mt_on_transfer` | `intents_feeding_mints_a_bond`, `intents_feeding_from_anyone_else_is_refused`, sandbox `intents.rs` |
| **Fixed at launch** | The memecoin list, caps, starting rate, tithe schedule, vesting period, forfeit, week length, Intents contract and image base are arguments to `new`. No method changes them. | `lib.rs` `new` | `the_launch_list_is_what_new_was_given`, `launch_refuses_a_memecoin_listed_twice`, sandbox `flow.rs` |
| **Guardian, not owner** | One role with two switches: seal or unseal a listed memecoin, replace the price feeder. It can be renounced. It cannot list a memecoin, change a number, mint or withdraw. | `lib.rs` `set_tribe_open`, `set_price_feeder`, `set_guardian` | `the_guardian_can_seal_a_memecoin`, `nobody_else_can_seal_a_memecoin`, `a_renounced_guardian_has_no_power_left` |

## Against the judging criteria

- **Technical implementation.** One contract implements NEP-141 (with NEP-145 and NEP-148), NEP-171 (with NEP-177, NEP-178, NEP-181) and a NEP-245 receiver for NEAR Intents. Amounts use 256-bit intermediates (`math.rs`). 50 unit tests, two sandbox tests on a real node, and two second-model security reviews whose findings are fixed and tested (see [Security notes](#security-notes)).
- **Design.** A woodcut site drawn entirely in code: the serpent, the Stomach's jars, ten heraldic coins, and Bonds as tarot cards rendered from contract state (`web/src/components`). It works at phone width.
- **Impact.** A memecoin whose supply only exists because other memecoins were fed to it, and whose every token is a claim on that basket. A redeemer receives the memecoins themselves and can withdraw them to their home chains through NEAR Intents.
- **Originality.** We surveyed the track on 2026-11-10 and found no other entry that eats other memecoins, redeems by burning for a pro-rata basket, or puts the vesting position in a transferable NFT.
- **Sustainability.** No treasury, no team allocation, no emissions. $CONSUME is minted only by feeding and always at its backing, so no feeding dilutes a holder and nobody is paid out of the next person's deposit. Value moves between people in two ways only, the tithe and broken seals, and both go to those who stay. Nothing can be withdrawn from the Stomach except by burning $CONSUME. The costs and limits are stated in the next section, not hidden.

## What to know before you trust it

- **Feeding costs the tithe, and the backing is paid in memecoins.** $CONSUME is minted at its backing, so $100 fed buys a claim on $100 of the Stomach less the tithe (1% at the start, up to 10%). Feed and redeem straight away and you are down by the tithe; the reason to feed is that you want the basket, a share of later tithes and broken seals, or you value $CONSUME above its backing. The backing is a share of ten memecoins, not a price in dollars: it falls when they fall.
- **Prices come from one off-chain account,** the Assayer, which reads NEAR Intents 1Click quotes and posts them, all in one call. A feeding is valued against every memecoin in the Stomach. The caps limit what a price that is too high on the memecoin being fed can cost. They do not limit a price that is too low on what the Stomach already holds: a feeding made then mints more than its share, whatever its size, and a dishonest Assayer could use that to take most of the Stomach. This is the largest trust in the design. See [Trust assumptions](#trust-assumptions).
- **A guardian exists.** It can stop a listed memecoin being eaten and replace the Assayer. It cannot do anything else, and it can be renounced.
- **NEAR Intents has no testnet,** so the testnet flow uses a stand-in contract with the same calls (`contracts/mock-intents`). The route check in the site is the real mainnet API.
- **The contract account still has its key,** as the status note says. Until it is deleted, whoever holds it could replace the code.

## The problem

Most memecoins are a ticker and a chart: nothing backs them, insiders dump on launch, and a dead memecoin leaves holders with nothing. CONSUME turns that around. New $CONSUME only exists when real memecoins are fed to it, every token is a pro-rata claim on the basket it ate (a backing, not a guaranteed price), a late feeder gets the same terms as an early one, nobody can sell everything on day one (leaving early forfeits half of what is still locked), and paper hands pay the patient.

## How it works

| Step | What happens | Contract method |
| --- | --- | --- |
| Storage credit | Feeders prepay a little NEAR for the storage their Bonds use. The site adds 0.1 NEAR with your first feeding; unused credit can be taken back. | `add_meal_credit()`, `withdraw_meal_credit()` |
| Feed | Send one of the ten memecoins to the contract: from your NEAR Intents balance with `mt_transfer_call` on the Intents contract, or as a plain NEP-141 with `ft_transfer_call` (each memecoin is set to one or the other). It is valued at the current price, capped per feeding and per day, and kept in the Stomach. Anything over the cap is refunded. `msg` may be JSON `{"recipient", "min_consume", "min_net_usd", "deadline_ns"}`. The site always sends `min_net_usd` (99% of the quoted value after the tithe) and a ten-minute deadline, so a fall in the memecoin's price or a famine while your wallet is open refunds you instead of paying less. | `mt_on_transfer`, `ft_on_transfer` |
| Bond | You receive a Bond NFT (NEP-171) that releases $CONSUME linearly over 30 days to whoever holds it. Bonds can be sold or transferred, and the lock goes with them. | minted inside the feeding |
| Collect | The Bond's holder collects what has been released so far. | `claim(token_id)` |
| Break the seal | Leave early: take what has been released plus half of the rest. The other half is never minted, which raises every remaining holder's share. | `exit(token_id)` (1 yoctoNEAR) |
| Redeem | Burn $CONSUME and receive your pro-rata share of every memecoin in the Stomach, paid out in the memecoins themselves (into your NEAR Intents balance for Intents memecoins, from where they can be withdrawn to their home chain). Shares are measured against all $CONSUME including what is still locked in Bonds, so nobody can empty the Stomach before later Bonds unlock. | `redeem(amount)` (1 yoctoNEAR) |
| Retry | If a payout fails (for example you are not registered on a plain NEP-141 memecoin), it stays owed to you. | `withdraw_owed()` |

Rules enforced by the contract:

- **Mint at the backing:** a feeding mints `net × claims ÷ stomach value`, where `net` is the feeding's USD value after the tithe, `claims` is all $CONSUME in wallets plus all still locked in Bonds, and `stomach value` is every held memecoin at its posted price before the feeding. With an empty Stomach it mints 1000 $CONSUME per dollar. So the backing per $CONSUME is the same before and after a feeding, apart from the tithe, which raises it. A feeding that would mint nothing is refused.
- **Famine:** the tithe is `min(10%, 1% × (1 + total eaten ÷ $10,000))` of the feeding's value. That part mints nothing. A feeding that crosses a famine pays each tithe on the part on each side.
- **Feast:** the memecoin fed most (by USD) in a week pays no tithe the following week.
- **Caps:** each memecoin has a largest feeding and a daily limit, smaller for thin markets (the NEAR-native memecoins). They limit how much of an overpriced memecoin can be fed in a day. They do not limit a feeding made while the Stomach is underpriced (see [Trust assumptions](#trust-assumptions)).
- **Stale prices are refused:** a feeding reverts if the price of the memecoin fed, or of any memecoin in the Stomach, is more than 15 minutes old. A round of prices must cover every memecoin that is open or held, so a feeding never reads a half-updated Stomach. Redemption needs no prices.

## The ten memecoins

The list is fixed when the contract is launched (it is an argument to `new`); these are the ten. All ten were routable through NEAR Intents from their home chains on 2026-11-09 (1Click dry quotes of $100 into USDC each returned a route; WIF, MOG and BRETT did not, so they were left out). The site re-checks this live: the "From any chain" section calls `/api/routes`, which asks 1Click for a free dry quote per memecoin (cached five minutes) and shows which routes are open and what $100 comes out as. On mainnet the Stomach holds them in its NEAR Intents balance (`intents.near`), under their real Intents token ids such as `nep141:eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near` for PEPE. Bringing a memecoin into your Intents balance from its home chain is a normal Intents deposit; the site does not run it for you on mainnet.

### NEAR Intents on testnet

NEAR Intents has no testnet, so `contracts/mock-intents` is a stand-in with the same calls CONSUME uses, checked against [near/intents](https://github.com/near/intents): NEP-245 `mt_transfer` and `mt_transfer_call` (1 yoctoNEAR, approvals refused, as on mainnet), the `mt_on_transfer` receiver call with refunds through `mt_resolve_transfer`, and `mt_balance_of` / `mt_batch_balance_of`. It uses the real mainnet token ids. Only the cross-chain legs are simulated:

- `simulate_deposit(token_id, from_chain)` credits your Intents balance as if the memecoin had arrived from its chain (once an hour per memecoin). The site's button reads "Bring test PEPE from Ethereum".
- `simulate_withdraw(token_id, amount, to_address)` burns a balance as if it had been sent home. The site's "Send to Ethereum" does this after a redemption.

Feeding, the Bond, collecting and redeeming are the real contract, and the same CONSUME code runs against `intents.near` on mainnet. Set `NEXT_PUBLIC_INTENTS_CONTRACT` to the mock (testnet) or `intents.near` (mainnet) to switch the site to this flow; without it the site uses the plain NEP-141 stand-ins in `contracts/mock-meme` and their faucet.

| Memecoin | Home chain | Mainnet token on NEAR |
| --- | --- | --- |
| DOGE | Dogecoin | `doge.omft.near` |
| SHIB | Ethereum | `eth-0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce.omft.near` |
| PEPE | Ethereum | `eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near` |
| PENGU | Solana | `sol-0xaad74c68eecfc9f8c5bdcea614f6167048c795ef.omdep.near` |
| SPX | Ethereum | `eth-0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c.omft.near` |
| TURBO | Ethereum | `eth-0xa35923162c49cf95e6bf26623385eb431ad920d3.omft.near` |
| BOME | Solana | `sol-57d087fd8c460f612f8701f5499ad8b2eec5ab68.omft.near` |
| BLACKDRAGON | NEAR | `blackdragon.tkn.near` |
| SHITZU | NEAR | `token.0xshitzu.near` |
| NearKat | NEAR | `kat.token0.near` |

## How NEAR is used

- **NEAR Intents** brings memecoins from Dogecoin, Ethereum and Solana into one NEAR account, so a single contract can hold a cross-chain basket without a bridge per chain. CONSUME is an Intents receiver (`mt_on_transfer`): it is fed straight from Intents balances and pays redemptions back into them with `mt_transfer`, so no token registration is needed and a redeemer can withdraw to any chain.
- **One contract, three standards:** $CONSUME (NEP-141 + NEP-145 + NEP-148), Bonds (NEP-171 + NEP-177 metadata + NEP-178 approvals + NEP-181 enumeration) and the Stomach itself. A feeding arrives as one `ft_transfer_call` from the memecoin's token; minting, vesting and the redemption accounting all happen inside this one contract, and only payouts call back out.
- **Bonds are NFTs that hold value:** the vesting position travels with the NFT. The image is drawn from contract state each time it is loaded, so it shows the days released and a broken seal: `/bond/<id>.svg` is the tall card the site shows, `/bond/square/<id>.svg` is the same card on a square mount for wallets and marketplaces (`media_base` is set to `<site>/bond/square` at launch).
- **Cheap storage and ~1 s blocks** make one NFT per feeding practical.

## Trust assumptions

There are four things you trust, and none of them is "the Stomach is safe no matter what":

1. **The Assayer (price feeder)** posts USD prices, read from NEAR Intents 1Click dry quotes. It cannot move anything out of the Stomach itself, but its prices decide how much every feeding mints, and overpaid $CONSUME is a claim on everyone else's share. This is the largest trust in the design.
   - A price too high on the memecoin being fed overpays that feeding. That memecoin's per-feeding and daily caps limit this.
   - A price too low on memecoins already held underprices the Stomach, and a feeding of any size then mints more than its share. The caps do not limit this. What slows it: the $CONSUME arrives as a Bond over 30 days, and breaking the seal forfeits half of what is locked, so feeding, breaking the seal and redeeming at once only pays when the Stomach is posted at under half its real value. Someone willing to hold the Bond for the 30 days gains from any underpricing larger than the tithe.
   - With an honest Assayer the error is how far prices move in the 15 minutes a price may be used. A dishonest or broken Assayer could post prices that let one feeding claim most of the Stomach. The contract has no limit on how far a price may move between rounds.
   - A round must price every memecoin that is open or held, in one call, so a feeding never reads a half-updated Stomach. Prices older than 15 minutes are refused, so a stopped Assayer stops feedings, not redemptions.
2. **The guardian** has three methods and no others: `set_tribe_open` (seal or unseal a memecoin that is already on the list), `set_price_feeder` (replace the Assayer) and `set_guardian` (pass the role on, or renounce it with `null`). It cannot add a memecoin, change a cap, a rate or a period, repoint the Intents contract, mint $CONSUME or withdraw from the Stomach: those methods do not exist. Its real power is the second one. A dishonest guardian could appoint a dishonest Assayer, with the damage described in point 1. Once the guardian is renounced, the Assayer can never be replaced. Until it is renounced the guardian is the deployer's account; the README will say here when that changes.
3. **NEAR Intents and the listed token contracts** themselves (`intents.near` and the bridged tokens on mainnet; the stand-ins on testnet). The Stomach's Intents memecoins sit in CONSUME's balance on the Intents contract. Only the Intents contract can feed an Intents memecoin, and which contract that is was fixed at launch.
4. **The deployment keys.** Until the contract account's full-access keys are deleted, whoever holds them can deploy different code. The README will say here when that has been done.

## Security notes

Protections in the contract, each with a unit test:

- **Bonds are locked mid-transfer:** while an `nft_transfer_call` is unresolved, the Bond cannot be collected or broken, so a receiver cannot drain it and hand it back. A locked Bond cannot start a second `nft_transfer_call` either, because that one would resolve first and lift the lock (`bond_in_flight_cannot_be_claimed`, `a_bond_in_flight_cannot_start_another_transfer_call`).
- **The contract pays for nobody's storage,** so it cannot be run out of NEAR. Feeders prepay credit, and a feeding is charged for every byte it writes (`feeding_charges_every_byte_it_stores`). A feeder's $CONSUME registration comes out of that credit at the token's own registration price, and someone who receives a Bond later pays theirs the same way (`the_feeder_is_registered_from_their_own_credit`, `a_bond_received_later_pays_its_own_registration`). An account's first credit deposit also pays for its own record (`a_first_credit_deposit_pays_for_its_record`).
- **Prices arrive in full rounds:** `set_prices` refuses a round that leaves out a memecoin that is open or held, and refuses a zero price (`a_round_must_price_every_open_memecoin`, `a_sealed_memecoin_is_left_out_of_a_round_only_when_none_is_held`, `a_zero_price_is_refused`).
- **Rounding goes against the feeder:** the Stomach is valued rounded up when a feeding is priced against it, and a Stomach worth under a micro-dollar counts as one (`the_stomach_is_rounded_up_when_a_feeding_is_priced`, `minting_at_the_floor_math`).
- **No silent zero payouts:** a feeding that would mint nothing and a redemption that would pay nothing are refused. A payout that fails stays owed, in a record that is kept while the payout is in flight (`a_redemption_that_would_pay_nothing_is_refused`, `a_failed_payout_stays_owed_and_a_paid_one_is_cleared`).
- **Minimum value and deadline** on feedings (`min_net_usd_is_enforced`, `deadline_is_enforced`). A memecoin's decimals and caps are fixed at launch.
- **Intents feedings only from the Intents contract**, one memecoin per call and only `nep141:` tokens. A memecoin set to Intents cannot be fed as a plain NEP-141 (or the other way round), and both that setting and the Intents contract are fixed at launch, so the Stomach's custody cannot be moved.
- The testnet stand-in tokens disable unregistering, so their free registrations cannot be cashed out.

Known and not fixed:

- **Memecoins sent to the contract with a plain transfer** (`ft_transfer` or `mt_transfer`, not the `_call` forms) are not counted in the Stomach, back nothing and cannot be recovered. Feed through the site, or with `ft_transfer_call` / `mt_transfer_call`.
- **No limit on price moves between rounds,** as described under [Trust assumptions](#trust-assumptions).
- Two payouts of the same memecoin to the same account in flight at once, where the first lands and the second fails, need a little free NEAR on the contract to write the owed record back. Fees keep the contract above that, and nothing a user does lowers it.

## Try it

On testnet: open [consume.cash](https://consume.cash) (or [consume-ivory.vercel.app](https://consume-ivory.vercel.app)) and connect a testnet wallet. The contract is `consume.consumecash.testnet`; the NEAR Intents stand-in is `intents.consumecash.testnet`; the guardian and the Assayer are `consumecash.testnet`. Video: not yet.

To run it yourself:

Prerequisites: Rust (stable) with the `wasm32-unknown-unknown` target, [cargo-near](https://github.com/near/cargo-near) 0.22 or newer, Node.js 22 or newer and pnpm 10. The sandbox test downloads a local NEAR node on first run and builds OpenSSL from source (needs a C compiler, make and perl).

Run everything locally, from the repository root:

```sh
# contracts: unit tests
(cd contracts/consume && cargo test)

(cd contracts/mock-intents && cargo test)

# build the wasm files
(cd contracts/consume && cargo near build non-reproducible-wasm)
(cd contracts/mock-meme && cargo near build non-reproducible-wasm)
(cd contracts/mock-intents && cargo near build non-reproducible-wasm)

# end-to-end on a local NEAR sandbox, plain NEP-141: a feeding without storage
# credit is refunded, feed, refund over cap, Bond, collect, redeem with
# exact payouts, a failed payout kept as owed, then paid on retry
(cd contracts/integration-tests && cargo test --test flow -- --nocapture)

# end-to-end through the NEAR Intents stand-in: simulated arrival, feed with
# mt_transfer_call, refunds into the Intents balance, collect, redeem paid by
# mt_transfer, simulated withdrawal
(cd contracts/integration-tests && cargo test --test intents)

# web app (shows sample figures until a contract is configured)
(cd web && pnpm install && pnpm dev)
```

Expected: 50 CONSUME unit tests and 3 mock-intents unit tests pass; both sandbox tests pass.

### Launch on testnet

Three scripts in `scripts/` (Node.js 24, the [`near` CLI](https://github.com/near/near-cli-rs)); none of them reads or stores a key:

```sh
# every argument of the one-time `new` call, from the same memecoin list the site uses
node scripts/launch-args.mjs --guardian you.testnet --assayer you.testnet --intents intents.you.testnet

# the Assayer: prints the ten prices it would post (live mainnet 1Click dry quotes); --send posts them
node scripts/assayer.mjs

# the whole testnet launch as a list of near commands; nothing is sent without --send
node scripts/testnet-launch.mjs --payer you.testnet --site https://your-site.example
```

## Repository layout

```
contracts/
  consume/            the CONSUME contract (token, Bonds, Stomach)
    src/meal.rs       feeding: pricing, caps, the tithe, the feast, minting a Bond
    src/intents.rs    feeding from NEAR Intents (mt_on_transfer)
    src/vest.rs       collect and break the seal
    src/redeem.rs     redeem and payouts
    src/lib.rs        state, launch (`new`), the guardian's three methods, views
    src/standards.rs  NEP-141 / NEP-171 interfaces
    src/math.rs       fixed-point arithmetic (256-bit intermediates)
  mock-intents/       testnet stand-in for NEAR Intents (NEP-245), simulated deposits and withdrawals
  mock-meme/          testnet stand-in for a plain NEP-141 memecoin, with a faucet
  integration-tests/  near-workspaces sandbox tests of both flows
web/                  Next.js app (the woodcut site)
scripts/              launch arguments, the Assayer, the testnet launch plan
```

Contract method names stay plain (`claim`, `exit`, `redeem`); the site uses the story's words (Feed, Bond, Collect, Break the seal, Redeem).

## Built with

near-sdk 5.30 and near-contract-standards, near-workspaces, the `uint` crate, Next.js 16.4, React 19.3 and TypeScript 6, @hot-labs/near-connect, Google Fonts (UnifrakturMaguntia, IM Fell English). All artwork (the serpent, the stomach's jars, the coins, the emblems) is drawn in code for this project; the coin designs are original heraldic devices, not the memecoins' logos.

**AI disclosure:** this project was written with AI coding assistance (Claude Code), and reviewed twice with a second model (OpenAI Codex). Its security findings are fixed above, except those listed as known and not fixed.

## Also by this author

Second entry by the same builder, independent of and sharing no code with **OneUp** (https://oneup.markets), a perps DEX also entered in NEAR HACKATHON.

## License

MIT, see [LICENSE](LICENSE).
