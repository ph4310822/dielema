/**
 * Manual integration test for Dielemma program
 *
 * This script tests the Solana program directly without the client UI.
 * It will help identify issues with the contract, serialization, or account setup.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  NATIVE_MINT,
  createSyncNativeInstruction,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  PROGRAM_ID,
  loadWallet,
  deriveDepositPDA,
  deriveTokenAccountPDA,
  generateDepositSeed,
  buildDepositInstructionData,
  buildWithdrawInstructionData,
  buildProofOfLifeInstructionData,
  buildClaimInstructionData,
  parseDepositAccount,
  printAccountInfo,
  simulateAndLog,
  printBufferHex,
  airdrop,
  DepositAccount,
} from './helpers';

// Configuration
const NETWORK = 'devnet';
const connection = new Connection(clusterApiUrl(NETWORK), 'confirmed');

/**
 * Main test flow
 */
async function main() {
  console.log('=== Dielemma Program Manual Test ===');
  console.log(`Network: ${NETWORK}`);
  console.log(`Program ID: ${PROGRAM_ID.toBase58()}\n`);

  // Load wallet
  let wallet: Keypair;
  try {
    wallet = loadWallet();
    console.log(`✓ Wallet loaded: ${wallet.publicKey.toBase58()}`);
  } catch (error) {
    console.error('✗ Failed to load wallet:', error);
    console.log('\nPlease create a wallet first:');
    console.log('  solana-keygen new');
    return;
  }

  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`  Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log('\n⚠ Low balance! Requesting airdrop...');
    try {
      await airdrop(connection, wallet.publicKey, 2);
    } catch (error) {
      console.error('✗ Airdrop failed. You may need to use a faucet:', error);
      console.log('  https://faucet.solana.com/');
    }
  }

  // Test receiver address (can be any valid address)
  const receiver = Keypair.generate().publicKey;
  console.log(`  Test Receiver: ${receiver.toBase58()}\n`);

  // Run tests
  try {
    await testDeposit(wallet, receiver);
    console.log('\n✓ All tests passed!');
  } catch (error) {
    console.error('\n✗ Test failed:', error);
  }
}

/**
 * Test 1: Create a deposit
 */
async function testDeposit(wallet: Keypair, receiver: PublicKey) {
  console.log('\n=== Test 1: Create Deposit ===');

  // Parameters
  const depositSeed = generateDepositSeed();
  const amount = 0.005 * LAMPORTS_PER_SOL; // 0.005 SOL (smaller amount to leave room for fees)
  const timeoutSeconds = BigInt(86400); // 1 day
  const tokenMint = NATIVE_MINT; // Using native SOL (wrapped)

  console.log(`Deposit Seed: ${depositSeed}`);
  console.log(`Amount: ${(amount / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`Timeout: ${timeoutSeconds} seconds (${Number(timeoutSeconds) / 86400} days)`);
  console.log(`Token Mint: ${tokenMint.toBase58()} (Native)`);

  // Derive PDAs
  const [depositPDA, depositBump] = deriveDepositPDA(wallet.publicKey, depositSeed);
  const [tokenAccountPDA] = deriveTokenAccountPDA(depositPDA);

  console.log(`\nDerived Addresses:`);
  console.log(`  Deposit PDA: ${depositPDA.toBase58()} (bump: ${depositBump})`);
  console.log(`  Token Account PDA: ${tokenAccountPDA.toBase58()}`);

  // Get user's ATA for native SOL
  const userATA = await getAssociatedTokenAddress(
    tokenMint,
    wallet.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  console.log(`  User ATA: ${userATA.toBase58()}`);

  // Check if ATA exists
  const userATAInfo = await connection.getAccountInfo(userATA);
  console.log(`  User ATA exists: ${userATAInfo !== null}`);

  // Build instruction data
  const instructionData = buildDepositInstructionData(
    depositSeed,
    receiver,
    BigInt(amount),
    timeoutSeconds
  );

  printBufferHex('\nInstruction Data (hex)', instructionData);

  // Build transaction
  const transaction = new Transaction();

  // If ATA doesn't exist, create it and wrap SOL
  // If it exists, we might need to add more wrapped SOL
  if (!userATAInfo) {
    console.log('\n⚠ User ATA does not exist. Creating wrapped SOL account...');

    // Create ATA
    const createATAInstruction = createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      userATA,
      wallet.publicKey,
      tokenMint
    );
    transaction.add(createATAInstruction);

    // Wrap SOL by transferring to the ATA and syncing
    const syncInstruction = createSyncNativeInstruction(userATA, TOKEN_PROGRAM_ID);
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: userATA,
      lamports: amount,
    });

    transaction.add(transferInstruction);
    transaction.add(syncInstruction);

    console.log('✓ Added instructions to create ATA and wrap SOL');
  } else {
    console.log('\n✓ User ATA exists');

    // Check balance and add more if needed
    const tokenBalance = await connection.getTokenAccountBalance(userATA);
    const currentBalance = BigInt(tokenBalance.value.uiAmount || 0) * BigInt(10**9);
    const requiredBalance = BigInt(amount);

    console.log(`  Current balance: ${tokenBalance.value.uiAmount || 0} SOL`);
    console.log(`  Required balance: ${Number(amount) / LAMPORTS_PER_SOL} SOL`);

    if (currentBalance < requiredBalance) {
      const additionalLamports = Number(requiredBalance - currentBalance);
      console.log(`  Adding ${(additionalLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL to ATA...`);

      const transferInstruction = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: userATA,
        lamports: additionalLamports,
      });

      const syncInstruction = createSyncNativeInstruction(userATA, TOKEN_PROGRAM_ID);

      transaction.add(transferInstruction);
      transaction.add(syncInstruction);

      console.log('✓ Added instructions to wrap more SOL');
    }
  }

  // Create the deposit instruction
  const instruction = {
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
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
  };

  transaction.add(instruction);

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  // Skip simulation for now - it doesn't account for the ATA creation in the same transaction
  // console.log('\nSimulating transaction...');
  // await simulateAndLog(connection, transaction, wallet.publicKey);

  // Send transaction
  console.log('\nSending transaction...');
  try {
    const signature = await connection.sendTransaction(transaction, [wallet]);
    console.log(`✓ Transaction sent: ${signature}`);

    // Confirm
    await connection.confirmTransaction(signature);
    console.log('✓ Transaction confirmed');

    // Check deposit account
    await checkDepositAccount(depositPDA);

    // Test withdrawal
    await testWithdraw(wallet, depositSeed, depositPDA, tokenMint, userATA);
  } catch (error) {
    console.error('✗ Transaction failed:', error);
    throw error;
  }
}

