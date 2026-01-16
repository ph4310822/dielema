/**
 * Quick test script for getClaimableDeposits method
 * Run with: node /tmp/test-claimable-deposits.js <receiver_address>
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const PROGRAM_ID = new PublicKey('3uT7JEnRZ4pc4bwYvJ9PHsw579YLfNBr3xQvTiXBkGyC');
const DEPOSIT_ACCOUNT_SIZE = 158;

async function getClaimableDeposits(receiverAddress) {
  console.log('Testing getClaimableDeposits for receiver:', receiverAddress);

  try {
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const receiverPubkey = new PublicKey(receiverAddress);

    console.log('\nFetching program accounts from mainnet...');
    const startTime = Date.now();

    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        { dataSize: DEPOSIT_ACCOUNT_SIZE },
        {
          memcmp: {
            offset: 32,
            bytes: receiverPubkey.toBase58(),
          },
        },
      ],
    });

    const elapsed = Date.now() - startTime;
    console.log(`Success! Found ${accounts.length} deposit(s) in ${elapsed}ms`);

    if (accounts.length > 0) {
      console.log('\nDeposit account addresses:');
      accounts.forEach((acc, idx) => {
        const addr = acc.pubkey.toBase58();
        console.log(`  ${idx + 1}. ${addr}`);
      });
    }

    return accounts.length;
  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('429')) {
      console.error('\nRate limited! Try:');
      console.error('  - Using a different RPC endpoint');
      console.error('  - Adding commitment: "confirmed"');
    }
    throw error;
  }
}

const receiverAddress = process.argv[2];

if (!receiverAddress) {
  console.error('Usage: node /tmp/test-claimable-deposits.js <receiver_address>');
  console.error('\nExample: node /tmp/test-claimable-deposits.js 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
  process.exit(1);
}

getClaimableDeposits(receiverAddress)
  .then(count => {
    console.log(`\nTest completed - found ${count} deposit(s)`);
    process.exit(0);
  })
  .catch(error => {
    console.error('\nTest failed');
    process.exit(1);
  });
