//! Vest NFTs: claim what has vested, or leave early and forfeit part of the rest.

use near_contract_standards::fungible_token::events::FtMint;
use near_sdk::json_types::U128;
use near_sdk::{assert_one_yocto, env, near, require, AccountId};

use crate::math;
use crate::{emit_event, Contract, ContractExt, Vest, BPS};

#[near(serializers = [json])]
pub struct VestView {
    pub token_id: String,
    pub owner_id: AccountId,
    pub vest: Vest,
    /// $CONSUME the holder could claim right now.
    pub claimable: U128,
    /// $CONSUME still locked.
    pub locked: U128,
    /// What `exit` would pay right now.
    pub exit_payout: U128,
}

impl Contract {
    fn vest_owner(&self, token_id: &String) -> AccountId {
        self.nft.owner_by_id.get(token_id).unwrap_or_else(|| env::panic_str("No such Vest NFT"))
    }

    fn view_vest(&self, token_id: &String) -> Option<VestView> {
        let vest = self.vests.get(token_id)?.clone();
        let owner_id = self.nft.owner_by_id.get(token_id)?;
        let (claimable, locked) = self.split(&vest);
        let exit_payout = claimable + locked - math::apply_bps(locked, self.config.exit_haircut_bps as u128);
        Some(VestView {
            token_id: token_id.clone(),
            owner_id,
            vest,
            claimable: U128(claimable),
            locked: U128(locked),
            exit_payout: U128(exit_payout),
        })
    }

    /// (claimable now, still locked)
    fn split(&self, vest: &Vest) -> (u128, u128) {
        if vest.exited {
            return (0, 0);
        }
        let vested = math::vested(vest.total.0, vest.start_ns.0, vest.duration_ns.0, env::block_timestamp());
        let claimable = vested.saturating_sub(vest.released.0);
        let locked = vest.total.0 - vested;
        (claimable, locked)
    }

    /// Mint $CONSUME to an account, registering it on the token if needed
    /// (the contract covers that storage).
    pub(crate) fn mint_consume(&mut self, to: &AccountId, amount: u128, memo: &str) {
        if amount == 0 {
            return;
        }
        if !self.token.accounts.contains_key(to) {
            self.token.internal_register_account(to);
        }
        self.token.internal_deposit(to, amount);
        FtMint { owner_id: to, amount: U128(amount), memo: Some(memo) }.emit();
    }
}

#[near]
impl Contract {
    /// Release everything that has vested so far to the NFT's current holder.
    pub fn claim(&mut self, token_id: String) -> U128 {
        let owner = self.vest_owner(&token_id);
        require!(env::predecessor_account_id() == owner, "Only the Vest NFT holder can claim");
        let mut vest = self.vests.get(&token_id).unwrap().clone();
        let (claimable, _) = self.split(&vest);
        require!(claimable > 0, "Nothing to claim yet");
        vest.released = U128(vest.released.0 + claimable);
        self.vests.insert(token_id.clone(), vest);
        self.total_unvested -= claimable;
        self.mint_consume(&owner, claimable, "vest claim");
        emit_event(
            "claim",
            near_sdk::serde_json::json!({ "vest_id": token_id, "owner": owner, "amount": U128(claimable) }),
        );
        U128(claimable)
    }

    /// Leave early: take what has vested plus the unlocked share of the rest.
    /// The haircut is never minted, so every remaining holder's share of the
    /// reliquary grows. The NFT stays, marked as exited. Requires 1 yoctoNEAR.
    #[payable]
    pub fn exit(&mut self, token_id: String) -> U128 {
        assert_one_yocto();
        let owner = self.vest_owner(&token_id);
        require!(env::predecessor_account_id() == owner, "Only the Vest NFT holder can exit");
        let mut vest = self.vests.get(&token_id).unwrap().clone();
        require!(!vest.exited, "Already exited");
        let (claimable, locked) = self.split(&vest);
        let forfeited = math::apply_bps(locked, self.config.exit_haircut_bps as u128);
        let payout = claimable + locked - forfeited;
        require!(self.config.exit_haircut_bps as u128 <= BPS, "bad config");

        self.total_unvested -= vest.total.0 - vest.released.0;
        self.total_forfeited += forfeited;
        vest.released = U128(vest.released.0 + payout);
        vest.exited = true;
        self.vests.insert(token_id.clone(), vest);
        self.mint_consume(&owner, payout, "vest exit");
        emit_event(
            "exit",
            near_sdk::serde_json::json!({
                "vest_id": token_id, "owner": owner,
                "payout": U128(payout), "forfeited": U128(forfeited),
            }),
        );
        U128(payout)
    }

    pub fn get_vest(&self, token_id: String) -> Option<VestView> {
        self.view_vest(&token_id)
    }

    pub fn get_vests_for_owner(&self, account_id: AccountId, from_index: Option<u64>, limit: Option<u64>) -> Vec<VestView> {
        let Some(per_owner) = self.nft.tokens_per_owner.as_ref() else { return vec![] };
        let Some(ids) = per_owner.get(&account_id) else { return vec![] };
        ids.iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50) as usize)
            .filter_map(|id| self.view_vest(&id))
            .collect()
    }

    /// Most recent meals, newest first.
    pub fn get_recent_vests(&self, limit: Option<u64>) -> Vec<VestView> {
        let limit = limit.unwrap_or(20).min(100);
        let last = self.next_vest_id;
        (1..last).rev().take(limit as usize).filter_map(|i| self.view_vest(&i.to_string())).collect()
    }
}
