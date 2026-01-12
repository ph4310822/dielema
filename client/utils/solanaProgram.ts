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
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { Network } from '../types';

// Program ID - update this if you redeploy
export const PROGRAM_ID = new PublicKey('CEcndvG4iioZHttjPkmLiufzdwgQ1Au6N4HJGnmAvem8');

// Deposit account data size (from Rust: 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 32 = 154 bytes)
export const DEPOSIT_ACCOUNT_SIZE = 154;

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
  officialTokenMint: string;
  // Computed fields
  elapsed: number;
  isExpired: boolean;
  depositSeed?: string; // If we can derive it
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

  // Create the instruction
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

  // Build transaction
  const transaction = new Transaction();
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = depositor;
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
 * Parse deposit account data from raw bytes
 */
export function parseDepositAccount(data: Buffer, address: PublicKey): SolanaDeposit | null {
  if (data.length < DEPOSIT_ACCOUNT_SIZE) {
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

    // official_token_mint: Pubkey (32 bytes)
    const officialTokenMint = new PublicKey(data.slice(offset, offset + 32));

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
      officialTokenMint: officialTokenMint.toBase58(),
      elapsed,
      isExpired,
    };
  } catch (error) {
    console.error('[solanaProgram] Error parsing deposit account:', error);
    return null;
  }
}

/**
 * Fetch all deposits for a specific user (as depositor)
 */
export async function getUserDeposits(
  connection: Connection,
  userAddress: string
): Promise<SolanaDeposit[]> {
  console.log('[solanaProgram] Fetching deposits for user:', userAddress);

  try {
    const userPubkey = new PublicKey(userAddress);

    // Get all accounts owned by the program
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        // Filter by data size (deposit accounts are 154 bytes)
        { dataSize: DEPOSIT_ACCOUNT_SIZE },
        // Filter by depositor (first 32 bytes)
        {
          memcmp: {
            offset: 0,
            bytes: userPubkey.toBase58(),
          },
        },
      ],
    });

    console.log('[solanaProgram] Found accounts:', accounts.length);

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

    // Sort by lastProofTimestamp descending (newest first)
    deposits.sort((a, b) => b.lastProofTimestamp - a.lastProofTimestamp);

    console.log('[solanaProgram] Parsed deposits:', deposits.length);
    return deposits;
  } catch (error) {
    console.error('[solanaProgram] Error fetching user deposits:', error);
    return [];
  }
}

/**
 * Fetch deposits where user is the receiver (claimable deposits)
 */
export async function getClaimableDeposits(
  connection: Connection,
  receiverAddress: string
): Promise<SolanaDeposit[]> {
  console.log('[solanaProgram] Fetching claimable deposits for receiver:', receiverAddress);

  try {
    const receiverPubkey = new PublicKey(receiverAddress);

    // Get all accounts owned by the program
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        { dataSize: DEPOSIT_ACCOUNT_SIZE },
        // Filter by receiver (bytes 32-64)
        {
          memcmp: {
            offset: 32, // receiver is at offset 32
            bytes: receiverPubkey.toBase58(),
          },
        },
      ],
    });

    console.log('[solanaProgram] Found claimable accounts:', accounts.length);

    const deposits: SolanaDeposit[] = [];

    for (const account of accounts) {
      const deposit = parseDepositAccount(
        Buffer.from(account.account.data),
        account.pubkey
      );
      if (deposit && !deposit.isClosed) {
        deposits.push(deposit);
      }
    }

    return deposits;
  } catch (error) {
    console.error('[solanaProgram] Error fetching claimable deposits:', error);
    return [];
  }
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
  // Build instruction data
  const instructionData = buildProofOfLifeInstructionData(depositSeed);

  // Create the instruction (simplified - no token burning for now)
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: depositor, isSigner: true, isWritable: false },
      { pubkey: depositAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: instructionData,
  });

  // Build transaction
  const transaction = new Transaction();
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = depositor;
  transaction.add(instruction);

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
