/**
 * Solana Program utilities for direct frontend interaction
 * No backend required for Solana transactions
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  NATIVE_MINT,
} from '@solana/spl-token';
import { Network } from '../types';

// Program ID - updated to store deposit_seed in account data
export const PROGRAM_ID = new PublicKey('3jMCqxicNqoUaymcH23ctjJxLv4NqLb4KqRxcokSKTnA');

// Maximum deposit seed length (must match Rust)
export const MAX_DEPOSIT_SEED_LENGTH = 32;

// Deposit account data size (from Rust: 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 4 + 32 = 158 bytes)
export const DEPOSIT_ACCOUNT_SIZE = 158;

/**
 * Parsed deposit account data from on-chain
 */
export interface SolanaDeposit {
  address: string;
  depositor: string;
  receiver: string;
  tokenMint: string;
  amount: bigint;
  lastProofTimestamp: number;
  timeoutSeconds: number;
  bump: number;
  isClosed: boolean;
  depositSeed: string; // Now always available from on-chain data
  // Computed fields
  elapsed: number;
  isExpired: boolean;
}

// PDA seeds
const DEPOSIT_SEED_PREFIX = 'deposit';
const TOKEN_ACCOUNT_SEED_PREFIX = 'token_account';

/**
 * Get Solana connection for the given network
 */
export function getConnection(network: Network): Connection {
  const cluster = network === 'mainnet' ? 'mainnet-beta' : 'devnet';
  return new Connection(clusterApiUrl(cluster), 'confirmed');
}

/**
 * Derive deposit PDA
 */
export function deriveDepositPDA(
  depositor: PublicKey,
  depositSeed: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(DEPOSIT_SEED_PREFIX),
      depositor.toBuffer(),
      Buffer.from(depositSeed),
    ],
    PROGRAM_ID
  );
}

/**
 * Derive token account PDA
 */
