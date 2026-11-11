//! A price round that carries the Assayer's quotes, on a local NEAR sandbox.
//!
//! `scripts/assayer.mjs` sends each round as `set_prices` with a second
//! argument, `round`, beside `prices`: the 1Click quotes it read. The contract
//! has no such parameter. This test shows that it takes the prices exactly as
//! before and keeps nothing of `round`, so the quotes are a public note in the
//! transaction and never an input to the contract.
//!
//! Build the wasm first, as for `flow.rs`. Set `CONSUME_WASM` to run against
//! another build of the contract, for example the code downloaded from the
//! live account:
//!   near contract download-wasm regular consume.consumecash.testnet save-to-file /tmp/live.wasm network-config testnet now
//!   CONSUME_WASM=/tmp/live.wasm cargo test --test round

use near_workspaces::types::NearToken;
use serde_json::{json, Value};

const USD: u128 = 1_000_000;

#[tokio::test]
async fn a_round_with_quotes_sets_the_same_prices_and_stores_nothing_else() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let wasm_path = std::env::var("CONSUME_WASM").unwrap_or_else(|_| "../target/near/consume/consume.wasm".into());
    println!("contract under test: {wasm_path}");

    let pepe = root.create_subaccount("pepe").initial_balance(NearToken::from_near(1)).transact().await?.into_result()?;
    let consume_acc = root.create_subaccount("consume").initial_balance(NearToken::from_near(30)).transact().await?.into_result()?;
    let consume = consume_acc.deploy(&std::fs::read(&wasm_path)?).await?.into_result()?;
    let assayer = root.create_subaccount("assayer").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    let stranger = root.create_subaccount("stranger").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    consume
        .call("new")
        .args_json(json!({ "config": {
            "guardian_id": null, "price_feeder_id": assayer.id(),
            "start_rate": "1000", "famine_usd": (10_000 * USD).to_string(),
            "tithe_step_bps": 100, "max_tithe_bps": 1000,
            "vest_duration_ns": "36000000000000",
            "exit_haircut_bps": 5000,
            "max_price_age_ns": "900000000000",
            "min_meal_usd": USD.to_string(),
            "epoch_ns": "604800000000000",
            "media_base": null
        }, "tribes": [
            { "token_id": pepe.id(), "symbol": "PEPE", "decimals": 18,
              "max_meal_usd": (1_000 * USD).to_string(), "daily_cap_usd": (5_000 * USD).to_string() },
        ]}))
        .transact()
        .await?
        .into_result()?;

    let tribe = |tribes: &Value| tribes.as_array().unwrap().iter().find(|t| t[0] == pepe.id().as_str()).unwrap()[1].clone();
    let round = json!({
        "read_at": "2026-11-11T21:00:00.000Z",
        "source": "NEAR Intents 1Click: a dry quote of $100 of each memecoin into USDC",
        "quotes": [{ "symbol": "PEPE", "token": pepe.id(), "quoted_usd": "0.000005", "listed_usd": "0.00000501" }]
    });

    // 1. A plain round, as rounds were sent before.
    assayer
        .call(consume.id(), "set_prices")
        .args_json(json!({ "prices": [[pepe.id(), "5000000000000"]] }))
        .transact()
        .await?
        .into_result()?;
    let plain: Value = consume.view("get_tribes").await?.json()?;
    assert_eq!(tribe(&plain)["price_e18"], "5000000000000");
    let storage_plain = consume.view_account().await?.storage_usage;

    // 2. The same call with the quotes beside the prices. The price it names is
    //    set, the round's own figures change nothing, and no byte is stored.
    let with_quotes = assayer
        .call(consume.id(), "set_prices")
        .args_json(json!({ "prices": [[pepe.id(), "6000000000000"]], "round": round }))
        .transact()
        .await?
        .into_result()?;
    assert!(with_quotes.logs().is_empty(), "set_prices logs nothing, with or without the quotes");
    let after: Value = consume.view("get_tribes").await?.json()?;
    assert_eq!(tribe(&after)["price_e18"], "6000000000000", "the posted price is the one in `prices`, not the one in `round`");
    assert_eq!(consume.view_account().await?.storage_usage, storage_plain, "the quotes are not stored");

    // 3. The quotes open nothing: anyone but the Assayer is refused as before.
    let refused = stranger
        .call(consume.id(), "set_prices")
        .args_json(json!({ "prices": [[pepe.id(), "1"]], "round": round }))
        .transact()
        .await?;
    let why = format!("{:?}", refused.into_result().expect_err("only the Assayer posts prices"));
    assert!(why.contains("Only the price feeder"), "{why}");
    let last: Value = consume.view("get_tribes").await?.json()?;
    assert_eq!(tribe(&last)["price_e18"], "6000000000000");
    Ok(())
}
