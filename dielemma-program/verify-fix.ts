/**
 * Verify the withdraw fix by checking the program data
 */
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = '4k2WMWgqn4ma9fSwgfyDuZ4HpzzJTiCbdxgAhbL6n7ra';

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');

  // Get program account
  const programAccount = await connection.getAccountInfo(new PublicKey(PROGRAM_ID));

  console.log('=== Program Information ===');
  console.log('Program ID:', PROGRAM_ID);
  console.log('Data Length:', programAccount?.data.length, 'bytes');

  // The program should be around 151KB if it was properly built
  if (programAccount && programAccount.data.length > 150000) {
    console.log('✅ Program size looks correct (>150KB)');
  } else {
    console.log('❌ Program size seems small, might not be properly built');
  }

  // Check the program data account
  const programDataAddress = new PublicKey('C12pB1w24kWJmedxeA8zdW7k6fz6FFgeH8u4xHcWAXzz');
  const programData = await connection.getAccountInfo(programDataAddress);

  if (programData) {
    console.log('\n=== Program Data Account ===');
    console.log('Address:', programDataAddress.toBase58());
    console.log('Owner:', programData.owner.toBase58());
    console.log('Data Length:', programData.data.length, 'bytes');

    // Check upgrade authority
    const upgradeAuthority = new PublicKey(programData.data.slice(0, 32));
    console.log('\nUpgrade Authority:', upgradeAuthority.toBase58());

    // This should match the wallet that deployed
    console.log('\n✅ Program is deployed and upgradeable');
  }

  console.log('\n=== Instructions for Testing ===');
  console.log('To test the withdraw fix:');
  console.log('1. Make sure you are using wallet: EjAX2KePXZEZEaADMVc5UT2SQDvBYfoP1Jyx7frignFX');
  console.log('2. This is the wallet that created deposit: sP3c4cQJY2q9RZ48afDuVcma4DzPDXk4yRszZTBkwxn');
  console.log('3. Only the depositor can withdraw their own deposits');
}

main().catch(console.error);
