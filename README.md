# CONSUME

**A memecoin that eats other memecoins.** Built at NEAR HACKATHON (memecoins track).

Feed it a memecoin from another chain (DOGE, PEPE, SHIB and seven more). It keeps the coin for good and pays you in $CONSUME through an **Indulgence**, an NFT that releases your $CONSUME over 30 days. Every $CONSUME can later be burned (**Redeem**) for its share of everything in its stomach. So $CONSUME is a memecoin backed by a growing basket of other memecoins.

> Status: contracts and web app work locally (unit tests and an end-to-end sandbox test pass). Testnet deployment, the hosted demo and the price feeder are in progress. This README will link the live contract and demo once deployed.

## The problem

Most memecoins are a ticker and a chart: nothing backs them, insiders dump on launch, and a dead coin leaves holders with nothing. CONSUME turns that around. New $CONSUME only exists when real coins are fed to it, every token is a pro-rata claim on the basket it ate (a backing, not a guaranteed price), early buyers cannot sell everything on day one (leaving early forfeits half of what is still locked), and paper hands pay the patient.

## How it works

| Step | What happens | Contract method |
| --- | --- | --- |
| Storage credit | Feeders prepay a little NEAR for the storage their Indulgences use. The site adds 0.1 NEAR with your first feeding; unused credit can be taken back. | `add_meal_credit()`, `withdraw_meal_credit()` |
| Feed | Send one of the ten memecoins to the contract: from your NEAR Intents balance with `mt_transfer_call` on the Intents contract, or as a plain NEP-141 with `ft_transfer_call` (each memecoin is set to one or the other). It is valued at the current price, capped per feeding and per day, and kept in the Stomach. Anything over the cap is refunded. `msg` may be JSON `{"recipient", "min_consume", "deadline_ns"}`; the site always sends a minimum (99% of the quote) and a ten-minute deadline, so a famine landing while your wallet is open refunds you instead of paying half. | `mt_on_transfer`, `ft_on_transfer` |
| Indulgence | You receive an Indulgence NFT (NEP-171) that releases $CONSUME linearly over 30 days to whoever holds it. Indulgences can be sold or transferred, and the lock goes with them. | minted inside the feeding |
| Collect | The Indulgence's holder collects what has been released so far. | `claim(token_id)` |
| Break the seal | Leave early: take what has been released plus half of the rest. The other half is never minted, which raises every remaining holder's share. | `exit(token_id)` (1 yoctoNEAR) |
| Redeem | Burn $CONSUME and receive your pro-rata share of every memecoin in the Stomach, paid out in the memecoins themselves (into your NEAR Intents balance for Intents memecoins, from where they can be withdrawn to their home chain). Shares are measured against all $CONSUME including what is still locked in Indulgences, so nobody can empty the Stomach before later Indulgences unlock. | `redeem(amount)` (1 yoctoNEAR) |
| Retry | If a payout fails (for example you are not registered on a plain NEP-141 memecoin), it stays owed to you. | `withdraw_owed()` |

Rules enforced by the contract:

- **Famine:** the rate starts at 1000 $CONSUME per dollar fed and halves every $10,000 consumed, so early feedings earn the most. Rates are kept in 18-decimal units, so halvings are exact (125 becomes 62.5) and a feeding that crosses a halving is paid at each rate for the part on each side. A feeding that would mint nothing is refused.
- **Feast:** the memecoin fed most (by USD) in a week pays 1.5× the following week.
- **Caps:** each memecoin has a largest feeding and a daily limit, smaller for thin markets (the NEAR-native coins). They limit how much a bad price can cost per day; they do not make a bad price harmless.
- **Stale prices are refused:** feedings revert if the price is more than 15 minutes old.

## The ten memecoins

The contract eats whatever list of tokens its owner configures; the site offers these ten. All ten were routable through NEAR Intents from their home chains on 2026-11-09 (1Click dry quotes of $100 into USDC each returned a route; WIF, MOG and BRETT did not, so they were left out). The site re-checks this live: the "From any chain" section calls `/api/routes`, which asks 1Click for a free dry quote per memecoin (cached five minutes) and shows which routes are open and what $100 comes out as. On mainnet the Stomach holds them in its NEAR Intents balance (`intents.near`), under their real Intents token ids such as `nep141:eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near` for PEPE. Bringing a memecoin into your Intents balance from its home chain is a normal Intents deposit; the site does not run it for you on mainnet.

### NEAR Intents on testnet

