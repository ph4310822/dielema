/**
 * Test Dielemma Smart Contract with WSOL (Wrapped SOL)
 * WSOL uses the legacy Token program without extensions
 *
 * Run: npx tsx tests/test-wsol.ts
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createSyncNativeInstruction,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { config } from 'dotenv';

// Load environment variables
config();

// Configuration
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('3uT7JEnRZ4pc4bwYvJ9PHsw579YLfNBr3xQvTiXBkGyC');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112'); // Native SOL mint
const DEPOSIT_SEED_PREFIX = 'deposit';
const TOKEN_ACCOUNT_SEED_PREFIX = 'token_account';

// Test state
let passed = 0;
let failed = 0;

// Utility functions
function sleep(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

function serializeString(str: string): Buffer {
  const strBytes = Buffer.from(str, 'utf-8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(strBytes.length, 0);
  return Buffer.concat([lengthBuffer, strBytes]);
}

function generateDepositSeed(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const hash = createHash('sha256').update(`${timestamp}-${random}`).digest('hex');
  return hash.substring(0, 20);
}

function deriveDepositPDA(depositor: PublicKey, depositSeed: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(DEPOSIT_SEED_PREFIX), depositor.toBuffer(), Buffer.from(depositSeed)],
    PROGRAM_ID
  );
}

function deriveTokenAccountPDA(depositPDA: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(TOKEN_ACCOUNT_SEED_PREFIX), depositPDA.toBuffer()],
    PROGRAM_ID
  );
}

function buildDepositInstructionData(
  depositSeed: string,
  receiver: PublicKey,
  amount: bigint,
  timeoutSeconds: bigint
): Buffer {
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(0, 0);

  const seedBuffer = serializeString(depositSeed);
  const receiverBuffer = Buffer.from(receiver.toBuffer());

  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amount, 0);

  const timeoutBuffer = Buffer.alloc(8);
  timeoutBuffer.writeBigUInt64LE(timeoutSeconds, 0);

  return Buffer.concat([discriminant, seedBuffer, receiverBuffer, amountBuffer, timeoutBuffer]);
}

function buildWithdrawInstructionData(depositSeed: string): Buffer {
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(2, 0);
  const seedBuffer = serializeString(depositSeed);
  return Buffer.concat([discriminant, seedBuffer]);
}

interface DepositInfo {
  address: PublicKey;
  seed: string;
  depositor: PublicKey;
  receiver: PublicKey;
  tokenMint: PublicKey;
  amount: bigint;
  timeout: bigint;
}

async function getDepositAccount(connection: Connection, address: PublicKey): Promise<any> {
  const accountInfo = await connection.getAccountInfo(address);
  if (!accountInfo) {
    throw new Error('Deposit account not found');
  }

  const data = Buffer.from(accountInfo.data);
  const depositor = new PublicKey(data.slice(0, 32));
  const receiver = new PublicKey(data.slice(32, 64));
  const tokenMint = new PublicKey(data.slice(64, 96));
  const amount = data.readBigUInt64LE(96);
  const lastProof = data.readBigInt64LE(104);
  const timeout = data.readBigUInt64LE(112);
  const bump = data.readUInt8(120);
  const isClosed = data.readUInt8(121) === 1;
  const seedLen = data.readUInt32LE(122);
  const seed = data.slice(126, 126 + seedLen).toString('utf-8');

  return {
    depositor,
    receiver,
    tokenMint,
    amount,
    lastProof,
    timeout,
    bump,
    isClosed,
    seed,
  };
}

// Test functions
async function testCreateDeposit(
  connection: Connection,
  wallet: Keypair,
  wsolATA: PublicKey,
  options?: { amount?: bigint; timeout?: bigint; receiver?: PublicKey }
): Promise<DepositInfo> {
  try {
    const receiver = options?.receiver || wallet.publicKey;
    const amount = options?.amount || BigInt(100_000_000); // 0.1 WSOL (0.1 SOL)
    const timeout = options?.timeout || BigInt(86400); // 1 day

    const depositSeed = generateDepositSeed();
    const [depositPDA] = deriveDepositPDA(wallet.publicKey, depositSeed);
    const [tokenAccountPDA] = deriveTokenAccountPDA(depositPDA);

    const instructionData = buildDepositInstructionData(depositSeed, receiver, amount, timeout);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: depositPDA, isSigner: false, isWritable: true },
        { pubkey: wsolATA, isSigner: false, isWritable: true },
        { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
        { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });

    const transaction = new Transaction().add(instruction);
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    const signature = await sendAndConfirmTransaction(connection, transaction, [wallet], {
      commitment: 'confirmed',
    });

    console.log(`  ✅ Deposit created: ${depositPDA.toBase58()}`);
    console.log(`  Tx: ${signature}`);

    return {
      address: depositPDA,
      seed: depositSeed,
      depositor: wallet.publicKey,
      receiver,
      tokenMint: WSOL_MINT,
      amount,
      timeout,
    };
  } catch (error: any) {
    console.log(`  ❌ FAILED: ${error.message}`);
    throw error;
  }
}

async function testWithdraw(connection: Connection, wallet: Keypair, deposit: DepositInfo, wsolATA: PublicKey): Promise<boolean> {
  try {
    const [tokenAccountPDA] = deriveTokenAccountPDA(deposit.address);

    const instructionData = buildWithdrawInstructionData(deposit.seed);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: deposit.address, isSigner: false, isWritable: true },
        { pubkey: wsolATA, isSigner: false, isWritable: true },
        { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });

    const transaction = new Transaction().add(instruction);
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    const signature = await sendAndConfirmTransaction(connection, transaction, [wallet], {
      commitment: 'confirmed',
    });

    // Verify deposit is closed
    const depositData = await getDepositAccount(connection, deposit.address);
    if (!depositData.isClosed) {
      throw new Error('Deposit should be closed after withdraw');
    }

    console.log('  ✅ Withdraw successful');
    console.log(`  Tx: ${signature}`);
    return true;
  } catch (error: any) {
    console.log(`  ❌ FAILED: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        Dielemma Smart Contract - WSOL Test Suite              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Create connection
  const connection = new Connection(RPC_URL, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 120000,
  });

  // Load wallet
  const walletKeypairPath = path.join(os.homedir(), '.config/solana/id.json');
  const walletBytes = JSON.parse(fs.readFileSync(walletKeypairPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletBytes));

  console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`Network: ${RPC_URL}\n`);

  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Wallet balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

  // Get or create WSOL ATA
  console.log('Setting up WSOL account...');
  const wsolATA = await getAssociatedTokenAddress(
    WSOL_MINT,
    wallet.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  // Check if WSOL ATA exists
  const wsolAccountInfo = await connection.getAccountInfo(wsolATA);
  if (!wsolAccountInfo) {
    console.log('Creating WSOL associated token account...');
    const createATAIx = createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      wsolATA,
      wallet.publicKey,
      WSOL_MINT,
      TOKEN_PROGRAM_ID
    );

    const transaction = new Transaction().add(createATAIx);
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    await sendAndConfirmTransaction(connection, transaction, [wallet], {
      commitment: 'confirmed',
    });

    console.log('  ✅ WSOL ATA created');
  } else {
    console.log('  ✅ WSOL ATA already exists');
  }

  // Wrap some SOL
  console.log('\nWrapping 0.5 SOL to WSOL...');
  const wrapAmount = 0.5 * LAMPORTS_PER_SOL;

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: wsolATA,
      lamports: wrapAmount,
    }),
    createSyncNativeInstruction(wsolATA, TOKEN_PROGRAM_ID)
  );

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  const wrapSig = await sendAndConfirmTransaction(connection, transaction, [wallet], {
    commitment: 'confirmed',
  });

  console.log(`  ✅ Wrapped 0.5 SOL to WSOL`);
  console.log(`  Tx: ${wrapSig}`);

  // Test 1: Create Deposit with WSOL
  console.log('\n=== Test 1: Create Deposit with WSOL ===');
  try {
    await testCreateDeposit(connection, wallet, wsolATA);
    passed++;
  } catch (error) {
    failed++;
  }

  // Test 2: Create Deposit and Withdraw
  console.log('\n=== Test 2: Deposit and Withdraw WSOL ===');
  try {
    const deposit = await testCreateDeposit(connection, wallet, wsolATA);
    const result = await testWithdraw(connection, wallet, deposit, wsolATA);
    if (result) passed++; else failed++;
  } catch (error) {
    failed++;
  }

  // Unwrap remaining WSOL
  console.log('\nUnwrapping remaining WSOL...');
  const wsolBalance = await connection.getTokenAccountBalance(wsolATA);
  const remainingAmount = Math.floor(parseFloat(wsolBalance.value.amount) * 1e9);

  if (remainingAmount > 0) {
    // Close WSOL account to unwrap
    const closeTransaction = new Transaction().add(
      createSyncNativeInstruction(wsolATA, TOKEN_PROGRAM_ID)
    );

    // Transfer all WSOL back to wallet and close account
    // This is a simplified version - in production you'd use the proper close instruction
    const { blockhash: latestBlockhash } = await connection.getLatestBlockhash();
    closeTransaction.recentBlockhash = latestBlockhash;
    closeTransaction.feePayer = wallet.publicKey;

    try {
      await sendAndConfirmTransaction(connection, closeTransaction, [wallet], {
        commitment: 'confirmed',
      });
      console.log('  ✅ Synced WSOL account');
    } catch (error: any) {
      console.log(`  ⚠️  Warning: Could not sync WSOL: ${error.message}`);
    }
  }

  // Print results
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                       Test Results                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📊 Total:  ${passed + failed}`);
  console.log(`  📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('\n');

  if (failed === 0) {
    console.log('🎉 All tests passed! The contract works with WSOL.');
  } else {
    console.log('⚠️  Some tests failed. Please review the logs above.');
  }
}

runTests().catch(console.error);
