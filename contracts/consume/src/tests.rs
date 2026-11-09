use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_sdk::json_types::{U128, U64};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken};

use crate::math;
use crate::*;

const DAY: u64 = NANOS_PER_DAY;
const USD: u128 = MICRO_USD;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(predecessor: &str, now: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("consume.testnet"))
        .predecessor_account_id(acc(predecessor))
        .block_timestamp(now)
        .account_balance(NearToken::from_near(100));
    testing_env!(b.build());
}

fn ctx_yocto(predecessor: &str, now: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("consume.testnet"))
        .predecessor_account_id(acc(predecessor))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(1))
        .account_balance(NearToken::from_near(100));
    testing_env!(b.build());
}

fn config() -> Config {
    Config {
        owner_id: acc("owner.testnet"),
        price_feeder_id: acc("feeder.testnet"),
        start_rate: U128(1000),
        halving_usd: U128(10_000 * USD),
        vest_duration_ns: U64(30 * DAY),
        exit_haircut_bps: 5000,
        max_price_age_ns: U64(15 * 60 * 1_000_000_000),
        min_meal_usd: U128(USD),
        epoch_ns: U64(7 * DAY),
        heaviest_bonus_bps: 15000,
        media_base: Some("https://consume.test/vest".into()),
        intents_id: Some(acc("intents.testnet")),
    }
}

/// PEPE-like: 18 decimals at $0.000005; DOGE-like: 8 decimals at $0.07.
fn setup(now: u64) -> Contract {
    ctx("owner.testnet", now);
    let mut c = Contract::new(config());
    c.set_tribe(acc("pepe.testnet"), "PEPE".into(), 18, U128(1_000 * USD), U128(5_000 * USD), true, None);
    c.set_tribe(acc("doge.testnet"), "DOGE".into(), 8, U128(1_000 * USD), U128(5_000 * USD), true, None);
    ctx("feeder.testnet", now);
    c.set_prices(vec![
        (acc("pepe.testnet"), U128(5_000_000_000_000)),          // 5e-6 USD * 1e18
        (acc("doge.testnet"), U128(70_000_000_000_000_000)),     // 0.07 USD * 1e18
    ]);
    c
}

fn pepe(whole: u128) -> u128 {
    whole * 10u128.pow(18)
}
fn doge(whole: u128) -> u128 {
    whole * 10u128.pow(8)
}

fn credit(c: &mut Contract, who: &str, now: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("consume.testnet"))
        .predecessor_account_id(acc(who))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_near(1))
        .account_balance(NearToken::from_near(100));
    testing_env!(b.build());
    c.add_meal_credit(None);
}

fn feed(c: &mut Contract, token: &str, from: &str, amount: u128, now: u64) -> u128 {
    if c.get_meal_credit(acc(from)).0 < NearToken::from_millinear(100).as_yoctonear() {
        credit(c, from, now);
    }
    ctx(token, now);
    match c.ft_on_transfer(acc(from), U128(amount), String::new()) {
        near_sdk::PromiseOrValue::Value(r) => r.0,
        _ => panic!("expected value"),
    }
}

#[test]
fn usd_value_math() {
    // 20,000,000 PEPE at $0.000005 = $100
    assert_eq!(math::usd_value(pepe(20_000_000), 18, 5_000_000_000_000), 100 * USD);
    // 1,000 DOGE at $0.07 = $70
    assert_eq!(math::usd_value(doge(1_000), 8, 70_000_000_000_000_000), 70 * USD);
    assert_eq!(math::amount_for_usd(70 * USD, 8, 70_000_000_000_000_000), doge(1_000));
}

#[test]
fn halving_splits_a_meal() {
    // $15,000 meal from zero: $10,000 at 1000/USD + $5,000 at 500/USD = 12.5M CONSUME
    let minted = math::consume_for_meal(1000, 10_000 * USD, 0, 15_000 * USD);
    assert_eq!(minted, 12_500_000 * ONE_CONSUME);
    assert_eq!(math::rate_at(1000, 10_000 * USD, 25_000 * USD), 250 * ONE_CONSUME);
    // halvings stay exact: 1000 -> ... -> 125 -> 62.5
    assert_eq!(math::rate_at(1000, 10_000 * USD, 40_000 * USD), 125 * ONE_CONSUME / 2);
}

#[test]
fn a_meal_mints_a_vest_nft() {
    let mut c = setup(DAY);
    let refund = feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    assert_eq!(refund, 0);
    let v = c.get_vest("1".into()).unwrap();
    assert_eq!(v.owner_id, acc("alice.testnet"));
    assert_eq!(v.vest.meal_usd.0, 100 * USD);
    assert_eq!(v.vest.total.0, 100_000 * ONE_CONSUME);
    assert_eq!(c.get_tribe(acc("pepe.testnet")).unwrap().stomach.0, pepe(20_000_000));
    assert_eq!(c.total_unvested, 100_000 * ONE_CONSUME);
    assert_eq!(c.nft_token("1".into()).unwrap().owner_id, acc("alice.testnet"));
}

