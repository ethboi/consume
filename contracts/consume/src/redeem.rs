//! Redeem: burn $CONSUME, take your share of every meme in the stomach.

use near_contract_standards::fungible_token::events::FtBurn;
use near_sdk::json_types::U128;
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, require, AccountId, Gas, NearToken, PromiseError,
};

use crate::math;
use crate::{emit_event, Contract, ContractExt};

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_MT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_ON_WITHDRAW: Gas = Gas::from_tgas(5);

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait MemeToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[ext_contract(ext_mt)]
#[allow(dead_code)]
trait Intents {
    fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    );
}

#[near(serializers = [json])]
pub struct RedeemQuote {
    /// (tribe token, raw units you would receive)
    pub shares: Vec<(AccountId, U128)>,
    /// Supply the share is measured against: circulating + still vesting.
    pub denominator: U128,
}

impl Contract {
    /// Everyone's claim on the stomach is counted against minted $CONSUME plus
    /// $CONSUME still vesting, so early claimers cannot drain it before later
    /// vests unlock.
    fn denominator(&self) -> u128 {
        self.token.total_supply + self.total_unvested
    }

    fn quote(&self, amount: u128) -> RedeemQuote {
        let denom = self.denominator();
        let shares = self
            .tribes
            .iter()
            .map(|(k, t)| (k.clone(), U128(if denom == 0 { 0 } else { math::mul_div(t.stomach.0, amount, denom) })))
            .collect();
        RedeemQuote { shares, denominator: U128(denom) }
    }

    /// Schedule one transfer (with its own refund-on-failure callback) per owed
    /// tribe. Each promise is independent: NEAR does not allow returning a joint
    /// promise, and one failed payout must not block the others.
    /// Returns how many payouts were started.
    fn start_withdrawals(&mut self, account_id: &AccountId) -> u32 {
        let mut started = 0;
        let keys: Vec<AccountId> = self.tribes.keys().cloned().collect();
        for token in keys {
            let key = (account_id.clone(), token.clone());
            let owed = *self.owed.get(&key).unwrap_or(&0);
            if owed == 0 {
                continue;
            }
            self.owed.remove(&key);
            let memo = Some("CONSUME stomach".to_string());
            let via_intents = self.tribes.get(&token).map(|t| t.via_intents).unwrap_or(false);
            let payout = match (via_intents, self.config.intents_id.clone()) {
                // Paid into the redeemer's Intents balance, from where it can be
                // withdrawn to the memecoin's home chain. No registration needed.
                (true, Some(intents)) => ext_mt::ext(intents)
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .with_static_gas(GAS_MT_TRANSFER)
                    .mt_transfer(account_id.clone(), crate::intents::intents_token_id(&token), U128(owed), None, memo),
                _ => ext_ft::ext(token.clone())
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .with_static_gas(GAS_FT_TRANSFER)
                    .ft_transfer(account_id.clone(), U128(owed), memo),
            };
            payout
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_ON_WITHDRAW)
                        .on_withdraw(account_id.clone(), token, U128(owed)),
                )
                .detach();
            started += 1;
        }
        started
    }
}

#[near]
impl Contract {
    pub fn quote_redeem(&self, amount: U128) -> RedeemQuote {
        self.quote(amount.0)
    }

    /// Burn `amount` $CONSUME and take your share of every tribe in the stomach.
    /// Payouts go out straight away. If a transfer fails (for example you are not
    /// registered on that meme's token), the amount stays owed to you and
    /// `withdraw_owed` retries it. Requires 1 yoctoNEAR.
    #[payable]
    pub fn redeem(&mut self, amount: U128) -> u32 {
        assert_one_yocto();
        let account = env::predecessor_account_id();
        let amount = amount.0;
        require!(amount > 0, "Nothing to redeem");
        let q = self.quote(amount);

        for (token, share) in &q.shares {
            if share.0 == 0 {
                continue;
            }
            let tribe = self.tribes.get_mut(token).unwrap();
            tribe.stomach = U128(tribe.stomach.0 - share.0);
            *self.owed.entry((account.clone(), token.clone())).or_insert(0) += share.0;
        }
        self.token.internal_withdraw(&account, amount);
        self.total_redeemed += amount;
        FtBurn { owner_id: &account, amount: U128(amount), memo: Some("redeem") }.emit();
        emit_event(
            "redeem",
            near_sdk::serde_json::json!({ "account": account, "burned": U128(amount), "shares": q.shares }),
        );
        self.start_withdrawals(&account)
    }

    /// Retry paying out anything still owed to the caller.
    pub fn withdraw_owed(&mut self) -> u32 {
        let account = env::predecessor_account_id();
        self.start_withdrawals(&account)
    }

    #[private]
    pub fn on_withdraw(
        &mut self,
        account_id: AccountId,
        token: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_err() {
            *self.owed.entry((account_id, token)).or_insert(0) += amount.0;
            false
        } else {
            true
        }
    }
}
