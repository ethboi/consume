
use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::NonFungibleTokenResolver;

#[test]
fn nft_media_hash_matches_immutable_svg_while_live_media_is_explicit() {
    use near_sdk::base64::{engine::general_purpose::STANDARD, Engine};
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    let metadata = c.nft_token("1".into()).unwrap().metadata.unwrap();
    let encoded = metadata.media.unwrap();
    let image = STANDARD.decode(encoded.strip_prefix("data:image/svg+xml;base64,").unwrap()).unwrap();
    assert_eq!(metadata.media_hash.unwrap().0, env::sha256(&image));
    let extra: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(&metadata.extra.unwrap()).unwrap();
    assert_eq!(extra["dynamic_media"], "https://consume.test/vest/1.svg");
    assert_eq!(extra["dynamic_media_is_mutable"], true);
}


fn approve(c: &mut Contract, owner: &str, market: &str, now: u64) -> u64 {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("consume.testnet")).predecessor_account_id(acc(owner))
        .block_timestamp(now).attached_deposit(NearToken::from_near(1));
    testing_env!(b.build());
    c.nft_approve("1".into(), acc(market), None);
    c.nft.approvals_by_id.as_ref().unwrap().get(&"1".into()).unwrap()[&acc(market)]
}

#[test]
fn claims_and_exits_invalidate_all_approvals_without_reusing_ids() {
    for exit in [false, true] {
        // Separate prefixes are not needed: clear the mocked storage between cases.
        testing_env!(VMContextBuilder::new().build());
        near_sdk::mock::with_mocked_blockchain(|b| b.take_storage());
        let mut c = setup(DAY);
        feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
        let old = approve(&mut c, "alice.testnet", "market.testnet", 10 * DAY);
        approve(&mut c, "alice.testnet", "other.testnet", 10 * DAY);
        if exit {
            ctx_yocto("alice.testnet", 10 * DAY);
            c.exit("1".into());
        } else {
            ctx("alice.testnet", 10 * DAY);
            c.claim("1".into());
        }
        assert!(!c.nft_is_approved("1".into(), acc("market.testnet"), None));
        assert!(!c.nft_is_approved("1".into(), acc("other.testnet"), None));
        let fresh = approve(&mut c, "alice.testnet", "market.testnet", 10 * DAY);
        assert!(fresh > old);
        assert!(!c.nft_is_approved("1".into(), acc("market.testnet"), Some(old)));
        credit(&mut c, "market.testnet", 10 * DAY);
        ctx_yocto("market.testnet", 10 * DAY);
        c.nft_transfer(acc("buyer.testnet"), "1".into(), Some(fresh), None);
        assert_eq!(c.nft_token("1".into()).unwrap().owner_id, acc("buyer.testnet"));
    }
}

#[test]
#[should_panic(expected = "Sender not approved")]
fn a_market_cannot_transfer_a_bond_after_its_owner_claims() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    let old = approve(&mut c, "alice.testnet", "market.testnet", 10 * DAY);
    ctx("alice.testnet", 10 * DAY);
    c.claim("1".into());
    credit(&mut c, "market.testnet", 10 * DAY);
    ctx_yocto("market.testnet", 10 * DAY);
    c.nft_transfer(acc("buyer.testnet"), "1".into(), Some(old), None);
}

#[test]
fn a_refused_claim_preserves_approvals() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    let id = approve(&mut c, "alice.testnet", "market.testnet", DAY);
    ctx("alice.testnet", DAY);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.claim("1".into()))).is_err());
    assert!(c.nft_is_approved("1".into(), acc("market.testnet"), Some(id)));
}

#[test]
fn redemption_records_are_funded_once_and_survive_overlapping_callbacks() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    ctx("alice.testnet", 40 * DAY);
    c.claim("1".into());
    ctx_yocto("alice.testnet", 40 * DAY);
    c.owed.flush();
    let before_bytes = env::storage_usage();
    let before_credit = c.get_meal_credit(acc("alice.testnet")).0;
    c.redeem(U128(FIRST / 4));
    let cost = u128::from(env::storage_usage() - before_bytes) * env::storage_byte_cost().as_yoctonear();
    assert!(cost > 0);
    assert_eq!(before_credit - c.get_meal_credit(acc("alice.testnet")).0, cost);
    let funded_credit = c.get_meal_credit(acc("alice.testnet")).0;
    ctx_yocto("alice.testnet", 40 * DAY);
    c.redeem(U128(FIRST / 4));
    assert_eq!(c.get_meal_credit(acc("alice.testnet")).0, funded_credit);
    ctx("consume.testnet", 40 * DAY);
    c.on_withdraw(acc("alice.testnet"), acc("pepe.testnet"), U128(pepe(5_000_000)), Ok(()));
    c.owed.flush();
    let before_failure = env::storage_usage();
    c.on_withdraw(acc("alice.testnet"), acc("pepe.testnet"), U128(pepe(5_000_000)), Err(near_sdk::PromiseError::Failed));
    c.owed.flush();
    assert_eq!(env::storage_usage(), before_failure);
    assert_eq!(c.get_owed(acc("alice.testnet")), vec![(acc("pepe.testnet"), U128(pepe(5_000_000)))]);
    ctx("alice.testnet", 40 * DAY);
    c.withdraw_meal_credit(None);
    assert_eq!(c.withdraw_owed(), 1, "a retry must not require new storage credit");
}

