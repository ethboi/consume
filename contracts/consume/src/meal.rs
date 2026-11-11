//! Eating: a listed memecoin arrives through `ft_transfer_call` (or from NEAR
//! Intents, see intents.rs), goes into the stomach for good, and the sender
//! gets a Bond NFT that releases $CONSUME.
//!
//! A feeding mints at the floor: its $CONSUME is the same share of all
//! $CONSUME as its value, less the tithe, is of the stomach. So a feeding can
//! never lower what each existing $CONSUME is backed by, and the tithe raises it.

use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::base64::{engine::general_purpose::STANDARD, Engine};
use near_sdk::{env, near, require, AccountId, PromiseOrValue};
use near_sdk::serde::Deserialize;

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
    /// The part of `meal_usd` kept back as the tithe, micro-USD. It mints
    /// nothing, so it belongs to everyone already holding.
    pub tithe_usd: U128,
    /// $CONSUME the Bond would release.
    pub consume: U128,
    /// True if this is last epoch's most-fed memecoin (the feast): no tithe.
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
        let net_usd = if bonus {
            meal_usd
        } else {
            math::after_tithe(
                self.config.tithe_step_bps as u128,
                self.config.max_tithe_bps as u128,
                self.config.famine_usd.0,
                self.total_eaten_usd,
                meal_usd,
            )
        };
        let consume = math::consume_at_floor(self.config.start_rate.0, net_usd, self.claims(), self.stomach_usd_for_minting(now));
        require!(consume > 0, "This feeding would mint no $CONSUME");

        MealQuote {
            accepted: U128(accepted),
            refund: U128(amount - accepted),
            meal_usd: U128(meal_usd),
            tithe_usd: U128(meal_usd - net_usd),
            consume: U128(consume),
            bonus,
        }
    }

    pub(crate) fn eat(&mut self, token_id: AccountId, payer: AccountId, eater: AccountId, amount: u128, terms: MealTerms) -> u128 {
        // the Bond pays out $CONSUME, so its first holder is registered for it now,
        // from the feeder's credit
        self.register_from_credit(&eater, &payer);
        let storage_before = env::storage_usage();
        let q = self.plan_meal(&token_id, amount);
        require!(q.consume.0 >= terms.min_consume, "Pays less than your minimum, refunded");
        require!(q.meal_usd.0 - q.tithe_usd.0 >= terms.min_net_usd, "Worth less than your minimum, refunded");
        let now = env::block_timestamp();
        let day = now / NANOS_PER_DAY;
        let epoch = now / self.config.epoch_ns.0;

        // stomach and counters
        let tribe = self.tribes.get_mut(&token_id).unwrap();
        tribe.stomach = U128(tribe.stomach.0 + q.accepted.0);
        tribe.eaten_usd = U128(tribe.eaten_usd.0 + q.meal_usd.0);
        let symbol = tribe.symbol.clone();
        let decimals = tribe.decimals;
        *self.daily_fed.entry((token_id.clone(), day)).or_insert(0) += q.meal_usd.0;
        *self.epoch_fed.entry((token_id.clone(), epoch)).or_insert(0) += q.meal_usd.0;
        self.total_eaten_usd += q.meal_usd.0;
        self.total_unvested += q.consume.0;

        // the Bond
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
        // NEP-177 hashes immutable media bytes. A live image changes as the
        // Bond vests, so keep that URL as extra metadata, not hashed media.
        let image = format!(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><rect width='400' height='400' fill='#efe9dc'/><g fill='#141110' font-family='serif' text-anchor='middle'><text x='200' y='100' font-size='36'>CONSUME</text><text x='200' y='190' font-size='30'>Bond #{vest_id}</text><text x='200' y='250' font-size='20'>Read current vesting on chain</text></g></svg>"
        );
        let metadata = TokenMetadata {
            title: Some(format!("Bond #{}: {} {}", vest_id, format_units(q.accepted.0, decimals), symbol)),
            description: Some(format!(
                "CONSUME ate {} {} (${}). This Bond releases {} $CONSUME to whoever holds it, a little each day. Break the seal early and half of what is still locked is forfeit.",
                format_units(q.accepted.0, decimals),
                symbol,
                format_units(q.meal_usd.0, 6),
                format_units(q.consume.0, 18),
            )),
            media: Some(format!("data:image/svg+xml;base64,{}", STANDARD.encode(image.as_bytes()))),
            media_hash: Some(Base64VecU8(env::sha256(image.as_bytes()))),
            copies: Some(1),
            issued_at: Some((now / 1_000_000).to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: self.config.media_base.as_ref().map(|b| near_sdk::serde_json::json!({
                "dynamic_media": format!("{}/{}.svg", b.trim_end_matches('/'), vest_id),
                "dynamic_media_is_mutable": true,
            }).to_string()),
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
                "tithe_usd": q.tithe_usd,
                "consume": q.consume,
                "bonus": q.bonus,
                "via_intents": self.tribes.get(&token_id).map(|t| t.via_intents).unwrap_or(false),
            }),
        );
        // the feeder pays for the storage this feeding created. These maps only
        // write on flush, so flush them before measuring.
        self.vests.flush();
        self.daily_fed.flush();
        self.epoch_fed.flush();
        let grown = env::storage_usage().saturating_sub(storage_before) as u128;
        let cost = grown * env::storage_byte_cost().as_yoctonear();
        let credit = *self.meal_credit.get(&payer).unwrap_or(&0);
        require!(credit >= cost, "Add storage credit first (add_meal_credit), refunded");
        self.meal_credit.insert(payer, credit - cost);
        q.refund.0
    }
}

