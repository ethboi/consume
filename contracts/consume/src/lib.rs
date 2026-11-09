//! CONSUME: a memecoin that eats other memecoins.
//!
//! Feed it a whitelisted memecoin (PEPE, DOGE, SHIB ...) with `ft_transfer_call`.
//! The meme goes into the reliquary for good. You get a Vest NFT that releases
//! $CONSUME to whoever holds it, linearly over the vesting period.
//! Burn $CONSUME with `redeem` to take your share of everything in the reliquary.
//!
//! One contract holds the $CONSUME token (NEP-141), the Vest NFTs (NEP-171)
//! and the reliquary, so minting, vesting and redemption never need a
//! cross-contract call except for paying out reliquary shares.

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
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault};

pub const NANOS_PER_DAY: u64 = 86_400_000_000_000;
/// USD amounts are stored in micro-dollars (6 decimals).
pub const MICRO_USD: u128 = 1_000_000;
/// $CONSUME has 18 decimals.
pub const CONSUME_DECIMALS: u8 = 18;
pub const ONE_CONSUME: u128 = 1_000_000_000_000_000_000;
pub const BPS: u128 = 10_000;

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
    /// but what is already in the reliquary stays there and stays redeemable.
    pub open: bool,
    /// Raw token units currently in the reliquary.
    pub reliquary: U128,
    /// Lifetime USD value eaten from this tribe, in micro-USD.
    pub eaten_usd: U128,
}

/// The vesting position held by a Vest NFT.
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
    /// Can add tribes and change caps. Can be renounced.
    pub owner_id: AccountId,
    /// The only account allowed to post tribe prices.
    pub price_feeder_id: AccountId,
    /// Whole $CONSUME paid per 1 USD eaten, before any halving.
    pub start_rate: U128,
    /// The rate halves every time this much USD (micro-USD) has been eaten in total.
    pub halving_usd: U128,
    pub vest_duration_ns: U64,
    /// Share of the still-locked amount forfeited on early exit (basis points).
    pub exit_haircut_bps: u32,
    /// Prices older than this are refused.
    pub max_price_age_ns: U64,
    /// Smallest meal accepted, micro-USD (stops dust NFTs).
    pub min_meal_usd: U128,
    /// Length of a "heaviest meal" epoch.
    pub epoch_ns: U64,
    /// Multiplier for meals from last epoch's heaviest tribe (basis points, 15000 = 1.5x).
    pub heaviest_bonus_bps: u32,
    /// Base URL for Vest NFT images, e.g. "https://consume.example/vest".
    pub media_base: Option<String>,
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
    /// Lifetime USD eaten across all tribes, micro-USD. Drives the halvings.
    pub(crate) total_eaten_usd: u128,
    /// $CONSUME promised to Vest NFTs but not yet released.
    pub(crate) total_unvested: u128,
    /// $CONSUME forfeited by early exits (never minted).
    pub(crate) total_forfeited: u128,
    /// $CONSUME burned through redeem.
    pub(crate) total_redeemed: u128,
}

#[near]
impl Contract {
    #[init]
    pub fn new(config: Config) -> Self {
        require!(config.start_rate.0 > 0, "start_rate must be positive");
        require!(config.halving_usd.0 > 0, "halving_usd must be positive");
        require!(config.vest_duration_ns.0 > 0, "vest_duration_ns must be positive");
        require!(config.epoch_ns.0 > 0, "epoch_ns must be positive");
        require!(config.exit_haircut_bps as u128 <= BPS, "exit_haircut_bps above 100%");
        let owner = config.owner_id.clone();
        Self {
            config,
            token: FungibleToken::new(StorageKey::FungibleToken),
            nft: NonFungibleToken::new(
                StorageKey::NftOwnerById,
                owner,
                Some(StorageKey::NftMetadata),
                Some(StorageKey::NftEnumeration),
                Some(StorageKey::NftApproval),
            ),
            tribes: IterableMap::new(StorageKey::Tribes),
            vests: LookupMap::new(StorageKey::Vests),
            daily_fed: LookupMap::new(StorageKey::DailyFed),
            epoch_fed: LookupMap::new(StorageKey::EpochFed),
            owed: LookupMap::new(StorageKey::Owed),
            next_vest_id: 1,
            total_eaten_usd: 0,
            total_unvested: 0,
            total_forfeited: 0,
            total_redeemed: 0,
        }
    }

    // ---------- admin ----------

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.config.owner_id, "Only the owner");
    }

    /// Add a tribe, or update its caps and symbol. Never touches the reliquary.
    pub fn set_tribe(
        &mut self,
        token_id: AccountId,
        symbol: String,
        decimals: u8,
        max_meal_usd: U128,
        daily_cap_usd: U128,
        open: bool,
    ) {
        self.assert_owner();
        let tribe = match self.tribes.get(&token_id) {
            Some(t) => Tribe { symbol, decimals, max_meal_usd, daily_cap_usd, open, ..t.clone() },
            None => Tribe {
                symbol,
                decimals,
                price_e18: U128(0),
                price_updated_ns: U64(0),
                max_meal_usd,
                daily_cap_usd,
                open,
                reliquary: U128(0),
                eaten_usd: U128(0),
            },
        };
        self.tribes.insert(token_id, tribe);
    }

    pub fn set_tribe_open(&mut self, token_id: AccountId, open: bool) {
        self.assert_owner();
        let tribe = self.tribes.get_mut(&token_id).unwrap_or_else(|| env::panic_str("Unknown tribe"));
        tribe.open = open;
    }

    pub fn set_price_feeder(&mut self, price_feeder_id: AccountId) {
        self.assert_owner();
        self.config.price_feeder_id = price_feeder_id;
    }

    pub fn set_media_base(&mut self, media_base: Option<String>) {
        self.assert_owner();
        self.config.media_base = media_base;
    }

    /// Hand the owner role to another account (e.g. a DAO), or to the contract
    /// itself to make the tribe list permanent.
    pub fn set_owner(&mut self, owner_id: AccountId) {
        self.assert_owner();
        self.config.owner_id = owner_id;
    }

    /// Price feeder posts USD prices (1e18-scaled, per whole token).
    /// The feeder reads them from NEAR Intents 1Click dry quotes.
    pub fn set_prices(&mut self, prices: Vec<(AccountId, U128)>) {
        require!(
            env::predecessor_account_id() == self.config.price_feeder_id,
            "Only the price feeder"
        );
        let now = env::block_timestamp();
        for (token_id, price) in prices {
            if let Some(tribe) = self.tribes.get_mut(&token_id) {
                tribe.price_e18 = price;
                tribe.price_updated_ns = U64(now);
            }
        }
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
        Stats {
            total_eaten_usd: U128(self.total_eaten_usd),
            consume_supply: U128(self.token.total_supply),
            total_unvested: U128(self.total_unvested),
            total_forfeited: U128(self.total_forfeited),
            total_redeemed: U128(self.total_redeemed),
            vests_minted: U64(self.next_vest_id - 1),
            current_rate: U128(math::rate_at(
                self.config.start_rate.0,
                self.config.halving_usd.0,
                self.total_eaten_usd,
            )),
            next_halving_at_usd: U128(math::next_halving_at(
                self.config.halving_usd.0,
                self.total_eaten_usd,
            )),
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
    /// Whole $CONSUME per USD right now (before any heaviest-tribe bonus).
    pub current_rate: U128,
    /// Total USD eaten (micro-USD) at which the rate halves next.
    pub next_halving_at_usd: U128,
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
