/**
 * Helper functions for testing the Dielemma program
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import * as borsh from 'borsh';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Program ID
export const PROGRAM_ID = new PublicKey('3jMCqxicNqoUaymcH23ctjJxLv4NqLb4KqRxcokSKTnA');

// Account sizes
export const DEPOSIT_ACCOUNT_SIZE = 154;

// PDA seeds
const DEPOSIT_SEED_PREFIX = 'deposit';
const TOKEN_ACCOUNT_SEED_PREFIX = 'token_account';

/**
 * Load wallet from Solana CLI config
 */
export function loadWallet(): Keypair {
  const walletPath = path.join(os.homedir(), '.config/solana/id.json');

  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet not found at ${walletPath}. Please run: solana-keygen new`);
  }

  const walletBytes = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(walletBytes));
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
 * Build instruction data for Withdraw
 */
export function buildWithdrawInstructionData(depositSeed: string): Buffer {
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(2, 0); // Withdraw = 2
  const seedBuffer = serializeString(depositSeed);
  return Buffer.concat([discriminant, seedBuffer]);
}

/**
 * Build instruction data for ProofOfLife
 */
export function buildProofOfLifeInstructionData(depositSeed: string): Buffer {
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(1, 0); // ProofOfLife = 1
  const seedBuffer = serializeString(depositSeed);
  return Buffer.concat([discriminant, seedBuffer]);
}

/**
 * Build instruction data for Claim
 */
export function buildClaimInstructionData(depositSeed: string): Buffer {
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(3, 0); // Claim = 3
  const seedBuffer = serializeString(depositSeed);
  return Buffer.concat([discriminant, seedBuffer]);
}

/**
 * Parse deposit account data from raw bytes
 */
export interface DepositAccount {
  depositor: string;
  receiver: string;
  tokenMint: string;
  amount: bigint;
  lastProofTimestamp: number;
  timeoutSeconds: number;
  bump: number;
  isClosed: boolean;
  officialTokenMint: string;
}

export function parseDepositAccount(data: Buffer): DepositAccount | null {
  if (data.length < DEPOSIT_ACCOUNT_SIZE) {
    console.log(`Invalid deposit account data size: ${data.length}`);
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

    return {
      depositor: depositor.toBase58(),
      receiver: receiver.toBase58(),
      tokenMint: tokenMint.toBase58(),
      amount,
      lastProofTimestamp,
      timeoutSeconds,
      bump,
      isClosed,
      officialTokenMint: officialTokenMint.toBase58(),
    };
  } catch (error) {
    console.error('Error parsing deposit account:', error);
    return null;
  }
}

/**
 * Print account info
 */
export function printAccountInfo(label: string, pubkey: PublicKey, connection: Connection): void {
  console.log(`\n${label}:`);
  console.log(`  Address: ${pubkey.toBase58()}`);
}

/**
 * Simulate transaction and print logs
 */
export async function simulateAndLog(
  connection: Connection,
  transaction: Transaction,
  signer: PublicKey
): Promise<void> {
  try {
    const { value: simulation } = await connection.simulateTransaction(transaction);
    console.log('\n=== Simulation Results ===');
    if (simulation.logs) {
      simulation.logs.forEach((log, i) => {
        console.log(`  [${i}] ${log}`);
      });
    }
    if (simulation.err) {
      console.log('  Error:', JSON.stringify(simulation.err));
    }
    console.log('  Units Consumed:', simulation.unitsConsumed);
  } catch (error) {
    console.error('Simulation failed:', error);
  }
}

/**
 * Print buffer as hex
 */
export function printBufferHex(label: string, buffer: Buffer): void {
  console.log(`${label}: ${buffer.toString('hex').substring(0, 100)}...`);
}

/**
 * Airdrop SOL to an account
 */
export async function airdrop(connection: Connection, pubkey: PublicKey, amount: number = 1): Promise<void> {
  const signature = await connection.requestAirdrop(pubkey, amount * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(signature);
  console.log(`Airdropped ${amount} SOL to ${pubkey.toBase58()}`);
}
