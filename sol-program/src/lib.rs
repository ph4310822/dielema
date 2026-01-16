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
    instruction::{initialize_account, transfer},
    state::Account as TokenAccount,
};

// Declare program ID
solana_program::declare_id!("EyFvSrD8X5DDGrWpyRRJsxLsrJqngQRAHVponPmR9mmm");

/// Burn address for official tokens (system program is used as burn target)
pub const BURN_ADDRESS: &str = "1nc1nerator11111111111111111111111111111111";

/// Official DLM token mint address (hardcoded)
/// DEVNET: 6WnV2dFQwvdJvMhWrg4d8ngYcgt6vvtKAkGrYovGjpwF
/// MAINNET: dVA6zfXBRieUCPS8GR4hve5ugmp5naPvKGFquUDpump
pub const OFFICIAL_DLM_TOKEN_MINT: &str = "6WnV2dFQwvdJvMhWrg4d8ngYcgt6vvtKAkGrYovGjpwF";

/// DLM token decimals (1 DLM = 10^6 smallest units)
pub const DLM_TOKEN_DECIMALS: u8 = 6;

/// WSOL mint address (wrapped SOL)
pub const WSOL_MINT: Pubkey = solana_program::pubkey!("So11111111111111111111111111111111111111111");

/// WSOL decimals (9 decimals)
pub const WSOL_DECIMALS: u8 = 9;

/// Instruction types for the Dielemma program
// Removed Debug, Clone, PartialEq derives to reduce stack usage in ABI generation
#[derive(BorshSerialize, BorshDeserialize)]
pub enum DielemmaInstruction {
    /// Deposit WSOL tokens with a receiver and proof-of-life timeout
    /// Accounts:
    /// 0. [signer] Depositor/Payer
    /// 1. [writable] Deposit account (PDA)
    /// 2. [writable] Token account (owned by depositor)
    /// 3. [writable] Deposit token account (PDA, holds deposited tokens)
    /// 4. [] Token program
    /// 5. [] System program
    /// 6. [] Rent sysvar
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

    /// Proof of life - verify user burned DLM token and reset timer
    /// Accounts:
    /// 0. [signer] Depositor
    /// 1. [writable] Deposit account (PDA)
    ProofOfLife {
        /// Deposit account seed (unique identifier)
        deposit_seed: String,
        /// Signature from burn transaction (64 bytes)
        burn_signature: [u8; 64],
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
    /// Token mint address (always WSOL)
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
    /// Last verified burn signature (to prevent replay attacks)
    pub last_burn_signature: Option<[u8; 64]>,
}

/// Calculate the size needed for a DepositAccount
/// 32 (depositor) + 32 (receiver) + 32 (token_mint) + 8 (amount) + 8 (last_proof_timestamp) +
/// 8 (timeout_seconds) + 1 (bump) + 1 (is_closed) + 4 (seed length) + 32 (seed data) + 1 (option tag) + 64 (burn_signature)
/// = 223 bytes
pub const DEPOSIT_ACCOUNT_SIZE: usize = 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 4 + MAX_DEPOSIT_SEED_LENGTH + 1 + 64;

// Derive PDA seeds
pub const DEPOSIT_SEED_PREFIX: &[u8] = b"deposit";
pub const TOKEN_ACCOUNT_SEED_PREFIX: &[u8] = b"token_account";

// Entry point for the Dielemma program
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

            // Parse deposit_seed (length-prefixed string) with bounds checking
            if data.len() < 4 {
                return Err(ProgramError::InvalidInstructionData);
            }
            let seed_len = u32::from_le_bytes(data[*offset..*offset + 4]
                .try_into().unwrap()) as usize;
            *offset += 4;
            if seed_len > MAX_DEPOSIT_SEED_LENGTH || *offset + seed_len > data.len() {
                msg!("Invalid deposit seed length");
                return Err(ProgramError::InvalidInstructionData);
            }
            let deposit_seed_bytes = &data[*offset..*offset + seed_len];
            let deposit_seed = std::str::from_utf8(deposit_seed_bytes)
                .map_err(|_| ProgramError::InvalidInstructionData)?;

            // Additional validation: ensure byte length is within bounds after UTF-8 conversion
            if deposit_seed_bytes.len() > MAX_DEPOSIT_SEED_LENGTH {
                msg!("Deposit seed bytes exceed maximum length");
                return Err(ProgramError::InvalidInstructionData);
            }
            *offset += seed_len;

            // Verify remaining data has enough bytes for receiver (32) + amount (8) + timeout (8) = 48
            if *offset + 48 > data.len() {
                msg!("Invalid instruction data: insufficient bytes");
                return Err(ProgramError::InvalidInstructionData);
            }

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

