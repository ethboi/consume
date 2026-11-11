//! Testnet stand-in for NEAR Intents (`intents.near`), which has no testnet.
//!
//! It implements the parts of the real contract CONSUME uses, with the same
//! method names and arguments (checked against github.com/near/intents):
//! NEP-245 `mt_transfer`, `mt_transfer_call`, `mt_balance_of`,
//! `mt_batch_balance_of`, the `mt_on_transfer` receiver call and
//! `mt_resolve_transfer`. Approvals are refused, as on mainnet.
//!
//! Cross-chain movement is simulated: `simulate_deposit` credits a balance as if
//! a memecoin had arrived from its home chain, and `simulate_withdraw` burns one
//! as if it had been sent back. Token ids are the real mainnet ones, e.g.
//! `nep141:eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near` for PEPE.

use near_sdk::json_types::U128;

include!("sponsorship_tests.rs");
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, PanicOnDefault, PromiseOrValue,
};

const COOLDOWN_NS: u64 = 60 * 60 * 1_000_000_000;
// Finite sponsorship: <=2.622 NEAR including code, below the 3 NEAR launch funding.
// Existing records remain usable at the cap.
const MAX_SPONSORED_STORAGE: u64 = 256 * 1024;
const GAS_ON_TRANSFER: Gas = Gas::from_tgas(80);
const GAS_RESOLVE: Gas = Gas::from_tgas(10);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Balances,
    Supply,
    Drip,
    LastDeposit,
}

#[ext_contract(ext_receiver)]
#[allow(dead_code)]
trait MultiTokenReceiver {
    fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>>;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    balances: LookupMap<(AccountId, String), u128>,
    supply: LookupMap<String, u128>,
    /// token id -> raw amount one simulated deposit credits
    drip: LookupMap<String, u128>,
    last_deposit: LookupMap<(AccountId, String), u64>,
}

fn event(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!("EVENT_JSON:{}", json!({ "standard": "nep245", "version": "1.0.0", "event": event, "data": [data] })));
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            balances: LookupMap::new(StorageKey::Balances),
            supply: LookupMap::new(StorageKey::Supply),
            drip: LookupMap::new(StorageKey::Drip),
            last_deposit: LookupMap::new(StorageKey::LastDeposit),
        }
    }

    /// Owner: how much one simulated deposit of `token_id` credits.
    pub fn set_drip(&mut self, token_id: String, amount: U128) {
        require!(env::predecessor_account_id() == self.owner_id, "Only the owner");
        require!(token_id.starts_with("nep141:"), "token ids look like nep141:<contract>");
        self.drip.insert(token_id, amount.0);
    }

    // ---------- simulated cross-chain ----------

    /// Credit the caller as if `token_id` had just arrived from its home chain
    /// through Intents. Once an hour per token.
    pub fn simulate_deposit(&mut self, token_id: String, from_chain: String) -> U128 {
        self.flush_storage();
        let before = env::storage_usage();
        let who = env::predecessor_account_id();
        let amount = *self.drip.get(&token_id).unwrap_or_else(|| env::panic_str("This token has no simulated deposits"));
        let key = (who.clone(), token_id.clone());
        let now = env::block_timestamp();
        if let Some(last) = self.last_deposit.get(&key) {
            require!(now >= last + COOLDOWN_NS, "One simulated deposit per token per hour");
        }
        self.last_deposit.insert(key, now);
        self.credit(&who, &token_id, amount);
        self.enforce_sponsorship_budget(before);
        event("mt_mint", json!({ "owner_id": who, "token_ids": [token_id], "amounts": [U128(amount)], "memo": format!("simulated deposit from {from_chain}") }));
        U128(amount)
    }

    /// Burn the caller's balance as if it had been withdrawn to `to_address`
    /// on the token's home chain. Requires 1 yoctoNEAR, like real withdrawals.
    #[payable]
    pub fn simulate_withdraw(&mut self, token_id: String, amount: U128, to_address: String) {
        assert_one_yocto();
        let who = env::predecessor_account_id();
        self.debit(&who, &token_id, amount.0);
        event("mt_burn", json!({ "owner_id": who, "token_ids": [token_id], "amounts": [amount], "memo": format!("simulated withdrawal to {to_address}") }));
    }

    // ---------- NEP-245 (the subset intents.near offers that CONSUME uses) ----------

    #[payable]
    pub fn mt_transfer(&mut self, receiver_id: AccountId, token_id: String, amount: U128, approval: Option<(AccountId, u64)>, memo: Option<String>) {
        assert_one_yocto();
        require!(approval.is_none(), "approvals are not supported");
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver_id, &token_id, amount.0, memo.as_deref());
    }

    #[payable]
    pub fn mt_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        assert_one_yocto();
        require!(approval.is_none(), "approvals are not supported");
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver_id, &token_id, amount.0, memo.as_deref());
        ext_receiver::ext(receiver_id.clone())
            .with_static_gas(GAS_ON_TRANSFER)
            .mt_on_transfer(sender.clone(), vec![sender.clone()], vec![token_id.clone()], vec![amount], msg)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_RESOLVE)
                    .mt_resolve_transfer(sender, receiver_id, token_id, amount),
            )
            .into()
    }

    /// Refund whatever the receiver returned (or everything if it failed),
    /// limited to what the receiver still holds. Returns the amounts used.
    #[private]
    pub fn mt_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, token_id: String, amount: U128) -> Vec<U128> {
        let unused = match env::promise_result_checked(0, 1_000) {
            Ok(bytes) => near_sdk::serde_json::from_slice::<Vec<U128>>(&bytes)
                .ok()
                .and_then(|v| v.first().map(|x| x.0))
                .map(|x| x.min(amount.0))
                .unwrap_or(amount.0),
            Err(_) => amount.0,
        };
        let held = self.balance(&receiver_id, &token_id);
        let refund = unused.min(held);
        if refund > 0 {
            self.move_tokens(&receiver_id, &sender_id, &token_id, refund, Some("refund"));
        }
        vec![U128(amount.0 - refund)]
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(self.balance(&account_id, &token_id))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids.iter().map(|t| U128(self.balance(&account_id, t))).collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        self.supply.get(&token_id).map(|s| U128(*s))
    }
}

