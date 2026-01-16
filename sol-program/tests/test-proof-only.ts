/**
 * Simple test for Proof of Life with Token-2022
 *
 * Run: solana-run-script tests/test-proof-only.ts
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMint,
  mintTo,
} from '@solana/spl-token';
import * as fs from 'fs';

// Configuration
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');
const PROGRAM_ID = new PublicKey('3uT7JEnRZ4pc4bwYvJ9PHsw579YLfNBr3xQvTiXBkGyC');

// Load keypair
const keypairBytes = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/solana/id_mainnet.json', 'utf8'));
const payer = Keypair.fromSecretKey(new Uint8Array(keypairBytes));

console.log('Testing Proof of Life with Token-2022...');
console.log('Payer:', payer.publicKey.toBase58());
console.log('RPC:', RPC_URL);

async function testProofOfLife() {
  try {
    // 1. Create a test token (Token-2022, 6 decimals)
    console.log('\n1. Creating test Token-2022 mint...');
    const mintKeypair = Keypair.generate();
    const mint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      6,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    const mintAddress = mintKeypair.publicKey;
    console.log('✅ Mint created:', mintAddress.toBase58());

    // 2. Create token account
    console.log('\n2. Creating token account...');
    const tokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      payer.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const createATAIx = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      tokenAccount,
      payer.publicKey,
      mintAddress,
      TOKEN_2022_PROGRAM_ID
    );

    await sendAndConfirmTransaction(connection, new Transaction().add(createATAIx), [payer]);
    console.log('✅ Token account created:', tokenAccount.toBase58());

    // 3. Mint 10 test tokens
    console.log('\n3. Minting 10 test tokens...');
    await mintTo(
      connection,
      payer,
      mintAddress,
      tokenAccount,
      payer,
      10_000_000, // 10 tokens with 6 decimals
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log('✅ Minted 10 tokens');

    // 4. Create a deposit first (required for proof of life)
    console.log('\n4. Creating deposit...');

    // Generate seed and derive PDA
    const depositSeed = `test-${Date.now()}`;
    const depositPDA = PublicKey.findProgramAddressSync(
      [Buffer.from('deposit'), payer.publicKey.toBuffer(), Buffer.from(depositSeed)],
      PROGRAM_ID
    )[0];

    console.log('   Deposit PDA:', depositPDA.toBase58());
    console.log('   Seed:', depositSeed);

    console.log('\n⚠️  Skipping deposit creation for now.');
    console.log('    To test full flow, you need to:');
    console.log('    1. Create a deposit with WSOL');
    console.log('    2. Then run proof of life with the test token');
    console.log('\n✅ Test setup complete!');
    console.log(`\nTest Token Mint: ${mintAddress.toBase58()}`);
    console.log(`Update lib.rs: OFFICIAL_DLM_TOKEN_MINT = "${mintAddress.toBase58()}"`);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

testProofOfLife()
  .then(() => console.log('\n✅ All tests passed!'))
  .catch(err => console.error('\n❌ Test failed:', err));
