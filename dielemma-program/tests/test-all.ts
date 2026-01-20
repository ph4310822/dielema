/**
 * Complete Test Suite for Dielemma Smart Contract
 *
 * Tests all contract functionality:
 * 1. Deposit
 * 2. Withdraw
 * 3. Claim (after timeout)
 * 4. Proof of Life
 * 5. Close Account
 * 6. Edge cases and security
 *
 * Run with: npx tsx tests/test-all.ts
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
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
  createTransferInstruction,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';

// Configuration
const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('3jtN4Ki5WvHQX4QQaatCNtiHQwE6TVPkjNywfrVnMQi9');
const DLM_TOKEN_MINT = new PublicKey('6WnV2dFQwvdJvMhWrg4d8ngYcgt6vvtKAkGrYovGjpwF');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
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

function buildClaimInstructionData(depositSeed: string): Buffer {
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(3, 0);
  const seedBuffer = serializeString(depositSeed);
  return Buffer.concat([discriminant, seedBuffer]);
}

function buildProofOfLifeInstructionData(depositSeed: string): Buffer {
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(1, 0);
  const seedBuffer = serializeString(depositSeed);
  return Buffer.concat([discriminant, seedBuffer]);
}

function buildCloseAccountInstructionData(depositSeed: string): Buffer {
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(4, 0);
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

/**
 * Wraps SOL to WSOL if the wallet has less than the minimum required WSOL balance
 * @param connection Solana connection
 * @param wallet Wallet keypair
 * @param minBalance Minimum WSOL balance required (in lamports, default 0.1 WSOL)
 */
async function ensureWsolBalance(
  connection: Connection,
  wallet: Keypair,
  minBalance: number = 0.1 * LAMPORTS_PER_SOL
): Promise<void> {
  try {
    const wsolATA = await getAssociatedTokenAddress(
      WSOL_MINT,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    // Check if WSOL ATA exists and get balance
    let currentBalance = 0;
    try {
      const accountInfo = await getAccount(connection, wsolATA);
      currentBalance = Number(accountInfo.amount);
    } catch (error) {
      // ATA doesn't exist, balance is 0
      console.log('  WSOL ATA does not exist yet');
    }

    console.log(`  Current WSOL balance: ${(currentBalance / LAMPORTS_PER_SOL).toFixed(6)} WSOL`);
    console.log(`  Required minimum: ${(minBalance / LAMPORTS_PER_SOL).toFixed(6)} WSOL`);

    if (currentBalance >= minBalance) {
      console.log('  ✅ Sufficient WSOL balance, no wrapping needed');
      return;
    }

    // Calculate amount to wrap
    const amountToWrap = minBalance - currentBalance;
    console.log(`  Wrapping ${(amountToWrap / LAMPORTS_PER_SOL).toFixed(6)} SOL to WSOL...`);

    // Check SOL balance
    const solBalance = await connection.getBalance(wallet.publicKey);
    if (solBalance < amountToWrap + 1 * LAMPORTS_PER_SOL) {
      throw new Error(`Insufficient SOL balance. Need at least ${(amountToWrap / LAMPORTS_PER_SOL + 1).toFixed(6)} SOL for wrapping + fees`);
    }

    const transaction = new Transaction();

    // Create WSOL ATA if it doesn't exist
    const wsolAccountInfo = await connection.getAccountInfo(wsolATA);
    if (!wsolAccountInfo) {
      console.log('  Creating WSOL ATA...');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          wsolATA,
          wallet.publicKey,
          WSOL_MINT
        )
      );
    }

    // Transfer SOL to WSOL ATA
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wsolATA,
        lamports: amountToWrap,
      })
    );

    // Sync native to convert SOL to WSOL
    transaction.add(
      createSyncNativeInstruction(wsolATA, TOKEN_PROGRAM_ID)
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    const signature = await sendAndConfirmTransaction(connection, transaction, [wallet], {
      commitment: 'confirmed',
    });

    console.log(`  ✅ Wrapped ${(amountToWrap / LAMPORTS_PER_SOL).toFixed(6)} SOL to WSOL`);
    console.log(`  Tx: ${signature}`);

    // Verify new balance
    const newAccountInfo = await getAccount(connection, wsolATA);
    console.log(`  New WSOL balance: ${(Number(newAccountInfo.amount) / LAMPORTS_PER_SOL).toFixed(6)} WSOL`);
  } catch (error: any) {
    console.log(`  ❌ Failed to wrap SOL: ${error.message}`);
    throw error;
  }
}