#[test]
fn over_the_meal_cap_is_refunded() {
    let mut c = setup(DAY);
    // $1,500 of DOGE, cap $1,000 per meal
    let sent = doge(1_500 * 100 / 7); // ~21,428 DOGE ~ $1,500
    let refund = feed(&mut c, "doge.testnet", "bob.testnet", sent, DAY);
    let v = c.get_vest("1".into()).unwrap();
    assert!(v.vest.meal_usd.0 <= 1_000 * USD && v.vest.meal_usd.0 > 999 * USD);
    assert_eq!(v.vest.eaten.0 + refund, sent);
}

#[test]
#[should_panic(expected = "eaten its fill today")]
fn daily_cap_holds() {
    let mut c = setup(DAY);
    for _ in 0..5 {
        feed(&mut c, "pepe.testnet", "alice.testnet", pepe(200_000_000), DAY); // $1,000 each
    }
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
}

#[test]
#[should_panic(expected = "Price is stale")]
fn stale_price_refused() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY + 16 * 60 * 1_000_000_000);
}

#[test]
#[should_panic(expected = "does not eat this token")]
fn unknown_token_refused() {
    let mut c = setup(DAY);
    feed(&mut c, "scam.testnet", "alice.testnet", 1, DAY);
}

#[test]
fn claim_releases_linearly_to_the_current_holder() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    // Alice sells the NFT to Carol on day 1
    ctx_yocto("alice.testnet", DAY);
    c.nft_transfer(acc("carol.testnet"), "1".into(), None, None);
    // halfway through the vest
    ctx("carol.testnet", DAY + 15 * DAY);
    let got = c.claim("1".into());
    assert_eq!(got.0, 50_000 * ONE_CONSUME);
    assert_eq!(c.ft_balance_of(acc("carol.testnet")).0, 50_000 * ONE_CONSUME);
    assert_eq!(c.total_unvested, 50_000 * ONE_CONSUME);
    // after the end, the rest
    ctx("carol.testnet", DAY + 40 * DAY);
    assert_eq!(c.claim("1".into()).0, 50_000 * ONE_CONSUME);
    assert_eq!(c.total_unvested, 0);
}

#[test]
fn exit_forfeits_half_of_the_locked_part() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    // 10 of 30 days in: 1/3 vested, 2/3 locked, half of locked forfeited
    ctx_yocto("alice.testnet", DAY + 10 * DAY);
    let paid = c.exit("1".into()).0;
    let total = 100_000 * ONE_CONSUME;
    let vested = total / 3;
    let locked = total - vested;
    assert_eq!(paid, vested + locked - locked / 2);
    assert_eq!(c.total_forfeited, locked / 2);
    assert_eq!(c.total_unvested, 0);
    assert!(c.get_vest("1".into()).unwrap().vest.exited);
}

#[test]
fn redeem_pays_a_fair_share_counting_unvested() {
    let mut c = setup(DAY);
    // Alice eats $100 of PEPE, Bob eats $100 of DOGE: 100k CONSUME each, all vesting
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    feed(&mut c, "doge.testnet", "bob.testnet", doge(100 * 100 / 7), DAY);
    // Alice claims everything after the vest, Bob has not claimed
    ctx("alice.testnet", 40 * DAY);
    c.claim("1".into());
    let alice = c.ft_balance_of(acc("alice.testnet")).0;
    // Alice redeems all of hers: she owns ~half of (supply + unvested)
    let q = c.quote_redeem(U128(alice));
    let pepe_share = q.shares.iter().find(|(k, _)| k == &acc("pepe.testnet")).unwrap().1 .0;
    let stomach_pepe = c.get_tribe(acc("pepe.testnet")).unwrap().stomach.0;
    let ratio = pepe_share as f64 / stomach_pepe as f64;
    assert!((ratio - 0.5).abs() < 0.01, "ratio {ratio}");
    ctx_yocto("alice.testnet", 40 * DAY);
    c.redeem(U128(alice));
    assert_eq!(c.ft_balance_of(acc("alice.testnet")).0, 0);
    assert_eq!(c.total_redeemed, alice);
    // Bob's later claim still has about half the stomach behind it
    let left = c.get_tribe(acc("pepe.testnet")).unwrap().stomach.0;
    assert!(left as f64 / stomach_pepe as f64 > 0.49);
}