impl Contract {
    fn balance(&self, who: &AccountId, token_id: &str) -> u128 {
        *self.balances.get(&(who.clone(), token_id.to_string())).unwrap_or(&0)
    }

    fn flush_storage(&mut self) {
        self.balances.flush();
        self.supply.flush();
        self.last_deposit.flush();
        self.drip.flush();
    }

    fn enforce_sponsorship_budget(&mut self, before: u64) {
        self.flush_storage();
        let after = env::storage_usage();
        require!(after <= before || after <= MAX_SPONSORED_STORAGE, "Testnet storage sponsorship exhausted");
    }

    fn credit(&mut self, who: &AccountId, token_id: &str, amount: u128) {
        *self.balances.entry((who.clone(), token_id.to_string())).or_insert(0) += amount;
        *self.supply.entry(token_id.to_string()).or_insert(0) += amount;
    }

    fn debit(&mut self, who: &AccountId, token_id: &str, amount: u128) {
        require!(amount > 0, "amount must be positive");
        let key = (who.clone(), token_id.to_string());
        let bal = *self.balances.get(&key).unwrap_or(&0);
        require!(bal >= amount, "Not enough balance");
        self.balances.insert(key, bal - amount);
        *self.supply.entry(token_id.to_string()).or_insert(0) -= amount;
    }

    fn move_tokens(&mut self, from: &AccountId, to: &AccountId, token_id: &str, amount: u128, memo: Option<&str>) {
        self.flush_storage();
        let before = env::storage_usage();
        require!(from != to, "sender and receiver must differ");
        self.debit(from, token_id, amount);
        self.credit(to, token_id, amount);
        self.enforce_sponsorship_budget(before);
        event(
            "mt_transfer",
            json!({ "old_owner_id": from, "new_owner_id": to, "token_ids": [token_id], "amounts": [U128(amount)], "memo": memo }),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::NearToken;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const PEPE: &str = "nep141:eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near";

    fn ctx(who: &str, yocto: u128, now: u64) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(who.parse().unwrap())
            .current_account_id("intents.testnet".parse().unwrap())
            .storage_usage(180_000)
            .attached_deposit(NearToken::from_yoctonear(yocto))
            .block_timestamp(now);
        testing_env!(b.build());
    }

    #[test]
    fn deposit_transfer_withdraw() {
        ctx("owner.testnet", 0, 1);
        let mut c = Contract::new("owner.testnet".parse().unwrap());
        c.set_drip(PEPE.into(), U128(1_000));
        ctx("alice.testnet", 0, 1);
        assert_eq!(c.simulate_deposit(PEPE.into(), "Ethereum".into()).0, 1_000);
        ctx("alice.testnet", 1, 1);
        c.mt_transfer("bob.testnet".parse().unwrap(), PEPE.into(), U128(400), None, None);
        assert_eq!(c.mt_balance_of("alice.testnet".parse().unwrap(), PEPE.into()).0, 600);
        assert_eq!(c.mt_balance_of("bob.testnet".parse().unwrap(), PEPE.into()).0, 400);
        ctx("bob.testnet", 1, 1);
        c.simulate_withdraw(PEPE.into(), U128(400), "0xabc".into());
        assert_eq!(c.mt_supply(PEPE.into()).unwrap().0, 600);
    }

    #[test]
    #[should_panic(expected = "One simulated deposit per token per hour")]
    fn deposit_cooldown() {
        ctx("owner.testnet", 0, 1);
        let mut c = Contract::new("owner.testnet".parse().unwrap());
        c.set_drip(PEPE.into(), U128(1_000));
        ctx("alice.testnet", 0, 1);
        c.simulate_deposit(PEPE.into(), "Ethereum".into());
        c.simulate_deposit(PEPE.into(), "Ethereum".into());
    }

    #[test]
    #[should_panic(expected = "approvals are not supported")]
    fn approvals_refused() {
        ctx("owner.testnet", 0, 1);
        let mut c = Contract::new("owner.testnet".parse().unwrap());
        ctx("alice.testnet", 1, 1);
        c.mt_transfer("bob.testnet".parse().unwrap(), PEPE.into(), U128(1), Some(("x.testnet".parse().unwrap(), 1)), None);
    }
}
