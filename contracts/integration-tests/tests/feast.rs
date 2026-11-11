//! The Feast on a local NEAR sandbox: last week's most fed memecoin pays no
//! tithe, and none feasts two weeks running. Build the wasm first:
//!   (cd consume && cargo near build non-reproducible-wasm)
//!   (cd mock-meme && cargo near build non-reproducible-wasm)
//!
//! `an_older_contract_upgrades_in_place` rehearses the upgrade of a contract
//! that was launched and fed before feasts were written down. It needs that
//! older build, so it runs only when CONSUME_OLD_WASM points at one:
//!   CONSUME_OLD_WASM=/path/to/older/consume.wasm cargo test --test feast

use near_workspaces::network::Sandbox;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const USD: u128 = 1_000_000;
/// Ten minutes: long enough to feed twice, short enough to step through.
const EPOCH_NS: u64 = 600_000_000_000;

fn e(x: u128, decimals: u32) -> u128 {
    x * 10u128.pow(decimals)
}

async fn view(c: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(c.view(method).args_json(args).await?.json()?)
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

async fn feed(who: &Account, token: &Contract, consume: &Contract, amount: u128) -> anyhow::Result<()> {
    who.call(token.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": consume.id(), "amount": amount.to_string(), "msg": "" }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn epoch(consume: &Contract) -> anyhow::Result<u64> {
    Ok(view(consume, "get_stats", json!({})).await?["epoch"].as_str().unwrap().parse()?)
}

/// Step the sandbox into the next epoch and return its number.
async fn next_epoch(worker: &Worker<Sandbox>, consume: &Contract) -> anyhow::Result<u64> {
    let from = epoch(consume).await?;
    for _ in 0..200 {
        worker.fast_forward(100).await?;
        let now = epoch(consume).await?;
        if now > from {
            assert_eq!(now, from + 1, "stepped over a whole epoch");
            return Ok(now);
        }
    }
    anyhow::bail!("the epoch did not end")
}

/// The whole run. With `old_wasm`, the contract is launched and first fed on
/// that older build, then upgraded in place with no init call, as on testnet.
async fn the_crown_passes_on(old_wasm: Option<Vec<u8>>) -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let new_wasm = std::fs::read("../target/near/consume/consume.wasm")?;

    let pepe = deploy_meme(&root, "pepe", "PEPE", 18, e(500_000_000, 18)).await?;
    let doge = deploy_meme(&root, "doge", "DOGE", 8, e(500_000, 8)).await?;

    let consume_acc = root.create_subaccount("consume").initial_balance(NearToken::from_near(30)).transact().await?.into_result()?;
    let consume = consume_acc.deploy(old_wasm.as_ref().unwrap_or(&new_wasm)).await?.into_result()?;
    let owner = root.create_subaccount("owner").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    consume
        .call("new")
        .args_json(json!({ "config": {
            "guardian_id": owner.id(), "price_feeder_id": owner.id(),
            "start_rate": "1000", "famine_usd": (10_000 * USD).to_string(),
            "tithe_step_bps": 100, "max_tithe_bps": 1000,
            "vest_duration_ns": "2592000000000000",
            "exit_haircut_bps": 5000,
            "max_price_age_ns": "3600000000000000",      // 1000 h: no feeder running here
            "min_meal_usd": USD.to_string(),
            "epoch_ns": EPOCH_NS.to_string(),
            "media_base": null
        }, "tribes": [
            { "token_id": pepe.id(), "symbol": "PEPE", "decimals": 18,
              "max_meal_usd": (1_000 * USD).to_string(), "daily_cap_usd": (5_000 * USD).to_string() },
            { "token_id": doge.id(), "symbol": "DOGE", "decimals": 8,
              "max_meal_usd": (1_000 * USD).to_string(), "daily_cap_usd": (5_000 * USD).to_string() },
        ]}))
        .transact()
        .await?
        .into_result()?;
    owner
        .call(consume.id(), "set_prices")
        .args_json(json!({ "prices": [
            [pepe.id(), "5000000000000"],            // $0.000005
            [doge.id(), "70000000000000000"],        // $0.07
        ]}))
        .transact()
        .await?
        .into_result()?;
    for t in [&pepe, &doge] {
        owner.call(t.id(), "register").args_json(json!({ "account_id": consume.id() })).transact().await?.into_result()?;
    }
    let alice = root.create_subaccount("alice").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    let bob = root.create_subaccount("bob").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    alice.call(pepe.id(), "faucet").transact().await?.into_result()?;
    bob.call(doge.id(), "faucet").transact().await?.into_result()?;
    for who in [&alice, &bob] {
        who.call(consume.id(), "add_meal_credit")
            .args_json(json!({}))
            .deposit(NearToken::from_millinear(100))
            .transact()
            .await?
            .into_result()?;
    }

    // Every week of this run PEPE is fed $100 and DOGE $35: PEPE is always the most fed.
    let pepe_meal = e(20_000_000, 18);
    let doge_meal = e(500, 8);
    let pepe_id = json!(pepe.id());
    let doge_id = json!(doge.id());

    // Week one starts at the top of an epoch, so both feedings land in it.
    let first = next_epoch(&worker, &consume).await?;
    feed(&alice, &pepe, &consume, pepe_meal).await?;
    feed(&bob, &doge, &consume, doge_meal).await?;
    assert_eq!(epoch(&consume).await?, first, "both feedings in one epoch");

    if old_wasm.is_some() {
        // the older build has no `feast` in its stats and no `get_feast`
        let before = view(&consume, "get_stats", json!({})).await?;
        assert!(before.get("feast").is_none(), "CONSUME_OLD_WASM should be a build from before the rule");
        let bond_before = view(&consume, "get_vest", json!({ "token_id": "1" })).await?;
        let tribes_before = view(&consume, "get_tribes", json!({})).await?;

        // upgrade in place: new code on the same account, no init call, no migration
        consume.as_account().deploy(&new_wasm).await?.into_result()?;

        let after = view(&consume, "get_stats", json!({})).await?;
        for key in ["total_eaten_usd", "consume_supply", "total_unvested", "vests_minted", "stomach_usd", "tithe_bps"] {
            assert_eq!(after[key], before[key], "{key} must survive the upgrade");
        }
        // (what a Bond can collect grows by the second, so compare what is stored)
        let bond_after = view(&consume, "get_vest", json!({ "token_id": "1" })).await?;
        assert_eq!(bond_after["vest"], bond_before["vest"]);
        assert_eq!(bond_after["owner_id"], bond_before["owner_id"]);
        assert_eq!(view(&consume, "get_tribes", json!({})).await?, tribes_before);
        assert_eq!(after["feast"], Value::Null, "the launch week has no feast");
    }

    // Week two: PEPE feasts. The week before has feedings but, on the older
    // build, no record: the contract works it out from the feedings.
    let second = next_epoch(&worker, &consume).await?;
    let stats = view(&consume, "get_stats", json!({})).await?;
    assert_eq!(stats["feast"], pepe_id);
    assert_eq!(stats["heaviest_last_epoch"], pepe_id);
    let q = view(&consume, "quote_meal", json!({ "token_id": pepe.id(), "amount": pepe_meal.to_string() })).await?;
    assert_eq!(q["bonus"], true);
    assert_eq!(q["tithe_usd"], "0");
    feed(&alice, &pepe, &consume, pepe_meal).await?;
    feed(&bob, &doge, &consume, doge_meal).await?;
    assert_eq!(epoch(&consume).await?, second);
    assert_eq!(view(&consume, "get_vest", json!({ "token_id": "3" })).await?["vest"]["bonus"], true);
    assert_eq!(view(&consume, "get_vest", json!({ "token_id": "4" })).await?["vest"]["bonus"], false);

    // Week three: PEPE was the most fed again, but it has just feasted, so DOGE feasts.
    let third = next_epoch(&worker, &consume).await?;
    let stats = view(&consume, "get_stats", json!({})).await?;
    assert_eq!(stats["heaviest_last_epoch"], pepe_id);
    assert_eq!(stats["feast"], doge_id);
    let q = view(&consume, "quote_meal", json!({ "token_id": pepe.id(), "amount": pepe_meal.to_string() })).await?;
    assert_eq!(q["bonus"], false);
    assert_eq!(q["tithe_usd"], USD.to_string(), "PEPE pays the 1% tithe on $100");
    let q = view(&consume, "quote_meal", json!({ "token_id": doge.id(), "amount": doge_meal.to_string() })).await?;
    assert_eq!(q["bonus"], true);
    feed(&alice, &pepe, &consume, pepe_meal).await?;
    feed(&bob, &doge, &consume, doge_meal).await?;
    assert_eq!(epoch(&consume).await?, third);
    assert_eq!(view(&consume, "get_vest", json!({ "token_id": "5" })).await?["vest"]["bonus"], false);
    assert_eq!(view(&consume, "get_vest", json!({ "token_id": "6" })).await?["vest"]["bonus"], true);

    // Week four: PEPE sat a week out and was the most fed, so it feasts again.
    let fourth = next_epoch(&worker, &consume).await?;
    assert_eq!(view(&consume, "get_stats", json!({})).await?["feast"], pepe_id);

    // Every week still answers the same afterwards.
    for (week, feast) in [(first, Value::Null), (second, pepe_id.clone()), (third, doge_id.clone()), (fourth, pepe_id.clone())] {
        assert_eq!(view(&consume, "get_feast", json!({ "epoch": week.to_string() })).await?, feast, "feast of epoch {week}");
    }
    Ok(())
}

#[tokio::test]
async fn no_memecoin_feasts_two_weeks_running() -> anyhow::Result<()> {
    the_crown_passes_on(None).await
}

#[tokio::test]
async fn an_older_contract_upgrades_in_place() -> anyhow::Result<()> {
    let Ok(path) = std::env::var("CONSUME_OLD_WASM") else {
        eprintln!("skipped: set CONSUME_OLD_WASM to a consume.wasm built before the rule to rehearse the upgrade");
        return Ok(());
    };
    the_crown_passes_on(Some(std::fs::read(path)?)).await
}
