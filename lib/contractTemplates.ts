export interface ContractTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  code: string;
  icon: string;
}

export const contractTemplates: ContractTemplate[] = [
  {
    id: 'simple-token',
    name: 'Simple Token',
    description: 'Basic fungible token using Aptos Coin standard',
    category: 'Token',
    icon: '🪙',
    code: `module Deployer::simple_token {
    use aptos_framework::coin;
    use aptos_framework::managed_coin;

    struct SimpleToken has drop {}

    fun init_module(account: &signer) {
        // Initialize managed coin - mint capability is stored automatically
        managed_coin::initialize<SimpleToken>(
            account,
            b"Simple Token",
            b"STK",
            8,
            false,
        );
    }

    public fun transfer(from: &signer, to: address, amount: u64) {
        coin::transfer<SimpleToken>(from, to, amount);
    }

    public fun balance_of(owner: address): u64 {
        coin::balance<SimpleToken>(owner)
    }
}`
  },
  {
    id: 'simple-nft',
    name: 'Simple NFT',
    description: 'Basic NFT collection using Aptos Token standard',
    category: 'NFT',
    icon: '🎭',
    code: `module Deployer::simple_nft {
    use std::signer;
    use std::string::{Self, String};
    use std::option;
    use aptos_framework::object::{Self, Object};
    use aptos_framework::token::{Self, Token};

    struct SimpleNFT has key {}

    public fun create_collection(
        creator: &signer,
        description: String,
        name: String,
        uri: String,
    ): Object<Token> {
        let collection_constructor_ref = token::create_collection(
            creator,
            description,
            name,
            uri,
            option::none(),
        );
        object::object_from_constructor_ref(&collection_constructor_ref)
    }

    public fun mint_nft(
        creator: &signer,
        collection: Object<Token>,
        description: String,
        name: String,
        uri: String,
    ): Object<Token> {
        let constructor_ref = token::create_named_token(
            creator,
            collection,
            description,
            name,
            option::none(),
            uri,
        );
        object::object_from_constructor_ref(&constructor_ref)
    }

    public fun transfer_nft(from: &signer, to: address, token: Object<Token>) {
        object::transfer(from, token, to);
    }
}`
  },
  {
    id: 'crowdfunding',
    name: 'Crowdfunding',
    description: 'Campaign-based crowdfunding platform',
    category: 'DeFi',
    icon: '💸',
    code: `module Deployer::crowdfunding {
    use std::signer;
    use std::string::String;
    use std::table;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;

    struct Campaign has key {
        creator: address,
        title: String,
        description: String,
        goal: u64,
        pledged: u64,
        end_time: u64,
        claimed: bool,
    }

    struct CampaignStore has key {
        campaigns: table::Table<u64, Campaign>,
        campaign_count: u64,
    }

    public fun initialize(account: &signer) {
        move_to(account, CampaignStore {
            campaigns: table::new(),
            campaign_count: 0,
        });
    }

    public fun create_campaign(
        account: &signer,
        title: String,
        description: String,
        goal: u64,
        duration_seconds: u64,
    ): u64 acquires CampaignStore {
        let account_addr = signer::address_of(account);
        let store = borrow_global_mut<CampaignStore>(account_addr);
        let campaign_id = store.campaign_count;
        let current_time = aptos_framework::timestamp::now_seconds();

        table::add(&mut store.campaigns, campaign_id, Campaign {
            creator: account_addr,
            title,
            description,
            goal,
            pledged: 0,
            end_time: current_time + duration_seconds,
            claimed: false,
        });

        store.campaign_count = campaign_id + 1;
        campaign_id
    }

    public fun pledge(account: &signer, campaign_id: u64, amount: u64) acquires CampaignStore {
        let account_addr = signer::address_of(account);
        let store = borrow_global_mut<CampaignStore>(account_addr);
        let campaign = table::borrow_mut(&mut store.campaigns, campaign_id);
        
        assert!(campaign.pledged < campaign.goal, 1);
        assert!(aptos_framework::timestamp::now_seconds() < campaign.end_time, 2);

        let coins = coin::withdraw<AptosCoin>(account, amount);
        campaign.pledged = campaign.pledged + amount;
        coin::deposit<AptosCoin>(account_addr, coins);
    }

    public fun claim(account: &signer, campaign_id: u64) acquires CampaignStore {
        let account_addr = signer::address_of(account);
        let store = borrow_global_mut<CampaignStore>(account_addr);
        let campaign = table::borrow_mut(&mut store.campaigns, campaign_id);

        assert!(account_addr == campaign.creator, 3);
        assert!(aptos_framework::timestamp::now_seconds() >= campaign.end_time, 4);
        assert!(campaign.pledged >= campaign.goal, 5);
        assert!(!campaign.claimed, 6);

        campaign.claimed = true;
        let coins = coin::withdraw<AptosCoin>(account_addr, campaign.pledged);
        coin::deposit<AptosCoin>(campaign.creator, coins);
    }
}`
  },
  {
    id: 'multisig-wallet',
    name: 'MultiSig Wallet',
    description: 'Multi-signature wallet for secure transactions',
    category: 'Security',
    icon: '🔐',
    code: `module Deployer::multisig_wallet {
    use std::signer;
    use std::vector;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;

    struct Transaction has store {
        to: address,
        amount: u64,
        executed: bool,
        confirmations: vector<address>,
    }

    struct Wallet has key {
        owners: vector<address>,
        required: u64,
        transactions: vector<Transaction>,
    }

    public fun initialize(account: &signer, owners: vector<address>, required: u64) {
        move_to(account, Wallet {
            owners,
            required,
            transactions: vector::empty(),
        });
    }

    public fun submit_transaction(
        account: &signer,
        to: address,
        amount: u64,
    ): u64 acquires Wallet {
        let account_addr = signer::address_of(account);
        let wallet = borrow_global_mut<Wallet>(account_addr);
        
        let tx = Transaction {
            to,
            amount,
            executed: false,
            confirmations: vector::empty(),
        };
        vector::push_back(&mut wallet.transactions, tx);
        vector::length(&wallet.transactions) - 1
    }

    public fun confirm_transaction(account: &signer, tx_id: u64) acquires Wallet {
        let account_addr = signer::address_of(account);
        let wallet = borrow_global_mut<Wallet>(account_addr);
        let tx = vector::borrow_mut(&mut wallet.transactions, tx_id);
        
        assert!(!tx.executed, 1);
        vector::push_back(&mut tx.confirmations, account_addr);
    }

    public fun execute_transaction(account: &signer, tx_id: u64) acquires Wallet {
        let account_addr = signer::address_of(account);
        let wallet = borrow_global_mut<Wallet>(account_addr);
        let tx = vector::borrow_mut(&mut wallet.transactions, tx_id);
        
        assert!(!tx.executed, 1);
        assert!(vector::length(&tx.confirmations) >= wallet.required, 2);

        tx.executed = true;
        let coins = coin::withdraw<AptosCoin>(account_addr, tx.amount);
        coin::deposit<AptosCoin>(tx.to, coins);
    }
}`
  },
  {
    id: 'voting',
    name: 'Voting System',
    description: 'Decentralized voting and governance',
    category: 'Governance',
    icon: '🗳️',
    code: `module Deployer::voting {
    use std::signer;
    use std::string::String;
    use std::vector;
    use std::table;

    struct Proposal has store {
        id: u64,
        title: String,
        description: String,
        proposer: address,
        yes_votes: u64,
        no_votes: u64,
        end_time: u64,
        executed: bool,
    }

    struct Voter has store {
        voting_power: u64,
    }

    struct VotingSystem has key {
        proposals: vector<Proposal>,
        voters: table::Table<address, Voter>,
        admin: address,
    }

    public fun initialize(account: &signer) {
        let account_addr = signer::address_of(account);
        move_to(account, VotingSystem {
            proposals: vector::empty(),
            voters: table::new(),
            admin: account_addr,
        });
    }

    public fun register_voter(account: &signer, voter: address, power: u64) acquires VotingSystem {
        let account_addr = signer::address_of(account);
        let system = borrow_global_mut<VotingSystem>(account_addr);
        assert!(account_addr == system.admin, 1);
        
        table::add(&mut system.voters, voter, Voter { voting_power: power });
    }

    public fun create_proposal(
        account: &signer,
        title: String,
        description: String,
        duration_seconds: u64,
    ): u64 acquires VotingSystem {
        let account_addr = signer::address_of(account);
        let system = borrow_global_mut<VotingSystem>(account_addr);
        assert!(table::contains(&system.voters, account_addr), 2);

        let proposal_id = vector::length(&system.proposals);
        let current_time = aptos_framework::timestamp::now_seconds();
        
        vector::push_back(&mut system.proposals, Proposal {
            id: proposal_id,
            title,
            description,
            proposer: account_addr,
            yes_votes: 0,
            no_votes: 0,
            end_time: current_time + duration_seconds,
            executed: false,
        });

        proposal_id
    }

    public fun vote(account: &signer, proposal_id: u64, support: bool) acquires VotingSystem {
        let account_addr = signer::address_of(account);
        let system = borrow_global_mut<VotingSystem>(account_addr);
        let voter = table::borrow(&system.voters, account_addr);
        let proposal = vector::borrow_mut(&mut system.proposals, proposal_id);
        
        assert!(aptos_framework::timestamp::now_seconds() < proposal.end_time, 3);
        assert!(!proposal.executed, 4);

        if (support) {
            proposal.yes_votes = proposal.yes_votes + voter.voting_power;
        } else {
            proposal.no_votes = proposal.no_votes + voter.voting_power;
        }
    }
}`
  },
  {
    id: 'staking',
    name: 'Token Staking',
    description: 'Stake tokens and earn rewards over time',
    category: 'DeFi',
    icon: '🔒',
    code: `module Deployer::staking {
    use std::signer;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;

    struct StakerInfo has key {
        staked_amount: u64,
        reward_per_token_paid: u64,
        rewards: u64,
    }

    struct StakingPool has key {
        total_staked: u64,
        reward_per_token: u64,
        last_update_time: u64,
    }

    public fun initialize(account: &signer) {
        let current_time = aptos_framework::timestamp::now_seconds();
        move_to(account, StakingPool {
            total_staked: 0,
            reward_per_token: 0,
            last_update_time: current_time,
        });
    }

    public fun stake(account: &signer, amount: u64) acquires StakingPool {
        let account_addr = signer::address_of(account);
        let pool = borrow_global_mut<StakingPool>(account_addr);
        
        if (!exists<StakerInfo>(account_addr)) {
            move_to(account, StakerInfo {
                staked_amount: 0,
                reward_per_token_paid: 0,
                rewards: 0,
            });
        }

        let staker = borrow_global_mut<StakerInfo>(account_addr);
        update_rewards(account_addr, pool, staker);

        let coins = coin::withdraw<AptosCoin>(account, amount);
        staker.staked_amount = staker.staked_amount + amount;
        pool.total_staked = pool.total_staked + amount;
        coin::deposit<AptosCoin>(account_addr, coins);
    }

    public fun withdraw(account: &signer, amount: u64) acquires StakingPool {
        let account_addr = signer::address_of(account);
        let pool = borrow_global_mut<StakingPool>(account_addr);
        let staker = borrow_global_mut<StakerInfo>(account_addr);

        update_rewards(account_addr, pool, staker);
        assert!(staker.staked_amount >= amount, 1);

        staker.staked_amount = staker.staked_amount - amount;
        pool.total_staked = pool.total_staked - amount;
        
        let coins = coin::withdraw<AptosCoin>(account_addr, amount);
        coin::deposit<AptosCoin>(account_addr, coins);
    }

    fun update_rewards(account_addr: address, pool: &mut StakingPool, staker: &mut StakerInfo) {
        let current_time = aptos_framework::timestamp::now_seconds();
        if pool.total_staked > 0 {
            let time_diff = current_time - pool.last_update_time;
            pool.reward_per_token = pool.reward_per_token + (time_diff * 100 / pool.total_staked);
        }
        pool.last_update_time = current_time;

        let earned = (staker.staked_amount * (pool.reward_per_token - staker.reward_per_token_paid)) / 100;
        staker.rewards = staker.rewards + earned;
        staker.reward_per_token_paid = pool.reward_per_token;
    }
}`
  }
];

export const getTemplateById = (id: string): ContractTemplate | undefined => {
  return contractTemplates.find(template => template.id === id);
};

export const getTemplatesByCategory = (category: string): ContractTemplate[] => {
  return contractTemplates.filter(template => template.category === category);
};