            if data.len() < 4 {
                return Err(ProgramError::InvalidInstructionData);
            }
            let seed_len = u32::from_le_bytes(data[*offset..*offset + 4]
                .try_into().unwrap()) as usize;
            *offset += 4;
            if seed_len > MAX_DEPOSIT_SEED_LENGTH || *offset + seed_len > data.len() {
                msg!("Invalid deposit seed length");
                return Err(ProgramError::InvalidInstructionData);
            }
            let deposit_seed_bytes = &data[*offset..*offset + seed_len];
            let deposit_seed = std::str::from_utf8(deposit_seed_bytes)
                .map_err(|_| ProgramError::InvalidInstructionData)?;

            // Additional validation: ensure byte length is within bounds after UTF-8 conversion
            if deposit_seed_bytes.len() > MAX_DEPOSIT_SEED_LENGTH {
                msg!("Deposit seed bytes exceed maximum length");
                return Err(ProgramError::InvalidAccountData);
            }
            *offset += seed_len;

            // Parse burn_signature (64 bytes)
            if *offset + 64 > data.len() {
                msg!("Invalid instruction data: missing burn signature");
                return Err(ProgramError::InvalidInstructionData);
            }
            let mut burn_signature = [0u8; 64];
            burn_signature.copy_from_slice(&data[*offset..*offset + 64]);

