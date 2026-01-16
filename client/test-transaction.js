/**
 * Test script to debug client transaction building
 */

const {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  clusterApiUrl,
} = require('@solana/web3.js');
const {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
} = require('@solana/spl-token');

// Configuration
const PROGRAM_ID = new PublicKey('3uT7JEnRZ4pc4bwYvJ9PHsw579YLfNBr3xQvTiXBkGyC');
const DEPOSIT_SEED_PREFIX = 'deposit';
const TOKEN_ACCOUNT_SEED_PREFIX = 'token_account';

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  const depositor = new PublicKey('EjAX2KePXZEZEaADMVc5UT2SQDvBYfoP1Jyx7frignFX');
  const receiver = new PublicKey('AtHMjriFjCWfxhF4GCh8GPQnQCoGxk7vNhnh6drPHsVr');
  const tokenMint = new PublicKey('So11111111111111111111111111111111111111112'); // Native mint
  const amount = BigInt(1 * 1e9); // 1 SOL
  const timeoutSeconds = BigInt(86400); // 1 day
  const depositSeed = `${Date.now()}-test`;

  console.log('Testing transaction build...');
  console.log('Depositor:', depositor.toBase58());
  console.log('Receiver:', receiver.toBase58());
  console.log('Token Mint:', tokenMint.toBase58());
  console.log('Amount:', amount.toString(), 'lamports');
  console.log('Deposit Seed:', depositSeed);

  // Derive PDAs
  const [depositPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(DEPOSIT_SEED_PREFIX),
      depositor.toBuffer(),
      Buffer.from(depositSeed),
    ],
    PROGRAM_ID
  );

  const [tokenAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from(TOKEN_ACCOUNT_SEED_PREFIX), depositPDA.toBuffer()],
    PROGRAM_ID
  );

  console.log('Deposit PDA:', depositPDA.toBase58());
  console.log('Token Account PDA:', tokenAccountPDA.toBase58());

  // Get user's ATA
  const userATA = await getAssociatedTokenAddress(
    tokenMint,
    depositor,
    false,
    TOKEN_PROGRAM_ID
  );

  console.log('User ATA:', userATA.toBase58());

  // Check if ATA exists
  const userATAInfo = await connection.getAccountInfo(userATA);
  console.log('ATA exists:', !!userATAInfo);

  // Build transaction
  const transaction = new Transaction();
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = depositor;

  if (!userATAInfo) {
    console.log('Creating ATA and wrapping SOL...');

    const createATAInstruction = createAssociatedTokenAccountInstruction(
      depositor,
      userATA,
      depositor,
      tokenMint
    );
    transaction.add(createATAInstruction);

    const syncInstruction = createSyncNativeInstruction(userATA, TOKEN_PROGRAM_ID);
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: depositor,
      toPubkey: userATA,
      lamports: Number(amount),
    });

    transaction.add(transferInstruction);
    transaction.add(syncInstruction);
  }

  // Build instruction data
  const discriminant = Buffer.alloc(4);
  discriminant.writeUInt32LE(0, 0);

  const seedBytes = Buffer.from(depositSeed, 'utf-8');
  const seedLength = Buffer.alloc(4);
  seedLength.writeUInt32LE(seedBytes.length, 0);

  const receiverBuffer = receiver.toBuffer();
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amount, 0);

  const timeoutBuffer = Buffer.alloc(8);
  timeoutBuffer.writeBigUInt64LE(timeoutSeconds, 0);

  const instructionData = Buffer.concat([
    discriminant,
    seedLength,
    seedBytes,
    receiverBuffer,
    amountBuffer,
    timeoutBuffer,
  ]);

  console.log('Instruction data length:', instructionData.length);
  console.log('Instruction data:', instructionData.toString('hex').substring(0, 100) + '...');

  // Create deposit instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: depositor, isSigner: true, isWritable: true },
      { pubkey: depositPDA, isSigner: false, isWritable: true },
      { pubkey: userATA, isSigner: false, isWritable: true },
      { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
      { pubkey: tokenMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: instructionData,
  });

  transaction.add(instruction);

  console.log('Transaction built');
  console.log('Number of instructions:', transaction.instructions.length);

  // Simulate transaction
  console.log('\nSimulating transaction...');
  try {
    const simulationResult = await connection.simulateTransaction(transaction);
    console.log('Simulation result:', JSON.stringify(simulationResult, null, 2));

    if (simulationResult.value.err) {
      console.error('\nSimulation error:', simulationResult.value.err);
    } else {
      console.log('\nSimulation successful!');
    }
  } catch (error) {
    console.error('Simulation failed:', error.message);
  }
}

main().catch(console.error);
