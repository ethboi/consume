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
        guardian_id: Some(acc("guardian.testnet")),
        price_feeder_id: acc("feeder.testnet"),
        start_rate: U128(1000),
        famine_usd: U128(10_000 * USD),
        tithe_step_bps: 100,
        max_tithe_bps: 1000,
        vest_duration_ns: U64(30 * DAY),
        exit_haircut_bps: 5000,
        max_price_age_ns: U64(15 * 60 * 1_000_000_000),
        min_meal_usd: U128(USD),
        epoch_ns: U64(7 * DAY),
        media_base: Some("https://consume.test/vest".into()),
        intents_id: Some(acc("intents.testnet")),
    }
}

fn tribe(token: &str, symbol: &str, decimals: u8, via_intents: bool) -> TribeInit {
    TribeInit {
        token_id: acc(token),
        symbol: symbol.into(),
        decimals,
        max_meal_usd: U128(1_000 * USD),
        daily_cap_usd: U128(5_000 * USD),
        via_intents,
    }
}

/// The launch list: two plain NEP-141 memecoins and one held on NEAR Intents.
fn launch_list() -> Vec<TribeInit> {
    vec![
        tribe("pepe.testnet", "PEPE", 18, false),
        tribe("doge.testnet", "DOGE", 8, false),
        tribe(PEPE_OMFT, "PEPE", 18, true),
    ]
}

/// PEPE-like: 18 decimals at $0.000005; DOGE-like: 8 decimals at $0.07.
fn setup(now: u64) -> Contract {
    ctx("deployer.testnet", now);
    let mut c = Contract::new(config(), launch_list());
    post(&mut c, now, PEPE_PRICE, DOGE_PRICE);
    c
}

const PEPE_PRICE: u128 = 5_000_000_000_000; // 5e-6 USD * 1e18
const DOGE_PRICE: u128 = 70_000_000_000_000_000; // 0.07 USD * 1e18

/// One round from the Assayer: every listed memecoin, in one call.
fn post(c: &mut Contract, now: u64, pepe_e18: u128, doge_e18: u128) {
    ctx("feeder.testnet", now);
    c.set_prices(vec![
        (acc("pepe.testnet"), U128(pepe_e18)),
        (acc("doge.testnet"), U128(doge_e18)),
        (acc(PEPE_OMFT), U128(PEPE_PRICE)),
    ]);
}

/// What the first $100 feeding mints: 1000 per dollar on an empty stomach, less the 1% tithe.
const FIRST: u128 = 99_000 * ONE_CONSUME;

/// Re-post the same prices (the Assayer does this every few minutes).
fn reprice(c: &mut Contract, now: u64) {
    post(c, now, PEPE_PRICE, DOGE_PRICE);
}

/// The floor as a fraction: (stomach value in micro-USD, all $CONSUME with a claim).
fn floor(c: &Contract) -> (u128, u128) {
    let s = c.get_stats();
    (s.stomach_usd.0, s.consume_supply.0 + s.total_unvested.0)
}

