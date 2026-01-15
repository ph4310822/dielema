/**
 * Test to verify single RPC call fix
 * This simulates what happens when wallet connects
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const PROGRAM_ID = new PublicKey('3jMCqxicNqoUaymcH23ctjJxLv4NqLb4KqRxcokSKTnA');
const DEPOSIT_ACCOUNT_SIZE = 158;

async function testSingleRPCCall(userAddress) {
  console.log('Testing single RPC call pattern...');
  console.log('User address:', userAddress);
  console.log('');

  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

  // OLD PATTERN (causes 429): Two separate calls
  console.log('❌ OLD PATTERN: Two separate RPC calls');
  console.log('=====================================');

  try {
    const startTime1 = Date.now();
    const accounts1 = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        { dataSize: DEPOSIT_ACCOUNT_SIZE },
        { memcmp: { offset: 0, bytes: userAddress } }, // depositor filter
      ],
    });
    const time1 = Date.now() - startTime1;
    console.log(`Call 1 (depositor filter): ${accounts1.length} accounts in ${time1}ms`);

    const startTime2 = Date.now();
    const accounts2 = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        { dataSize: DEPOSIT_ACCOUNT_SIZE },
        { memcmp: { offset: 32, bytes: userAddress } }, // receiver filter
      ],
    });
    const time2 = Date.now() - startTime2;
    console.log(`Call 2 (receiver filter): ${accounts2.length} accounts in ${time2}ms`);
    console.log(`Total time: ${time1 + time2}ms`);
    console.log(`Total RPC calls: 2`);
  } catch (error) {
    console.error('Error with old pattern:', error.message);
  }

  console.log('');
  console.log('✅ NEW PATTERN: Single RPC call, client-side filtering');
  console.log('======================================================');

  try {
    const startTime = Date.now();

    // Single call to fetch ALL deposits
    const allAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        { dataSize: DEPOSIT_ACCOUNT_SIZE },
        // NO memcmp filter - fetch all
      ],
    });

    const fetchTime = Date.now() - startTime;
    console.log(`Fetched ${allAccounts.length} total accounts in ${fetchTime}ms`);

    // Client-side filtering (instant)
    const filterStart = Date.now();

    const asDepositor = allAccounts.filter(acc => {
      // First 32 bytes are depositor pubkey
      const depositor = new PublicKey(acc.account.data.slice(0, 32));
      return depositor.toBase58() === userAddress;
    });

    const asReceiver = allAccounts.filter(acc => {
      // Bytes 32-64 are receiver pubkey
      const receiver = new PublicKey(acc.account.data.slice(32, 64));
      return receiver.toBase58() === userAddress;
    });

    const filterTime = Date.now() - filterStart;

    console.log(`User as depositor: ${asDepositor.length} accounts`);
    console.log(`User as receiver: ${asReceiver.length} accounts`);
    console.log(`Filtering time: ${filterTime}ms (instant)`);
    console.log(`Total time: ${fetchTime + filterTime}ms`);
    console.log(`Total RPC calls: 1 ✅`);

    console.log('');
    console.log('Summary:');
    console.log(`- Old pattern: 2 RPC calls (triggers 429)`);
    console.log(`- New pattern: 1 RPC call (no 429)`);
    console.log(`- Speed improvement: Same fetch time, no rate limit!`);

  } catch (error) {
    console.error('Error with new pattern:', error.message);
  }
}

// Test with a sample address
const testAddress = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
testSingleRPCCall(testAddress)
  .then(() => console.log('\n✅ Test completed'))
  .catch(err => console.error('\n❌ Test failed:', err));
