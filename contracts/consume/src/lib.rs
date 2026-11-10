//! CONSUME: a memecoin that eats other memecoins.
//!
//! Feed it a listed memecoin (PEPE, DOGE, SHIB ...): with `mt_transfer_call` on
//! the NEAR Intents contract, or with `ft_transfer_call` for a plain NEP-141.
//! The meme goes into the stomach for good. You get a Bond NFT that releases
//! $CONSUME to whoever holds it, linearly over the vesting period.
//! Burn $CONSUME with `redeem` to take your share of everything in the stomach.
//!
//! Memecoins can also arrive through NEAR Intents (`intents.near`, or the
//! testnet mock in `mock-intents`): a tribe marked `via_intents` is fed with
//! `mt_transfer_call` on the Intents contract, stays in CONSUME's Intents
//! balance, and redemptions are paid there with `mt_transfer`, so they can be
//! withdrawn to the memecoin's home chain.
//!
//! One contract holds the $CONSUME token (NEP-141), the Bond NFTs (NEP-171)
//! and the stomach, so minting, vesting and redemption never need a
//! cross-contract call except for paying out stomach shares.
//!
//! Everything about the mechanic is fixed by `new`: the list of memecoins,
//! their caps, the start rate, the tithe and its famines, the vesting period,
//! the exit forfeit, the Intents contract. No method changes any of it afterwards. The only
//! role left is the guardian, who can seal or unseal a listed memecoin and
//! replace the price feeder, and nothing else (see "guardian" below).

mod intents;
mod math;
mod meal;
mod redeem;
mod standards;
mod vest;

#[cfg(test)]
mod tests;

use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::non_fungible_token::NonFungibleToken;
use near_sdk::json_types::{U128, U64};
use near_sdk::store::{IterableMap, LookupMap, LookupSet};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};

pub const NANOS_PER_DAY: u64 = 86_400_000_000_000;
/// USD amounts are stored in micro-dollars (6 decimals).
pub const MICRO_USD: u128 = 1_000_000;
/// $CONSUME has 18 decimals.
pub const CONSUME_DECIMALS: u8 = 18;
pub const ONE_CONSUME: u128 = 1_000_000_000_000_000_000;
pub const BPS: u128 = 10_000;
/// Largest start rate accepted (whole $CONSUME per USD), so rate * 1e18 fits in u128.
pub const MAX_START_RATE: u128 = 1_000_000_000;
/// Largest token decimals accepted for a tribe.
pub const MAX_DECIMALS: u8 = 30;
/// Largest tithe a deployment can set (basis points): half of a feeding.
pub const MAX_TITHE_BPS: u32 = 5_000;
/// Most memecoins a deployment can list (views and the feast walk the list).
pub const MAX_TRIBES: usize = 32;

#[derive(BorshStorageKey)]
#[near]
pub(crate) enum StorageKey {
    FungibleToken,
    NftOwnerById,
    NftMetadata,
    NftEnumeration,
    NftApproval,
    Tribes,
    Vests,
    DailyFed,
    EpochFed,
    Owed,
    InFlight,
    MealCredit,
}

/// A memecoin CONSUME is willing to eat.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Tribe {
    /// Display symbol, e.g. "PEPE".
    pub symbol: String,
    /// Decimals of the meme token contract.
    pub decimals: u8,
    /// USD price of one whole token, scaled by 1e18.
    pub price_e18: U128,
    /// When the price feeder last set the price.
    pub price_updated_ns: U64,
    /// Largest single meal accepted, in micro-USD.
    pub max_meal_usd: U128,
    /// Most this tribe can be fed per UTC day, in micro-USD.
    pub daily_cap_usd: U128,
    /// Closed tribes are not eaten (e.g. when the Intents route has no liquidity),
    /// but what is already in the stomach stays there and stays redeemable.
    pub open: bool,
    /// Raw token units currently in the stomach.
    pub stomach: U128,
    /// Lifetime USD value eaten from this tribe, in micro-USD.
    pub eaten_usd: U128,
    /// True if this memecoin is held on NEAR Intents (fed with
    /// `mt_transfer_call`, paid out with `mt_transfer`) rather than as a
    /// NEP-141 balance on its token contract. Fixed at launch.
    pub via_intents: bool,
}

/// A memecoin on the launch list, as passed to `new`. The list, the decimals,
/// the caps and where each memecoin is held never change after launch.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct TribeInit {
    pub token_id: AccountId,
    pub symbol: String,
    pub decimals: u8,
    pub max_meal_usd: U128,
    pub daily_cap_usd: U128,
    /// Held on NEAR Intents rather than as a plain NEP-141 balance.
    #[serde(default)]
    pub via_intents: bool,
}