/// a/b >= c/d, for floors.
fn not_lower(after: (u128, u128), before: (u128, u128)) -> bool {
    math::U256::from(after.0) * math::U256::from(before.1) >= math::U256::from(before.0) * math::U256::from(after.1)
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
fn the_stomach_is_rounded_up_when_a_feeding_is_priced() {
    // a few raw units of PEPE are worth far less than a micro-dollar
    assert_eq!(math::usd_value(1_900, 18, PEPE_PRICE), 0);
    assert_eq!(math::usd_value_up(1_900, 18, PEPE_PRICE), 1);
    // exact values are not pushed up
    assert_eq!(math::usd_value_up(pepe(20_000_000), 18, PEPE_PRICE), 100 * USD);
    assert_eq!(math::usd_value_up(0, 18, PEPE_PRICE), 0);
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
fn famine_grows_the_tithe_to_its_cap() {
    // 1% from the start, one more for every $10,000 eaten, never above 10%
    assert_eq!(math::tithe_at(100, 1000, 10_000 * USD, 0), 100);
    assert_eq!(math::tithe_at(100, 1000, 10_000 * USD, 25_000 * USD), 300);
    assert_eq!(math::tithe_at(100, 1000, 10_000 * USD, 95_000 * USD), 1000);
    assert_eq!(math::tithe_at(100, 1000, 10_000 * USD, 5_000_000 * USD), 1000);
    // a feeding that crosses a famine pays each tithe on its own side:
    // $10,000 at 1% + $5,000 at 2% leaves $9,900 + $4,900
    assert_eq!(math::after_tithe(100, 1000, 10_000 * USD, 0, 15_000 * USD), 14_800 * USD);
    // at the cap the rest is all at 10%
    assert_eq!(math::after_tithe(100, 1000, 10_000 * USD, 200_000 * USD, 50_000 * USD), 45_000 * USD);
}

#[test]
fn minting_at_the_floor_math() {
    // nothing minted yet: the start rate
    assert_eq!(math::consume_at_floor(1000, 99 * USD, 0, 0), FIRST);
    // claims out but a stomach worth under a micro-dollar: the feeding takes
    // (nearly) all of it, it is not shared with the old claims at the start rate
    assert_eq!(math::consume_at_floor(1000, 99 * USD, 5 * ONE_CONSUME, 0), 99 * USD * 5 * ONE_CONSUME);
    // 1M $CONSUME backed by $2,000: $50 is 2.5% of the stomach, so it mints 2.5% of the claims
    assert_eq!(math::consume_at_floor(1000, 50 * USD, 1_000_000 * ONE_CONSUME, 2_000 * USD), 25_000 * ONE_CONSUME);
}

#[test]
fn a_feeding_mints_a_bond() {
    let mut c = setup(DAY);
    let refund = feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    assert_eq!(refund, 0);
    let v = c.get_vest("1".into()).unwrap();
    assert_eq!(v.owner_id, acc("alice.testnet"));
    assert_eq!(v.vest.meal_usd.0, 100 * USD);
    assert_eq!(v.vest.total.0, FIRST);
    assert_eq!(c.get_tribe(acc("pepe.testnet")).unwrap().stomach.0, pepe(20_000_000));
    assert_eq!(c.total_unvested, FIRST);
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
    // Carol is new to $CONSUME: her registration comes out of her own storage credit
    credit(&mut c, "carol.testnet", DAY);
    // halfway through the vest
    ctx("carol.testnet", DAY + 15 * DAY);
    let got = c.claim("1".into());
    assert_eq!(got.0, FIRST / 2);
    assert_eq!(c.ft_balance_of(acc("carol.testnet")).0, FIRST / 2);
    assert_eq!(c.total_unvested, FIRST / 2);
    // after the end, the rest
    ctx("carol.testnet", DAY + 40 * DAY);
    assert_eq!(c.claim("1".into()).0, FIRST / 2);
    assert_eq!(c.total_unvested, 0);
}

#[test]
fn exit_forfeits_half_of_the_locked_part() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    // 10 of 30 days in: 1/3 vested, 2/3 locked, half of locked forfeited
    ctx_yocto("alice.testnet", DAY + 10 * DAY);
    let paid = c.exit("1".into()).0;
    let total = FIRST;
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
    // Alice eats $100 of PEPE, Bob eats $100 of DOGE: about the same $CONSUME each, all vesting
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
fn the_feast_waives_the_tithe_next_epoch() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(40_000_000), DAY); // $200
    feed(&mut c, "doge.testnet", "bob.testnet", doge(100 * 100 / 7), DAY); // ~$100
    let next_week = 8 * DAY;
    reprice(&mut c, next_week);
    // PEPE was fed most last week: this week it pays no tithe
    let q = c.quote_meal(acc("pepe.testnet"), U128(pepe(20_000_000)));
    assert!(q.bonus);
    assert_eq!(q.tithe_usd.0, 0);
    // DOGE pays the usual 1%
    let q2 = c.quote_meal(acc("doge.testnet"), U128(doge(1_000)));
    assert!(!q2.bonus);
    assert_eq!(q2.tithe_usd.0, 70 * USD / 100);
    // and even a feast feeding cannot lower the floor
    let before = floor(&c);
    feed(&mut c, "pepe.testnet", "carol.testnet", pepe(20_000_000), next_week);
    assert!(not_lower(floor(&c), before));
}

