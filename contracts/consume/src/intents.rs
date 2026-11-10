//! Feeding through NEAR Intents. A memecoin bridged from its home chain sits in
//! the feeder's Intents balance as a NEP-245 token such as
//! `nep141:eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near`. The feeder
//! calls `mt_transfer_call` on the Intents contract with CONSUME as receiver,
//! and the Intents contract calls `mt_on_transfer` here.

use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, PromiseOrValue};

use crate::meal::parse_meal_msg;
use crate::{Contract, ContractExt};

/// NEP-245 ids for NEP-141 tokens held on Intents.
pub(crate) const NEP141_PREFIX: &str = "nep141:";

pub(crate) fn intents_token_id(token: &AccountId) -> String {
    format!("{NEP141_PREFIX}{token}")
}

#[near]
impl Contract {
    /// NEP-245 receiver. `msg` follows the same rules as `ft_on_transfer`.
    /// One memecoin per call. Returns the unused amount, which the Intents
    /// contract refunds; a panic refunds everything.
    pub fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        let intents = self.config.intents_id.clone().unwrap_or_else(|| env::panic_str("NEAR Intents is not set up"));
        require!(env::predecessor_account_id() == intents, "Only the NEAR Intents contract can call this");
        require!(token_ids.len() == 1 && amounts.len() == 1, "Feed one memecoin at a time");
        // The feeder is whoever owned the tokens, which is the sender for a
        // plain mt_transfer_call.
        require!(previous_owner_ids.len() == 1 && previous_owner_ids[0] == sender_id, "Feed from your own balance");

        let token: AccountId = token_ids[0]
            .strip_prefix(NEP141_PREFIX)
            .and_then(|t| t.parse().ok())
            .unwrap_or_else(|| env::panic_str("CONSUME only eats nep141: tokens"));
        let tribe = self.tribes.get(&token).unwrap_or_else(|| env::panic_str("CONSUME does not eat this token"));
        require!(tribe.via_intents, "This memecoin is fed directly (ft_transfer_call), not through Intents");

        let (eater, terms) = parse_meal_msg(&sender_id, &msg);
        let refund = self.eat(token, sender_id, eater, amounts[0].0, terms);
        PromiseOrValue::Value(vec![U128(refund)])
    }
}
