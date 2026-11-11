// The Feast: last week's most fed memecoin pays no tithe, and none feasts two
// weeks running. Included by tests.rs, so it shares that file's helpers.

const WEEK: u64 = 7 * DAY;

/// A moment one day into the given week.
fn week(n: u64) -> u64 {
    n * WEEK + DAY
}

/// Feed $200 of PEPE and about $100 of DOGE, so PEPE is the week's most fed.
fn pepe_leads(c: &mut Contract, now: u64) {
    reprice(c, now);
    feed(c, "pepe.testnet", "alice.testnet", pepe(40_000_000), now);
    feed(c, "doge.testnet", "bob.testnet", doge(1_428), now);
}

fn feast_now(c: &Contract) -> Option<AccountId> {
    c.get_stats().feast
}

fn pays_no_tithe(c: &Contract, token: &str) -> bool {
    let amount = if token == "pepe.testnet" { pepe(20_000_000) } else { doge(1_000) };
    let q = c.quote_meal(acc(token), U128(amount));
    assert_eq!(q.bonus, q.tithe_usd.0 == 0);
    q.bonus
}

#[test]
fn no_memecoin_feasts_two_weeks_running() {
    let mut c = setup(week(0));
    pepe_leads(&mut c, week(0));

    // week 1: PEPE feasts, and is the most fed again
    pepe_leads(&mut c, week(1));
    assert_eq!(feast_now(&c), Some(acc("pepe.testnet")));

    // week 2: PEPE was fed the most, but it has just feasted. The crown
    // passes to the most fed of the others.
    reprice(&mut c, week(2));
    let stats = c.get_stats();
    assert_eq!(stats.heaviest_last_epoch, Some(acc("pepe.testnet")));
    assert_eq!(stats.feast, Some(acc("doge.testnet")));
    assert!(pays_no_tithe(&c, "doge.testnet"));
    assert!(!pays_no_tithe(&c, "pepe.testnet"));

    // the Bonds carry it: a DOGE feeding is a feast feeding, a PEPE one is not
    let doge_bond = c.get_stats().vests_minted.0 + 1;
    feed(&mut c, "doge.testnet", "bob.testnet", doge(1_428), week(2));
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(40_000_000), week(2));
    assert!(c.get_vest(doge_bond.to_string()).unwrap().vest.bonus);
    assert!(!c.get_vest((doge_bond + 1).to_string()).unwrap().vest.bonus);
}

#[test]
fn the_crown_changes_hands_every_week_when_one_memecoin_is_always_fed_most() {
    let mut c = setup(week(0));
    let mut feasts = vec![];
    for n in 0..6 {
        reprice(&mut c, week(n));
        feasts.push(feast_now(&c));
        pepe_leads(&mut c, week(n));
        // feeding does not change who feasts this week
        assert_eq!(feast_now(&c), feasts[n as usize]);
    }
    let (p, d) = (Some(acc("pepe.testnet")), Some(acc("doge.testnet")));
    assert_eq!(feasts, vec![None, p.clone(), d.clone(), p.clone(), d.clone(), p.clone()]);
    // and every past week still answers the same
    for n in 0..6 {
        assert_eq!(c.get_feast(U64(n)), feasts[n as usize]);
    }
}

#[test]
fn a_feast_fed_alone_is_followed_by_a_week_with_no_feast() {
    let mut c = setup(week(0));
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(40_000_000), week(0));

    // week 1: PEPE feasts and is the only memecoin fed
    reprice(&mut c, week(1));
    assert!(pays_no_tithe(&c, "pepe.testnet"));
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(40_000_000), week(1));

    // week 2: no other memecoin was fed, so no memecoin feasts
    reprice(&mut c, week(2));
    assert_eq!(feast_now(&c), None);
    assert!(!pays_no_tithe(&c, "pepe.testnet"));
    assert!(!pays_no_tithe(&c, "doge.testnet"));
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(40_000_000), week(2));

    // week 3: PEPE sat a week out, so it can feast again
    reprice(&mut c, week(3));
    assert_eq!(feast_now(&c), Some(acc("pepe.testnet")));
}

