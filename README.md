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
| Feed | Send one of the ten memes to the contract with `ft_transfer_call`. It is valued at the current price, capped per feeding and per day, and kept in the Stomach. Anything over the cap is refunded. `msg` may be JSON `{"recipient", "min_consume", "deadline_ns"}`; the site always sends a minimum (99% of the quote) and a ten-minute deadline, so a famine landing while your wallet is open refunds you instead of paying half. | `ft_on_transfer` |
| Indulgence | You receive an Indulgence NFT (NEP-171) that releases $CONSUME linearly over 30 days to whoever holds it. Indulgences can be sold or transferred, and the lock goes with them. | minted inside `ft_on_transfer` |
| Collect | The Indulgence's holder collects what has been released so far. | `claim(token_id)` |
| Break the seal | Leave early: take what has been released plus half of the rest. The other half is never minted, which raises every remaining holder's share. | `exit(token_id)` (1 yoctoNEAR) |
| Redeem | Burn $CONSUME and receive your pro-rata share of every meme in the Stomach, paid out in the memes themselves. Shares are measured against all $CONSUME including what is still locked in Indulgences, so nobody can empty the Stomach before later Indulgences unlock. | `redeem(amount)` (1 yoctoNEAR) |
| Retry | If a payout fails (for example you are not registered on that meme's token), it stays owed to you. | `withdraw_owed()` |

Rules enforced by the contract:

- **Famine:** the rate starts at 1000 $CONSUME per dollar fed and halves every $10,000 consumed, so early feedings earn the most. Rates are kept in 18-decimal units, so halvings are exact (125 becomes 62.5) and a feeding that crosses a halving is paid at each rate for the part on each side. A feeding that would mint nothing is refused.
- **Feast:** the meme fed most (by USD) in a week pays 1.5× the following week.
- **Caps:** each meme has a largest feeding and a daily limit, smaller for thin markets (the NEAR-native coins). They limit how much a bad price can cost per day; they do not make a bad price harmless.
- **Stale prices are refused:** feedings revert if the price is more than 15 minutes old.

## The ten memes

The contract eats whatever list of tokens its owner configures; the site offers these ten. All ten were routable through NEAR Intents from their home chains on 2026-11-09 (1Click dry quotes of $100 into USDC each returned a route; WIF, MOG and BRETT did not, so they were left out). On mainnet the Stomach holds their Intents-bridged NEP-141 tokens; on testnet it holds stand-in tokens with the same decimals and a faucet. Getting the meme onto NEAR is up to the feeder (for example a 1Click swap or withdrawal to your NEAR account); the site does not run that swap for you.

| Meme | Home chain | Mainnet token on NEAR |
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

- **NEAR Intents** brings memes from Dogecoin, Ethereum and Solana into one NEAR account, so a single contract can hold a cross-chain basket without a bridge per chain.
- **One contract, three standards:** $CONSUME (NEP-141 + NEP-145 + NEP-148), Indulgences (NEP-171 + NEP-177 metadata + NEP-178 approvals + NEP-181 enumeration) and the Stomach itself. A feeding arrives as one `ft_transfer_call` from the meme's token; minting, vesting and the redemption accounting all happen inside this one contract, and only payouts call back out.
- **Indulgences are NFTs that hold value:** the vesting position travels with the NFT.
- **Cheap storage and ~1 s blocks** make one NFT per feeding practical.

## Trust assumptions (read this)

There are four things you trust, and none of them is "the Stomach is safe no matter what":

1. **The Assayer (price feeder)** posts USD prices, read from NEAR Intents 1Click dry quotes. It cannot move anything in the Stomach, but a wrong price over- or under-pays feedings, up to each meme's per-feeding and daily caps. Overpaid $CONSUME is a claim on everyone else's share.
2. **The owner** can add memes, change caps, seal a meme and replace the Assayer. It has no function that withdraws from the Stomach, and a meme's decimals cannot change once added. But a malicious owner could list a fake token, or appoint a dishonest Assayer, and mint $CONSUME that redeems for real memes. The owner role is meant to pass to a DAO (`set_owner`).
3. **The whitelisted token contracts** themselves (the Intents-bridged tokens on mainnet, the stand-ins on testnet).
4. **The deployment keys.** Until the contract account's full-access keys are deleted, whoever holds them can deploy different code. The README will say here when that has been done.

## Security notes

Protections in the contract, each with a unit test:

- **No cashable sponsorship:** when collecting registers you on $CONSUME at the contract's expense, that registration can never be unregistered for a refund.
- **Indulgences are locked mid-transfer:** while an `nft_transfer_call` is unresolved, the Indulgence cannot be collected or broken, so a receiver cannot drain it and hand it back.
- **Feeders pay their own storage** through prepaid credit, so feedings cannot run the contract out of NEAR.
- **No silent zero payouts, minimum output and deadline** on feedings, and frozen decimals per meme.
- The testnet stand-in tokens disable unregistering, so their free registrations cannot be cashed out either.

## Try it

Testnet deployment and hosted demo: coming soon (links will be added here).

Prerequisites: Rust (stable) with the `wasm32-unknown-unknown` target, [cargo-near](https://github.com/near/cargo-near) 0.22 or newer, Node.js 22 or newer and pnpm 10. The sandbox test downloads a local NEAR node on first run and builds OpenSSL from source (needs a C compiler, make and perl).

Run everything locally, from the repository root:

```sh
# contracts: unit tests
(cd contracts/consume && cargo test)

# build both wasm files
(cd contracts/consume && cargo near build non-reproducible-wasm)
(cd contracts/mock-meme && cargo near build non-reproducible-wasm)

# end-to-end on a local NEAR sandbox: a feeding without storage credit is refunded,
# feed, refund over cap, Indulgence, collect, redeem with exact payouts,
# a failed payout kept as owed, then paid on retry
(cd contracts/integration-tests && cargo test --test flow -- --nocapture)

# web app (shows sample figures until a contract is configured)
(cd web && pnpm install && pnpm dev)
```

Expected: 21 unit tests pass; the sandbox test prints the final stats and passes.

## Repository layout

```
contracts/
  consume/            the CONSUME contract (token, Indulgences, Stomach)
    src/meal.rs       feeding: pricing, caps, halvings, the feast bonus, minting an Indulgence
    src/vest.rs       collect and break the seal
    src/redeem.rs     redeem and payouts
    src/standards.rs  NEP-141 / NEP-171 interfaces
    src/math.rs       fixed-point arithmetic (256-bit intermediates)
  mock-meme/          testnet stand-in for an Intents-bridged meme, with a faucet
  integration-tests/  near-workspaces sandbox test of the full flow
web/                  Next.js app (the woodcut site)
```

Contract method names stay plain (`claim`, `exit`, `redeem`); the site uses the story's words (Feed, Indulgence, Collect, Break the seal, Redeem).

## Built with

near-sdk 5.30 and near-contract-standards, near-workspaces, the `uint` crate, Next.js 16.4, React 19.3 and TypeScript 6, @hot-labs/near-connect, Google Fonts (UnifrakturMaguntia, IM Fell English). All artwork (the serpent, the stomach's jars, the coins, the emblems) is drawn in code for this project; the coin designs are original heraldic devices, not the memes' logos.

**AI disclosure:** this project was written with AI coding assistance (Claude Code), and reviewed with a second model (OpenAI Codex) whose security findings are fixed above.

## Also by this author

Second entry by the same builder, independent of and sharing no code with **OneUp** (https://oneup.markets), a perps DEX also entered in NEAR HACKATHON.

## License

MIT, see [LICENSE](LICENSE).
