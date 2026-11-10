//! End-to-end on a local NEAR sandbox: real cross-contract calls between
//! CONSUME and two mock memes. Build the wasm first:
//!   (cd consume && cargo near build non-reproducible-wasm)
//!   (cd mock-meme && cargo near build non-reproducible-wasm)

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const USD: u128 = 1_000_000;

fn e(x: u128, decimals: u32) -> u128 {
    x * 10u128.pow(decimals)
}

async fn view(c: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(c.view(method).args_json(args).await?.json()?)
}

async fn balance(token: &Contract, who: &Account) -> anyhow::Result<u128> {
    let v = view(token, "ft_balance_of", json!({ "account_id": who.id() })).await?;
    Ok(v.as_str().unwrap().parse()?)
}

async fn deploy_meme(root: &Account, name: &str, symbol: &str, decimals: u8, faucet: u128) -> anyhow::Result<Contract> {
    let wasm = std::fs::read("../target/near/mock_meme/mock_meme.wasm")?;
    let acc = root.create_subaccount(name).initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    let c = acc.deploy(&wasm).await?.into_result()?;
    c.call("new")
        .args_json(json!({ "name": format!("Test {symbol}"), "symbol": symbol, "decimals": decimals, "faucet_amount": faucet.to_string() }))
        .transact()
        .await?
        .into_result()?;
    Ok(c)
}