/// Optional JSON in the transfer `msg`. An empty msg or a bare account id also work.
#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct MealMsg {
    recipient: Option<AccountId>,
    min_consume: Option<U128>,
    min_net_usd: Option<U128>,
    deadline_ns: Option<U64>,
}

/// The least a feeder will accept; anything less refunds the whole feeding.
#[derive(Default)]
pub(crate) struct MealTerms {
    /// Fewest $CONSUME. This count falls when the rest of the stomach gains
    /// value, even though each $CONSUME is then backed by more.
    pub min_consume: u128,
    /// Least value the feeding must be counted at after the tithe, micro-USD.
    /// It depends only on the fed memecoin's price, the caps and the tithe,
    /// so it is the steadier guard of the two.
    pub min_net_usd: u128,
}

/// Read a feeding's `msg` (same rules for NEP-141 and Intents feedings):
/// returns who gets the Bond and the least the feeder will accept.
pub(crate) fn parse_meal_msg(sender_id: &AccountId, msg: &str) -> (AccountId, MealTerms) {
    let m = msg.trim();
    if m.is_empty() {
        (sender_id.clone(), MealTerms::default())
    } else if m.starts_with('{') {
        let parsed: MealMsg = near_sdk::serde_json::from_str(m).unwrap_or_else(|_| env::panic_str("msg is not valid JSON"));
        if let Some(deadline) = parsed.deadline_ns {
            require!(env::block_timestamp() <= deadline.0, "Feeding arrived after its deadline, refunded");
        }
        let terms = MealTerms {
            min_consume: parsed.min_consume.map(|v| v.0).unwrap_or(0),
            min_net_usd: parsed.min_net_usd.map(|v| v.0).unwrap_or(0),
        };
        (parsed.recipient.unwrap_or_else(|| sender_id.clone()), terms)
    } else {
        (m.parse().unwrap_or_else(|_| env::panic_str("msg must be empty, an account id or JSON")), MealTerms::default())
    }
}

#[near]
impl FungibleTokenReceiver for Contract {
    /// Feed CONSUME: call `ft_transfer_call` on a tribe's token with this contract
    /// as receiver. `msg` is empty, an account id to receive the Bond, or
    /// JSON `{"recipient"?, "min_consume"?, "min_net_usd"?, "deadline_ns"?}`. Anything over the
    /// caps is refunded; a failed check refunds everything.
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let token_id = env::predecessor_account_id();
        if let Some(t) = self.tribes.get(&token_id) {
            require!(!t.via_intents, "This memecoin is fed through NEAR Intents (mt_transfer_call)");
        }
        let (eater, terms) = parse_meal_msg(&sender_id, &msg);
        let refund = self.eat(token_id, sender_id, eater, amount.0, terms);
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