            process_proof_of_life(program_id, accounts, deposit_seed, &burn_signature)
        }
        2 => {
            // Withdraw instruction
            let data = &instruction_data[4..];
            let offset = &mut 0;

            if data.len() < 4 {
                return Err(ProgramError::InvalidInstructionData);
            }
            let seed_len = u32::from_le_bytes(data[*offset..*offset + 4]
                .try_into().unwrap()) as usize;
            *offset += 4;
            if seed_len > MAX_DEPOSIT_SEED_LENGTH || *offset + seed_len > data.len() {
                msg!("Invalid deposit seed length");
                return Err(ProgramError::InvalidInstructionData);
            }
            let deposit_seed_bytes = &data[*offset..*offset + seed_len];
            let deposit_seed = std::str::from_utf8(deposit_seed_bytes)
                .map_err(|_| ProgramError::InvalidInstructionData)?;

            // Additional validation: ensure byte length is within bounds after UTF-8 conversion
            if deposit_seed_bytes.len() > MAX_DEPOSIT_SEED_LENGTH {
                msg!("Deposit seed bytes exceed maximum length");
                return Err(ProgramError::InvalidInstructionData);
            }

            process_withdraw(program_id, accounts, deposit_seed)
        }
        3 => {
            // Claim instruction
            let data = &instruction_data[4..];
            let offset = &mut 0;

            if data.len() < 4 {
                return Err(ProgramError::InvalidInstructionData);
            }
            let seed_len = u32::from_le_bytes(data[*offset..*offset + 4]
                .try_into().unwrap()) as usize;
            *offset += 4;
            if seed_len > MAX_DEPOSIT_SEED_LENGTH || *offset + seed_len > data.len() {
                msg!("Invalid deposit seed length");
                return Err(ProgramError::InvalidInstructionData);
            }
            let deposit_seed_bytes = &data[*offset..*offset + seed_len];
            let deposit_seed = std::str::from_utf8(deposit_seed_bytes)
                .map_err(|_| ProgramError::InvalidInstructionData)?;

            // Additional validation: ensure byte length is within bounds after UTF-8 conversion
            if deposit_seed_bytes.len() > MAX_DEPOSIT_SEED_LENGTH {
                msg!("Deposit seed bytes exceed maximum length");
                return Err(ProgramError::InvalidInstructionData);
            }

            process_claim(program_id, accounts, deposit_seed)
        }
        4 => {
            // CloseAccount instruction
            let data = &instruction_data[4..];
            let offset = &mut 0;

            if data.len() < 4 {
                return Err(ProgramError::InvalidInstructionData);
            }
            let seed_len = u32::from_le_bytes(data[*offset..*offset + 4]
                .try_into().unwrap()) as usize;
            *offset += 4;
            if seed_len > MAX_DEPOSIT_SEED_LENGTH || *offset + seed_len > data.len() {
                msg!("Invalid deposit seed length");
                return Err(ProgramError::InvalidInstructionData);
            }
            let deposit_seed_bytes = &data[*offset..*offset + seed_len];
            let deposit_seed = std::str::from_utf8(deposit_seed_bytes)
                .map_err(|_| ProgramError::InvalidInstructionData)?;

            // Additional validation: ensure byte length is within bounds after UTF-8 conversion
            if deposit_seed_bytes.len() > MAX_DEPOSIT_SEED_LENGTH {
                msg!("Deposit seed bytes exceed maximum length");
                return Err(ProgramError::InvalidInstructionData);
            }

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
    let token_program = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;
    let rent_account = next_account_info(account_info_iter)?;

    // Verify depositor is signer
    if !depositor.is_signer {
        msg!("Depositor must sign the transaction");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify system program
    if system_program.key != &system_program::id() {
        msg!("Invalid system program");
        return Err(ProgramError::IncorrectProgramId);
    }

    // Verify rent sysvar
    if rent_account.key != &Rent::id() {
        msg!("Invalid rent sysvar");
        return Err(ProgramError::InvalidAccountData);
    }

    // Verify token program (legacy Token for WSOL)
    if token_program.key != &spl_token::id() {
        msg!("Invalid token program");
        return Err(ProgramError::IncorrectProgramId);
    }

    // Validate deposit amount
    if amount == 0 {
        msg!("Deposit amount must be greater than 0");
        return Err(ProgramError::InvalidInstructionData);
    }

    // Validate timeout range (1 minute to 10 years)
    const MIN_TIMEOUT_SECONDS: u64 = 60; // 1 minute
    const MAX_TIMEOUT_SECONDS: u64 = 315360000; // 10 years
    if timeout_seconds < MIN_TIMEOUT_SECONDS || timeout_seconds > MAX_TIMEOUT_SECONDS {
        msg!("Timeout must be between {} and {} seconds", MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS);
        return Err(ProgramError::InvalidInstructionData);
    }

    // Verify token account ownership and mint
    let (owner, mint) = {
        let token_account_data = depositor_token_account.data.borrow();
        let account_state = TokenAccount::unpack(&token_account_data)
            .map_err(|_| ProgramError::InvalidAccountData)?;
        (account_state.owner, account_state.mint)
    };

    if owner != *depositor.key {
        msg!("Token account must be owned by depositor");
        return Err(ProgramError::InvalidAccountData);
    }

    if mint != WSOL_MINT {
        msg!("Only WSOL deposits are supported");
        return Err(ProgramError::InvalidAccountData);
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

    // WSOL uses standard Token account size
    let token_account_size = TokenAccount::LEN;

    // Create token account (needs PDA signature since it will be owned by PDA)
    let create_token_account_ix = system_instruction::create_account(
        depositor.key,
        deposit_token_account.key,
        rent.minimum_balance(token_account_size),
        token_account_size as u64,
        token_program.key,
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

    // Initialize token account with WSOL mint
    let init_token_account_ix = initialize_account(
        token_program.key,
        deposit_token_account.key,
        &WSOL_MINT,
        deposit_account.key,
    )?;

    invoke_signed(
        &init_token_account_ix,
        &[
            deposit_token_account.clone(),
            system_program.clone(),  // Required for mint rent exemption
            deposit_account.clone(),
            rent_account.clone(),
        ],
        &[&[
            TOKEN_ACCOUNT_SEED_PREFIX,
            deposit_pda.as_ref(),
            &[token_bump],
        ]],
    )?;

    // Transfer tokens from depositor to deposit token account
    let transfer_ix = transfer(
        token_program.key,
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
        token_mint: WSOL_MINT,
        amount,
        last_proof_timestamp: clock.unix_timestamp,
        timeout_seconds,
        bump,
        is_closed: false,
        deposit_seed_len: seed_len,
        deposit_seed: seed_array,
        last_burn_signature: None,
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
    burn_signature: &[u8; 64],  // Burn signature from user
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();

    let depositor = next_account_info(account_info_iter)?;
    let deposit_account = next_account_info(account_info_iter)?;

    // Verify depositor is signer
    if !depositor.is_signer {
        msg!("Depositor must sign the transaction");
        return Err(ProgramError::MissingRequiredSignature);
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

    // Check for replay attacks - verify this burn signature hasn't been used before
    if let Some(last_sig) = deposit_state.last_burn_signature {
        if *burn_signature == last_sig {
            msg!("Burn signature already used - replay attack detected");
            return Err(ProgramError::InvalidInstructionData);
        }
    }

    // TODO: Additional signature validation could be added here
    // For now, we accept any 64-byte signature as valid proof of burn
    // The client is responsible for ensuring the burn actually occurred

    // Update timestamp and store burn signature
    let clock = Clock::get()?;
    deposit_state.last_proof_timestamp = clock.unix_timestamp;
    deposit_state.last_burn_signature = Some(*burn_signature);

    // Serialize back
    deposit_state.serialize(&mut &mut deposit_account.data.borrow_mut()[..])?;

    msg!("Proof of life recorded at {}", deposit_state.last_proof_timestamp);
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

    // Verify token account ownership
    let owner = {
        let token_account_data = depositor_token_account.data.borrow();
        let account_state = TokenAccount::unpack(&token_account_data)
            .map_err(|_| ProgramError::InvalidAccountData)?;
        account_state.owner
    };

    if owner != *depositor.key {
        msg!("Token account must be owned by depositor");
        return Err(ProgramError::InvalidAccountData);
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
        msg!("Only the depositor can withdraw");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Check if already closed
    if deposit_state.is_closed {
        msg!("Deposit already withdrawn or claimed");
        return Err(ProgramError::InvalidAccountData);
    }

    // CRITICAL: Mark as closed BEFORE transfer to prevent race condition/double withdrawal
    deposit_state.is_closed = true;
    deposit_state.serialize(&mut &mut deposit_account.data.borrow_mut()[..])?;

    // Get current token balance (scoped to ensure borrow is released before we borrow again)
    let token_amount = {
        let token_account_data = deposit_token_account.data.borrow();
        // Use Box to allocate on heap instead of stack
        let token_account_state = Box::new(
            TokenAccount::unpack(&token_account_data)?
        );
        token_account_state.amount
    }; // token_account_data is dropped here

    // Transfer tokens back to depositor (from deposit_token_account to depositor_token_account)
    let transfer_ix = transfer(
        token_program.key,
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
        ],
        &[&[
            DEPOSIT_SEED_PREFIX,
            depositor.key.as_ref(),
            deposit_seed.as_bytes(),
            &[deposit_state.bump],
        ]],
    )?;

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

    // Verify token account ownership
    let owner = {
        let token_account_data = receiver_token_account.data.borrow();
        let account_state = TokenAccount::unpack(&token_account_data)
            .map_err(|_| ProgramError::InvalidAccountData)?;
        account_state.owner
    };

    if owner != *receiver.key {
        msg!("Token account must be owned by receiver");
        return Err(ProgramError::InvalidAccountData);
    }

    // Deserialize deposit account once (mutable from start to avoid double deserialization)
    let mut deposit_state = DepositAccount::try_from_slice(&deposit_account.data.borrow())?;

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

    // Verify receiver is signer
    if !receiver.is_signer {
        msg!("Receiver must sign the claim transaction");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Check if already closed
    if deposit_state.is_closed {
        msg!("Deposit already withdrawn or claimed");
        return Err(ProgramError::InvalidAccountData);
    }

    // Check if proof-of-life has expired
    let clock = Clock::get()?;

    // Validate timestamp is not in the future
    if deposit_state.last_proof_timestamp > clock.unix_timestamp {
        msg!("Invalid last_proof_timestamp: future date detected");
        return Err(ProgramError::InvalidAccountData);
    }

    // Validate timestamp is not unreasonably old (before Solana genesis)
    const MIN_VALID_TIMESTAMP: i64 = 1598000000; // ~August 2020
    if deposit_state.last_proof_timestamp < MIN_VALID_TIMESTAMP {
        msg!("Invalid last_proof_timestamp: unreasonably old date");
        return Err(ProgramError::InvalidAccountData);
    }

    let elapsed = clock.unix_timestamp - deposit_state.last_proof_timestamp;
    if elapsed < deposit_state.timeout_seconds as i64 {
        msg!(
            "Proof of life has not expired yet. Elapsed: {}, Required: {}",
            elapsed,
            deposit_state.timeout_seconds
        );
        return Err(ProgramError::InvalidAccountData);
    }

    // CRITICAL: Mark as closed BEFORE transfer to prevent race condition/double claim
    deposit_state.is_closed = true;
    deposit_state.serialize(&mut &mut deposit_account.data.borrow_mut()[..])?;

    // Get current token balance (scoped to ensure borrow is released before we borrow again)
    let token_amount = {
        let token_account_data = deposit_token_account.data.borrow();
        // Use Box to allocate on heap instead of stack
        let token_account_state = Box::new(
            TokenAccount::unpack(&token_account_data)?
        );
        token_account_state.amount
    }; // token_account_data is dropped here

    // Transfer tokens to receiver (from deposit_token_account to receiver_token_account)
    let transfer_ix = transfer(
        token_program.key,
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
        ],
        &[&[
            DEPOSIT_SEED_PREFIX,
            deposit_state.depositor.as_ref(),
            deposit_seed.as_bytes(),
            &[deposit_state.bump],
        ]],
    )?;

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

    // Verify authority is signer
    if !authority.is_signer {
        msg!("Authority must sign the transaction");
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