export function deriveTokenAccountPDA(depositPDA: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(TOKEN_ACCOUNT_SEED_PREFIX), depositPDA.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Generate a unique deposit seed
 */
export function generateDepositSeed(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Serialize a string for Borsh (length-prefixed)
 */
function serializeString(str: string): Buffer {
  const strBytes = Buffer.from(str, 'utf-8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(strBytes.length, 0);
  return Buffer.concat([lengthBuffer, strBytes]);
}

/**
 * Build instruction data for Deposit
 * Borsh format: enum discriminant (4 bytes) + deposit_seed (string) + receiver (32 bytes) + amount (u64) + timeout_seconds (u64)
 */
export function buildDepositInstructionData(
  depositSeed: string,
  receiver: PublicKey,
  amount: bigint,
  timeoutSeconds: bigint
): Buffer {
  // Enum discriminant for Deposit = 0
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(0, 0);

  // Serialize deposit_seed as Borsh string (length-prefixed)
  const seedBuffer = serializeString(depositSeed);

  // Receiver pubkey (32 bytes)
  const receiverBuffer = receiver.toBuffer();

  // Amount (u64, 8 bytes, little-endian)
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amount, 0);

  // Timeout seconds (u64, 8 bytes, little-endian)
  const timeoutBuffer = Buffer.alloc(8);
  timeoutBuffer.writeBigUInt64LE(timeoutSeconds, 0);

  return Buffer.concat([discriminant, seedBuffer, receiverBuffer, amountBuffer, timeoutBuffer]);
}

/**
 * Build a complete deposit transaction
 */
export async function buildDepositTransaction(
  connection: Connection,
  depositor: PublicKey,
  receiver: PublicKey,
  tokenMint: PublicKey,
  amount: bigint,
  timeoutSeconds: bigint
): Promise<{ transaction: Transaction; depositSeed: string }> {
  // Generate unique deposit seed
  const depositSeed = generateDepositSeed();

  // Derive PDAs
  const [depositPDA] = deriveDepositPDA(depositor, depositSeed);
  const [tokenAccountPDA] = deriveTokenAccountPDA(depositPDA);

  // Get user's ATA for the token
  const userATA = await getAssociatedTokenAddress(
    tokenMint,
    depositor,
    false,
    TOKEN_PROGRAM_ID
  );

  // Build instruction data
  const instructionData = buildDepositInstructionData(
    depositSeed,
    receiver,
    amount,
    timeoutSeconds
  );

  // Build transaction
  const transaction = new Transaction();
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = depositor;

  // Check if ATA exists and handle wrapped SOL
  const userATAInfo = await connection.getAccountInfo(userATA);

  if (!userATAInfo) {
    // ATA doesn't exist - create it and wrap SOL
    console.log('[solanaProgram] Creating ATA and wrapping SOL...');

    // Create ATA
    const createATAInstruction = createAssociatedTokenAccountInstruction(
      depositor,
      userATA,
      depositor,
      tokenMint
    );
    transaction.add(createATAInstruction);

    // Wrap SOL by transferring to the ATA and syncing
    const syncInstruction = createSyncNativeInstruction(userATA, TOKEN_PROGRAM_ID);
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: depositor,
      toPubkey: userATA,
      lamports: Number(amount),
    });

    transaction.add(transferInstruction);
    transaction.add(syncInstruction);
  } else {
    console.log('[solanaProgram] ATA exists, checking balance...');

    // Check balance and add more if needed
    const tokenBalance = await connection.getTokenAccountBalance(userATA);
    const currentBalance = BigInt(Math.floor((tokenBalance.value.uiAmount || 0) * 1e9));
    const requiredBalance = amount;

    console.log(`[solanaProgram] Current balance: ${tokenBalance.value.uiAmount || 0} SOL`);
    console.log(`[solanaProgram] Required balance: ${Number(amount) / 1e9} SOL`);

    if (currentBalance < requiredBalance) {
      const additionalLamports = Number(requiredBalance - currentBalance);
      console.log(`[solanaProgram] Adding ${(additionalLamports / 1e9).toFixed(4)} SOL to ATA...`);

      const transferInstruction = SystemProgram.transfer({
        fromPubkey: depositor,
        toPubkey: userATA,
        lamports: additionalLamports,
      });

      const syncInstruction = createSyncNativeInstruction(userATA, TOKEN_PROGRAM_ID);

      transaction.add(transferInstruction);
      transaction.add(syncInstruction);
    }
  }

  // Create the deposit instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: depositor, isSigner: true, isWritable: true },
      { pubkey: depositPDA, isSigner: false, isWritable: true },
      { pubkey: userATA, isSigner: false, isWritable: true },
      { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
      { pubkey: tokenMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: instructionData,
  });

  transaction.add(instruction);

  return { transaction, depositSeed };
}

/**
 * Build instruction data for ProofOfLife
 */
export function buildProofOfLifeInstructionData(depositSeed: string): Buffer {
  // Enum discriminant for ProofOfLife = 1
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(1, 0);

  // Serialize deposit_seed
  const seedBuffer = serializeString(depositSeed);

  return Buffer.concat([discriminant, seedBuffer]);
}

/**
 * Build instruction data for Withdraw
 */
export function buildWithdrawInstructionData(depositSeed: string): Buffer {
  // Enum discriminant for Withdraw = 2
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(2, 0);

  // Serialize deposit_seed
  const seedBuffer = serializeString(depositSeed);

  return Buffer.concat([discriminant, seedBuffer]);
}

/**
 * Build instruction data for Claim
 */
export function buildClaimInstructionData(depositSeed: string): Buffer {
  // Enum discriminant for Claim = 3
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(3, 0);

  // Serialize deposit_seed
  const seedBuffer = serializeString(depositSeed);

  return Buffer.concat([discriminant, seedBuffer]);
}

/**
 * Fetch deposit account data from blockchain
 */
export async function fetchDepositAccount(
  connection: Connection,
  depositAddress: string
): Promise<SolanaDeposit | null> {
  try {
    const pubkey = new PublicKey(depositAddress);
    const accountInfo = await connection.getAccountInfo(pubkey);

    if (!accountInfo || !accountInfo.data) {
      console.log('[solanaProgram] Deposit account not found:', depositAddress);
      return null;
    }

    return parseDepositAccount(Buffer.from(accountInfo.data), pubkey);
  } catch (error) {
    console.error('[solanaProgram] Error fetching deposit account:', error);
    return null;
  }
}

/**
 * Parse deposit account data from raw bytes
 */
