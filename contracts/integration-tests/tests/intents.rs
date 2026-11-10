//! CONSUME fed through the NEAR Intents mock on a local sandbox:
//! simulated bridge-in, mt_transfer_call feeding, claim, redeem paid back into
//! the Intents balance, simulated withdrawal. Build the wasm first:
//!   (cd consume && cargo near build non-reproducible-wasm)
//!   (cd mock-intents && cargo near build non-reproducible-wasm)

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const USD: u128 = 1_000_000;
const PEPE: &str = "eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near";
const DOGE: &str = "doge.omft.near";

fn e(x: u128, decimals: u32) -> u128 {
    x * 10u128.pow(decimals)
}

async fn view(c: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(c.view(method).args_json(args).await?.json()?)
}

async fn mt_balance(intents: &Contract, who: &str, token: &str) -> anyhow::Result<u128> {
    let v = view(intents, "mt_balance_of", json!({ "account_id": who, "token_id": format!("nep141:{token}") })).await?;
    Ok(v.as_str().unwrap().parse()?)
}

async fn feed(intents: &Contract, who: &Account, consume: &Contract, token: &str, amount: u128) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(who
        .call(intents.id(), "mt_transfer_call")
        .args_json(json!({ "receiver_id": consume.id(), "token_id": format!("nep141:{token}"), "amount": amount.to_string(), "msg": "" }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?)
}

#[tokio::test]
async fn feed_and_redeem_through_intents() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let owner = root.create_subaccount("owner").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;

    let intents_acc = root.create_subaccount("intents").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    let intents = intents_acc.deploy(&std::fs::read("../target/near/mock_intents/mock_intents.wasm")?).await?.into_result()?;
    intents.call("new").args_json(json!({ "owner_id": owner.id() })).transact().await?.into_result()?;
    for (token, drip) in [(PEPE, e(50_000_000, 18)), (DOGE, e(50_000, 8))] {
        owner
            .call(intents.id(), "set_drip")
            .args_json(json!({ "token_id": format!("nep141:{token}"), "amount": drip.to_string() }))
            .transact()
            .await?
            .into_result()?;
    }

    let consume_acc = root.create_subaccount("consume").initial_balance(NearToken::from_near(30)).transact().await?.into_result()?;
    let consume = consume_acc.deploy(&std::fs::read("../target/near/consume/consume.wasm")?).await?.into_result()?;
    consume
        .call("new")
        .args_json(json!({ "config": {
            "guardian_id": owner.id(), "price_feeder_id": owner.id(),
            "start_rate": "1000", "famine_usd": (10_000 * USD).to_string(),
            "tithe_step_bps": 100, "max_tithe_bps": 1000,
            "vest_duration_ns": "20000000000",
            "exit_haircut_bps": 5000,
            "max_price_age_ns": "3600000000000000",
            "min_meal_usd": USD.to_string(),
            "epoch_ns": "604800000000000",
            "media_base": null,
            "intents_id": intents.id(),
        }, "tribes": [
            { "token_id": PEPE, "symbol": "PEPE", "decimals": 18, "via_intents": true,
              "max_meal_usd": (1_000 * USD).to_string(), "daily_cap_usd": (5_000 * USD).to_string() },
            { "token_id": DOGE, "symbol": "DOGE", "decimals": 8, "via_intents": true,
              "max_meal_usd": (1_000 * USD).to_string(), "daily_cap_usd": (5_000 * USD).to_string() },
        ]}))
        .transact()
        .await?
        .into_result()?;
    owner
        .call(consume.id(), "set_prices")
        .args_json(json!({ "prices": [[PEPE, "5000000000000"], [DOGE, "70000000000000000"]] }))
        .transact()
        .await?
        .into_result()?;

    let alice = root.create_subaccount("alice").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    let bob = root.create_subaccount("bob").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    // "bridge in" from the home chains
    alice
        .call(intents.id(), "simulate_deposit")
        .args_json(json!({ "token_id": format!("nep141:{PEPE}"), "from_chain": "Ethereum" }))
        .transact()
        .await?
        .into_result()?;
    bob.call(intents.id(), "simulate_deposit")
        .args_json(json!({ "token_id": format!("nep141:{DOGE}"), "from_chain": "Dogecoin" }))
        .transact()
        .await?
        .into_result()?;

    // without storage credit the feeding is refused and refunded
    let r = feed(&intents, &alice, &consume, PEPE, e(20_000_000, 18)).await?;
    assert!(r.is_success(), "the outer call succeeds; CONSUME's panic is refunded");
    assert_eq!(mt_balance(&intents, alice.id().as_str(), PEPE).await?, e(50_000_000, 18), "refused feeding refunded");

    for who in [&alice, &bob] {
        who.call(consume.id(), "add_meal_credit").args_json(json!({})).deposit(NearToken::from_millinear(100)).transact().await?.into_result()?;
    }

    // Alice feeds $100 of PEPE
    feed(&intents, &alice, &consume, PEPE, e(20_000_000, 18)).await?.into_result()?;
    assert_eq!(mt_balance(&intents, alice.id().as_str(), PEPE).await?, e(30_000_000, 18));
    assert_eq!(mt_balance(&intents, consume.id().as_str(), PEPE).await?, e(20_000_000, 18));
    let vest = view(&consume, "get_vest", json!({ "token_id": "1" })).await?;
    assert_eq!(vest["owner_id"], alice.id().to_string());
    assert_eq!(vest["vest"]["meal_usd"], (100 * USD).to_string());

    // Bob offers ~$3,500 of DOGE; the $1,000 cap sends the rest back to his Intents balance
    feed(&intents, &bob, &consume, DOGE, e(50_000, 8)).await?.into_result()?;
    let eaten: u128 = view(&consume, "get_vest", json!({ "token_id": "2" })).await?["vest"]["eaten"].as_str().unwrap().parse()?;
    assert_eq!(mt_balance(&intents, bob.id().as_str(), DOGE).await? + eaten, e(50_000, 8));
    assert_eq!(mt_balance(&intents, consume.id().as_str(), DOGE).await?, eaten);

    worker.fast_forward(600).await?;
    alice.call(consume.id(), "claim").args_json(json!({ "token_id": "1" })).transact().await?.into_result()?;
    let got: u128 = view(&consume, "ft_balance_of", json!({ "account_id": alice.id() })).await?.as_str().unwrap().parse()?;
    assert_eq!(got, 99_000 * 10u128.pow(18));

    // Redeem: both shares land in Alice's Intents balance, no registration needed
    let quote = view(&consume, "quote_redeem", json!({ "amount": got.to_string() })).await?;
    let share = |t: &str| -> u128 {
        quote["shares"].as_array().unwrap().iter().find(|p| p[0] == t).map(|p| p[1].as_str().unwrap().parse().unwrap()).unwrap_or(0)
    };
    let (pepe_share, doge_share) = (share(PEPE), share(DOGE));
    assert!(pepe_share > 0 && doge_share > 0);
    let pepe_before = mt_balance(&intents, alice.id().as_str(), PEPE).await?;
    alice
        .call(consume.id(), "redeem")
        .args_json(json!({ "amount": got.to_string() }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(mt_balance(&intents, alice.id().as_str(), PEPE).await? - pepe_before, pepe_share);
    assert_eq!(mt_balance(&intents, alice.id().as_str(), DOGE).await?, doge_share);
    assert!(view(&consume, "get_owed", json!({ "account_id": alice.id() })).await?.as_array().unwrap().is_empty());

    // "bridge out" the DOGE to a Dogecoin address
    alice
        .call(intents.id(), "simulate_withdraw")
        .args_json(json!({ "token_id": format!("nep141:{DOGE}"), "amount": doge_share.to_string(), "to_address": "DQx1example" }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;
    assert_eq!(mt_balance(&intents, alice.id().as_str(), DOGE).await?, 0);
    Ok(())
}