#[test]
fn a_week_with_no_feedings_ends_the_run() {
    let mut c = setup(week(0));
    pepe_leads(&mut c, week(0));
    pepe_leads(&mut c, week(1));
    // week 2 (DOGE's feast) passes with no feeding at all, so week 3 has no feast
    reprice(&mut c, week(3));
    assert_eq!(c.get_feast(U64(2)), Some(acc("doge.testnet")));
    assert_eq!(feast_now(&c), None);
    pepe_leads(&mut c, week(3));
    // and PEPE, most fed in week 3, feasts in week 4
    reprice(&mut c, week(4));
    assert_eq!(feast_now(&c), Some(acc("pepe.testnet")));
}

#[test]
fn the_first_feeding_of_a_week_writes_the_feast_down_once() {
    let mut c = setup(week(0));
    assert_eq!(feast_record(0), None);
    pepe_leads(&mut c, week(0));
    // week 0 has no feast, and that is written down too
    assert_eq!(feast_record(0), Some(None));

    reprice(&mut c, week(1));
    assert_eq!(feast_record(1), None);
    let before = c.get_meal_credit(acc("carol.testnet")).0;
    assert_eq!(before, 0);
    feed(&mut c, "doge.testnet", "carol.testnet", doge(1_428), week(1));
    assert_eq!(feast_record(1), Some(Some(acc("pepe.testnet"))));
    // the feeder's credit paid for the record: the contract's storage is covered
    let first = NearToken::from_near(1).as_yoctonear() - c.get_meal_credit(acc("carol.testnet")).0;
    feed(&mut c, "pepe.testnet", "david.testnet", pepe(40_000_000), week(1));
    let later = NearToken::from_near(1).as_yoctonear() - c.get_meal_credit(acc("david.testnet")).0;
    println!("the feast record cost {} yoctoNEAR", first - later);
    assert!(first > later, "the first feeding of the week pays for the record");
}

#[test]
fn weeks_fed_before_the_rule_was_deployed_still_crown_a_feast() {
    // the live contract was fed before feasts were written down: its first
    // weeks have feedings and no record
    let mut c = setup(week(0));
    pepe_leads(&mut c, week(0));
    assert!(env::storage_remove(&feast_key(0)));

    reprice(&mut c, week(1));
    assert_eq!(feast_now(&c), Some(acc("pepe.testnet")));
    assert!(pays_no_tithe(&c, "pepe.testnet"));

    // two such weeks in a row are walked back through: PEPE feasted in the
    // second, so DOGE feasts in the third
    pepe_leads(&mut c, week(1));
    assert!(env::storage_remove(&feast_key(1)));
    reprice(&mut c, week(2));
    assert_eq!(feast_now(&c), Some(acc("doge.testnet")));
    // from the first feeding on, the record is kept
    pepe_leads(&mut c, week(2));
    assert_eq!(feast_record(2), Some(Some(acc("doge.testnet"))));
    reprice(&mut c, week(3));
    assert_eq!(feast_now(&c), Some(acc("pepe.testnet")));
}

#[test]
fn a_tie_goes_to_the_first_listed_that_did_not_just_feast() {
    let mut c = setup(week(0));
    // DOGE at $0.05, so both can be fed exactly $100
    let tie = |c: &mut Contract, now: u64| {
        post(c, now, PEPE_PRICE, 50_000_000_000_000_000);
        feed(c, "doge.testnet", "bob.testnet", doge(2_000), now);
        feed(c, "pepe.testnet", "alice.testnet", pepe(20_000_000), now);
    };
    tie(&mut c, week(0));
    // PEPE is listed first, so it takes the tie
    post(&mut c, week(1), PEPE_PRICE, 50_000_000_000_000_000);
    assert_eq!(feast_now(&c), Some(acc("pepe.testnet")));
    tie(&mut c, week(1));
    // the same tie a week later goes to DOGE, since PEPE has just feasted
    post(&mut c, week(2), PEPE_PRICE, 50_000_000_000_000_000);
    assert_eq!(feast_now(&c), Some(acc("doge.testnet")));
}