#[test]
#[should_panic(expected = "Add storage credit first")]
fn a_token_buyer_must_fund_their_first_redemption_records() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    ctx("alice.testnet", 40 * DAY);
    c.claim("1".into());
    c.token.internal_register_account(&acc("buyer.testnet"));
    ctx_yocto("alice.testnet", 40 * DAY);
    c.ft_transfer(acc("buyer.testnet"), U128(FIRST / 2), None);
    ctx_yocto("buyer.testnet", 40 * DAY);
    c.redeem(U128(FIRST / 2));
}

#[test]
#[should_panic(expected = "This Bond is mid-transfer")]
fn a_bond_in_flight_cannot_be_transferred_directly() {
    let mut c = setup(DAY);
    feed(&mut c, "pepe.testnet", "alice.testnet", pepe(20_000_000), DAY);
    ctx_yocto("alice.testnet", DAY);
    let _ = c.nft_transfer_call(acc("bob.testnet"), "1".into(), None, None, "".into());
    ctx_yocto("bob.testnet", DAY);
    c.nft_transfer(acc("carol.testnet"), "1".into(), None, None);
}

#[test]
fn transfer_reserve_covers_long_owner_ids_and_rejected_transfer_call() {
    let mut c = setup(DAY);
    let owner = "a".repeat(64);
    let receiver = "b".repeat(64);
    feed(&mut c, "pepe.testnet", &owner, pepe(20_000_000), DAY);
    feed(&mut c, "pepe.testnet", &owner, pepe(20_000_000), DAY);
    let approval = approve(&mut c, &owner, "market.testnet", DAY);
    let approvals = c.nft.approvals_by_id.as_ref().unwrap().get(&"1".into());
    ctx_yocto(&owner, DAY);
    let credit_before = c.get_meal_credit(acc(&owner)).0;
    let bytes_before = env::storage_usage();
    let _ = c.nft_transfer_call(acc(&receiver), "1".into(), None, None, "".into());
    let forward_growth = env::storage_usage().saturating_sub(bytes_before);
    assert_eq!(credit_before - c.get_meal_credit(acc(&owner)).0,
        u128::from(crate::standards::BOND_TRANSFER_STORAGE_BYTES) * env::storage_byte_cost().as_yoctonear());
    // The previous owner loses their other Bond while the call is pending.
    ctx_yocto(&owner, DAY);
    c.nft_transfer(acc("carol.testnet"), "2".into(), None, None);
    assert!(c.nft.tokens_per_owner.as_ref().unwrap().get(&acc(&owner)).is_none());
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("consume.testnet")).predecessor_account_id(acc("consume.testnet"));
    testing_env!(b.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::default(), vec![near_sdk::PromiseResult::Successful(b"true".to_vec())]);
    let callback_before = env::storage_usage();
    assert!(!c.nft_resolve_transfer(acc(&owner), acc(&receiver), "1".into(), approvals));
    let callback_growth = env::storage_usage().saturating_sub(callback_before);
    assert!(forward_growth + callback_growth <= crate::standards::BOND_TRANSFER_STORAGE_BYTES);
    assert!(c.nft_is_approved("1".into(), acc("market.testnet"), Some(approval)));
    assert_eq!(c.nft_token("1".into()).unwrap().owner_id, acc(&owner));
}

#[test]
fn the_largest_launch_can_schedule_every_intents_payout() {
    ctx("deployer.testnet", DAY);
    let tribes = (0..MAX_TRIBES).map(|i| tribe(&format!("coin{i}.testnet"), "COIN", 18, true)).collect();
    let mut c = Contract::new(config(), tribes);
    credit(&mut c, "alice.testnet", DAY);
    c.token.internal_register_account(&acc("alice.testnet"));
    c.token.internal_deposit(&acc("alice.testnet"), 1000);
    for t in c.tribes.values_mut() { t.stomach = U128(1000); }
    ctx_yocto("alice.testnet", DAY);
    assert_eq!(c.redeem(U128(100)), 10);
}

#[test]
#[should_panic(expected = "Too many memecoins")]
fn launches_above_the_payout_gas_limit_are_refused() {
    ctx("deployer.testnet", DAY);
    let tribes = (0..=MAX_TRIBES).map(|i| tribe(&format!("coin{i}.testnet"), "COIN", 18, true)).collect();
    Contract::new(config(), tribes);
}