/// The vesting position held by a Bond NFT.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Vest {
    pub tribe: AccountId,
    /// Raw meme token units eaten in this meal.
    pub eaten: U128,
    /// USD value of the meal at the time, micro-USD.
    pub meal_usd: U128,
    /// Total $CONSUME this NFT releases.
    pub total: U128,
    /// $CONSUME already released (claimed or paid out on exit).
    pub released: U128,
    pub start_ns: U64,
    pub duration_ns: U64,
    /// True once the holder left early. The NFT stays as a record.
    pub exited: bool,
    /// True if this meal earned the heaviest-tribe bonus.
    pub bonus: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Config {
    /// The guardian can seal or unseal a listed memecoin and replace the
    /// price feeder. It cannot add memecoins, change caps or rates, mint,
    /// or move anything in the stomach. `None` once renounced.
    pub guardian_id: Option<AccountId>,
    /// The only account allowed to post tribe prices.
    pub price_feeder_id: AccountId,
    /// Whole $CONSUME minted per 1 USD while the stomach is empty (at most
    /// MAX_START_RATE). After that every feeding mints at the floor: the same
    /// share of all $CONSUME as its value is of the stomach.
    pub start_rate: U128,
    /// Famine: the tithe grows by one step every time this much USD
    /// (micro-USD) has been eaten in total.
    pub famine_usd: U128,
    /// The tithe is the share of a feeding that mints nothing and so belongs to
    /// everyone already holding (basis points). It starts at one step.
    pub tithe_step_bps: u32,
    /// The tithe never grows past this (basis points, at most MAX_TITHE_BPS).
    pub max_tithe_bps: u32,
    pub vest_duration_ns: U64,
    /// Share of the still-locked amount forfeited on early exit (basis points).
    pub exit_haircut_bps: u32,
    /// Prices older than this are refused.
    pub max_price_age_ns: U64,
    /// Smallest meal accepted, micro-USD (stops dust NFTs).
    pub min_meal_usd: U128,
    /// Length of a feast epoch. The memecoin fed most (by USD) in one epoch
    /// pays no tithe in the next.
    pub epoch_ns: U64,
    /// Base URL for Bond NFT images, e.g. "https://consume.example/bond/square".
    pub media_base: Option<String>,
    /// The NEAR Intents contract (`intents.near` on mainnet, the mock on
    /// testnet). Only this account can feed `via_intents` tribes.
    pub intents_id: Option<AccountId>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub(crate) config: Config,
    pub(crate) token: FungibleToken,
    pub(crate) nft: NonFungibleToken,
    pub(crate) tribes: IterableMap<AccountId, Tribe>,
    pub(crate) vests: LookupMap<String, Vest>,
    /// (tribe, day index) -> micro-USD eaten that day.
    pub(crate) daily_fed: LookupMap<(AccountId, u64), u128>,
    /// (tribe, epoch index) -> micro-USD eaten that epoch.
    pub(crate) epoch_fed: LookupMap<(AccountId, u64), u128>,
    /// (account, tribe) -> raw meme units the account can withdraw after redeeming.
    pub(crate) owed: LookupMap<(AccountId, AccountId), u128>,
    pub(crate) next_vest_id: u64,
    /// Lifetime USD eaten across all tribes, micro-USD. Drives the famines.
    pub(crate) total_eaten_usd: u128,
    /// $CONSUME promised to Vest NFTs but not yet released.
    pub(crate) total_unvested: u128,
    /// $CONSUME forfeited by early exits (never minted).
    pub(crate) total_forfeited: u128,
    /// $CONSUME burned through redeem.
    pub(crate) total_redeemed: u128,
    /// Bonds inside an unresolved nft_transfer_call. They cannot be
    /// claimed or exited until the transfer resolves (blocks a receiver from
    /// draining a Bond and then rejecting it).
    pub(crate) in_flight: LookupSet<String>,
    /// NEAR each account has prepaid for the storage its feedings create.
    pub(crate) meal_credit: LookupMap<AccountId, u128>,
}