// ---------- the economics: mint at the floor ----------

#[test]
fn a_feeding_never_lowers_the_floor() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    let mut last = floor(&c);
    // different memecoins, sizes and feeders, with prices moving in between
    let moves: [(&str, u128, u128); 4] = [
        ("doge.testnet", doge(1_000), 70_000_000_000_000_000),
        ("pepe.testnet", pepe(3_333_333), 9_000_000_000_000),   // PEPE up 80%
        ("doge.testnet", doge(14_000), 21_000_000_000_000_000), // DOGE down 70%
        ("pepe.testnet", pepe(123_456_789), 1_000_000_000_000), // PEPE down 89%
    ];
    for (i, (token, amount, price)) in moves.into_iter().enumerate() {
        let now = DAY + (i as u64 + 1) * 60_000_000_000;
        let (p, d) = if token == "pepe.testnet" { (price, DOGE_PRICE) } else { (PEPE_PRICE, price) };
        post(&mut c, now, p, d);
        // the floor is measured at the prices the feeding is made at
        let before = floor(&c);
        feed(&mut c, token, "bob.testnet", amount, now);
        let after = floor(&c);
        assert!(not_lower(after, before), "feeding {i} lowered the floor");
        assert!(after != before, "the tithe should have raised it");
        last = after;
    }
    assert!(last.0 > 0 && last.1 > 0);
}

#[test]
fn a_late_feeder_gets_what_they_fed_less_the_tithe() {
    let mut c = setup(DAY);
    // $20,000 eaten before Carol arrives: two days at both daily caps
    for day in [DAY, 2 * DAY] {
        reprice(&mut c, day);
        for _ in 0..5 {
            feed(&mut c, "pepe.testnet", "alice.testnet", pepe(200_000_000), day);
            feed(&mut c, "doge.testnet", "bob.testnet", doge(1_000 * 100 / 7), day);
        }
    }
    assert!(c.total_eaten_usd > 19_990 * USD && c.total_eaten_usd < 20_000 * USD);
    let day3 = 3 * DAY;
    reprice(&mut c, day3);
    feed(&mut c, "pepe.testnet", "carol.testnet", pepe(20_000_000), day3); // $100
    let bond = c.get_vest((c.next_vest_id - 1).to_string()).unwrap().vest;
    assert_eq!(bond.meal_usd.0, 100 * USD);
    // what her $CONSUME redeems for, valued at the same prices
    let q = c.quote_redeem(bond.total);
    let worth: u128 = q
        .shares
        .iter()
        .map(|(k, v)| {
            let t = c.get_tribe(k.clone()).unwrap();
            math::usd_value(v.0, t.decimals, t.price_e18.0)
        })
        .sum();
    // her feeding crosses the second famine, so nearly all of it pays 3%:
    // about $97 back for $100. Under a halving rate it would have been about $43.
    assert!(worth > 96_900_000 && worth < 97_100_000, "worth {worth}");
}

#[test]
fn a_broken_seal_raises_the_floor() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    feed(&mut c, "doge.testnet", "bob.testnet", doge(1_000), DAY);
    let before = floor(&c);
    ctx_yocto("alice.testnet", 2 * DAY);
    c.exit("1".into());
    let after = floor(&c);
    assert!(not_lower(after, before) && after != before);
}

#[test]
#[should_panic(expected = "A round must price every memecoin that is open or held")]
fn a_round_must_price_every_open_memecoin() {
    let mut c = setup(DAY);
    // DOGE alone: a feeding could be minted against a half-repriced stomach
    ctx("feeder.testnet", DAY);
    c.set_prices(vec![(acc("doge.testnet"), U128(DOGE_PRICE))]);
}