#[test]
fn heaviest_tribe_gets_the_bonus_next_epoch() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(40_000_000), DAY); // $200
    feed(&mut c, "doge.testnet", "bob.testnet", doge(100 * 100 / 7), DAY); // ~$100
    let next_week = 8 * DAY;
    ctx("feeder.testnet", next_week);
    c.set_prices(vec![
        (acc("pepe.testnet"), U128(5_000_000_000_000)),
        (acc("doge.testnet"), U128(70_000_000_000_000_000)),
    ]);
    let q = c.quote_meal(acc("pepe.testnet"), U128(pepe(20_000_000)));
    assert!(q.bonus);
    let q2 = c.quote_meal(acc("doge.testnet"), U128(doge(1_000)));
    assert!(!q2.bonus);
}

#[test]
fn format_units_reads_well() {
    assert_eq!(meal::format_units(pepe(20_000_000), 18), "20000000");
    assert_eq!(meal::format_units(1_234_567, 6), "1.2345");
    assert_eq!(meal::format_units(1_500_000, 6), "1.5");
}


// ---------------- regressions for the security review ----------------

#[test]
#[should_panic(expected = "Add storage credit first")]
fn feeding_without_storage_credit_is_refused() {
    let mut c = setup(DAY);
    ctx("pepe.testnet", DAY);
    let _ = c.ft_on_transfer(acc("nocredit.testnet"), U128(pepe(20_000_000)), String::new());
}

#[test]
fn feeding_charges_storage_to_the_feeder() {
    let mut c = setup(DAY);
    credit(&mut c, "alice.testnet", DAY);
    let before = c.get_meal_credit(acc("alice.testnet")).0;
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    let after = c.get_meal_credit(acc("alice.testnet")).0;
    assert!(after < before, "storage must be paid from the feeder's credit");
}

#[test]
#[should_panic(expected = "sponsored and cannot be refunded")]
fn sponsored_account_cannot_unregister() {
    use near_contract_standards::storage_management::StorageManagement;
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    ctx("alice.testnet", 40 * DAY);
    c.claim("1".into());
    ctx_yocto("alice.testnet", 40 * DAY);
    c.storage_unregister(None);
}

#[test]
#[should_panic(expected = "mid-transfer")]
fn indulgence_in_flight_cannot_be_claimed() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    c.in_flight.insert("1".to_string()); // as nft_transfer_call does before calling the receiver
    ctx("alice.testnet", 20 * DAY);
    c.claim("1".into());
}

