//! A Bond sold through an approval, on a local NEAR sandbox: the seller lists
//! it with `nft_approve`, the approved account (standing in for a marketplace)
//! hands it to the buyer with `nft_transfer`, and from then on the buyer is
//! paid and the seller is refused.
//!
//! Build the wasm first, as for `flow.rs`. Set `CONSUME_WASM` to run against
//! another build of the contract, for example the code downloaded from the
//! live account:
//!   near contract download-wasm regular consume.consumecash.testnet save-to-file /tmp/live.wasm network-config testnet now
//!   CONSUME_WASM=/tmp/live.wasm cargo test --test sale

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const USD: u128 = 1_000_000;
const BOND: &str = "1";

fn e(x: u128, decimals: u32) -> u128 {
    x * 10u128.pow(decimals)
}

async fn view(c: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(c.view(method).args_json(args).await?.json()?)
}

fn num(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}

/// $CONSUME held by an account (0 if it was never registered).
async fn consume_of(consume: &Contract, who: &Account) -> anyhow::Result<u128> {
    Ok(num(&view(consume, "ft_balance_of", json!({ "account_id": who.id() })).await?))
}

async fn holder(consume: &Contract) -> anyhow::Result<String> {
    let token = view(consume, "nft_token", json!({ "token_id": BOND })).await?;
    Ok(token["owner_id"].as_str().unwrap().to_string())
}

/// The approval id the Bond's listing carries for `market`, if it has one.
async fn approval_id(consume: &Contract, market: &Account) -> anyhow::Result<Option<u64>> {
    let token = view(consume, "nft_token", json!({ "token_id": BOND })).await?;
    Ok(token["approved_account_ids"].get(market.id().as_str()).and_then(Value::as_u64))
}

/// Runs a call that must be refused and returns why.
async fn refused(who: &Account, consume: &Contract, method: &str, args: Value, deposit: NearToken) -> anyhow::Result<String> {
    let r = who.call(consume.id(), method).args_json(args).deposit(deposit).max_gas().transact().await?;
    let err = r.into_result().expect_err(&format!("{method} by {} should be refused", who.id()));
    Ok(format!("{err:?}"))
}

