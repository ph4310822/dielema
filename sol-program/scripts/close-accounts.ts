/**
 * Close All Accounts Script
 *
 * This script finds and closes all Solana accounts created by your deployment key.
 * It handles:
 * 1. Program buffers (from failed deployments)
 * 2. Deposit PDAs (from the dielemma program)
 * 3. Token accounts associated with deposits
 *
 * Run with: npx tsx scripts/close-accounts.ts
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

// Configuration
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('EyFvSrD8X5DDGrWpyRRJsxLsrJqngQRAHVponPmR9mmm');
const DEPOSIT_SEED_PREFIX = 'deposit';
const TOKEN_ACCOUNT_SEED_PREFIX = 'token_account';

// Utility functions
function sleep(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
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

function serializeString(str: string): Buffer {
  const strBytes = Buffer.from(str, 'utf-8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(strBytes.length, 0);
  return Buffer.concat([lengthBuffer, strBytes]);
}

function buildCloseAccountInstructionData(depositSeed: string): Buffer {
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(4, 0);
  const seedBuffer = serializeString(depositSeed);
  return Buffer.concat([discriminant, seedBuffer]);
}

interface AccountInfo {
  address: PublicKey;
  balance: number;
  owner: PublicKey;
  executable: boolean;
}

/**
 * Get all accounts owned by your keypair
 */
async function getAllOwnedAccounts(
  connection: Connection,
  owner: PublicKey
): Promise<AccountInfo[]> {
  console.log(`\n🔍 Searching for all accounts owned by ${owner.toBase58()}...`);

  const accounts: AccountInfo[] = [];
  let offset = 0;
  const chunkSize = 1000;

  while (true) {
    try {
      const accountList = await connection.getProgramAccounts(owner, {
        commitment: 'confirmed',
        minContextSlot: undefined,
        dataSlice: { offset: 0, length: 0 },
        filters: [],
      });

      // Actually, let's use a different approach - get large accounts
      const largeAccounts = await connection.getProgramAccounts(
        SystemProgram.programId,
        {
          filters: [
            {
              memcmp: {
                offset: 32,
                bytes: owner.toBase58(),
              },
            },
          ],
          dataSlice: { offset: 0, length: 0 },
        }
      );

      for (const account of largeAccounts) {
        const balance = await connection.getBalance(account.pubkey);
        accounts.push({
          address: account.pubkey,
          balance,
          owner,
          executable: false,
        });
      }

      break;
    } catch (error: any) {
      console.log(`  ⚠️  Error fetching accounts: ${error.message}`);
      break;
    }
  }

  console.log(`  Found ${accounts.length} accounts`);
  return accounts;
}

/**
 * Find all deposit PDAs for a given depositor
 * This tries common seed patterns
 */
async function findDepositPDAs(
  connection: Connection,
  depositor: PublicKey
): Promise<Array<{ address: PublicKey; seed: string; balance: number }>> {
  console.log('\n🔍 Searching for deposit PDAs...');

  const deposits: Array<{ address: PublicKey; seed: string; balance: number }> = [];

  // Try a range of possible seeds (timestamps, hashes, etc.)
  const seedPatterns = [
    // Timestamp-based seeds (last 30 days)
    ...Array.from({ length: 30 }, (_, i) => {
      const timestamp = Date.now() - i * 24 * 60 * 60 * 1000;
      return timestamp.toString(16).substring(0, 20);
    }),
    // Hash-like patterns
    ...Array.from({ length: 100 }, () =>
      Math.random().toString(36).substring(2, 12)
    ),
  ];

  for (const seed of seedPatterns) {
    try {
      const [depositPDA] = deriveDepositPDA(depositor, seed);
      const accountInfo = await connection.getAccountInfo(depositPDA);

      if (accountInfo && accountInfo.owner.equals(PROGRAM_ID)) {
        const balance = await connection.getBalance(depositPDA);
        deposits.push({
          address: depositPDA,
          seed,
          balance,
        });
        console.log(`  ✅ Found deposit: ${depositPDA.toBase58()} (${balance / LAMPORTS_PER_SOL} SOL)`);
      }
    } catch (error) {
      // Account doesn't exist, continue
    }
  }

  console.log(`  Found ${deposits.length} deposit accounts`);
  return deposits;
}

/**
 * Close a deposit account using the program's close instruction
 */
async function closeDepositAccount(
  connection: Connection,
  wallet: Keypair,
  depositAddress: PublicKey,
  depositSeed: string
): Promise<boolean> {
  try {
    const [tokenAccountPDA] = deriveTokenAccountPDA(depositAddress);

    const instructionData = buildCloseAccountInstructionData(depositSeed);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: depositAddress, isSigner: false, isWritable: true },
        { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: false, isWritable: true },
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

    console.log(`  ✅ Closed deposit account: ${depositAddress.toBase58()}`);
    console.log(`  Tx: ${signature}`);
    return true;
  } catch (error: any) {
    console.log(`  ❌ Failed to close ${depositAddress.toBase58()}: ${error.message}`);
    return false;
  }
}

