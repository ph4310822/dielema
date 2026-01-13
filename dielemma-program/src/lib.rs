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
solana_program::declare_id!("4k2WMWgqn4ma9fSwgfyDuZ4HpzzJTiCbdxgAhbL6n7ra");

/// Burn address for official tokens (system program is used as burn target)
pub const BURN_ADDRESS: &str = "1nc1nerator11111111111111111111111111111111";

/// Official DLM token mint address (hardcoded)
pub const OFFICIAL_DLM_TOKEN_MINT: &str = "9iJpLnJ4VkPjDopdrCz4ykgT1nkYNA3jD3GcsGauu4gm";

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
        /// Unique deposit seed (client-generated)
        deposit_seed: String,
        /// Receiver who can claim if proof-of-life expires
        receiver: Pubkey,
        /// Amount of tokens to deposit (in smallest unit)
        amount: u64,
        /// Timeout period in seconds (e.g., 86400 = 1 day)
        timeout_seconds: u64,
    },

    /// Proof of life - resets the timer and burns 1 DLM token
    /// Accounts:
    /// 0. [signer] Depositor
    /// 1. [writable] Deposit account (PDA)
    /// 2. [writable] Depositor's DLM token account
    /// 3. [writable] Official DLM token mint (supply decreases when burning)
    /// 4. [] Token program
    /// 5. [] System program
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
}

/// Maximum length of deposit seed string
pub const MAX_DEPOSIT_SEED_LENGTH: usize = 32;

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
    /// Length of deposit_seed
    pub deposit_seed_len: u32,
    /// Deposit seed used to derive this account's PDA (fixed-size array)
    pub deposit_seed: [u8; MAX_DEPOSIT_SEED_LENGTH],
}