#[tokio::test]
async fn an_approved_sale_passes_the_payout_to_the_buyer() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let wasm_path = std::env::var("CONSUME_WASM").unwrap_or_else(|_| "../target/near/consume/consume.wasm".into());
    println!("contract under test: {wasm_path}");

    let pepe_acc = root.create_subaccount("pepe").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    let pepe = pepe_acc.deploy(&std::fs::read("../target/near/mock_meme/mock_meme.wasm")?).await?.into_result()?;
    pepe.call("new")
        .args_json(json!({ "name": "Test PEPE", "symbol": "PEPE", "decimals": 18, "faucet_amount": e(50_000_000, 18).to_string() }))
        .transact()
        .await?
        .into_result()?;

    let consume_acc = root.create_subaccount("consume").initial_balance(NearToken::from_near(30)).transact().await?.into_result()?;
    let consume = consume_acc.deploy(&std::fs::read(&wasm_path)?).await?.into_result()?;
    let assayer = root.create_subaccount("assayer").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    consume
        .call("new")
        .args_json(json!({ "config": {
            "guardian_id": null, "price_feeder_id": assayer.id(),
            "start_rate": "1000", "famine_usd": (10_000 * USD).to_string(),
            "tithe_step_bps": 100, "max_tithe_bps": 1000,
            "vest_duration_ns": "36000000000000",        // 10 h: the Bond is mid-release for the whole test
            "exit_haircut_bps": 5000,
            "max_price_age_ns": "3600000000000000",      // 1000 h: no feeder running here
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
    assayer
        .call(consume.id(), "set_prices")
        .args_json(json!({ "prices": [[pepe.id(), "5000000000000"]] }))   // $0.000005
        .transact()
        .await?
        .into_result()?;
    assayer.call(pepe.id(), "register").args_json(json!({ "account_id": consume.id() })).transact().await?.into_result()?;

    // the seller, the marketplace's account and the buyer
    let mut people = Vec::new();
    for name in ["seller", "market", "buyer"] {
        let who = root.create_subaccount(name).initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
        // storage credit: the seller's Bond and the buyer's $CONSUME
        // registration. The market adds its own further down.
        if name != "market" {
            who.call(consume.id(), "add_meal_credit")
                .args_json(json!({}))
                .deposit(NearToken::from_millinear(100))
                .transact()
                .await?
                .into_result()?;
        }
        people.push(who);
    }
    let (seller, market, buyer) = (&people[0], &people[1], &people[2]);

    // The seller feeds $100 of PEPE and holds Bond 1: 99,000 $CONSUME after the 1% tithe.
    seller.call(pepe.id(), "faucet").transact().await?.into_result()?;
    seller
        .call(pepe.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": consume.id(), "amount": e(20_000_000, 18).to_string(), "msg": "" }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(holder(&consume).await?, seller.id().to_string());
    let total = num(&view(&consume, "get_vest", json!({ "token_id": BOND })).await?["vest"]["total"]);
    assert_eq!(total, 99_000 * 10u128.pow(18));

    // 1. The listing: the seller approves the market for this Bond.
    let approve = json!({ "token_id": BOND, "account_id": market.id() });
    seller.call(consume.id(), "nft_approve").args_json(approve.clone()).deposit(NearToken::from_millinear(10)).transact().await?.into_result()?;
    let first_listing = approval_id(&consume, market).await?.expect("the market is approved");
    let sale = |approval: u64, to: &Account| json!({ "receiver_id": to.id(), "token_id": BOND, "approval_id": approval });

    // Whoever calls the transfer pays its 0.01024 NEAR storage reserve from
    // their own credit. A market with none is refused and the listing stands.
    let why = refused(market, &consume, "nft_transfer", sale(first_listing, buyer), ONE_YOCTO).await?;
    assert!(why.contains("Add storage credit first"), "{why}");
    assert_eq!(holder(&consume).await?, seller.id().to_string());
    assert_eq!(approval_id(&consume, market).await?, Some(first_listing), "a refused sale leaves the listing as it was");
    market
        .call(consume.id(), "add_meal_credit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // 2. The seller collects what has been released so far. That is theirs to
    //    take, but it changes what the Bond is worth, so the listing is void:
    //    the market can no longer hand over a Bond that pays less than it did
    //    when it was listed.
    seller.call(consume.id(), "claim").args_json(json!({ "token_id": BOND })).transact().await?.into_result()?;
    let seller_took = consume_of(&consume, seller).await?;
    assert!(seller_took > 0, "the seller collected the released part");
    assert_eq!(approval_id(&consume, market).await?, None, "collecting clears the listing");
    let why = refused(market, &consume, "nft_transfer", sale(first_listing, buyer), ONE_YOCTO).await?;
    assert!(why.contains("Sender not approved"), "{why}");
    assert_eq!(holder(&consume).await?, seller.id().to_string(), "the void listing moves nothing");

    // 3. A fresh listing gets a new, higher approval id, and the sale goes through on it.
    seller.call(consume.id(), "nft_approve").args_json(approve).deposit(NearToken::from_millinear(10)).transact().await?.into_result()?;
    let listing = approval_id(&consume, market).await?.expect("the market is approved again");
    assert!(listing > first_listing, "approval ids are never reused");
    market
        .call(consume.id(), "nft_transfer")
        .args_json(sale(listing, buyer))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;
    assert_eq!(holder(&consume).await?, buyer.id().to_string(), "the buyer holds the Bond");
    assert_eq!(approval_id(&consume, market).await?, None, "the sale uses the listing up");

    // 4. What stops the seller. Nothing is paid out by the sale itself: the
    //    seller keeps what they collected before it and gets nothing after.
    assert_eq!(consume_of(&consume, seller).await?, seller_took);
    let why = refused(seller, &consume, "claim", json!({ "token_id": BOND }), NearToken::from_yoctonear(0)).await?;
    assert!(why.contains("Only the Bond holder can claim"), "{why}");
    let why = refused(seller, &consume, "exit", json!({ "token_id": BOND }), ONE_YOCTO).await?;
    assert!(why.contains("Only the Bond holder can exit"), "{why}");
    // the seller cannot take it back, and the market cannot move it again on the old listing
    let back = json!({ "receiver_id": seller.id(), "token_id": BOND });
    let why = refused(seller, &consume, "nft_transfer", back, ONE_YOCTO).await?;
    assert!(why.contains("Sender not approved"), "{why}");
    let why = refused(market, &consume, "nft_transfer", sale(listing, seller), ONE_YOCTO).await?;
    assert!(why.contains("Sender not approved"), "{why}");
    assert_eq!(holder(&consume).await?, buyer.id().to_string());

    // 5. The buyer collects. Every $CONSUME the Bond has released went to
    //    whoever held it at the time, and nothing went anywhere else.
    assert_eq!(consume_of(&consume, buyer).await?, 0);
    buyer.call(consume.id(), "claim").args_json(json!({ "token_id": BOND })).transact().await?.into_result()?;
    let buyer_took = consume_of(&consume, buyer).await?;
    assert!(buyer_took > 0, "the buyer is paid what was released after the seller's collection");
    let vest = view(&consume, "get_vest", json!({ "token_id": BOND })).await?;
    assert_eq!(num(&vest["vest"]["released"]), seller_took + buyer_took);
    assert_eq!(num(&vest["claimable"]) + num(&vest["locked"]), total - seller_took - buyer_took);

    // 6. The buyer holds the whole position, the early exit included: breaking
    //    the seal pays the buyer and forfeits half of what was still locked.
    buyer.call(consume.id(), "exit").args_json(json!({ "token_id": BOND })).deposit(ONE_YOCTO).transact().await?.into_result()?;
    let stats = view(&consume, "get_stats", json!({})).await?;
    let forfeited = num(&stats["total_forfeited"]);
    assert!(forfeited > 0);
    assert_eq!(
        consume_of(&consume, seller).await? + consume_of(&consume, buyer).await? + forfeited,
        total,
        "seller's share, buyer's share and the forfeit add up to the Bond"
    );
    assert_eq!(consume_of(&consume, seller).await?, seller_took, "the seller got nothing after the sale");
    assert_eq!(consume_of(&consume, market).await?, 0, "the market never held any of it");
    assert_eq!(view(&consume, "get_vest", json!({ "token_id": BOND })).await?["vest"]["exited"], true);
    Ok(())
}