#[near]
impl Contract {
    /// Launch. The memecoin list and every parameter are set here, once.
    #[init]
    pub fn new(config: Config, tribes: Vec<TribeInit>) -> Self {
        require!(config.start_rate.0 > 0, "start_rate must be positive");
        require!(config.start_rate.0 <= MAX_START_RATE, "start_rate too large");
        require!(config.famine_usd.0 > 0, "famine_usd must be positive");
        require!(config.max_tithe_bps <= MAX_TITHE_BPS, "max_tithe_bps too large");
        require!(config.tithe_step_bps <= config.max_tithe_bps, "tithe_step_bps above max_tithe_bps");
        require!(config.vest_duration_ns.0 > 0, "vest_duration_ns must be positive");
        require!(config.epoch_ns.0 > 0, "epoch_ns must be positive");
        require!(config.exit_haircut_bps as u128 <= BPS, "exit_haircut_bps above 100%");
        require!(!tribes.is_empty(), "List at least one memecoin");
        require!(tribes.len() <= MAX_TRIBES, "Too many memecoins");
        let mut list = IterableMap::new(StorageKey::Tribes);
        for t in tribes {
            require!(t.decimals <= MAX_DECIMALS, "decimals too large");
            require!(t.max_meal_usd.0 > 0 && t.daily_cap_usd.0 > 0, "Caps must be positive");
            require!(!t.via_intents || config.intents_id.is_some(), "An Intents memecoin needs intents_id");
            let tribe = Tribe {
                symbol: t.symbol,
                decimals: t.decimals,
                price_e18: U128(0),
                price_updated_ns: U64(0),
                max_meal_usd: t.max_meal_usd,
                daily_cap_usd: t.daily_cap_usd,
                open: true,
                stomach: U128(0),
                eaten_usd: U128(0),
                via_intents: t.via_intents,
            };
            require!(list.insert(t.token_id, tribe).is_none(), "A memecoin is listed twice");
        }
        Self {
            config,
            token: FungibleToken::new(StorageKey::FungibleToken),
            nft: NonFungibleToken::new(
                StorageKey::NftOwnerById,
                // the standard wants an owner; Bonds are only ever minted by a feeding
                env::current_account_id(),
                Some(StorageKey::NftMetadata),
                Some(StorageKey::NftEnumeration),
                Some(StorageKey::NftApproval),
            ),
            tribes: list,
            vests: LookupMap::new(StorageKey::Vests),
            daily_fed: LookupMap::new(StorageKey::DailyFed),
            epoch_fed: LookupMap::new(StorageKey::EpochFed),
            owed: LookupMap::new(StorageKey::Owed),
            next_vest_id: 1,
            total_eaten_usd: 0,
            total_unvested: 0,
            total_forfeited: 0,
            total_redeemed: 0,
            in_flight: LookupSet::new(StorageKey::InFlight),
            meal_credit: LookupMap::new(StorageKey::MealCredit),
        }
    }

    // ---------- guardian ----------
    //
    // These three methods are the whole of the guardian's power. There is no
    // method that adds a memecoin, changes a cap, a rate or a period, repoints
    // the Intents contract, mints $CONSUME or takes anything from the stomach.

    fn assert_guardian(&self) {
        require!(
            self.config.guardian_id.as_ref() == Some(&env::predecessor_account_id()),
            "Only the guardian"
        );
    }

    /// Seal a listed memecoin (stop eating it, e.g. when its route has no
    /// liquidity or its price cannot be trusted) or unseal it. What is already
    /// in the stomach stays there and stays redeemable either way.
    pub fn set_tribe_open(&mut self, token_id: AccountId, open: bool) {
        self.assert_guardian();
        let tribe = self.tribes.get_mut(&token_id).unwrap_or_else(|| env::panic_str("Unknown tribe"));
        tribe.open = open;
        emit_event("tribe_open", near_sdk::serde_json::json!({ "token_id": token_id, "open": open }));
    }

    /// Replace the price feeder (e.g. if its key is lost or it misprices).
    pub fn set_price_feeder(&mut self, price_feeder_id: AccountId) {
        self.assert_guardian();
        emit_event("price_feeder", near_sdk::serde_json::json!({ "price_feeder_id": price_feeder_id }));
        self.config.price_feeder_id = price_feeder_id;
    }

    /// Pass the guardian role on (e.g. to a DAO), or renounce it with `null`.
    /// Renouncing cannot be undone: no memecoin can be sealed or unsealed and
    /// the price feeder can never be replaced again.
    pub fn set_guardian(&mut self, guardian_id: Option<AccountId>) {
        self.assert_guardian();
        emit_event("guardian", near_sdk::serde_json::json!({ "guardian_id": guardian_id }));
        self.config.guardian_id = guardian_id;
    }

    // ---------- price feeder ----------

