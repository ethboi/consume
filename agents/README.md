# CONSUME for agents

Everything the site can do, an agent can do: read the contract, quote a feeding or a redemption, and get the exact calls to sign. There are two ways in, and both run the same code (`web/src/lib/mcp.ts`).

Nothing in this folder holds a key. The MCP server only reads and prepares. The bots print what they would do and sign only when you add `--send`, with the `near` CLI and the key already in your own keychain.

Needs Node.js 22.18 or newer (it runs the TypeScript source directly). No install step and no dependencies.

## The MCP server

**Over HTTP**, from the site. No key, no sign-in:

```
https://consume.cash/api/mcp
```

```sh
claude mcp add --transport http consume https://consume.cash/api/mcp
```

**Over stdio**, from this repository:

```sh
node agents/mcp.mjs
```

```sh
claude mcp add consume -- node /path/to/consume/agents/mcp.mjs
```

The repository's `.mcp.json` already names the stdio server, so Claude Code offers it when opened here.

Both read the public testnet deployment (`consume.consumecash.testnet`). To point the stdio server elsewhere set `CONSUME_CONTRACT`, `CONSUME_INTENTS`, `CONSUME_NETWORK` and `CONSUME_RPC`.

### Tools

| Tool | What it answers |
| --- | --- |
| `overview` | What CONSUME is and its state now: the Stomach, the backing of each $CONSUME, the tithe, the Feast, when the week ends, whether prices are fresh, the fixed rules |
| `list_memecoins` | The ten memecoins: price, price age, largest feeding, daily cap, how much is in the Stomach |
| `feast_race` | This week's standings, who is feasting now, time left |
| `quote_feeding` | What a feeding would mint right now, by amount or by dollar value |
| `quote_redeem` | What burning some $CONSUME would pay, memecoin by memecoin |
| `account` | An account's NEAR, $CONSUME, memecoins ready to feed, Bonds and anything owed |
| `bond` | One Bond: collected, ready, locked, and what breaking the seal would give and forfeit |
| `recent_feedings` | The latest feedings, newest first |
| `ledger` | The log of every feeding, every $CONSUME minted and every $CONSUME burned, each with its transaction, and whether the entries add up to the totals the contract keeps (when they do not, the list is short: its limits are in the main README under "Every mint and burn, logged") |
| `prepare_feed` | The unsigned calls for a feeding, with the quote, the slippage floor and a ten minute deadline |
| `prepare_collect` | The unsigned call that collects what a Bond has released |
| `prepare_break_seal` | The unsigned call that breaks a Bond's seal, with what is forfeited |
| `prepare_redeem` | The unsigned call that burns $CONSUME for memecoins, with the quote |
| `prepare_test_deposit` | Testnet only: the call that brings free test memecoins |

Each `prepare_*` answer carries `calls` (contract, method, arguments, deposit in yoctoNEAR, gas) for a wallet, and `near_cli`, the same calls as `near` command lines. A plan that would fail says why under `warnings`.

### Try it without a client

```sh
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"hand","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"feast_race","arguments":{}}}' \
  | node agents/mcp.mjs
```

## The bots

```sh
node agents/bots.mjs herald
node agents/bots.mjs collector --as you.testnet --min 100
node agents/bots.mjs feeder    --as you.testnet --usd 25
node agents/bots.mjs kingmaker --as you.testnet --symbol SHITZU --budget 50
```

| Bot | What it does |
| --- | --- |
| `herald` | Reads only. Reports the Stomach, the backing, the Feast race, and what needs attention: old prices, a close race, a week about to end, a tithe step coming |
| `collector` | Collects the $CONSUME your Bonds have released, for every Bond with at least `--min` ready |
| `feeder` | Feeds a set dollar amount. With no `--symbol` it feeds the memecoin that is feasting (no tithe), or else the one you hold most of. `--max-tithe 5` waits while the tithe is above 5% |
| `kingmaker` | Plays the Feast race: in the last `--within` hours of the week (default 6) it feeds just enough of one memecoin to take the lead, if that fits `--budget`. Earlier it waits. `--now` feeds at once |

Common flags: `--send` to sign, `--every 600` to keep running, `--json` for one JSON object per round, `--bring` to take test memecoins first (testnet), `--contract`, `--intents`, `--network`, `--rpc` for another deployment. On mainnet `--send` also needs `--mainnet`.

What a dry run looks like:

```
$ node agents/bots.mjs kingmaker --as you.testnet --symbol SHITZU --budget 50
kingmaker  Nothing to do. SHITZU is $6.10 behind PEPE with 37 hours left. Taking the lead
           would cost $6.12. Waiting for the last 6 hours of the week (--now feeds at once).
```

Three things the bots are careful about:

- A plan with a warning is never sent. If the account is short of the memecoin, or does not hold the Bond, the bot says so and signs nothing.
- A feeding the contract refuses still succeeds as a transaction, because the memecoins are returned. So after a feeding the bot looks for the new Bond and says plainly if there is none.
- No bot ever breaks a seal or redeems. Those are for a person, or for an agent that has been told to.

## Why the kingmaker is here

The Feast is a game: the most fed memecoin of the week pays no tithe the next. The cheapest way to play it is to wait until the last hours and feed just past the leader, and the simulation in `sim/` shows that a reigning Feast tends to keep its crown. We would rather ship that strategy in the open, where every community can run it, than leave it to whoever writes the script first. What it can take is bounded: the winner skips the tithe, mints exactly at the backing like everyone else, and is still held to that memecoin's daily cap.