#[test]
fn a_sealed_memecoin_is_left_out_of_a_round_only_when_none_is_held() {
    let mut c = setup(DAY);
    ctx("guardian.testnet", DAY);
    c.set_tribe_open(acc("doge.testnet"), false);
    // sealed and never eaten: no feeding reads its price
    ctx("feeder.testnet", DAY);
    c.set_prices(vec![(acc("pepe.testnet"), U128(PEPE_PRICE)), (acc(PEPE_OMFT), U128(PEPE_PRICE))]);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    // sealed but held: every feeding is priced against it, so it must be in the round
    ctx("guardian.testnet", DAY);
    c.set_tribe_open(acc("pepe.testnet"), false);
    ctx("feeder.testnet", DAY);
    let refused = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.set_prices(vec![(acc(PEPE_OMFT), U128(PEPE_PRICE))]);
    }));
    assert!(refused.is_err(), "a held memecoin was left out of a round");
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
fn feeding_charges_every_byte_it_stores() {
    let mut c = setup(DAY);
    credit(&mut c, "alice.testnet", DAY);
    let credit_before = c.get_meal_credit(acc("alice.testnet")).0;
    // write out every map, as the end of a call does on chain
    fn flush(c: &mut Contract) {
        c.vests.flush();
        c.daily_fed.flush();
        c.epoch_fed.flush();
        c.meal_credit.flush();
        c.tribes.flush();
    }
    ctx("pepe.testnet", DAY);
    flush(&mut c);
    let before = env::storage_usage();
    let _ = c.ft_on_transfer(acc("alice.testnet"), U128(pepe(20_000_000)), String::new());
    flush(&mut c);
    let grown = (env::storage_usage() - before) as u128;
    let paid = credit_before - c.get_meal_credit(acc("alice.testnet")).0;
    assert!(grown > 0);
    assert!(
        paid >= grown * env::storage_byte_cost().as_yoctonear(),
        "the feeder paid for {paid} yocto of storage, the feeding stored {grown} bytes"
    );
}

#[test]
fn the_feeder_is_registered_from_their_own_credit() {
    use near_contract_standards::storage_management::StorageManagement;
    let mut c = setup(DAY);
    assert!(c.storage_balance_of(acc("alice.testnet")).is_none());
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    // registered at the feeding, so collecting later needs nothing more
    assert!(c.storage_balance_of(acc("alice.testnet")).is_some());
    ctx("alice.testnet", 40 * DAY);
    assert_eq!(c.claim("1".into()).0, FIRST);
}

#[test]
#[should_panic(expected = "not registered for $CONSUME yet")]
fn a_bond_received_later_pays_its_own_registration() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    ctx_yocto("alice.testnet", DAY);
    c.nft_transfer(acc("carol.testnet"), "1".into(), None, None);
    // Carol has no storage credit and never registered: the contract does not pay for her
    ctx("carol.testnet", 20 * DAY);
    c.claim("1".into());
}

#[test]
fn a_first_credit_deposit_pays_for_its_record() {
    let mut c = setup(DAY);
    let deposit = |c: &mut Contract, who: &str, yocto: u128| {
        let mut b = VMContextBuilder::new();
        b.current_account_id(acc("consume.testnet"))
            .predecessor_account_id(acc("mallory.testnet"))
            .block_timestamp(DAY)
            .attached_deposit(NearToken::from_yoctonear(yocto))
            .account_balance(NearToken::from_near(100));
        testing_env!(b.build());
        c.add_meal_credit(Some(acc(who))).0
    };
    // one yocto cannot open a record at the contract's cost
    let dust = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| deposit(&mut c, "victim1.testnet", 1)));
    assert!(dust.is_err(), "a one-yocto deposit opened a credit record");
    // a real first deposit is credited less its record, later ones in full
    let tenth = NearToken::from_millinear(100).as_yoctonear();
    let first = deposit(&mut c, "victim2.testnet", tenth);
    assert!(first < tenth && first > tenth * 9 / 10, "first deposit credited {first}");
    assert_eq!(deposit(&mut c, "victim2.testnet", tenth), first + tenth);
}