/**
 * Test 2: Withdraw from deposit
 */
async function testWithdraw(
  wallet: Keypair,
  depositSeed: string,
  depositPDA: PublicKey,
  tokenMint: PublicKey,
  userATA: PublicKey
) {
  console.log('\n=== Test 2: Withdraw ===');

  const [tokenAccountPDA] = deriveTokenAccountPDA(depositPDA);

  // Build instruction data
  const instructionData = buildWithdrawInstructionData(depositSeed);

  // Create the withdraw instruction
  const instruction = {
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: depositPDA, isSigner: false, isWritable: true },
      { pubkey: userATA, isSigner: false, isWritable: true },
      { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: instructionData,
  };

  // Build transaction
  const transaction = new Transaction();
  transaction.add(instruction);

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  // Simulate
  console.log('\nSimulating transaction...');
  await simulateAndLog(connection, transaction, wallet.publicKey);

  // Send
  console.log('\nSending transaction...');
  try {
    const signature = await connection.sendTransaction(transaction, [wallet]);
    console.log(`✓ Transaction sent: ${signature}`);

    await connection.confirmTransaction(signature);
    console.log('✓ Transaction confirmed');

    // Check deposit account again
    await checkDepositAccount(depositPDA);
  } catch (error) {
    console.error('✗ Withdraw failed:', error);
    throw error;
  }
}

/**
 * Check deposit account state
 */
async function checkDepositAccount(depositPDA: PublicKey) {
  console.log('\n=== Checking Deposit Account ===');

  try {
    const accountInfo = await connection.getAccountInfo(depositPDA);

    if (!accountInfo) {
      console.log('✗ Deposit account not found!');
      return;
    }

    console.log(`✓ Deposit account found`);
    console.log(`  Owner: ${accountInfo.owner.toBase58()}`);
    console.log(`  Lamports: ${accountInfo.lamports}`);
    console.log(`  Data length: ${accountInfo.data.length}`);

    const deposit = parseDepositAccount(Buffer.from(accountInfo.data));

    if (deposit) {
      console.log('\n  Deposit Data:');
      console.log(`    Depositor: ${deposit.depositor}`);
      console.log(`    Receiver: ${deposit.receiver}`);
      console.log(`    Token Mint: ${deposit.tokenMint}`);
      console.log(`    Amount: ${deposit.amount.toString()}`);
      console.log(`    Last Proof: ${deposit.lastProofTimestamp} (${new Date(deposit.lastProofTimestamp * 1000).toISOString()})`);
      console.log(`    Timeout: ${deposit.timeoutSeconds}s`);
      console.log(`    Bump: ${deposit.bump}`);
      console.log(`    Is Closed: ${deposit.isClosed}`);
      console.log(`    Official Token Mint: ${deposit.officialTokenMint}`);
    }
  } catch (error) {
    console.error('✗ Error checking deposit account:', error);
  }
}

// Run
main().catch(console.error);
