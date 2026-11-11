
#[cfg(test)]
mod sponsorship_tests {
    use super::*;
    use near_sdk::{testing_env, NearToken};
    use near_sdk::test_utils::VMContextBuilder;
    const TOKEN: &str = "nep141:pepe.testnet";

    fn context(who: &str, bytes: u64) {
        let mut b = VMContextBuilder::new();
        b.current_account_id("intents.testnet".parse().unwrap())
            .predecessor_account_id(who.parse().unwrap())
            .storage_usage(bytes).attached_deposit(NearToken::from_yoctonear(1))
            .block_timestamp(2 * COOLDOWN_NS);
        testing_env!(b.build());
    }
    fn setup() -> Contract {
        context("owner.testnet", 180_000);
        let mut c = Contract::new("owner.testnet".parse().unwrap());
        c.set_drip(TOKEN.into(), U128(1000));
        context("alice.testnet", 180_000);
        c.simulate_deposit(TOKEN.into(), "Ethereum".into());
        c.mt_transfer("bob.testnet".parse().unwrap(), TOKEN.into(), U128(100), None, None);
        c
    }
    #[test]
    #[should_panic(expected = "Testnet storage sponsorship exhausted")]
    fn arbitrary_receivers_cannot_exhaust_sponsor_balance() {
        let mut c = setup();
        context("alice.testnet", MAX_SPONSORED_STORAGE);
        c.mt_transfer("uncreated.testnet".parse().unwrap(), TOKEN.into(), U128(1), None, None);
    }
    #[test]
    #[should_panic(expected = "Testnet storage sponsorship exhausted")]
    fn transfer_calls_share_the_sponsorship_cap() {
        let mut c = setup();
        context("alice.testnet", MAX_SPONSORED_STORAGE);
        let _ = c.mt_transfer_call("uncreated.testnet".parse().unwrap(), TOKEN.into(), U128(1), None, None, "".into());
    }
    #[test]
    #[should_panic(expected = "Testnet storage sponsorship exhausted")]
    fn new_faucet_users_share_the_sponsorship_cap() {
        let mut c = setup();
        context("new.testnet", MAX_SPONSORED_STORAGE);
        c.simulate_deposit(TOKEN.into(), "Ethereum".into());
    }
    #[test]
    fn existing_balances_and_async_refunds_work_at_the_cap() {
        let mut c = setup();
        context("alice.testnet", MAX_SPONSORED_STORAGE);
        c.mt_transfer("bob.testnet".parse().unwrap(), TOKEN.into(), U128(900), None, None);
        assert_eq!(c.balance(&"alice.testnet".parse().unwrap(), TOKEN), 0);
        let mut b = VMContextBuilder::new();
        b.current_account_id("intents.testnet".parse().unwrap())
            .predecessor_account_id("intents.testnet".parse().unwrap()).storage_usage(MAX_SPONSORED_STORAGE);
        testing_env!(b.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::default(), vec![near_sdk::PromiseResult::Failed]);
        assert_eq!(c.mt_resolve_transfer("alice.testnet".parse().unwrap(), "bob.testnet".parse().unwrap(), TOKEN.into(), U128(900)), vec![U128(0)]);
        assert_eq!(env::storage_usage(), MAX_SPONSORED_STORAGE);
        assert_eq!(c.balance(&"alice.testnet".parse().unwrap(), TOKEN), 900);
    }
}