/**
 * Close a program buffer account
 */
async function closeBufferAccount(
  connection: Connection,
  wallet: Keypair,
  bufferAddress: PublicKey
): Promise<boolean> {
  try {
    const transaction = new Transaction().add(
      SystemProgram.closeAccount({
        fromPubkey: bufferAddress,
        lamports: await connection.getBalance(bufferAddress),
        toPubkey: wallet.publicKey,
        authority: wallet.publicKey,
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    const signature = await sendAndConfirmTransaction(connection, transaction, [wallet], {
      commitment: 'confirmed',
    });

    console.log(`  ✅ Closed buffer: ${bufferAddress.toBase58()}`);
    console.log(`  Tx: ${signature}`);
    return true;
  } catch (error: any) {
    console.log(`  ❌ Failed to close buffer ${bufferAddress.toBase58()}: ${error.message}`);
    return false;
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              Close All Accounts - Devnet Cleanup                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Setup connection
  const connection = new Connection(RPC_URL, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 120000,
  });

  // Load wallet
  const walletKeypairPath = path.join(os.homedir(), '.config/solana/id_mainnet.json');
  let wallet: Keypair;

  try {
    const walletBytes = JSON.parse(fs.readFileSync(walletKeypairPath, 'utf-8'));
    wallet = Keypair.fromSecretKey(new Uint8Array(walletBytes));
  } catch (error) {
    console.error('❌ Failed to load wallet from ~/.config/solana/id_mainnet.json');
    console.log('   Make sure you have a Solana keypair file at that location.');
    process.exit(1);
  }

  console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`Network: ${RPC_URL}\n`);

  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Wallet balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

  let totalClosed = 0;
  let totalRecovered = 0;

  // 1. Find and close deposit PDAs
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Step 1: Closing Deposit Accounts');
  console.log('═══════════════════════════════════════════════════════════════');

  const deposits = await findDepositPDAs(connection, wallet.publicKey);

  for (const deposit of deposits) {
    console.log(`\nClosing deposit: ${deposit.address.toBase58()}`);
    const recovered = deposit.balance;
    const success = await closeDepositAccount(
      connection,
      wallet,
      deposit.address,
      deposit.seed
    );

    if (success) {
      totalClosed++;
      totalRecovered += recovered;
    }

    // Small delay to avoid rate limiting
    await sleep(1);
  }

  // 2. Close program buffers (from failed deployments)
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Step 2: Closing Program Buffer Accounts');
  console.log('═══════════════════════════════════════════════════════════════');

  // Check for common buffer files
  const bufferFiles = [
    'recovered-buffer-keypair.json',
    'my-program-keypair.json',
  ];

  for (const bufferFile of bufferFiles) {
    const bufferPath = path.join(process.cwd(), bufferFile);

    try {
      if (fs.existsSync(bufferPath)) {
        const bufferBytes = JSON.parse(fs.readFileSync(bufferPath, 'utf-8'));
        const bufferKeypair = Keypair.fromSecretKey(new Uint8Array(bufferBytes));
        const bufferAddress = bufferKeypair.publicKey;

        const accountInfo = await connection.getAccountInfo(bufferAddress);

        if (accountInfo && accountInfo.owner.equals(wallet.publicKey)) {
          console.log(`\nClosing buffer from ${bufferFile}:`);
          const recovered = await connection.getBalance(bufferAddress);
          const success = await closeBufferAccount(connection, wallet, bufferAddress);

          if (success) {
            totalClosed++;
            totalRecovered += recovered;
          }
        }
      }
    } catch (error: any) {
      console.log(`  ⚠️  Could not process ${bufferFile}: ${error.message}`);
    }
  }

  // 3. Summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                          Summary                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`  📊 Total accounts closed: ${totalClosed}`);
  console.log(`  💰 Total SOL recovered: ${(totalRecovered / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  const finalBalance = await connection.getBalance(wallet.publicKey);
  console.log(`  💵 Final wallet balance: ${(finalBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

  if (totalClosed > 0) {
    console.log('✅ Successfully closed accounts and recovered rent!');
  } else {
    console.log('ℹ️  No additional accounts found to close.');
    console.log('   If you know of specific accounts to close, you can close them manually using:');
    console.log('   solana program close <PROGRAM_ADDRESS> <KEYPAIR>');
  }
}

main().catch(console.error);