#[test]
#[should_panic(expected = "Pays less than your minimum")]
fn min_consume_is_enforced() {
    let mut c = setup(DAY);
    credit(&mut c, "alice.testnet", DAY);
    ctx("pepe.testnet", DAY);
    let msg = format!(r#"{{"min_consume":"{}"}}"#, 200_000u128 * ONE_CONSUME);
    let _ = c.ft_on_transfer(acc("alice.testnet"), U128(pepe(20_000_000)), msg); // pays 100k
}

#[test]
#[should_panic(expected = "after its deadline")]
fn deadline_is_enforced() {
    let mut c = setup(DAY);
    credit(&mut c, "alice.testnet", DAY);
    ctx("pepe.testnet", DAY);
    let msg = format!(r#"{{"deadline_ns":"{}"}}"#, DAY - 1);
    let _ = c.ft_on_transfer(acc("alice.testnet"), U128(pepe(20_000_000)), msg);
}

#[test]
fn json_msg_can_name_a_recipient() {
    let mut c = setup(DAY);
    credit(&mut c, "alice.testnet", DAY);
    ctx("pepe.testnet", DAY);
    let _ = c.ft_on_transfer(acc("alice.testnet"), U128(pepe(20_000_000)), r#"{"recipient":"carol.testnet"}"#.into());
    assert_eq!(c.get_vest("1".into()).unwrap().owner_id, acc("carol.testnet"));
}

#[test]
#[should_panic(expected = "decimals cannot change")]
fn tribe_decimals_are_frozen() {
    let mut c = setup(DAY);
    ctx("owner.testnet", DAY);
    c.set_tribe(acc("pepe.testnet"), "PEPE".into(), 6, U128(1_000 * USD), U128(5_000 * USD), true, None);
}

#[test]
fn rate_never_rounds_a_meal_down_to_zero_early() {
    // after 10 halvings the old integer rate was 0; raw units keep paying
    let minted = math::consume_for_meal(1000, 10_000 * USD, 100_000 * USD, 100 * USD);
    assert!(minted > 0);
    assert_eq!(minted, 100 * (1000 * ONE_CONSUME >> 10));
}

// ---------- NEAR Intents ----------

const PEPE_OMFT: &str = "eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near";

fn setup_intents(now: u64) -> Contract {
    let mut c = setup(now);
    ctx("owner.testnet", now);
    c.set_tribe(acc(PEPE_OMFT), "PEPE".into(), 18, U128(1_000 * USD), U128(5_000 * USD), true, Some(true));
    ctx("feeder.testnet", now);
    c.set_prices(vec![(acc(PEPE_OMFT), U128(5_000_000_000_000))]);
    c
}

fn feed_intents(c: &mut Contract, caller: &str, from: &str, token_id: &str, amount: u128, msg: &str, now: u64) -> Vec<U128> {
    if c.get_meal_credit(acc(from)).0 < NearToken::from_millinear(100).as_yoctonear() {
        credit(c, from, now);
    }
    ctx(caller, now);
    match c.mt_on_transfer(acc(from), vec![acc(from)], vec![token_id.into()], vec![U128(amount)], msg.into()) {
        near_sdk::PromiseOrValue::Value(r) => r,
        _ => panic!("expected value"),
    }
}

#[test]
fn intents_feeding_mints_an_indulgence() {
    let mut c = setup_intents(DAY);
    let id = format!("nep141:{PEPE_OMFT}");
    let refund = feed_intents(&mut c, "intents.testnet", "alice.testnet", &id, pepe(20_000_000), "", DAY);
    assert_eq!(refund, vec![U128(0)]);
    let t = c.get_tribe(acc(PEPE_OMFT)).unwrap();
    assert_eq!(t.stomach.0, pepe(20_000_000));
    assert_eq!(t.eaten_usd.0, 100 * USD);
    assert_eq!(c.nft.owner_by_id.get(&"1".to_string()), Some(acc("alice.testnet")));
}

#[test]
fn intents_feeding_refunds_over_the_cap() {
    let mut c = setup_intents(DAY);
    let id = format!("nep141:{PEPE_OMFT}");
    // $2,000 offered, $1,000 meal cap
    let refund = feed_intents(&mut c, "intents.testnet", "alice.testnet", &id, pepe(400_000_000), "", DAY);
    assert_eq!(refund, vec![U128(pepe(200_000_000))]);
}

#[test]
#[should_panic(expected = "Only the NEAR Intents contract can call this")]
fn intents_feeding_from_anyone_else_is_refused() {
    let mut c = setup_intents(DAY);
    let id = format!("nep141:{PEPE_OMFT}");
    feed_intents(&mut c, "fake-intents.testnet", "alice.testnet", &id, pepe(20_000_000), "", DAY);
}

#[test]
#[should_panic(expected = "fed directly")]
fn direct_tribe_cannot_be_fed_through_intents() {
    let mut c = setup_intents(DAY);
    feed_intents(&mut c, "intents.testnet", "alice.testnet", "nep141:pepe.testnet", pepe(20_000_000), "", DAY);
}

#[test]
#[should_panic(expected = "fed through NEAR Intents")]
fn intents_tribe_cannot_be_fed_directly() {
    let mut c = setup_intents(DAY);
    feed(&mut c, PEPE_OMFT, "alice.testnet", pepe(20_000_000), DAY);
}

#[test]
#[should_panic(expected = "only eats nep141")]
fn non_nep141_intents_tokens_are_refused() {
    let mut c = setup_intents(DAY);
    feed_intents(&mut c, "intents.testnet", "alice.testnet", "nep245:x.near:1", 1, "", DAY);
}

#[test]
fn intents_feeding_reads_the_msg() {
    let mut c = setup_intents(DAY);
    let id = format!("nep141:{PEPE_OMFT}");
    feed_intents(&mut c, "intents.testnet", "alice.testnet", &id, pepe(20_000_000), r#"{"recipient":"bob.testnet"}"#, DAY);
    assert_eq!(c.nft.owner_by_id.get(&"1".to_string()), Some(acc("bob.testnet")));
}

#[test]
#[should_panic(expected = "custody cannot change")]
fn custody_is_fixed_once_eaten() {
    let mut c = setup_intents(DAY);
    let id = format!("nep141:{PEPE_OMFT}");
    feed_intents(&mut c, "intents.testnet", "alice.testnet", &id, pepe(20_000_000), "", DAY);
    ctx("owner.testnet", DAY);
    c.set_tribe(acc(PEPE_OMFT), "PEPE".into(), 18, U128(1_000 * USD), U128(5_000 * USD), true, Some(false));
}

#[test]
#[should_panic(expected = "the Intents contract is fixed")]
fn intents_contract_is_fixed_once_eaten() {
    let mut c = setup_intents(DAY);
    let id = format!("nep141:{PEPE_OMFT}");
    feed_intents(&mut c, "intents.testnet", "alice.testnet", &id, pepe(20_000_000), "", DAY);
    ctx("owner.testnet", DAY);
    c.set_intents_id(Some(acc("other.testnet")));
}
