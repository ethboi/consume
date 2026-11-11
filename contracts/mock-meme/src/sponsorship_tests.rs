
#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{testing_env, test_utils::VMContextBuilder};
    fn context(who: &str, bytes: u64, now: u64) {
        let mut b = VMContextBuilder::new();
        b.current_account_id("pepe.testnet".parse().unwrap()).predecessor_account_id(who.parse().unwrap())
            .storage_usage(bytes).block_timestamp(now);
        testing_env!(b.build());
    }
    fn setup() -> Contract {
        context("alice.testnet", 180_000, 1);
        let mut c = Contract::new("Pepe".into(), "PEPE".into(), 18, U128(1000));
        c.faucet();
        c
    }
    #[test]
    #[should_panic(expected = "Testnet storage sponsorship exhausted")]
    fn free_registration_is_bounded() {
        let mut c = setup();
        context("alice.testnet", MAX_SPONSORED_STORAGE, 1);
        c.register("uncreated.testnet".parse().unwrap());
    }
    #[test]
    #[should_panic(expected = "Testnet storage sponsorship exhausted")]
    fn free_faucet_growth_is_bounded() {
        let mut c = setup();
        context("bob.testnet", MAX_SPONSORED_STORAGE, 1);
        c.faucet();
    }
    #[test]
    fn existing_registration_and_faucet_work_at_the_cap() {
        let mut c = setup();
        context("alice.testnet", MAX_SPONSORED_STORAGE, FAUCET_COOLDOWN_NS + 1);
        c.register("alice.testnet".parse().unwrap());
        c.faucet();
        assert_eq!(env::storage_usage(), MAX_SPONSORED_STORAGE);
        assert_eq!(c.ft_balance_of("alice.testnet".parse().unwrap()), U128(2000));
    }
}
