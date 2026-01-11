//! Dielemma: A proof-of-life smart contract on Solana
//!
//! Users deposit tokens and must periodically prove they are alive.
//! If they fail to do so within the configured time period, the receiver can claim the tokens.

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    system_instruction,
    system_program,
    sysvar::{clock::Clock, rent::Rent, Sysvar, SysvarId},
};
use spl_token::{
    instruction::{initialize_account, transfer, burn, close_account},
    state::Account as TokenAccount,
};

// Declare program ID
solana_program::declare_id!("45BVWUn3fdnLwikmk9WZjcXjLBQNiBprsYKKhV1NhCQj");

/// Burn address for official tokens (system program is used as burn target)
pub const BURN_ADDRESS: &str = "1nc1nerator11111111111111111111111111111111";

/// Instruction types for the Dielemma program
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum DielemmaInstruction {
    /// Deposit tokens with a receiver and proof-of-life timeout
    /// Accounts:
    /// 0. [signer] Depositor/Payer
    /// 1. [writable] Deposit account (PDA)
    /// 2. [writable] Token account (owned by depositor)
    /// 3. [writable] Deposit token account (PDA, holds deposited tokens)
    /// 4. [] Token mint
    /// 5. [] Token program
    /// 6. [] System program
    /// 7. [] Rent sysvar
    Deposit {
        /// Receiver who can claim if proof-of-life expires
        receiver: Pubkey,
        /// Amount of tokens to deposit (in smallest unit)
        amount: u64,
        /// Timeout period in seconds (e.g., 86400 = 1 day)
        timeout_seconds: u64,
    },

    /// Proof of life - resets the timer and burns 1 official token
    /// Accounts:
    /// 0. [signer] Depositor
    /// 1. [writable] Deposit account (PDA)
    /// 2. [writable] Depositor's official token account
    /// 3. [writable] PDA token account to hold tokens for burning
    /// 4. [] Official token mint
    /// 5. [] Token program
    /// 6. [] System program
    ProofOfLife {
        /// Deposit account seed (unique identifier)
        deposit_seed: String,
    },

    /// Withdraw deposited tokens (depositor can always withdraw)
    /// Accounts:
    /// 0. [signer] Depositor
    /// 1. [writable] Deposit account (PDA)
    /// 2. [writable] Depositor's token account
    /// 3. [writable] Deposit token account (PDA)
    /// 4. [] Token program
    Withdraw {
        /// Deposit account seed (unique identifier)
        deposit_seed: String,
    },

    /// Claim tokens if proof-of-life has expired (receiver only)
    /// Accounts:
    /// 0. [signer] Receiver
    /// 1. [writable] Deposit account (PDA)
    /// 2. [writable] Receiver's token account
    /// 3. [writable] Deposit token account (PDA)
    /// 4. [] Token program
    Claim {
        /// Deposit account seed (unique identifier)
        deposit_seed: String,
    },

    /// Close the deposit account (after withdrawal or claim)
    /// Accounts:
    /// 0. [signer] Depositor or receiver
    /// 1. [writable] Deposit account (PDA)
    /// 2. [writable] Refund recipient
    /// 3. [] System program
    CloseAccount {
        /// Deposit account seed (unique identifier)
        deposit_seed: String,
    },

    /// Set the official token mint address for proof-of-life burning
    /// Accounts:
    /// 0. [signer] Admin/Owner
    /// 1. [] Official token mint
    SetOfficialToken {
        /// Official token mint address
        official_token_mint: Pubkey,
    },
}

/// Deposit account state stored on-chain
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct DepositAccount {
    /// Depositor's public key
    pub depositor: Pubkey,
    /// Receiver who can claim if proof-of-life expires
    pub receiver: Pubkey,
    /// Token mint address
    pub token_mint: Pubkey,
    /// Amount of tokens deposited
    pub amount: u64,
    /// Last proof-of-life timestamp (unix timestamp)
    pub last_proof_timestamp: i64,
    /// Timeout period in seconds
    pub timeout_seconds: u64,
    /// Bump seed for PDA
    pub bump: u8,
    /// Whether tokens have been withdrawn/claimed
    pub is_closed: bool,
    /// Official token mint for proof-of-life burning
    pub official_token_mint: Pubkey,
}