export function parseDepositAccount(data: Buffer, address: PublicKey): SolanaDeposit | null {
  if (data.length < 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 4) { // Minimum size to read string length
    console.log('[solanaProgram] Invalid deposit account data size:', data.length);
    return null;
  }

  try {
    let offset = 0;

    // depositor: Pubkey (32 bytes)
    const depositor = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // receiver: Pubkey (32 bytes)
    const receiver = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // token_mint: Pubkey (32 bytes)
    const tokenMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // amount: u64 (8 bytes)
    const amount = data.readBigUInt64LE(offset);
    offset += 8;

    // last_proof_timestamp: i64 (8 bytes)
    const lastProofTimestamp = Number(data.readBigInt64LE(offset));
    offset += 8;

    // timeout_seconds: u64 (8 bytes)
    const timeoutSeconds = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // bump: u8 (1 byte)
    const bump = data.readUInt8(offset);
    offset += 1;

    // is_closed: bool (1 byte)
    const isClosed = data.readUInt8(offset) === 1;
    offset += 1;

    // deposit_seed_len: u32 (4 bytes)
    const seedLength = data.readUInt32LE(offset);
    offset += 4;

    // deposit_seed: [u8; 32] (32 bytes, but only seedLength bytes are valid)
    const seedBytes = data.slice(offset, offset + MAX_DEPOSIT_SEED_LENGTH);
    const depositSeed = seedBytes.slice(0, seedLength).toString('utf-8');

    // Calculate elapsed time and expiry
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - lastProofTimestamp;
    const isExpired = elapsed >= timeoutSeconds;

    return {
      address: address.toBase58(),
      depositor: depositor.toBase58(),
      receiver: receiver.toBase58(),
      tokenMint: tokenMint.toBase58(),
      amount,
      lastProofTimestamp,
      timeoutSeconds,
      bump,
      isClosed,
      depositSeed,
      elapsed,
      isExpired,
    };
  } catch (error) {
    console.error('[solanaProgram] Error parsing deposit account:', error);
    return null;
  }
}

// Shared cache for ALL deposits to avoid duplicate getProgramAccounts calls
interface AllDepositsCache {
  data: SolanaDeposit[];
  timestamp: number;
  promise: Promise<SolanaDeposit[]> | null;
}

const allDepositsCache: AllDepositsCache = {
  data: [],
  timestamp: 0,
  promise: null,
};

const CACHE_TTL = 30000; // 30 seconds cache

/**
 * Fetch ALL deposit accounts from the program (called once, cached)
 * This prevents 429 errors by consolidating multiple getProgramAccounts calls
 * Uses promise-based locking to ensure only one fetch at a time
 */
async function fetchAllDeposits(connection: Connection): Promise<SolanaDeposit[]> {
  const now = Date.now();

  // If we're already fetching, return the same promise
  if (allDepositsCache.promise) {
    console.log('[solanaProgram] Already fetching, waiting for existing promise...');
    return allDepositsCache.promise;
  }

  // Check if cache is still valid
  if (allDepositsCache.data.length > 0 && now - allDepositsCache.timestamp < CACHE_TTL) {
    console.log('[solanaProgram] Using cached all deposits:', allDepositsCache.data.length);
    return allDepositsCache.data;
  }

  // Create the fetch promise
  console.log('[solanaProgram] Fetching ALL deposit accounts from program...');

  const fetchPromise = (async () => {
    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        commitment: 'confirmed',
        filters: [
          { dataSize: DEPOSIT_ACCOUNT_SIZE },
          // NO memcmp filter - fetch ALL deposits at once
        ],
      });

      console.log('[solanaProgram] Found total deposit accounts:', accounts.length);

      const deposits: SolanaDeposit[] = [];

      for (const account of accounts) {
        const deposit = parseDepositAccount(
          Buffer.from(account.account.data),
          account.pubkey
        );
        if (deposit) {
          deposits.push(deposit);
        }
      }

      // Update cache
      allDepositsCache.data = deposits;
      allDepositsCache.timestamp = now;

      console.log('[solanaProgram] Parsed all deposits:', deposits.length);
      return deposits;
    } catch (error) {
      console.error('[solanaProgram] Error fetching all deposits:', error);

      // Return cached data if available
      if (allDepositsCache.data.length > 0) {
        console.log('[solanaProgram] Using cached data due to error');
        return allDepositsCache.data;
      }

      return [];
    } finally {
      // Clear the promise whether success or failure
      allDepositsCache.promise = null;
    }
  })();

  // Store the promise so concurrent calls wait for it
  allDepositsCache.promise = fetchPromise;

  return fetchPromise;
}

