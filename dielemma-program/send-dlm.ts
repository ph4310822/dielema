/**
 * Send DLM tokens to an address
 */

import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  transfer,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const NETWORK = 'devnet';
const RECIPIENT = 'EjAX2KePXZEZEaADMVc5UT2SQDvBYfoP1Jyx7frignFX';
const DLM_MINT = new PublicKey('9iJpLnJ4VkPjDopdrCz4ykgT1nkYNA3jD3GcsGauu4gm');
const AMOUNT = 100; // Send 100 DLM tokens

async function main() {
  console.log('=== Sending DLM Tokens ===\n');
  console.log('Recipient:', RECIPIENT);
  console.log('Amount:', AMOUNT, 'DLM');
  console.log('Network:', NETWORK);
  console.log();

  // Connect to devnet
  const connection = new Connection(clusterApiUrl(NETWORK), 'confirmed');

  // Load the deployer wallet from Solana CLI config
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const walletPath = path.join(homeDir, '.config', 'solana', 'id.json');

  console.log('Loading wallet...');
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const sender = Keypair.fromSecretKey(new Uint8Array(secretKey));
  console.log('Sender:', sender.publicKey.toBase58());

  // Get sender's DLM token account
  console.log('\nGetting sender DLM token account...');
  const senderATA = await getOrCreateAssociatedTokenAccount(
    connection,
    sender,
    DLM_MINT,
    sender.publicKey
  );
  console.log('Sender ATA:', senderATA.address.toBase58());

  // Check sender balance
  const senderBalance = await connection.getTokenAccountBalance(senderATA.address);
  console.log('Sender DLM balance:', senderBalance.value.uiAmountString, 'DLM');

  if (parseFloat(senderBalance.value.uiAmountString || '0') < AMOUNT) {
    console.error('Insufficient DLM balance!');
    return;
  }

  // Get or create recipient's token account
  console.log('\nGetting recipient DLM token account...');
  const recipientATA = await getOrCreateAssociatedTokenAccount(
    connection,
    sender, // payer
    DLM_MINT,
    new PublicKey(RECIPIENT)
  );
  console.log('Recipient ATA:', recipientATA.address.toBase58());

  // Transfer tokens
  console.log('\nTransferring', AMOUNT, 'DLM tokens...');
  const amount = BigInt(AMOUNT) * BigInt(10**9); // 9 decimals

  const signature = await transfer(
    connection,
    sender,
    senderATA.address,
    recipientATA.address,
    sender,
    amount
  );

  console.log('\n✅ Transfer successful!');
  console.log('Signature:', signature);
  console.log('\nRecipient now has', AMOUNT, 'DLM tokens');
}

main().catch(console.error);