#[tokio::test]
async fn offering_claim_redeem() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;

    let pepe = deploy_meme(&root, "pepe", "PEPE", 18, e(50_000_000, 18)).await?;
    let doge = deploy_meme(&root, "doge", "DOGE", 8, e(50_000, 8)).await?;

    let consume_acc = root.create_subaccount("consume").initial_balance(NearToken::from_near(30)).transact().await?.into_result()?;
    let consume = consume_acc.deploy(&std::fs::read("../target/near/consume/consume.wasm")?).await?.into_result()?;
    let owner = root.create_subaccount("owner").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    consume
        .call("new")
        .args_json(json!({ "config": {
            "guardian_id": owner.id(), "price_feeder_id": owner.id(),
            "start_rate": "1000", "famine_usd": (10_000 * USD).to_string(),
            "tithe_step_bps": 100, "max_tithe_bps": 1000,
            "vest_duration_ns": "20000000000",           // 20 s so the test can watch it vest
            "exit_haircut_bps": 5000,
            "max_price_age_ns": "3600000000000000",      // 1000 h: no feeder running here
            "min_meal_usd": USD.to_string(),
            "epoch_ns": "604800000000000",
            "media_base": null
        }, "tribes": [
            // the memecoin list and its caps are fixed here, at launch
            { "token_id": pepe.id(), "symbol": "PEPE", "decimals": 18,
              "max_meal_usd": (1_000 * USD).to_string(), "daily_cap_usd": (5_000 * USD).to_string() },
            { "token_id": doge.id(), "symbol": "DOGE", "decimals": 8,
              "max_meal_usd": (1_000 * USD).to_string(), "daily_cap_usd": (5_000 * USD).to_string() },
        ]}))
        .transact()
        .await?
        .into_result()?;

    // No admin key: the methods that used to change the list, the Intents
    // contract, the image base or the owner do not exist, and launching twice
    // is refused.
    for method in ["set_tribe", "set_intents_id", "set_media_base", "set_owner"] {
        let r = owner.call(consume.id(), method).args_json(json!({})).transact().await?;
        assert!(format!("{:?}", r.into_result().unwrap_err()).contains("MethodNotFound"), "{method} should not exist");
    }
    let again = consume.call("new").args_json(json!({ "config": consume.view("get_config").await?.json::<serde_json::Value>()?, "tribes": [] })).transact().await?;
    assert!(again.is_failure(), "the contract cannot be launched twice");
    owner
        .call(consume.id(), "set_prices")
        .args_json(json!({ "prices": [
            [pepe.id(), "5000000000000"],            // $0.000005
            [doge.id(), "70000000000000000"],        // $0.07
        ]}))
        .transact()
        .await?
        .into_result()?;
    // The reliquary must be registered on each meme token to receive it.
    for t in [&pepe, &doge] {
        owner.call(t.id(), "register").args_json(json!({ "account_id": consume.id() })).transact().await?.into_result()?;
    }

    let alice = root.create_subaccount("alice").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    let bob = root.create_subaccount("bob").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    alice.call(pepe.id(), "faucet").transact().await?.into_result()?;
    bob.call(doge.id(), "faucet").transact().await?.into_result()?;
    // feeders prepay the storage their Bonds use
    for who in [&alice, &bob] {
        who.call(consume.id(), "add_meal_credit")
            .args_json(json!({}))
            .deposit(NearToken::from_millinear(100))
            .transact()
            .await?
            .into_result()?;
    }

    // a feeding with no storage credit is refunded in full
    let carol = root.create_subaccount("carol").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    carol.call(pepe.id(), "faucet").transact().await?.into_result()?;
    carol
        .call(pepe.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": consume.id(), "amount": e(20_000_000, 18).to_string(), "msg": "" }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;
    assert_eq!(balance(&pepe, &carol).await?, e(50_000_000, 18), "refused feeding must be refunded");

    // Alice offers $100 of PEPE.
    alice
        .call(pepe.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": consume.id(), "amount": e(20_000_000, 18).to_string(), "msg": "" }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(balance(&pepe, &alice).await?, e(30_000_000, 18));
    let vest = view(&consume, "get_vest", json!({ "token_id": "1" })).await?;
    assert_eq!(vest["owner_id"], alice.id().to_string());
    assert_eq!(vest["vest"]["meal_usd"], (100 * USD).to_string());

    // Bob offers ~$3,500 of DOGE; the $1,000 meal cap refunds the rest.
    bob.call(doge.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": consume.id(), "amount": e(50_000, 8).to_string(), "msg": "" }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let bob_vest = view(&consume, "get_vest", json!({ "token_id": "2" })).await?;
    let eaten: u128 = bob_vest["vest"]["eaten"].as_str().unwrap().parse()?;
    assert_eq!(balance(&doge, &bob).await? + eaten, e(50_000, 8), "refund must come back to Bob");
    assert!(eaten < e(15_000, 8));

    // Let the vests run out, then Alice collects her due.
    worker.fast_forward(600).await?;
    alice.call(consume.id(), "claim").args_json(json!({ "token_id": "1" })).transact().await?.into_result()?;
    let alice_consume = balance(&consume, &alice).await?;
    assert_eq!(alice_consume, 99_000 * 10u128.pow(18));

    // Alice redeems everything. She is registered on PEPE but not on DOGE,
    // so her DOGE share must stay owed rather than vanish.
    let pepe_before = balance(&pepe, &alice).await?;
    let quote = view(&consume, "quote_redeem", json!({ "amount": alice_consume.to_string() })).await?;
    let share_of = |token: &Contract| -> u128 {
        quote["shares"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p[0] == token.id().to_string())
            .map(|p| p[1].as_str().unwrap().parse().unwrap())
            .unwrap_or(0)
    };
    let (pepe_share, doge_share) = (share_of(&pepe), share_of(&doge));
    assert!(pepe_share > 0 && doge_share > 0);
    alice
        .call(consume.id(), "redeem")
        .args_json(json!({ "amount": alice_consume.to_string() }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(balance(&pepe, &alice).await? - pepe_before, pepe_share, "exact PEPE share paid out");
    let owed = view(&consume, "get_owed", json!({ "account_id": alice.id() })).await?;
    assert_eq!(owed.as_array().unwrap().len(), 1, "DOGE share kept as owed: {owed}");
    assert_eq!(balance(&consume, &alice).await?, 0);

    // After registering on DOGE, the retry pays out.
    alice.call(doge.id(), "register").args_json(json!({ "account_id": alice.id() })).transact().await?.into_result()?;
    alice.call(consume.id(), "withdraw_owed").max_gas().transact().await?.into_result()?;
    assert_eq!(balance(&doge, &alice).await?, doge_share, "exact DOGE share paid on retry");
    let owed = view(&consume, "get_owed", json!({ "account_id": alice.id() })).await?;
    assert!(owed.as_array().unwrap().is_empty());

    let stats = view(&consume, "get_stats", json!({})).await?;
    println!("stats after the run: {stats:#}");
    Ok(())
}
