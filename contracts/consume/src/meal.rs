//! Eating: a whitelisted meme arrives through `ft_transfer_call`, goes into the
//! reliquary for good, and the sender gets a Vest NFT that releases $CONSUME.

use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
use near_sdk::json_types::{U128, U64};
use near_sdk::{env, near, require, AccountId, PromiseOrValue};

use crate::math;
use crate::{emit_event, Contract, ContractExt, Vest, NANOS_PER_DAY};

/// What a meal would do, without doing it. Same logic as the real thing.
#[near(serializers = [json])]
pub struct MealQuote {
    /// Raw meme units that would be eaten.
    pub accepted: U128,
    /// Raw meme units that would be sent back (over a cap).
    pub refund: U128,
    /// USD value of the accepted part, micro-USD.
    pub meal_usd: U128,
    /// $CONSUME the Vest NFT would release.
    pub consume: U128,
    /// True if the heaviest-tribe bonus applies.
    pub bonus: bool,
}

impl Contract {
    pub(crate) fn plan_meal(&self, token_id: &AccountId, amount: u128) -> MealQuote {
        let tribe = self.tribes.get(token_id).unwrap_or_else(|| env::panic_str("CONSUME does not eat this token"));
        require!(tribe.open, "This tribe is closed");
        require!(tribe.price_e18.0 > 0, "No price for this tribe yet");
        let now = env::block_timestamp();
        require!(
            now.saturating_sub(tribe.price_updated_ns.0) <= self.config.max_price_age_ns.0,
            "Price is stale, try again shortly"
        );

        let day = now / NANOS_PER_DAY;
        let fed_today = *self.daily_fed.get(&(token_id.clone(), day)).unwrap_or(&0);
        let room_today = tribe.daily_cap_usd.0.saturating_sub(fed_today);
        let allowed_usd = room_today.min(tribe.max_meal_usd.0);
        require!(allowed_usd > 0, "This tribe has eaten its fill today");

        let full_usd = math::usd_value(amount, tribe.decimals, tribe.price_e18.0);
        let (accepted, meal_usd) = if full_usd <= allowed_usd {
            (amount, full_usd)
        } else {
            let accepted = math::amount_for_usd(allowed_usd, tribe.decimals, tribe.price_e18.0).min(amount);
            (accepted, math::usd_value(accepted, tribe.decimals, tribe.price_e18.0))
        };
        require!(meal_usd >= self.config.min_meal_usd.0, "Meal too small");

        let epoch = now / self.config.epoch_ns.0;
        let bonus = self.heaviest_tribe(epoch.saturating_sub(1)).as_ref() == Some(token_id) && epoch > 0;
        let mut consume = math::consume_for_meal(
            self.config.start_rate.0,
            self.config.halving_usd.0,
            self.total_eaten_usd,
            meal_usd,
        );
        if bonus {
            consume = math::apply_bps(consume, self.config.heaviest_bonus_bps as u128);
        }

        MealQuote {
            accepted: U128(accepted),
            refund: U128(amount - accepted),
            meal_usd: U128(meal_usd),
            consume: U128(consume),
            bonus,
        }
    }

    fn eat(&mut self, token_id: AccountId, eater: AccountId, amount: u128) -> u128 {
        let q = self.plan_meal(&token_id, amount);
        let now = env::block_timestamp();
        let day = now / NANOS_PER_DAY;
        let epoch = now / self.config.epoch_ns.0;

        // reliquary and counters
        let tribe = self.tribes.get_mut(&token_id).unwrap();
        tribe.reliquary = U128(tribe.reliquary.0 + q.accepted.0);
        tribe.eaten_usd = U128(tribe.eaten_usd.0 + q.meal_usd.0);
        let symbol = tribe.symbol.clone();
        let decimals = tribe.decimals;
        *self.daily_fed.entry((token_id.clone(), day)).or_insert(0) += q.meal_usd.0;
        *self.epoch_fed.entry((token_id.clone(), epoch)).or_insert(0) += q.meal_usd.0;
        self.total_eaten_usd += q.meal_usd.0;
        self.total_unvested += q.consume.0;

        // the Vest NFT
        let vest_id = self.next_vest_id.to_string();
        self.next_vest_id += 1;
        let vest = Vest {
            tribe: token_id.clone(),
            eaten: q.accepted,
            meal_usd: q.meal_usd,
            total: q.consume,
            released: U128(0),
            start_ns: U64(now),
            duration_ns: self.config.vest_duration_ns,
            exited: false,
            bonus: q.bonus,
        };
        self.vests.insert(vest_id.clone(), vest);
        let metadata = TokenMetadata {
            title: Some(format!("Writ #{}: {} {}", vest_id, format_units(q.accepted.0, decimals), symbol)),
            description: Some(format!(
                "The Crucible consumed {} {} (${}). This Writ releases {} $CONSUME to whoever holds it, a little each day. Break the seal early and half of what is still locked is forfeit.",
                format_units(q.accepted.0, decimals),
                symbol,
                format_units(q.meal_usd.0, 6),
                format_units(q.consume.0, 18),
            )),
            media: self.config.media_base.as_ref().map(|b| format!("{}/{}.svg", b.trim_end_matches('/'), vest_id)),
            media_hash: None,
            copies: Some(1),
            issued_at: Some((now / 1_000_000).to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        };
        // The contract pays the NFT storage from its own balance (refund_id = None).
        self.nft.internal_mint_with_refund(vest_id.clone(), eater.clone(), Some(metadata), None);
        near_contract_standards::non_fungible_token::events::NftMint {
            owner_id: &eater,
            token_ids: &[&vest_id],
            memo: None,
        }
        .emit();

        emit_event(
            "meal",
            near_sdk::serde_json::json!({
                "vest_id": vest_id,
                "eater": eater,
                "tribe": token_id,
                "eaten": q.accepted,
                "meal_usd": q.meal_usd,
                "consume": q.consume,
                "bonus": q.bonus,
            }),
        );
        q.refund.0
    }
}

#[near]
impl FungibleTokenReceiver for Contract {
    /// Feed CONSUME: call `ft_transfer_call` on a tribe's token with this contract
    /// as receiver. `msg` can name another account to receive the Vest NFT;
    /// empty means the sender. Anything over the caps is refunded.
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let token_id = env::predecessor_account_id();
        let eater: AccountId = if msg.trim().is_empty() {
            sender_id
        } else {
            msg.trim().parse().unwrap_or_else(|_| env::panic_str("msg must be empty or an account id"))
        };
        let refund = self.eat(token_id, eater, amount.0);
        PromiseOrValue::Value(U128(refund))
    }
}

#[near]
impl Contract {
    /// Preview a meal: what would be eaten, refunded and paid.
    pub fn quote_meal(&self, token_id: AccountId, amount: U128) -> MealQuote {
        self.plan_meal(&token_id, amount.0)
    }
}

/// Human-readable fixed-point number, trimmed, at most 4 decimals.
pub(crate) fn format_units(raw: u128, decimals: u8) -> String {
    let scale = 10u128.pow(decimals as u32);
    let whole = raw / scale;
    let frac = raw % scale;
    let mut s = whole.to_string();
    if frac > 0 && decimals > 0 {
        let mut f = format!("{:0width$}", frac, width = decimals as usize);
        f.truncate(4.min(decimals as usize));
        let f = f.trim_end_matches('0');
        if !f.is_empty() {
            s.push('.');
            s.push_str(f);
        }
    }
    s
}