/**
 * Clear the all-deposits cache (call after creating/modifying deposits)
 */
export function clearAllDepositsCache() {
  console.log('[solanaProgram] Clearing all deposits cache');
  allDepositsCache.data = [];
  allDepositsCache.timestamp = 0;
  allDepositsCache.promise = null; // Clear any pending promise
}

/**
 * Fetch all deposits for a specific user (as depositor)
 * Uses shared cache to avoid duplicate RPC calls
 */
export async function getUserDeposits(
  connection: Connection,
  userAddress: string
): Promise<SolanaDeposit[]> {
  console.log('[solanaProgram] Getting deposits for user (as depositor):', userAddress);

  const allDeposits = await fetchAllDeposits(connection);

  // Filter client-side
  const userDeposits = allDeposits.filter(d => d.depositor === userAddress);

  // Sort by lastProofTimestamp descending (newest first)
  userDeposits.sort((a, b) => b.lastProofTimestamp - a.lastProofTimestamp);

  console.log('[solanaProgram] Found', userDeposits.length, 'deposits for user');
  return userDeposits;
}

/**
 * Fetch deposits where user is the receiver (claimable deposits)
 * Uses shared cache to avoid duplicate RPC calls
 */
export async function getClaimableDeposits(
  connection: Connection,
  receiverAddress: string
): Promise<SolanaDeposit[]> {
  console.log('[solanaProgram] Getting deposits for user (as receiver):', receiverAddress);

  const allDeposits = await fetchAllDeposits(connection);

  // Filter client-side
  const claimable = allDeposits.filter(d => d.receiver === receiverAddress && !d.isClosed);

  console.log('[solanaProgram] Found', claimable.length, 'claimable deposits');
  return claimable;
}

/**
 * Clear the claimable deposits cache (call after claiming)
 * Note: Now uses the shared all-deposits cache
 */
export function clearClaimableDepositsCache(receiverAddress?: string) {
  // Clear the shared cache since deposits may have changed
  clearAllDepositsCache();
}

/**
 * Get a single deposit by its PDA address
 */
export async function getDepositByAddress(
  connection: Connection,
  depositAddress: string
): Promise<SolanaDeposit | null> {
  try {
    const depositPubkey = new PublicKey(depositAddress);
    const accountInfo = await connection.getAccountInfo(depositPubkey);

    if (!accountInfo) {
      console.log('[solanaProgram] Deposit account not found:', depositAddress);
      return null;
    }

    return parseDepositAccount(Buffer.from(accountInfo.data), depositPubkey);
  } catch (error) {
    console.error('[solanaProgram] Error fetching deposit:', error);
    return null;
  }
}

/**
 * Build a complete Proof of Life transaction
 */
