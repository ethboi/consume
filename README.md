# CONSUME

**A memecoin that eats other memecoins.** Built at NEAR HACKATHON (memecoins track).

Feed the Crucible a memecoin from another chain (DOGE, PEPE, SHIB and seven more). It keeps the coin for good and pays you in $CONSUME through a **Writ**, an NFT that releases your $CONSUME over 30 days. Every $CONSUME can later be burned (**Transmute**) for its share of everything the Crucible has eaten. So $CONSUME is a memecoin backed by a growing basket of other memecoins.

> Status: contracts and web app work locally (unit tests and an end-to-end sandbox test pass). Testnet deployment, the hosted demo and the price feeder are in progress. This README will link the live contract and demo once deployed.

## The problem

Most memecoins are a ticker and a chart: nothing backs them, insiders dump on launch, and a dead coin leaves holders with nothing. CONSUME turns that around. Its supply only grows when real coins are fed to it, every token has a floor (a share of the basket it ate), early sellers cannot dump on day one, and paper hands pay the patient.

## How it works

| Step | What happens | Contract method |
| --- | --- | --- |
| Feed | Send one of the ten memes to the contract with `ft_transfer_call`. It is valued at the current price, capped per feeding and per day, and kept in the Crucible. Anything over the cap is refunded. | `ft_on_transfer` |
| Writ | You receive a Writ NFT (NEP-171) that releases $CONSUME linearly over 30 days to whoever holds it. Writs can be sold or transferred. | minted inside `ft_on_transfer` |
| Collect | The Writ's holder collects what has been released so far. | `claim(token_id)` |
| Break the seal | Leave early: take what has been released plus half of the rest. The other half is never minted, which raises every remaining holder's share. | `exit(token_id)` (1 yoctoNEAR) |
| Transmute | Burn $CONSUME and receive your pro-rata share of every meme in the Crucible, paid out in the memes themselves. Shares are measured against all $CONSUME including what is still locked in Writs, so nobody can empty the Crucible before later Writs unlock. | `redeem(amount)` (1 yoctoNEAR) |
| Retry | If a payout fails (for example you are not registered on that meme's token), it stays owed to you. | `withdraw_owed()` |

Rules enforced by the contract:

- **Famine:** the rate starts at 1000 $CONSUME per dollar fed and halves every $10,000 consumed, so early feedings earn the most. A feeding that crosses a halving is paid at each rate for the part on each side.
- **Feast:** the meme fed most (by USD) in a week pays 1.5× the following week.
- **Caps:** each meme has a largest feeding and a daily limit. Thin markets (the NEAR-native coins) get small ones, so a manipulated price cannot be used to drain the Crucible.
- **Stale prices are refused:** feedings revert if the price is more than 15 minutes old.

## The ten memes

All ten are routable through NEAR Intents from their home chains (checked with 1Click dry quotes on 2026-11-09). On mainnet the Crucible holds their Intents-bridged NEP-141 tokens; on testnet it holds stand-in tokens with the same decimals and a faucet.

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
- **One contract, three standards:** $CONSUME (NEP-141 + NEP-145 + NEP-148), Writs (NEP-171 + NEP-177 metadata + NEP-178 approvals + NEP-181 enumeration) and the Crucible itself. Feeding, minting, vesting and redemption never need a cross-contract call except paying out shares.
- **Writs are NFTs that hold value:** the vesting position travels with the NFT.
- **Cheap storage and ~1 s blocks** make one NFT per feeding practical.

## Trust assumptions (read this)

- **The Assayer (price feeder)** is one account that posts USD prices, read from NEAR Intents 1Click dry quotes. It can set prices but cannot move anything in the Crucible. A wrong price could over- or under-pay one feeding, bounded by the per-feeding and daily caps. This is the one account users must trust.
- **The owner** can add memes, change caps, open or seal a meme, and change the Assayer. There is no owner function that withdraws from the Crucible. The owner role can be handed to a DAO or to the contract itself (`set_owner`).
- To make the code immutable after deployment, delete the contract account's full-access keys.

## Try it

Testnet deployment and hosted demo: coming soon (links will be added here).

Run everything locally:

```sh
# contracts: unit tests
cd contracts/consume && cargo test

# build both wasm files (needs cargo-near)
(cd contracts/consume && cargo near build non-reproducible-wasm)
(cd contracts/mock-meme && cargo near build non-reproducible-wasm)

# end-to-end on a local NEAR sandbox: feed, refund over cap, Writ, collect,
# transmute, meme payout, failed payout kept as owed then retried
cd contracts/integration-tests && cargo test --test flow -- --nocapture

# web app (shows sample figures until a contract is configured)
cd web && pnpm install && pnpm dev
```

Expected: 12 unit tests pass; the sandbox test prints the final stats and passes.

## Repository layout

```
contracts/
  consume/            the CONSUME contract (token, Writs, Crucible)
    src/meal.rs       feeding: pricing, caps, halvings, the feast bonus, minting a Writ
    src/vest.rs       collect and break the seal
    src/redeem.rs     transmute and payouts
    src/standards.rs  NEP-141 / NEP-171 interfaces
    src/math.rs       fixed-point arithmetic (256-bit intermediates)
  mock-meme/          testnet stand-in for an Intents-bridged meme, with a faucet
  integration-tests/  near-workspaces sandbox test of the full flow
web/                  Next.js app (the woodcut site)
```

Contract method names stay plain (`claim`, `exit`, `redeem`); the site uses the story's words (Collect, Break the seal, Transmute).

## Built with

near-sdk 5.30 and near-contract-standards, near-workspaces, the `uint` crate, Next.js 16 and React 19, @hot-labs/near-connect, Google Fonts (UnifrakturMaguntia, IM Fell English). All artwork (the serpent, the jars, the coins, the emblems) is drawn in code for this project; the coin designs are original heraldic devices, not the memes' logos.

**AI disclosure:** this project was written with AI coding assistance (Claude Code). All code was reviewed and tested by the author.

## Also by this author

Second entry by the same builder, independent of and sharing no code with **OneUp** (https://oneup.markets), a perps DEX also entered in NEAR HACKATHON.

## License

MIT, see [LICENSE](LICENSE).
