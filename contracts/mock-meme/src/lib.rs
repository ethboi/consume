//! Testnet stand-in for an Intents-bridged memecoin (e.g. PEPE as
//! `eth-0x6982...omft.near` on mainnet). A plain NEP-141 token with the real
//! coin's decimals plus a rate-limited faucet, so anyone can try CONSUME
//! without real funds.

use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement};
use near_sdk::json_types::U128;

include!("sponsorship_tests.rs");
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue};

const FAUCET_COOLDOWN_NS: u64 = 60 * 60 * 1_000_000_000;
// Includes deployed code storage; the testnet launch funds more than this cap.
const MAX_SPONSORED_STORAGE: u64 = 256 * 1024;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Token,
    LastDrip,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
    name: String,
    symbol: String,
    decimals: u8,
    /// Raw units handed out per faucet call.
    faucet_amount: u128,
    last_drip: LookupMap<AccountId, u64>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(name: String, symbol: String, decimals: u8, faucet_amount: U128) -> Self {
        Self {
            token: FungibleToken::new(StorageKey::Token),
            name,
            symbol,
            decimals,
            faucet_amount: faucet_amount.0,
            last_drip: LookupMap::new(StorageKey::LastDrip),
        }
    }

    /// Mint `faucet_amount` to the caller, at most once an hour. The contract pays
    /// the caller's storage registration.
    pub fn faucet(&mut self) -> U128 {
        self.last_drip.flush();
        let before = env::storage_usage();
        let account = env::predecessor_account_id();
        let now = env::block_timestamp();
        if let Some(last) = self.last_drip.get(&account) {
            require!(now >= last + FAUCET_COOLDOWN_NS, "Faucet: once an hour");
        }
        self.last_drip.insert(account.clone(), now);
        if !self.token.accounts.contains_key(&account) {
            self.token.internal_register_account(&account);
        }
        self.token.internal_deposit(&account, self.faucet_amount);
        self.enforce_sponsorship_budget(before);
        FtMint { owner_id: &account, amount: U128(self.faucet_amount), memo: Some("faucet") }.emit();
        U128(self.faucet_amount)
    }

    /// Register any account for free (testnet convenience, mirrors storage_deposit).
    pub fn register(&mut self, account_id: AccountId) {
        let before = env::storage_usage();
        if !self.token.accounts.contains_key(&account_id) {
            self.token.internal_register_account(&account_id);
        }
        self.enforce_sponsorship_budget(before);
    }
}

impl Contract {
    fn enforce_sponsorship_budget(&mut self, before: u64) {
        self.last_drip.flush();
        let after = env::storage_usage();
        require!(after <= before || after <= MAX_SPONSORED_STORAGE, "Testnet storage sponsorship exhausted");
    }
}

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let (used, _) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    /// Disabled: registrations here are free (faucet and `register`), so
    /// refunding a storage deposit on unregister would let anyone drain the
    /// contract's NEAR by registering and unregistering in a loop.
    #[payable]
    fn storage_unregister(&mut self, _force: Option<bool>) -> bool {
        near_sdk::env::panic_str("Unregistering is disabled on this testnet stand-in")
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: self.name.clone(),
            symbol: self.symbol.clone(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: self.decimals,
        }
    }
}