    /// Price feeder posts USD prices (1e18-scaled, per whole token).
    /// The feeder reads them from NEAR Intents 1Click dry quotes.
    pub fn set_prices(&mut self, prices: Vec<(AccountId, U128)>) {
        require!(
            env::predecessor_account_id() == self.config.price_feeder_id,
            "Only the price feeder"
        );
        // One round prices every memecoin a feeding can read (open, or held in
        // the stomach), so no feeding ever sees one repriced and another not.
        for (token_id, tribe) in self.tribes.iter() {
            require!(
                !(tribe.open || tribe.stomach.0 > 0) || prices.iter().any(|(p, _)| p == token_id),
                "A round must price every memecoin that is open or held"
            );
        }
        let now = env::block_timestamp();
        for (token_id, price) in prices {
            // a zero price would value the stomach too low and overpay the next feeding
            require!(price.0 > 0, "A price must be more than zero");
            if let Some(tribe) = self.tribes.get_mut(&token_id) {
                tribe.price_e18 = price;
                tribe.price_updated_ns = U64(now);
            }
        }
    }

    // ---------- storage credit for feedings ----------

    /// Prepay NEAR for the storage your feedings create (each Bond NFT
    /// and its records). A feeding is refused if its storage cost exceeds the
    /// feeder's credit. An account's first deposit also pays for its own credit
    /// record, which is kept for good.
    #[payable]
    pub fn add_meal_credit(&mut self, account_id: Option<AccountId>) -> U128 {
        let account = account_id.unwrap_or_else(env::predecessor_account_id);
        let mut amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Attach NEAR to add credit");
        let had = match self.meal_credit.get(&account) {
            Some(credit) => *credit,
            None => {
                // nobody can make the contract store a record for free
                let before = env::storage_usage();
                self.meal_credit.insert(account.clone(), 0);
                self.meal_credit.flush();
                let cost = env::storage_usage().saturating_sub(before) as u128 * env::storage_byte_cost().as_yoctonear();
                require!(amount > cost, "Attach more NEAR: the first deposit also pays for its own record");
                amount -= cost;
                0
            }
        };
        self.meal_credit.insert(account, had + amount);
        U128(had + amount)
    }

    /// Take back unused storage credit.
    pub fn withdraw_meal_credit(&mut self, amount: Option<U128>) -> Promise {
        let account = env::predecessor_account_id();
        let credit = *self.meal_credit.get(&account).unwrap_or(&0);
        let amount = amount.map(|a| a.0).unwrap_or(credit);
        require!(amount > 0 && amount <= credit, "Not enough credit");
        self.meal_credit.insert(account.clone(), credit - amount);
        Promise::new(account).transfer(NearToken::from_yoctonear(amount))
    }

    pub fn get_meal_credit(&self, account_id: AccountId) -> U128 {
        U128(*self.meal_credit.get(&account_id).unwrap_or(&0))
    }

    // ---------- views ----------

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_tribes(&self) -> Vec<(AccountId, Tribe)> {
        self.tribes.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
    }

    pub fn get_tribe(&self, token_id: AccountId) -> Option<Tribe> {
        self.tribes.get(&token_id).cloned()
    }

    pub fn get_stats(&self) -> Stats {
        let now = env::block_timestamp();
        let epoch = now / self.config.epoch_ns.0;
        let stomach_usd = self.stomach_usd(None);
        let tithe = self.tithe_now();
        Stats {
            total_eaten_usd: U128(self.total_eaten_usd),
            consume_supply: U128(self.token.total_supply),
            total_unvested: U128(self.total_unvested),
            total_forfeited: U128(self.total_forfeited),
            total_redeemed: U128(self.total_redeemed),
            vests_minted: U64(self.next_vest_id - 1),
            stomach_usd: U128(stomach_usd),
            current_rate: U128(math::consume_at_floor(self.config.start_rate.0, MICRO_USD, self.claims(), stomach_usd)),
            tithe_bps: tithe as u32,
            next_famine_at_usd: (tithe < self.config.max_tithe_bps as u128 && self.config.tithe_step_bps > 0)
                .then(|| U128(math::next_famine_at(self.config.famine_usd.0, self.total_eaten_usd))),
            epoch: U64(epoch),
            heaviest_last_epoch: self.heaviest_tribe(epoch.saturating_sub(1)),
            now_ns: U64(now),
        }
    }

    pub fn get_epoch_fed(&self, epoch: U64) -> Vec<(AccountId, U128)> {
        self.tribes
            .keys()
            .map(|k| (k.clone(), U128(*self.epoch_fed.get(&(k.clone(), epoch.0)).unwrap_or(&0))))
            .collect()
    }