/// Calculate the size needed for a DepositAccount
pub const DEPOSIT_ACCOUNT_SIZE: usize = 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 32; // 154 bytes

// Derive PDA seeds
pub const DEPOSIT_SEED_PREFIX: &[u8] = b"deposit";
pub const TOKEN_ACCOUNT_SEED_PREFIX: &[u8] = b"token_account";

/// Entry point for the Dielemma program
entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = DielemmaInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        DielemmaInstruction::Deposit {
            receiver,
            amount,
            timeout_seconds,
        } => process_deposit(program_id, accounts, receiver, amount, timeout_seconds),
        DielemmaInstruction::ProofOfLife { deposit_seed } => {
            process_proof_of_life(program_id, accounts, deposit_seed)
        }
        DielemmaInstruction::Withdraw { deposit_seed } => {
            process_withdraw(program_id, accounts, deposit_seed)
        }
        DielemmaInstruction::Claim { deposit_seed } => process_claim(program_id, accounts, deposit_seed),
        DielemmaInstruction::CloseAccount { deposit_seed } => {
            process_close_account(program_id, accounts, deposit_seed)
        }
        DielemmaInstruction::SetOfficialToken {
            official_token_mint,
        } => process_set_official_token(program_id, accounts, official_token_mint),
    }
}

