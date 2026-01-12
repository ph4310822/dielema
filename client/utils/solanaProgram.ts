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
} from '@solana/spl-token';
import { Network } from '../types';

// Program ID - update this if you redeploy
export const PROGRAM_ID = new PublicKey('CEcndvG4iioZHttjPkmLiufzdwgQ1Au6N4HJGnmAvem8');

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