    pub fn get_owed(&self, account_id: AccountId) -> Vec<(AccountId, U128)> {
        self.tribes
            .keys()
            .filter_map(|k| {
                let v = *self.owed.get(&(account_id.clone(), k.clone())).unwrap_or(&0);
                (v > 0).then(|| (k.clone(), U128(v)))
            })
            .collect()
    }
}

impl Contract {
    /// All $CONSUME that has a claim on the stomach: minted, plus what is still
    /// locked in Bonds. Redemptions and feedings are both measured against it.
    pub(crate) fn claims(&self) -> u128 {
        self.token.total_supply + self.total_unvested
    }

    /// The stomach's value at the posted prices, micro-USD. With `fresh_at`
    /// (a feeding), every memecoin held must have a price no older than
    /// `max_price_age_ns`, because the feeding is priced against all of them.
    pub(crate) fn stomach_usd(&self, fresh_at: Option<u64>) -> u128 {
        self.value_stomach(fresh_at, false)
    }

    /// The stomach's value for pricing a feeding: fresh prices only, and each
    /// memecoin rounded up, so the feeding is never minted more than its share.
    pub(crate) fn stomach_usd_for_minting(&self, now: u64) -> u128 {
        self.value_stomach(Some(now), true)
    }

    fn value_stomach(&self, fresh_at: Option<u64>, round_up: bool) -> u128 {
        let mut total: u128 = 0;
        for t in self.tribes.values() {
            if t.stomach.0 == 0 {
                continue;
            }
            if let Some(now) = fresh_at {
                require!(
                    now.saturating_sub(t.price_updated_ns.0) <= self.config.max_price_age_ns.0,
                    "A price in the stomach is stale, try again shortly"
                );
            }
            total += if round_up {
                math::usd_value_up(t.stomach.0, t.decimals, t.price_e18.0)
            } else {
                math::usd_value(t.stomach.0, t.decimals, t.price_e18.0)
            };
        }
        total
    }

    /// Register `account` to hold $CONSUME if it is not yet, paid from `payer`'s
    /// storage credit at the token's own registration price. The contract never
    /// pays for a registration, and `storage_unregister` refunds this same amount.
    pub(crate) fn register_from_credit(&mut self, account: &AccountId, payer: &AccountId) {
        if self.token.accounts.contains_key(account) {
            return;
        }
        let fee = self.token.account_storage_usage as u128 * env::storage_byte_cost().as_yoctonear();
        let credit = *self.meal_credit.get(payer).unwrap_or(&0);
        require!(
            credit >= fee,
            "Add storage credit first (add_meal_credit): this account is not registered for $CONSUME yet"
        );
        self.meal_credit.insert(payer.clone(), credit - fee);
        self.token.internal_register_account(account);
    }

    /// The tithe right now, basis points.
    pub(crate) fn tithe_now(&self) -> u128 {
        math::tithe_at(
            self.config.tithe_step_bps as u128,
            self.config.max_tithe_bps as u128,
            self.config.famine_usd.0,
            self.total_eaten_usd,
        )
    }

    /// The tribe that was fed the most USD in the given epoch, if any was fed.
    pub(crate) fn heaviest_tribe(&self, epoch: u64) -> Option<AccountId> {
        let mut best: Option<(AccountId, u128)> = None;
        for k in self.tribes.keys() {
            let fed = *self.epoch_fed.get(&(k.clone(), epoch)).unwrap_or(&0);
            if fed > 0 && best.as_ref().map_or(true, |(_, b)| fed > *b) {
                best = Some((k.clone(), fed));
            }
        }
        best.map(|(k, _)| k)
    }
}

#[near(serializers = [json])]
pub struct Stats {
    pub total_eaten_usd: U128,
    pub consume_supply: U128,
    pub total_unvested: U128,
    pub total_forfeited: U128,
    pub total_redeemed: U128,
    pub vests_minted: U64,
    /// The stomach's value at the posted prices, micro-USD.
    pub stomach_usd: U128,
    /// Raw $CONSUME (18 decimals) one USD mints at the floor, before the tithe.
    pub current_rate: U128,
    /// The tithe on a feeding right now, basis points.
    pub tithe_bps: u32,
    /// Total USD eaten (micro-USD) at which the tithe grows next. `null` once
    /// it has reached its maximum.
    pub next_famine_at_usd: Option<U128>,
    pub epoch: U64,
    pub heaviest_last_epoch: Option<AccountId>,
    pub now_ns: U64,
}

/// NEP-297 style event log for things the standards do not cover.
pub(crate) fn emit_event(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        near_sdk::serde_json::json!({
            "standard": "consume",
            "version": "1.0.0",
            "event": event,
            "data": [data],
        })
    ));
}