NEAR Intents has no testnet, so `contracts/mock-intents` is a stand-in with the same calls CONSUME uses, checked against [near/intents](https://github.com/near/intents): NEP-245 `mt_transfer` and `mt_transfer_call` (1 yoctoNEAR, approvals refused, as on mainnet), the `mt_on_transfer` receiver call with refunds through `mt_resolve_transfer`, and `mt_balance_of` / `mt_batch_balance_of`. It uses the real mainnet token ids. Only the cross-chain legs are simulated:

- `simulate_deposit(token_id, from_chain)` credits your Intents balance as if the memecoin had arrived from its chain (once an hour per memecoin). The site's button reads "Bring test PEPE from Ethereum".
- `simulate_withdraw(token_id, amount, to_address)` burns a balance as if it had been sent home. The site's "Send to Ethereum" does this after a redemption.

Feeding, the Indulgence, collecting and redeeming are the real contract, and the same CONSUME code runs against `intents.near` on mainnet. Set `NEXT_PUBLIC_INTENTS_CONTRACT` to the mock (testnet) or `intents.near` (mainnet) to switch the site to this flow; without it the site uses the plain NEP-141 stand-ins in `contracts/mock-meme` and their faucet.

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
- **One contract, three standards:** $CONSUME (NEP-141 + NEP-145 + NEP-148), Indulgences (NEP-171 + NEP-177 metadata + NEP-178 approvals + NEP-181 enumeration) and the Stomach itself. A feeding arrives as one `ft_transfer_call` from the memecoin's token; minting, vesting and the redemption accounting all happen inside this one contract, and only payouts call back out.
- **Indulgences are NFTs that hold value:** the vesting position travels with the NFT.
- **Cheap storage and ~1 s blocks** make one NFT per feeding practical.

## Trust assumptions (read this)

There are four things you trust, and none of them is "the Stomach is safe no matter what":

1. **The Assayer (price feeder)** posts USD prices, read from NEAR Intents 1Click dry quotes. It cannot move anything in the Stomach, but a wrong price over- or under-pays feedings, up to each memecoin's per-feeding and daily caps. Overpaid $CONSUME is a claim on everyone else's share.
2. **The owner** can add memecoins, change caps, seal a memecoin and replace the Assayer. It has no function that withdraws from the Stomach, and a memecoin's decimals cannot change once added. But a malicious owner could list a fake token, or appoint a dishonest Assayer, and mint $CONSUME that redeems for real memecoins. The owner role is meant to pass to a DAO (`set_owner`).
3. **NEAR Intents and the whitelisted token contracts** themselves (`intents.near` and the bridged tokens on mainnet; the stand-ins on testnet). The Stomach's Intents memecoins sit in CONSUME's balance on the Intents contract. Only the Intents contract can feed an Intents memecoin, and which contract that is cannot change once one has been eaten.
4. **The deployment keys.** Until the contract account's full-access keys are deleted, whoever holds them can deploy different code. The README will say here when that has been done.

## Security notes

Protections in the contract, each with a unit test:

- **No cashable sponsorship:** when collecting registers you on $CONSUME at the contract's expense, that registration can never be unregistered for a refund.
- **Indulgences are locked mid-transfer:** while an `nft_transfer_call` is unresolved, the Indulgence cannot be collected or broken, so a receiver cannot drain it and hand it back.
- **Feeders pay their own storage** through prepaid credit, so feedings cannot run the contract out of NEAR.
- **No silent zero payouts, minimum output and deadline** on feedings, and frozen decimals per memecoin.
- **Intents feedings only from the Intents contract**, one memecoin per call and only `nep141:` tokens. A memecoin set to Intents cannot be fed as a plain NEP-141 (or the other way round), and neither that setting nor the Intents contract can change once it has eaten, so the Stomach's custody cannot be moved.
- The testnet stand-in tokens disable unregistering, so their free registrations cannot be cashed out either.

## Try it

Testnet deployment and hosted demo: coming soon (links will be added here).

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
# credit is refunded, feed, refund over cap, Indulgence, collect, redeem with
# exact payouts, a failed payout kept as owed, then paid on retry
(cd contracts/integration-tests && cargo test --test flow -- --nocapture)

# end-to-end through the NEAR Intents stand-in: simulated arrival, feed with
# mt_transfer_call, refunds into the Intents balance, collect, redeem paid by
# mt_transfer, simulated withdrawal
(cd contracts/integration-tests && cargo test --test intents)

# web app (shows sample figures until a contract is configured)
(cd web && pnpm install && pnpm dev)
```

Expected: 30 CONSUME unit tests and 3 mock-intents unit tests pass; both sandbox tests pass.

## Repository layout

```
contracts/
  consume/            the CONSUME contract (token, Indulgences, Stomach)
    src/meal.rs       feeding: pricing, caps, halvings, the feast bonus, minting an Indulgence
    src/intents.rs    feeding from NEAR Intents (mt_on_transfer)
    src/vest.rs       collect and break the seal
    src/redeem.rs     redeem and payouts
    src/standards.rs  NEP-141 / NEP-171 interfaces
    src/math.rs       fixed-point arithmetic (256-bit intermediates)
  mock-intents/       testnet stand-in for NEAR Intents (NEP-245), simulated deposits and withdrawals
  mock-meme/          testnet stand-in for a plain NEP-141 memecoin, with a faucet
  integration-tests/  near-workspaces sandbox tests of both flows
web/                  Next.js app (the woodcut site)
```

Contract method names stay plain (`claim`, `exit`, `redeem`); the site uses the story's words (Feed, Indulgence, Collect, Break the seal, Redeem).

## Built with

near-sdk 5.30 and near-contract-standards, near-workspaces, the `uint` crate, Next.js 16.4, React 19.3 and TypeScript 6, @hot-labs/near-connect, Google Fonts (UnifrakturMaguntia, IM Fell English). All artwork (the serpent, the stomach's jars, the coins, the emblems) is drawn in code for this project; the coin designs are original heraldic devices, not the memecoins' logos.

**AI disclosure:** this project was written with AI coding assistance (Claude Code), and reviewed with a second model (OpenAI Codex) whose security findings are fixed above.

## Also by this author

Second entry by the same builder, independent of and sharing no code with **OneUp** (https://oneup.markets), a perps DEX also entered in NEAR HACKATHON.

## License

MIT, see [LICENSE](LICENSE).