/// Calculate the size needed for a DepositAccount
/// 32 (depositor) + 32 (receiver) + 32 (token_mint) + 8 (amount) + 8 (last_proof_timestamp) +
/// 8 (timeout_seconds) + 1 (bump) + 1 (is_closed) + 4 (seed length) + 32 (seed data)
/// = 158 bytes
pub const DEPOSIT_ACCOUNT_SIZE: usize = 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 4 + MAX_DEPOSIT_SEED_LENGTH;

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
    // Manually parse instruction to avoid stack overflow with Borsh + String
    // Instruction format: discriminant (4 bytes) + data
    if instruction_data.len() < 4 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let discriminant = u32::from_le_bytes(
        instruction_data[0..4]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?
    );

    match discriminant {
        0 => {
            // Deposit instruction
            let data = &instruction_data[4..];
            let offset = &mut 0;

            // Parse deposit_seed (length-prefixed string)
            let seed_len = u32::from_le_bytes(data[*offset..*offset + 4]
                .try_into().unwrap()) as usize;
            *offset += 4;
            let deposit_seed = std::str::from_utf8(&data[*offset..*offset + seed_len])
                .map_err(|_| ProgramError::InvalidInstructionData)?;
            *offset += seed_len;

            // Parse receiver (32 bytes)
            let receiver_bytes = &data[*offset..*offset + 32];
            *offset += 32;
            let receiver = Pubkey::try_from(receiver_bytes)
                .map_err(|_| ProgramError::InvalidInstructionData)?;

            // Parse amount (u64)
            let amount = u64::from_le_bytes(data[*offset..*offset + 8]
                .try_into().unwrap());
            *offset += 8;

            // Parse timeout_seconds (u64)
            let timeout_seconds = u64::from_le_bytes(data[*offset..*offset + 8]
                .try_into().unwrap());

            process_deposit(program_id, accounts, deposit_seed, &receiver, amount, timeout_seconds)
        }
        1 => {
            // ProofOfLife instruction
            let data = &instruction_data[4..];
            let offset = &mut 0;

            let seed_len = u32::from_le_bytes(data[*offset..*offset + 4]
                .try_into().unwrap()) as usize;
            *offset += 4;
            let deposit_seed = std::str::from_utf8(&data[*offset..*offset + seed_len])
                .map_err(|_| ProgramError::InvalidInstructionData)?;

            process_proof_of_life(program_id, accounts, deposit_seed)
        }
        2 => {
            // Withdraw instruction
            let data = &instruction_data[4..];
            let offset = &mut 0;

            let seed_len = u32::from_le_bytes(data[*offset..*offset + 4]
                .try_into().unwrap()) as usize;
            *offset += 4;
            let deposit_seed = std::str::from_utf8(&data[*offset..*offset + seed_len])
                .map_err(|_| ProgramError::InvalidInstructionData)?;

            process_withdraw(program_id, accounts, deposit_seed)
        }
        3 => {
            // Claim instruction
            let data = &instruction_data[4..];
            let offset = &mut 0;

            let seed_len = u32::from_le_bytes(data[*offset..*offset + 4]
                .try_into().unwrap()) as usize;
            *offset += 4;
            let deposit_seed = std::str::from_utf8(&data[*offset..*offset + seed_len])
                .map_err(|_| ProgramError::InvalidInstructionData)?;

            process_claim(program_id, accounts, deposit_seed)
        }
        4 => {
            // CloseAccount instruction
            let data = &instruction_data[4..];
            let offset = &mut 0;

            let seed_len = u32::from_le_bytes(data[*offset..*offset + 4]
                .try_into().unwrap()) as usize;
            *offset += 4;
            let deposit_seed = std::str::from_utf8(&data[*offset..*offset + seed_len])
                .map_err(|_| ProgramError::InvalidInstructionData)?;

            process_close_account(program_id, accounts, deposit_seed)
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// Process deposit instruction
fn process_deposit(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    deposit_seed: &str,  // Use reference to avoid copying
    receiver: &Pubkey,   // Use reference to avoid copying
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

    // Get clock for timestamp
    let clock = Clock::get()?;

    // Derive PDA for deposit account (using client-provided seed)
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

    // Create token account (needs PDA signature since it will be owned by PDA)
    let create_token_account_ix = system_instruction::create_account(
        depositor.key,
        deposit_token_account.key,
        rent.minimum_balance(token_account_size),
        token_account_size as u64,
        &spl_token::id(),
    );

    invoke_signed(
        &create_token_account_ix,
        &[
            depositor.clone(),
            deposit_token_account.clone(),
            system_program.clone(),
        ],
        &[&[
            TOKEN_ACCOUNT_SEED_PREFIX,
            deposit_pda.as_ref(),
            &[token_bump],
        ]],
    )?;

    // Initialize token account (owned by deposit PDA, so we need invoke_signed)
    let init_token_account_ix = initialize_account(
        &spl_token::id(),
        deposit_token_account.key,
        token_mint.key,
        deposit_account.key,
    )?;

    invoke_signed(
        &init_token_account_ix,
        &[
            deposit_token_account.clone(),
            token_mint.clone(),
            deposit_account.clone(),
            rent_account.clone(),
            token_program.clone(),
        ],
        &[&[
            TOKEN_ACCOUNT_SEED_PREFIX,
            deposit_pda.as_ref(),
            &[token_bump],
        ]],
    )?;

    // Transfer tokens from depositor to deposit token account
    let transfer_ix = transfer(
        &spl_token::id(),
        depositor_token_account.key,  // Source: depositor's ATA
        deposit_token_account.key,      // Destination: deposit's token account
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
    let seed_bytes = deposit_seed.as_bytes();
    let seed_len = seed_bytes.len() as u32;

    // Initialize fixed-size array with seed data
    let mut seed_array = [0u8; MAX_DEPOSIT_SEED_LENGTH];
    seed_array[..seed_bytes.len()].copy_from_slice(seed_bytes);

    let deposit_state = DepositAccount {
        depositor: *depositor.key,
        receiver: *receiver,  // Copy the Pubkey
        token_mint: *token_mint.key,
        amount,
        last_proof_timestamp: clock.unix_timestamp,
        timeout_seconds,
        bump,
        is_closed: false,
        deposit_seed_len: seed_len,
        deposit_seed: seed_array,
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
    deposit_seed: &str,  // Use reference
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();

    let depositor = next_account_info(account_info_iter)?;
    let deposit_account = next_account_info(account_info_iter)?;
    let depositor_token_account = next_account_info(account_info_iter)?;
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

    // Verify official token mint matches the hardcoded DLM token
    let official_dlm_mint = OFFICIAL_DLM_TOKEN_MINT.parse::<Pubkey>()
        .map_err(|_| ProgramError::InvalidAccountData)?;

    if *official_token_mint.key != official_dlm_mint {
        msg!("Official token mint must be DLM token");
        msg!("Expected: {}", OFFICIAL_DLM_TOKEN_MINT);
        msg!("Got: {}", official_token_mint.key);
        return Err(ProgramError::InvalidAccountData);
    }

    // Amount to burn: 1 DLM token (9 decimals)
    let burn_amount: u64 = 1_000_000_000;

    // Burn directly from depositor's token account
    let burn_ix = burn(
        &spl_token::id(),
        depositor_token_account.key,
        official_token_mint.key,
        depositor.key,
        &[],
        burn_amount,
    )?;

    invoke(
        &burn_ix,
        &[
            depositor_token_account.clone(),
            official_token_mint.clone(),
            depositor.clone(),
            token_program.clone(),
        ],
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
    deposit_seed: &str,  // Use reference
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

    // Get current token balance (scoped to ensure borrow is released before we borrow again)
    let token_amount = {
        let token_account_data = deposit_token_account.data.borrow();
        let token_account_state = TokenAccount::unpack(&token_account_data)?;
        token_account_state.amount
    }; // token_account_data is dropped here

    // Transfer tokens back to depositor (from deposit_token_account to depositor_token_account)
    let transfer_ix = transfer(
        &spl_token::id(),
        deposit_token_account.key,      // Source: deposit's token account
        depositor_token_account.key,    // Destination: depositor's ATA
        deposit_account.key,
        &[],
        token_amount,
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

    // Mark as closed (now safe to borrow again)
    deposit_state.is_closed = true;
    deposit_state.serialize(&mut &mut deposit_account.data.borrow_mut()[..])?;

    msg!("Withdrawal successful: {} tokens", token_amount);
    Ok(())
}

/// Process claim instruction
fn process_claim(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    deposit_seed: &str,  // Use reference
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

    // Get current token balance (scoped to ensure borrow is released before we borrow again)
    let token_amount = {
        let token_account_data = deposit_token_account.data.borrow();
        let token_account_state = TokenAccount::unpack(&token_account_data)?;
        token_account_state.amount
    }; // token_account_data is dropped here

    // Transfer tokens to receiver (from deposit_token_account to receiver_token_account)
    let transfer_ix = transfer(
        &spl_token::id(),
        deposit_token_account.key,      // Source: deposit's token account
        receiver_token_account.key,     // Destination: receiver's ATA
        deposit_account.key,
        &[],
        token_amount,
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

    // Mark as closed (now safe to borrow again)
    let mut deposit_state = DepositAccount::try_from_slice(&deposit_account.data.borrow())?;
    deposit_state.is_closed = true;
    deposit_state.serialize(&mut &mut deposit_account.data.borrow_mut()[..])?;

    msg!("Claim successful: {} tokens transferred to receiver", token_amount);
    Ok(())
}

/// Process close account instruction
fn process_close_account(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    deposit_seed: &str,  // Use reference
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
            deposit_seed: "test-seed-123".to_string(),
            receiver,
            amount: 1000,
            timeout_seconds: 86400,
        };

        let serialized = instruction.try_to_vec().unwrap();
        let deserialized = DielemmaInstruction::try_from_slice(&serialized).unwrap();

        assert_eq!(instruction, deserialized);
    }
}