#[test]
#[should_panic(expected = "This Bond is mid-transfer")]
fn a_bond_in_flight_cannot_start_another_transfer_call() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    ctx_yocto("alice.testnet", 10 * DAY);
    let _ = c.nft_transfer_call(acc("bob.testnet"), "1".into(), None, None, String::new());
    assert!(c.in_flight.contains("1"));
    // Bob holds it until the transfer resolves. A second transfer-call from him
    // would resolve first and lift the lock, letting him collect and hand it back.
    ctx_yocto("bob.testnet", 10 * DAY);
    let _ = c.nft_transfer_call(acc("carol.testnet"), "1".into(), None, None, String::new());
}

#[test]
#[should_panic(expected = "Too little to redeem")]
fn a_redemption_that_would_pay_nothing_is_refused() {
    let mut c = setup(DAY);
    feed(&mut c, "doge.testnet", "alice.testnet", doge(1_000), DAY);
    ctx("alice.testnet", 40 * DAY);
    c.claim("1".into());
    // one unit of $CONSUME is worth less than one unit of DOGE: burning it would pay nothing
    ctx_yocto("alice.testnet", 40 * DAY);
    c.redeem(U128(1));
}

#[test]
fn a_failed_payout_stays_owed_and_a_paid_one_is_cleared() {
    use near_sdk::PromiseError;
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    ctx("alice.testnet", 40 * DAY);
    c.claim("1".into());
    ctx_yocto("alice.testnet", 40 * DAY);
    assert_eq!(c.redeem(U128(FIRST / 2)), 1);
    let share = pepe(10_000_000);
    // in flight: nothing shows as owed, but the record is still there to write back to
    assert!(c.get_owed(acc("alice.testnet")).is_empty());
    assert!(c.owed.contains_key(&(acc("alice.testnet"), acc("pepe.testnet"))));
    // the transfer fails (say Alice is not registered on PEPE): owed again
    ctx("consume.testnet", 40 * DAY);
    assert!(!c.on_withdraw(acc("alice.testnet"), acc("pepe.testnet"), U128(share), Err(PromiseError::Failed)));
    assert_eq!(c.get_owed(acc("alice.testnet")), vec![(acc("pepe.testnet"), U128(share))]);
    // she retries and it lands: the record goes
    ctx("alice.testnet", 40 * DAY);
    assert_eq!(c.withdraw_owed(), 1);
    ctx("consume.testnet", 40 * DAY);
    assert!(c.on_withdraw(acc("alice.testnet"), acc("pepe.testnet"), U128(share), Ok(())));
    assert!(!c.owed.contains_key(&(acc("alice.testnet"), acc("pepe.testnet"))));
}

#[test]
#[should_panic(expected = "mid-transfer")]
fn bond_in_flight_cannot_be_claimed() {
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
    let _ = c.ft_on_transfer(acc("alice.testnet"), U128(pepe(20_000_000)), msg); // pays 99k
}

