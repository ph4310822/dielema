import {
  Connection,
  PublicKey,
  Keypair,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const RPC_URL = 'https://api.devnet.solana.com';
const DLM_TOKEN_MINT = new PublicKey('6WnV2dFQwvdJvMhWrg4d8ngYcgt6vvtKAkGrYovGjpwF');

async function debugTokenAccount() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const walletKeypairPath = path.join(os.homedir(), '.config/solana/id_mainnet.json');
  const walletBytes = JSON.parse(fs.readFileSync(walletKeypairPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletBytes));

  console.log('Wallet:', wallet.publicKey.toBase58());

  // Get ATA for both token programs
  const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbJnfuDQFcZZ5tcZBnCiFpUzLnsDyBMZqDPDT');

  const legacyATA = PublicKey.findProgramAddressSync(
    [
      wallet.publicKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      DLM_TOKEN_MINT.toBuffer(),
    ],
    ATA_PROGRAM_ID
  )[0];

  const token2022ATA = PublicKey.findProgramAddressSync(
    [
      wallet.publicKey.toBuffer(),
      TOKEN_2022_PROGRAM_ID.toBuffer(),
      DLM_TOKEN_MINT.toBuffer(),
    ],
    ATA_PROGRAM_ID
  )[0];

  console.log('\nChecking Legacy Token ATA:', legacyATA.toBase58());
  const legacyInfo = await connection.getAccountInfo(legacyATA);
  if (legacyInfo) {
    console.log('  - Found!');
    console.log('  - Owner:', legacyInfo.owner.toBase58());
    console.log('  - Data length:', legacyInfo.data.length);
    console.log('  - Lamports:', legacyInfo.lamports);
    // Read amount (bytes 64-72)
    const amount = legacyInfo.data.readBigUInt64LE(64);
    console.log('  - Amount:', amount.toString());
  } else {
    console.log('  - Not found');
  }

  console.log('\nChecking Token-2022 ATA:', token2022ATA.toBase58());
  const token2022Info = await connection.getAccountInfo(token2022ATA);
  if (token2022Info) {
    console.log('  - Found!');
    console.log('  - Owner:', token2022Info.owner.toBase58());
    console.log('  - Data length:', token2022Info.data.length);
    console.log('  - Lamports:', token2022Info.lamports);
    // Check for extensions (first 2 bytes indicate extension type)
    const extensionType = token2022Info.data.readUInt16LE(0);
    console.log('  - Extension type (first 2 bytes):', extensionType);
    // Try to read amount at different positions
    console.log('  - Data bytes 0-10:', Array.from(token2022Info.data.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  } else {
    console.log('  - Not found');
  }

  console.log('\nChecking DLM Mint:', DLM_TOKEN_MINT.toBase58());
  const mintInfo = await connection.getAccountInfo(DLM_TOKEN_MINT);
  if (mintInfo) {
    console.log('  - Owner:', mintInfo.owner.toBase58());
    console.log('  - Data length:', mintInfo.data.length);
    console.log('  - Is Token-2022:', mintInfo.owner.toBase58() === 'TokenzQdBNbJnfuDQFcZZ5tcZBnCiFpUzLnsDyBMZqDPDT');
  }
}

debugTokenAccount().catch(console.error);