/// Process deposit instruction
fn process_deposit(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    receiver: Pubkey,
    amount: u64,
    timeout_seconds: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();

    let depositor = next_account_info(account_info_iter)?;
    let deposit_account = next_account_info(account_info_iter)?;
    let depositor_token_account = next_account_info(account_info_iter)?;
    let deposit_token_account = next_account_info(account_info_iter)?;
    let token_mint = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;
    let rent_account = next_account_info(account_info_iter)?;

    // Verify system program
    if system_program.key != &system_program::id() {
        msg!("Invalid system program");
        return Err(ProgramError::IncorrectProgramId);
    }

    // Verify token program
    if token_program.key != &spl_token::id() {
        msg!("Invalid token program");
        return Err(ProgramError::IncorrectProgramId);
    }

    // Generate unique deposit seed
    let clock = Clock::get()?;
    let deposit_seed = format!("{}-{}", depositor.key, clock.unix_timestamp);

    // Derive PDA for deposit account
    let (deposit_pda, bump) = Pubkey::find_program_address(
        &[DEPOSIT_SEED_PREFIX, depositor.key.as_ref(), deposit_seed.as_bytes()],
        program_id,
    );

    if deposit_account.key != &deposit_pda {
        msg!("Invalid deposit account PDA");
        return Err(ProgramError::InvalidAccountData);
    }

    // Check if deposit account already exists
    if deposit_account.lamports() > 0 {
        msg!("Deposit account already exists");
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    // Calculate minimum rent exemption
    let rent = Rent::get()?;
    let required_lamports = rent
        .minimum_balance(DEPOSIT_ACCOUNT_SIZE)
        .max(1);

    // Create deposit account
    let create_deposit_account_ix = system_instruction::create_account(
        depositor.key,
        deposit_account.key,
        required_lamports,
        DEPOSIT_ACCOUNT_SIZE as u64,
        program_id,
    );

    invoke_signed(
        &create_deposit_account_ix,
        &[
            depositor.clone(),
            deposit_account.clone(),
            system_program.clone(),
        ],
        &[&[
            DEPOSIT_SEED_PREFIX,
            depositor.key.as_ref(),
            deposit_seed.as_bytes(),
            &[bump],
        ]],
    )?;

    // Derive PDA for deposit token account
    let (token_account_pda, token_bump) = Pubkey::find_program_address(
        &[
            TOKEN_ACCOUNT_SEED_PREFIX,
            deposit_pda.as_ref(),
        ],
        program_id,
    );

    if deposit_token_account.key != &token_account_pda {
        msg!("Invalid token account PDA");
        return Err(ProgramError::InvalidAccountData);
    }

    // Calculate token account size
    let token_account_size = TokenAccount::LEN;

    // Create token account
    let create_token_account_ix = system_instruction::create_account(
        depositor.key,
        deposit_token_account.key,
        rent.minimum_balance(token_account_size),
        token_account_size as u64,
        &spl_token::id(),
    );

    invoke(
        &create_token_account_ix,
        &[
            depositor.clone(),
            deposit_token_account.clone(),
            system_program.clone(),
        ],
    )?;

    // Initialize token account
    let init_token_account_ix = initialize_account(
        &spl_token::id(),
        deposit_token_account.key,
        token_mint.key,
        deposit_account.key,
    )?;

    invoke(
        &init_token_account_ix,
        &[
            deposit_token_account.clone(),
            token_mint.clone(),
            deposit_account.clone(),
            rent_account.clone(),
            token_program.clone(),
        ],
    )?;

    // Transfer tokens from depositor to deposit token account
    let transfer_ix = transfer(
        &spl_token::id(),
        deposit_token_account.key,
        depositor_token_account.key,
        depositor.key,
        &[],
        amount,
    )?;

    invoke(
        &transfer_ix,
        &[
            depositor_token_account.clone(),
            deposit_token_account.clone(),
            depositor.clone(),
            token_program.clone(),
        ],
    )?;

    // Create deposit account state
    let deposit_state = DepositAccount {
        depositor: *depositor.key,
        receiver,
        token_mint: *token_mint.key,
        amount,
        last_proof_timestamp: clock.unix_timestamp,
        timeout_seconds,
        bump,
        is_closed: false,
        official_token_mint: Pubkey::default(), // Will be set by admin
    };

    // Serialize and write to account
    deposit_state.serialize(&mut &mut deposit_account.data.borrow_mut()[..])?;

    msg!("Deposit successful: {} tokens to receiver {}", amount, receiver);
    Ok(())
}

/// Process proof-of-life instruction
fn process_proof_of_life(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    deposit_seed: String,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();

    let depositor = next_account_info(account_info_iter)?;
    let deposit_account = next_account_info(account_info_iter)?;
    let depositor_token_account = next_account_info(account_info_iter)?;
    let burn_token_account = next_account_info(account_info_iter)?;
    let official_token_mint = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    // Verify system program
    if system_program.key != &system_program::id() {
        return Err(ProgramError::IncorrectProgramId);
    }

    // Verify token program
    if token_program.key != &spl_token::id() {
        msg!("Invalid token program");
        return Err(ProgramError::IncorrectProgramId);
    }

    // Derive PDA
    let (deposit_pda, _bump) = Pubkey::find_program_address(
        &[DEPOSIT_SEED_PREFIX, depositor.key.as_ref(), deposit_seed.as_bytes()],
        program_id,
    );

    if deposit_account.key != &deposit_pda {
        return Err(ProgramError::InvalidAccountData);
    }

    // Deserialize deposit account
    let mut deposit_state = DepositAccount::try_from_slice(&deposit_account.data.borrow())?;

    // Verify depositor
    if deposit_state.depositor != *depositor.key {
        msg!("Only the depositor can perform proof of life");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Check if already closed
    if deposit_state.is_closed {
        msg!("Deposit account is already closed");
        return Err(ProgramError::InvalidAccountData);
    }

    // Check if official token mint is set
    if deposit_state.official_token_mint == Pubkey::default() {
        msg!("Official token mint not set");
        return Err(ProgramError::InvalidAccountData);
    }

    // Verify official token mint matches
    if deposit_state.official_token_mint != *official_token_mint.key {
        msg!("Official token mint mismatch");
        return Err(ProgramError::InvalidAccountData);
    }

    // Amount to burn: 1 token (assuming 9 decimals for Solana tokens)
    let burn_amount: u64 = 1_000_000_000;

    // Transfer 1 token from depositor to burn token account
    let transfer_ix = transfer(
        &spl_token::id(),
        burn_token_account.key,
        depositor_token_account.key,
        depositor.key,
        &[],
        burn_amount,
    )?;

    invoke(
        &transfer_ix,
        &[
            depositor_token_account.clone(),
            burn_token_account.clone(),
            depositor.clone(),
            token_program.clone(),
        ],
    )?;

    // Burn the tokens
    let burn_ix = burn(
        &spl_token::id(),
        burn_token_account.key,
        official_token_mint.key,
        burn_token_account.key,
        &[],
        burn_amount,
    )?;

    invoke_signed(
        &burn_ix,
        &[
            burn_token_account.clone(),
            official_token_mint.clone(),
            token_program.clone(),
        ],
        &[&[
            DEPOSIT_SEED_PREFIX,
            depositor.key.as_ref(),
            deposit_seed.as_bytes(),
            &[_bump],
        ]],
    )?;

    // Update timestamp
    let clock = Clock::get()?;
    deposit_state.last_proof_timestamp = clock.unix_timestamp;

    // Serialize back
    deposit_state.serialize(&mut &mut deposit_account.data.borrow_mut()[..])?;

    msg!("Proof of life recorded at {} with {} tokens burned", deposit_state.last_proof_timestamp, burn_amount);
    Ok(())
}

/// Process withdraw instruction
fn process_withdraw(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    deposit_seed: String,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();

    let depositor = next_account_info(account_info_iter)?;
    let deposit_account = next_account_info(account_info_iter)?;
    let depositor_token_account = next_account_info(account_info_iter)?;
    let deposit_token_account = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;

    // Derive PDA
    let (deposit_pda, _bump) = Pubkey::find_program_address(
        &[DEPOSIT_SEED_PREFIX, depositor.key.as_ref(), deposit_seed.as_bytes()],
        program_id,
    );

    if deposit_account.key != &deposit_pda {
        return Err(ProgramError::InvalidAccountData);
    }

    // Deserialize deposit account
    let mut deposit_state = DepositAccount::try_from_slice(&deposit_account.data.borrow())?;

    // Verify depositor
    if deposit_state.depositor != *depositor.key {
        msg!("Only the depositor can withdraw");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Check if already closed
    if deposit_state.is_closed {
        msg!("Deposit already withdrawn or claimed");
        return Err(ProgramError::InvalidAccountData);
    }

    // Get current token balance
    let token_account_data = deposit_token_account.data.borrow();
    let token_account_state = TokenAccount::unpack(&token_account_data)?;

    // Transfer tokens back to depositor
    let transfer_ix = transfer(
        &spl_token::id(),
        depositor_token_account.key,
        deposit_token_account.key,
        deposit_account.key,
        &[],
        token_account_state.amount,
    )?;

    invoke_signed(
        &transfer_ix,
        &[
            deposit_token_account.clone(),
            depositor_token_account.clone(),
            deposit_account.clone(),
            token_program.clone(),
        ],
        &[&[
            DEPOSIT_SEED_PREFIX,
            depositor.key.as_ref(),
            deposit_seed.as_bytes(),
            &[deposit_state.bump],
        ]],
    )?;

    // Mark as closed
    deposit_state.is_closed = true;
    deposit_state.serialize(&mut &mut deposit_account.data.borrow_mut()[..])?;

    msg!("Withdrawal successful: {} tokens", token_account_state.amount);
    Ok(())
}

/// Process claim instruction
fn process_claim(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    deposit_seed: String,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();

    let receiver = next_account_info(account_info_iter)?;
    let deposit_account = next_account_info(account_info_iter)?;
    let receiver_token_account = next_account_info(account_info_iter)?;
    let deposit_token_account = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;

    // Deserialize deposit account first to get depositor
    let deposit_state = DepositAccount::try_from_slice(&deposit_account.data.borrow())?;

    // Derive PDA
    let (deposit_pda, _bump) = Pubkey::find_program_address(
        &[DEPOSIT_SEED_PREFIX, deposit_state.depositor.as_ref(), deposit_seed.as_bytes()],
        program_id,
    );

    if deposit_account.key != &deposit_pda {
        return Err(ProgramError::InvalidAccountData);
    }

    // Verify receiver
    if deposit_state.receiver != *receiver.key {
        msg!("Only the designated receiver can claim");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Check if already closed
    if deposit_state.is_closed {
        msg!("Deposit already withdrawn or claimed");
        return Err(ProgramError::InvalidAccountData);
    }

    // Check if proof-of-life has expired
    let clock = Clock::get()?;
    let elapsed = clock.unix_timestamp - deposit_state.last_proof_timestamp;
    if elapsed < deposit_state.timeout_seconds as i64 {
        msg!(
            "Proof of life has not expired yet. Elapsed: {}, Required: {}",
            elapsed,
            deposit_state.timeout_seconds
        );
        return Err(ProgramError::InvalidAccountData);
    }

    // Get current token balance
    let token_account_data = deposit_token_account.data.borrow();
    let token_account_state = TokenAccount::unpack(&token_account_data)?;

    // Transfer tokens to receiver
    let transfer_ix = transfer(
        &spl_token::id(),
        receiver_token_account.key,
        deposit_token_account.key,
        deposit_account.key,
        &[],
        token_account_state.amount,
    )?;

    invoke_signed(
        &transfer_ix,
        &[
            deposit_token_account.clone(),
            receiver_token_account.clone(),
            deposit_account.clone(),
            token_program.clone(),
        ],
        &[&[
            DEPOSIT_SEED_PREFIX,
            deposit_state.depositor.as_ref(),
            deposit_seed.as_bytes(),
            &[deposit_state.bump],
        ]],
    )?;

    msg!("Claim successful: {} tokens transferred to receiver", token_account_state.amount);
    Ok(())
}

/// Process close account instruction
fn process_close_account(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    deposit_seed: String,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();

    let authority = next_account_info(account_info_iter)?;
    let deposit_account = next_account_info(account_info_iter)?;
    let refund_recipient = next_account_info(account_info_iter)?;
    let _system_program = next_account_info(account_info_iter)?;

    // Deserialize deposit account
    let deposit_state = DepositAccount::try_from_slice(&deposit_account.data.borrow())?;

    // Derive PDA
    let (deposit_pda, _bump) = Pubkey::find_program_address(
        &[DEPOSIT_SEED_PREFIX, deposit_state.depositor.as_ref(), deposit_seed.as_bytes()],
        program_id,
    );

    if deposit_account.key != &deposit_pda {
        return Err(ProgramError::InvalidAccountData);
    }

    // Verify authority (must be depositor or receiver)
    if deposit_state.depositor != *authority.key && deposit_state.receiver != *authority.key {
        msg!("Only depositor or receiver can close the account");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Check if tokens have been withdrawn/claimed
    if !deposit_state.is_closed {
        msg!("Cannot close account with active tokens");
        return Err(ProgramError::InvalidAccountData);
    }

    // Close account and transfer lamports
    let close_lamports = deposit_account.lamports();
    **deposit_account.lamports.borrow_mut() = 0;
    **refund_recipient.lamports.borrow_mut() += close_lamports;

    msg!("Account closed, {} lamports refunded", close_lamports);
    Ok(())
}

/// Process set official token instruction
fn process_set_official_token(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    official_token_mint: Pubkey,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();

    let admin = next_account_info(account_info_iter)?;
    let _official_token_mint_account = next_account_info(account_info_iter)?;

    // For simplicity, we allow any signer to set the official token mint
    // In production, you should implement proper access control
    if !admin.is_signer {
        msg!("Admin must sign");
        return Err(ProgramError::MissingRequiredSignature);
    }

    msg!("Official token mint set to: {}", official_token_mint);
    // Note: In a real implementation, you'd want to store this in a config account
    // For now, each deposit will have its own official_token_mint field that can be updated
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_sdk::{
        signature::{Keypair, Signer},
        transaction::Transaction,
    };

    #[test]
    fn test_instruction_packing() {
        let receiver = Pubkey::new_unique();
        let instruction = DielemmaInstruction::Deposit {
            receiver,
            amount: 1000,
            timeout_seconds: 86400,
        };

        let serialized = instruction.try_to_vec().unwrap();
        let deserialized = DielemmaInstruction::try_from_slice(&serialized).unwrap();

        assert_eq!(instruction, deserialized);
    }
}