#[test]
#[should_panic(expected = "Worth less than your minimum")]
fn min_net_usd_is_enforced() {
    let mut c = setup(DAY);
    credit(&mut c, "alice.testnet", DAY);
    // quoted at $100, $99 after the tithe; then PEPE's posted price drops 10%
    post(&mut c, DAY, 4_500_000_000_000, DOGE_PRICE);
    ctx("pepe.testnet", DAY);
    let msg = format!(r#"{{"min_net_usd":"{}"}}"#, 98 * USD);
    let _ = c.ft_on_transfer(acc("alice.testnet"), U128(pepe(20_000_000)), msg);
}

#[test]
fn min_net_usd_ignores_the_rest_of_the_stomach() {
    let mut c = setup(DAY);
    feed(&mut c, "doge.testnet", "bob.testnet", doge(10_000), DAY); // $700 of DOGE in the stomach
    let quoted = c.quote_meal(acc("pepe.testnet"), U128(pepe(20_000_000)));
    // DOGE gains 20% while Alice's wallet is open: her $100 now mints fewer
    // $CONSUME, each backed by more, and is still counted at $99
    post(&mut c, DAY, PEPE_PRICE, 84_000_000_000_000_000);
    let now = c.quote_meal(acc("pepe.testnet"), U128(pepe(20_000_000)));
    assert!(now.consume.0 < quoted.consume.0 * 99 / 100, "a count-based minimum would have refunded her");
    credit(&mut c, "alice.testnet", DAY);
    ctx("pepe.testnet", DAY);
    let msg = format!(r#"{{"min_net_usd":"{}"}}"#, 99 * USD);
    let _ = c.ft_on_transfer(acc("alice.testnet"), U128(pepe(20_000_000)), msg);
    let bond = c.get_vest((c.next_vest_id - 1).to_string()).unwrap();
    assert_eq!(bond.owner_id, acc("alice.testnet"));
    assert_eq!(bond.vest.total, now.consume);
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

// ---------- NEAR Intents ----------

const PEPE_OMFT: &str = "eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near";

fn setup_intents(now: u64) -> Contract {
    setup(now)
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
fn intents_feeding_mints_a_bond() {
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

// ---------- fixed at launch, and the guardian ----------

#[test]
fn the_launch_list_is_what_new_was_given() {
    let c = setup(DAY);
    let tribes = c.get_tribes();
    assert_eq!(tribes.len(), 3);
    assert!(tribes.iter().all(|(_, t)| t.open && t.max_meal_usd.0 == 1_000 * USD && t.daily_cap_usd.0 == 5_000 * USD));
    assert!(c.get_tribe(acc(PEPE_OMFT)).unwrap().via_intents);
    assert!(!c.get_tribe(acc("doge.testnet")).unwrap().via_intents);
}

#[test]
#[should_panic(expected = "listed twice")]
fn launch_refuses_a_memecoin_listed_twice() {
    ctx("deployer.testnet", DAY);
    Contract::new(config(), vec![tribe("pepe.testnet", "PEPE", 18, false), tribe("pepe.testnet", "PEPE", 6, false)]);
}

#[test]
#[should_panic(expected = "needs intents_id")]
fn launch_refuses_an_intents_memecoin_without_the_intents_contract() {
    ctx("deployer.testnet", DAY);
    Contract::new(Config { intents_id: None, ..config() }, vec![tribe(PEPE_OMFT, "PEPE", 18, true)]);
}

#[test]
#[should_panic(expected = "This tribe is closed")]
fn the_guardian_can_seal_a_memecoin() {
    let mut c = setup(DAY);
    ctx("guardian.testnet", DAY);
    c.set_tribe_open(acc("pepe.testnet"), false);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
}

#[test]
fn a_sealed_memecoin_stays_redeemable_and_can_be_unsealed() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    ctx("guardian.testnet", DAY);
    c.set_tribe_open(acc("pepe.testnet"), false);
    let t = c.get_tribe(acc("pepe.testnet")).unwrap();
    assert!(!t.open);
    assert_eq!(t.stomach.0, pepe(20_000_000));
    c.set_tribe_open(acc("pepe.testnet"), true);
    assert_eq!(feed(&mut c, "pepe.testnet", "bob.testnet", pepe(20_000_000), DAY), 0);
}

#[test]
#[should_panic(expected = "Only the guardian")]
fn nobody_else_can_seal_a_memecoin() {
    let mut c = setup(DAY);
    ctx("feeder.testnet", DAY);
    c.set_tribe_open(acc("pepe.testnet"), false);
}

#[test]
#[should_panic(expected = "Only the price feeder")]
fn a_replaced_price_feeder_can_no_longer_post_prices() {
    let mut c = setup(DAY);
    ctx("guardian.testnet", DAY);
    c.set_price_feeder(acc("feeder2.testnet"));
    assert_eq!(c.get_config().price_feeder_id, acc("feeder2.testnet"));
    ctx("feeder.testnet", DAY);
    c.set_prices(vec![(acc("pepe.testnet"), U128(1))]);
}

#[test]
#[should_panic(expected = "A price must be more than zero")]
fn a_zero_price_is_refused() {
    let mut c = setup(DAY);
    post(&mut c, DAY, 0, DOGE_PRICE);
}

#[test]
#[should_panic(expected = "Only the guardian")]
fn a_renounced_guardian_has_no_power_left() {
    let mut c = setup(DAY);
    ctx("guardian.testnet", DAY);
    c.set_guardian(None);
    assert!(c.get_config().guardian_id.is_none());
    c.set_price_feeder(acc("feeder2.testnet"));
}