export async function buildProofOfLifeTransaction(
  connection: Connection,
  depositor: PublicKey,
  depositAddress: PublicKey,
  depositSeed: string
): Promise<Transaction> {
  console.log('[solanaProgram] Building proof of life transaction');
  console.log('[solanaProgram]   Depositor:', depositor.toBase58());
  console.log('[solanaProgram]   Deposit Address:', depositAddress.toBase58());
  console.log('[solanaProgram]   Deposit Seed:', depositSeed);

  // DLM Token mint address (hardcoded in contract) - uses Token-2022 program
  const DLM_MINT = new PublicKey('dVA6zfXBRieUCPS8GR4hve5ugmp5naPvKGFquUDpump');
  console.log('[solanaProgram]   DLM Mint:', DLM_MINT.toBase58());

  // Get depositor's DLM token ATA using Token-2022 program
  const dlmATA = await getAssociatedTokenAddress(
    DLM_MINT,
    depositor,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  console.log('[solanaProgram]   DLM ATA (Token-2022):', dlmATA.toBase58());

  // Check DLM balance
  try {
    const dlmBalance = await connection.getTokenAccountBalance(dlmATA);
    console.log('[solanaProgram]   DLM Balance:', dlmBalance.value.uiAmountString || '0', 'DLM');
  } catch (error) {
    console.warn('[solanaProgram]   Could not fetch DLM balance:', error);
  }

  // Build instruction data
  const instructionData = buildProofOfLifeInstructionData(depositSeed);
  console.log('[solanaProgram]   Instruction data length:', instructionData.length, 'bytes');

  // Build transaction
  const transaction = new Transaction();
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = depositor;

  // Check if DLM ATA exists, if not create it using Token-2022 program
  const dlmATAInfo = await connection.getAccountInfo(dlmATA);
  if (!dlmATAInfo) {
    console.log('[solanaProgram] Creating DLM token account (Token-2022)...');
    transaction.add(
      createAssociatedTokenAccountInstruction(
        depositor,
        dlmATA,
        depositor,
        DLM_MINT,
        TOKEN_2022_PROGRAM_ID
      )
    );
  } else {
    console.log('[solanaProgram] DLM ATA already exists');
  }

  // Create the proof of life instruction with DLM token burning
  // Account structure: depositor, depositPDA, dlmATA, dlmMint, tokenProgram, systemProgram
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: depositor, isSigner: true, isWritable: false },
      { pubkey: depositAddress, isSigner: false, isWritable: true },
      { pubkey: dlmATA, isSigner: false, isWritable: true },
      { pubkey: DLM_MINT, isSigner: false, isWritable: true }, // Must be writable for burning
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: instructionData,
  });

  transaction.add(instruction);
  console.log('[solanaProgram] Transaction built with', transaction.instructions.length, 'instruction(s)');

  return transaction;
}

/**
 * Build a complete Withdraw transaction
 */
export async function buildWithdrawTransaction(
  connection: Connection,
  depositor: PublicKey,
  depositAddress: PublicKey,
  tokenMint: PublicKey,
  depositSeed: string
): Promise<Transaction> {
  // Derive token account PDA
  const [tokenAccountPDA] = deriveTokenAccountPDA(depositAddress);

  // Get depositor's ATA for the token
  const depositorATA = await getAssociatedTokenAddress(
    tokenMint,
    depositor,
    false,
    TOKEN_PROGRAM_ID
  );

  // Check if ATA exists, if not we need to create it
  const ataInfo = await connection.getAccountInfo(depositorATA);

  const transaction = new Transaction();
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = depositor;

  // Create ATA if it doesn't exist
  if (!ataInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        depositor,
        depositorATA,
        depositor,
        tokenMint
      )
    );
  }

  // Build instruction data
  const instructionData = buildWithdrawInstructionData(depositSeed);

  // Create the withdraw instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: depositor, isSigner: true, isWritable: false },
      { pubkey: depositAddress, isSigner: false, isWritable: true },
      { pubkey: depositorATA, isSigner: false, isWritable: true },
      { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: instructionData,
  });

  transaction.add(instruction);

  return transaction;
}

/**
 * Build a complete Claim transaction
 */
export async function buildClaimTransaction(
  connection: Connection,
  receiver: PublicKey,
  depositorAddress: PublicKey,
  depositAddress: PublicKey,
  tokenMint: PublicKey,
  depositSeed: string
): Promise<Transaction> {
  // Derive token account PDA
  const [tokenAccountPDA] = deriveTokenAccountPDA(depositAddress);

  // Get receiver's ATA for the token
  const receiverATA = await getAssociatedTokenAddress(
    tokenMint,
    receiver,
    false,
    TOKEN_PROGRAM_ID
  );

  // Check if ATA exists, if not we need to create it
  const ataInfo = await connection.getAccountInfo(receiverATA);

  const transaction = new Transaction();
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = receiver;

  // Create ATA if it doesn't exist
  if (!ataInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        receiver,
        receiverATA,
        receiver,
        tokenMint
      )
    );
  }

  // Build instruction data
  const instructionData = buildClaimInstructionData(depositSeed);

  // Create the claim instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: receiver, isSigner: true, isWritable: false },
      { pubkey: depositAddress, isSigner: false, isWritable: true },
      { pubkey: receiverATA, isSigner: false, isWritable: true },
      { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: instructionData,
  });

  transaction.add(instruction);

  return transaction;
}
