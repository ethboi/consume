# Judge demo and evidence

Start at [consume.cash/demo](https://consume.cash/demo). The intended tracks are Memecoins With Mechanics and NFTs That Do Something. Track selection here does not establish submission status.

## One complete moment

The short story is **feed → Bond → transfer → recipient collects → redeem**. Set up two NEAR testnet wallets before recording, each with at least 0.2 test NEAR. The second wallet must exist; a NEAR account name is not an Ethereum or Solana address. Use free test memecoins only.

| Time | Show | Say |
| --- | --- | --- |
| 0–10 s | The Stomach and Feast | “Memecoin communities compete to feed a shared basket. The weekly winner pays no tithe the following week.” |
| 10–25 s | A $10 PEPE quote and the wallet approval | “Feeding earns a claim on the basket, less the shown tithe. Testnet arrivals are simulated.” |
| 25–40 s | The new Bond, then Send this Bond and its confirmation | “This NFT holds the vesting claim. Sending spends 0.01024 NEAR of credit; any top-up is shown before signing.” |
| 40–60 s | Switch to the recipient; show the same Bond and Collect | “Ownership carries the uncollected payout and unchanged 30-day schedule. The new holder receives the tokens.” |
| 60–80 s | Early-exit preview if needed, then the redemption basket | “To finish immediately, I can forfeit half of the locked part. Burning collected $CONSUME returns its share of the basket.” |
| 80–90 s | Successful transaction and Ledger, then source link | “The rules run in a NEAR contract. Here are the public code and transaction receipts.” |

These timings are an editing plan, not a claim about wallet latency. Do not edit a rejected transaction into a successful outcome. Keep any wait or cut explicit. Show “NEAR testnet · test tokens · simulated cross-chain arrival” throughout. A real wallet recording has not yet been captured. Screenshots are also accepted for a hosted demo under the [official rules](https://nearhackathon.com/HACKATHON.md).

## What is verified

The deployed demo/transfer release passed 13 web unit tests, 21 sample browser tests and 21 sandbox browser tests, plus TypeScript, lint and production builds. The contract code was unchanged.

The follow-up local regression pass adds [14 transfer tests](../web/e2e/transfer.spec.ts), bringing the sandbox browser suite to 35. All 35 passed, alongside the 21 sample tests, 74 contract unit tests, 13 web unit tests, both contract sandbox flows, three WASM builds, TypeScript, lint, production builds, the four simulation scenarios and the MCP handshake. Eight read-only checks of the existing live deployment also passed. The regressions exposed a wallet-switch race and unclear disconnect recovery; the local fix rechecks the connected account and pins the reviewed signer before requesting a signature. These follow-up changes have not been deployed, and a real browser-wallet signing session remains unverified.

- [The README’s testnet receipts](../README.md#seen-on-testnet) cover feeding, collection, early exit and redemption through the deployed test Intents contract.
- [The release record](RELEASE-2026-11-11.md) identifies the currently deployed contract bytes and preserved state.
- [The browser suite](../web/e2e/chain.spec.ts) exercises the web interface against those contract sources on a local NEAR sandbox. Its injected wallet signs with sandbox keys. This establishes interface behavior, not third-party wallet compatibility or public-chain execution.
- The transfer interface supports direct transfers, with recipient validation, a review step, funded storage and an explorer receipt. It does not perform a sale. Marketplace compatibility remains unverified.

The hosted page and this guide must not describe unrecorded actions as proof. On 2026-11-11 the builder ran a $1 test PEPE feeding and an ownership handoff on the public testnet, using the NEAR CLI and existing project keychains:

| Step | Public receipt | Verified result |
| --- | --- | --- |
| Feed | [2B1eep…qw7ny](https://testnet.nearblocks.io/txns/2B1eepnMtrvRwpDarzNBWgn1N9Qxnm44rbtUftpqw7ny) | New Bond 26 minted to `consumecash.testnet`. |
| Transfer | [96Uyw8…jREjY](https://testnet.nearblocks.io/txns/96Uyw8uJV6F2V49bTwDiBih5gSBkXPo2k7ctekSjREjY) | Owner became `pilgrim.consumecash.testnet`; stored vesting state was unchanged. Exactly 0.01024 NEAR was deducted from the sender’s storage credit. |
| Recipient collects | [4hN5JL…y2VYt](https://testnet.nearblocks.io/txns/4hN5JL3JGMNWh6cLbuWDFFtTaqFcCE7WpwmGn4ny2VYt) | `claim` paid 0.009801989231199044 $CONSUME to the recipient. Their balance increased by that amount; the sender’s balance did not change. |

[Machine-readable before/after evidence](evidence/bond-26-transfer.json) records the exact values and calls. Both accounts belong to the builder. This is public-chain execution evidence, not independent adoption or a third-party browser-wallet recording. The new web interface is covered separately by the sandbox browser tests, including rejection of a former holder’s claim.

## Independent feedback

No independent feedback has been collected for this update. Builder accounts and automated bots are not independent users.

Invite three to five people who did not build the project to try the funded-wallet walkthrough. Give them the public guide, avoid coaching until they get stuck, and collect these observations with their permission:

1. Can they explain what they receive, what they pay and what happens on early exit?
2. Can they feed, find their Bond, transfer it and redeem without help? Record the step where they stop and time to finish, excluding wallet/faucet setup.
3. Does the Feast give them a reason to participate instead of keeping their coins? Record their reason in their own words; do not prompt for a positive answer.
4. Do they understand that the current bridge is simulated, prices are trusted and no return or resale is guaranteed?

Keep a dated, anonymized result table with participant count, completed flows, observed friction and resulting changes. Publish only observations actually collected and consented to; never count screenshots of builder bots as adoption.