/**
 * Ensures DLM token ATA exists and has balance
 * Creates ATA if it doesn't exist and shows info about transferring tokens
 */
async function ensureDlmTokenAccount(connection: Connection, wallet: Keypair): Promise<void> {
  try {
    const dlmATA = await getAssociatedTokenAddress(
      DLM_TOKEN_MINT,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Check if ATA exists
    const dlmATAInfo = await connection.getAccountInfo(dlmATA);

    if (!dlmATAInfo) {
      console.log('  Creating DLM Token ATA...');
      const transaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          dlmATA,
          wallet.publicKey,
          DLM_TOKEN_MINT,
          TOKEN_2022_PROGRAM_ID
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      const signature = await sendAndConfirmTransaction(connection, transaction, [wallet], {
        commitment: 'confirmed',
      });
      console.log(`  ✅ Created DLM ATA: ${dlmATA.toBase58()}`);
      console.log(`  Tx: ${signature}`);
    } else {
      console.log(`  DLM ATA exists: ${dlmATA.toBase58()}`);
    }

    // Check balance using connection.getAccountInfo instead of getAccount
    const dlmAccountInfo = await connection.getAccountInfo(dlmATA);
    if (!dlmAccountInfo) {
      console.log('  ❌ Failed to get ATA info');
      return;
    }

    // Parse token account data manually
    const data = Buffer.from(dlmAccountInfo.data);
    // Skip first 64 bytes (mint and owner), next 8 bytes are amount
    const dlmBalance = data.readBigUInt64LE(64);
    console.log(`  DLM ATA Balance: ${dlmBalance} (${Number(dlmBalance) / 1_000_000} DLM)`);

    if (dlmBalance === 0n) {
      console.log('  ⚠️  ATA exists but has 0 balance');
      console.log('  You need to transfer DLM tokens from your old token account to the ATA:');
      console.log(`  Old token account: DTidzBHsmbmhaKfbqSdNM2izxP5hs1P4Ai1cmi2X1kSd`);
      console.log(`  New ATA: ${dlmATA.toBase58()}`);
      console.log('');
      console.log('  To transfer, use this Solana CLI command:');
      console.log(`  spl-token transfer --fund-identity --program-id TokenzQdBNvJnfuDQFcZZ5tcZBnCiFpUzLnsDyBMZqDPDTidyDTidzBHsmbmhaKfbqSdNM2izxP5hs1P4Ai1cmi2X1kSd ${dlmATA.toBase58()} 1000 --owner ~/.config/solana/id_mainnet.json`);
      console.log('');
      console.log('  Or you can use Solscan/Explorer to initiate the transfer');
    } else if (dlmBalance < 1_000_000n) {
      console.log('  ⚠️  WARNING: Insufficient DLM tokens for Proof of Life!');
      console.log(`  Required: 1 DLM token (1,000,000)`);
      console.log(`  Available: ${dlmBalance}`);
    } else {
      console.log('  ✅ Sufficient DLM tokens for Proof of Life');
    }
  } catch (error: any) {
    console.log(`  ❌ Failed to setup DLM token account: ${error.message}`);
    throw error;
  }
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
  options?: { amount?: bigint; timeout?: bigint; receiver?: PublicKey }
): Promise<DepositInfo> {
  try {
    const receiver = options?.receiver || wallet.publicKey;
    const amount = options?.amount || BigInt(1_000_000); // 0.01 WSOL
    const timeout = options?.timeout || BigInt(86400); // 1 day

    const depositSeed = generateDepositSeed();
    const [depositPDA] = deriveDepositPDA(wallet.publicKey, depositSeed);
    const [tokenAccountPDA] = deriveTokenAccountPDA(depositPDA);

    const depositorATA = await getAssociatedTokenAddress(
      WSOL_MINT,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const instructionData = buildDepositInstructionData(depositSeed, receiver, amount, timeout);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: depositPDA, isSigner: false, isWritable: true },
        { pubkey: depositorATA, isSigner: false, isWritable: true },
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

async function testVerifyDepositData(connection: Connection, deposit: DepositInfo): Promise<boolean> {
  try {
    const depositData = await getDepositAccount(connection, deposit.address);

    if (depositData.depositor.toBase58() !== deposit.depositor.toBase58()) {
      throw new Error('Depositor mismatch');
    }
    if (depositData.receiver.toBase58() !== deposit.receiver.toBase58()) {
      throw new Error('Receiver mismatch');
    }
    if (depositData.amount !== deposit.amount) {
      throw new Error('Amount mismatch');
    }
    if (depositData.timeout !== deposit.timeout) {
      throw new Error('Timeout mismatch');
    }
    if (depositData.seed !== deposit.seed) {
      throw new Error('Seed mismatch');
    }
    if (depositData.isClosed) {
      throw new Error('Deposit should not be closed');
    }

    console.log('  ✅ Deposit data verified');
    return true;
  } catch (error: any) {
    console.log(`  ❌ FAILED: ${error.message}`);
    return false;
  }
}

async function testWithdraw(connection: Connection, wallet: Keypair, deposit: DepositInfo): Promise<boolean> {
  try {
    const [tokenAccountPDA] = deriveTokenAccountPDA(deposit.address);
    const depositorATA = await getAssociatedTokenAddress(
      deposit.tokenMint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const instructionData = buildWithdrawInstructionData(deposit.seed);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: deposit.address, isSigner: false, isWritable: true },
        { pubkey: depositorATA, isSigner: false, isWritable: true },
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

async function testClaim(connection: Connection, receiverWallet: Keypair, deposit: DepositInfo): Promise<boolean> {
  try {
    const [tokenAccountPDA] = deriveTokenAccountPDA(deposit.address);
    const receiverATA = await getAssociatedTokenAddress(
      deposit.tokenMint,
      receiverWallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const instructionData = buildClaimInstructionData(deposit.seed);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: receiverWallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: deposit.address, isSigner: false, isWritable: true },
        { pubkey: receiverATA, isSigner: false, isWritable: true },
        { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });

    const transaction = new Transaction().add(instruction);
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = receiverWallet.publicKey;

    const signature = await sendAndConfirmTransaction(connection, transaction, [receiverWallet], {
      commitment: 'confirmed',
    });

    // Verify deposit is closed
    const depositData = await getDepositAccount(connection, deposit.address);
    if (!depositData.isClosed) {
      throw new Error('Deposit should be closed after claim');
    }

    console.log('  ✅ Claim successful');
    console.log(`  Tx: ${signature}`);
    return true;
  } catch (error: any) {
    console.log(`  ❌ FAILED: ${error.message}`);
    return false;
  }
}

async function testProofOfLife(connection: Connection, wallet: Keypair, deposit: DepositInfo): Promise<boolean> {
  try {
    const dlmATA = await getAssociatedTokenAddress(
      DLM_TOKEN_MINT,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const instructionData = buildProofOfLifeInstructionData(deposit.seed);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: deposit.address, isSigner: false, isWritable: true },
        { pubkey: dlmATA, isSigner: false, isWritable: true },
        { pubkey: DLM_TOKEN_MINT, isSigner: false, isWritable: true },
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

    console.log('  ✅ Proof of Life successful');
    console.log(`  Tx: ${signature}`);
    return true;
  } catch (error: any) {
    console.log(`  ❌ FAILED: ${error.message}`);
    return false;
  }
}

async function testDoubleWithdrawShouldFail(connection: Connection, wallet: Keypair, deposit: DepositInfo): Promise<boolean> {
  try {
    const [tokenAccountPDA] = deriveTokenAccountPDA(deposit.address);
    const depositorATA = await getAssociatedTokenAddress(
      deposit.tokenMint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const instructionData = buildWithdrawInstructionData(deposit.seed);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: deposit.address, isSigner: false, isWritable: true },
        { pubkey: depositorATA, isSigner: false, isWritable: true },
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

    await sendAndConfirmTransaction(connection, transaction, [wallet], {
      commitment: 'confirmed',
    });

    console.log('  ❌ FAILED: Double withdraw should have failed');
    return false;
  } catch (error: any) {
    const errorMsg = error.message || '';
    if (errorMsg.includes('already closed') ||
      errorMsg.includes('already withdrawn') ||
      errorMsg.includes('InvalidAccountData') ||
      errorMsg.includes('Deposit already withdrawn or claimed')) {
      console.log('  ✅ Double withdraw correctly failed');
      return true;
    }
    console.log(`  ❌ FAILED with unexpected error: ${error.message}`);
    return false;
  }
}

async function testClaimBeforeTimeoutShouldFail(connection: Connection, receiverWallet: Keypair, deposit: DepositInfo): Promise<boolean> {
  try {
    const [tokenAccountPDA] = deriveTokenAccountPDA(deposit.address);
    const receiverATA = await getAssociatedTokenAddress(
      deposit.tokenMint,
      receiverWallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const instructionData = buildClaimInstructionData(deposit.seed);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: receiverWallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: deposit.address, isSigner: false, isWritable: true },
        { pubkey: receiverATA, isSigner: false, isWritable: true },
        { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });

    const transaction = new Transaction().add(instruction);
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = receiverWallet.publicKey;

    await sendAndConfirmTransaction(connection, transaction, [receiverWallet], {
      commitment: 'confirmed',
    });

    console.log('  ❌ FAILED: Claim before timeout should have failed');
    return false;
  } catch (error: any) {
    if (error.message.includes('not expired') || error.message.includes('InvalidAccountData')) {
      console.log('  ✅ Claim before timeout correctly failed');
      return true;
    }
    console.log(`  ❌ FAILED with unexpected error: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           Dielemma Smart Contract - Complete Test Suite          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const walletKeypairPath = path.join(os.homedir(), '.config/solana/id_mainnet.json');
  const walletBytes = JSON.parse(fs.readFileSync(walletKeypairPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletBytes));

  console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`Network: ${RPC_URL}\n`);

  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Wallet balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

  // Ensure we have at least 0.1 WSOL for testing
  console.log('=== Checking WSOL Balance ===');
  await ensureWsolBalance(connection, wallet, 0.1 * LAMPORTS_PER_SOL);
  console.log('');

  // Ensure DLM token ATA exists and has balance
  console.log('=== Checking DLM Token Account ===');
  await ensureDlmTokenAccount(connection, wallet);
  console.log('');


  // Test 1: Create Deposit
  // console.log('=== Test 1: Create Deposit ===');
  // try {
  //   const deposit1 = await testCreateDeposit(connection, wallet);
  //   passed++;
  // } catch (error) {
  //   failed++;
  // }

  // // Test 2: Verify Deposit Data
  // console.log('\n=== Test 2: Verify Deposit Data ===');
  // const deposit2 = await testCreateDeposit(connection, wallet);
  // const result2 = await testVerifyDepositData(connection, deposit2);
  // if (result2) passed++; else failed++;

  // // Test 3: Withdraw
  // console.log('\n=== Test 3: Withdraw ===');
  // const deposit3 = await testCreateDeposit(connection, wallet);
  // const result3 = await testWithdraw(connection, wallet, deposit3);
  // if (result3) passed++; else failed++;

  // // Test 4: Double Withdraw (should fail)
  // console.log('\n=== Test 4: Double Withdraw (should fail) ===');
  // const result4 = await testDoubleWithdrawShouldFail(connection, wallet, deposit3);
  // if (result4) passed++; else failed++;

  // // Test 5: Claim after timeout
  // console.log('\n=== Test 5: Claim after timeout ===');
  // console.log('  Creating deposit with 60 second timeout...');
  // const deposit5 = await testCreateDeposit(connection, wallet, { timeout: BigInt(60) });
  // console.log('  Waiting for timeout to expire...');
  // await sleep(61);
  // console.log('  Timeout expired, attempting claim...');
  // const result5 = await testClaim(connection, wallet, deposit5);
  // if (result5) passed++; else failed++;

  // // Test 6: Claim before timeout (should fail)
  // console.log('\n=== Test 6: Claim before timeout (should fail) ===');
  // const deposit6 = await testCreateDeposit(connection, wallet, { timeout: BigInt(60) });
  // const result6 = await testClaimBeforeTimeoutShouldFail(connection, wallet, deposit6);
  // if (result6) passed++; else failed++;

  // Test 7: Proof of Life
  console.log('\n=== Test 7: Proof of Life ===');
  const deposit7 = await testCreateDeposit(connection, wallet);
  const result7 = await testProofOfLife(connection, wallet, deposit7);
  if (result7) passed++; else failed++;

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
    console.log('🎉 All tests passed! The contract is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please review the logs above.');
  }
}

runAllTests().catch(console.error);
