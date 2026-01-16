import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  Connection,
  PublicKey,
  Keypair,
  TransactionInstruction,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.SOLANA_PROGRAM_ID || '3uT7JEnRZ4pc4bwYvJ9PHsw579YLfNBr3xQvTiXBkGyC');

const connection = new Connection(RPC_URL, 'confirmed');

// Middleware
app.use(cors());
app.use(express.json());

// Types
interface DepositRequest {
  depositor: string;
  receiver: string;
  tokenMint: string;
  amount: number;
  timeoutSeconds: number;
}

interface ProofOfLifeRequest {
  depositor: string;
  depositSeed: string;
}

interface WithdrawRequest {
  depositor: string;
  depositSeed: string;
  receiverTokenAccount?: string;
}

interface ClaimRequest {
  receiver: string;
  depositSeed: string;
  depositor: string;
}

// Helper: Derive deposit PDA
function deriveDepositPDA(depositor: string, depositSeed: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('deposit'),
      new PublicKey(depositor).toBuffer(),
      Buffer.from(depositSeed),
    ],
    PROGRAM_ID
  );
}

// Helper: Derive deposit token account PDA
function deriveTokenAccountPDA(depositPDA: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('token_account'), depositPDA.toBuffer()],
    PROGRAM_ID
  );
}

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', network: 'mainnet-beta', programId: PROGRAM_ID.toBase58() });
});

// Create deposit instruction
app.post('/api/deposit', async (req: Request, res: Response) => {
  try {
    const { depositor, receiver, tokenMint, amount, timeoutSeconds }: DepositRequest = req.body;

    // Validate inputs
    if (!depositor || !receiver || !tokenMint || amount <= 0 || timeoutSeconds <= 0) {
      return res.status(400).json({ error: 'Invalid input parameters' });
    }

    const depositorPubkey = new PublicKey(depositor);
    const receiverPubkey = new PublicKey(receiver);
    const tokenMintPubkey = new PublicKey(tokenMint);

    // Generate deposit seed (using current timestamp)
    const depositSeed = `${Date.now()}`;

    // Derive PDAs
    const [depositPDA, depositBump] = deriveDepositPDA(depositor, depositSeed);
    const [tokenAccountPDA] = deriveTokenAccountPDA(depositPDA);

    // Get depositor's token account
    const depositorTokenAccount = await getAssociatedTokenAddress(
      tokenMintPubkey,
      depositorPubkey
    );

    // Build instruction data
    const instructionData = Buffer.alloc(32 + 32 + 8 + 8);
    instructionData.writeUInt8(0, 0); // Instruction type: Deposit = 0
    let offset = 1;
    receiverPubkey.toBuffer().copy(instructionData, offset);
    offset += 32;
    instructionData.writeBigUInt64LE(BigInt(amount), offset);
    offset += 8;
    instructionData.writeBigUInt64LE(BigInt(timeoutSeconds), offset);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: depositorPubkey, isSigner: true, isWritable: true },
        { pubkey: depositPDA, isSigner: false, isWritable: true },
        { pubkey: depositorTokenAccount, isSigner: false, isWritable: true },
        { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
        { pubkey: tokenMintPubkey, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });

    res.json({
      success: true,
      depositSeed,
      depositPDA: depositPDA.toBase58(),
      tokenAccountPDA: tokenAccountPDA.toBase58(),
      instruction: {
        programId: PROGRAM_ID.toBase58(),
        keys: instruction.keys.map(k => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: instructionData.toString('base64'),
      },
    });
  } catch (error: any) {
    console.error('Error creating deposit instruction:', error);
    res.status(500).json({ error: error.message || 'Failed to create deposit instruction' });
  }
});

// Create proof-of-life instruction
app.post('/api/proof-of-life', async (req: Request, res: Response) => {
  try {
    const { depositor, depositSeed }: ProofOfLifeRequest = req.body;

    if (!depositor || !depositSeed) {
      return res.status(400).json({ error: 'Invalid input parameters' });
    }

    const depositorPubkey = new PublicKey(depositor);
    const [depositPDA] = deriveDepositPDA(depositor, depositSeed);

    // Build instruction data
    const instructionData = Buffer.alloc(1 + 4 + depositSeed.length);
    instructionData.writeUInt8(1, 0); // Instruction type: ProofOfLife = 1
    instructionData.writeUInt32LE(depositSeed.length, 1);
    instructionData.write(depositSeed, 5);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: depositorPubkey, isSigner: true, isWritable: false },
        { pubkey: depositPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });

    res.json({
      success: true,
      instruction: {
        programId: PROGRAM_ID.toBase58(),
        keys: instruction.keys.map(k => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: instructionData.toString('base64'),
      },
    });
  } catch (error: any) {
    console.error('Error creating proof-of-life instruction:', error);
    res.status(500).json({ error: error.message || 'Failed to create proof-of-life instruction' });
  }
});

// Create withdraw instruction
app.post('/api/withdraw', async (req: Request, res: Response) => {
  try {
    const { depositor, depositSeed }: WithdrawRequest = req.body;

    if (!depositor || !depositSeed) {
      return res.status(400).json({ error: 'Invalid input parameters' });
    }

    const depositorPubkey = new PublicKey(depositor);
    const [depositPDA] = deriveDepositPDA(depositor, depositSeed);
    const [tokenAccountPDA] = deriveTokenAccountPDA(depositPDA);

    // Get depositor's token account (will be derived on frontend)
    // For now, return the instruction without the exact token account
    // The frontend should provide the user's ATA

    // Build instruction data
    const instructionData = Buffer.alloc(1 + 4 + depositSeed.length);
    instructionData.writeUInt8(2, 0); // Instruction type: Withdraw = 2
    instructionData.writeUInt32LE(depositSeed.length, 1);
    instructionData.write(depositSeed, 5);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: depositorPubkey, isSigner: true, isWritable: false },
        { pubkey: depositPDA, isSigner: false, isWritable: true },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: true }, // Placeholder for user's ATA
        { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });

    res.json({
      success: true,
      tokenAccountPDA: tokenAccountPDA.toBase58(),
      instruction: {
        programId: PROGRAM_ID.toBase58(),
        keys: instruction.keys.map(k => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: instructionData.toString('base64'),
      },
    });
  } catch (error: any) {
    console.error('Error creating withdraw instruction:', error);
    res.status(500).json({ error: error.message || 'Failed to create withdraw instruction' });
  }
});

// Create claim instruction
app.post('/api/claim', async (req: Request, res: Response) => {
  try {
    const { receiver, depositSeed, depositor }: ClaimRequest = req.body;

    if (!receiver || !depositSeed || !depositor) {
      return res.status(400).json({ error: 'Invalid input parameters' });
    }

    const receiverPubkey = new PublicKey(receiver);
    const depositorPubkey = new PublicKey(depositor);
    const [depositPDA] = deriveDepositPDA(depositor, depositSeed);
    const [tokenAccountPDA] = deriveTokenAccountPDA(depositPDA);

    // Build instruction data
    const instructionData = Buffer.alloc(1 + 4 + depositSeed.length);
    instructionData.writeUInt8(3, 0); // Instruction type: Claim = 3
    instructionData.writeUInt32LE(depositSeed.length, 1);
    instructionData.write(depositSeed, 5);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: receiverPubkey, isSigner: true, isWritable: false },
        { pubkey: depositPDA, isSigner: false, isWritable: true },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: true }, // Placeholder for receiver's ATA
        { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });

    res.json({
      success: true,
      tokenAccountPDA: tokenAccountPDA.toBase58(),
      instruction: {
        programId: PROGRAM_ID.toBase58(),
        keys: instruction.keys.map(k => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: instructionData.toString('base64'),
      },
    });
  } catch (error: any) {
    console.error('Error creating claim instruction:', error);
    res.status(500).json({ error: error.message || 'Failed to create claim instruction' });
  }
});

// Get deposit info
app.get('/api/deposit/:depositor/:depositSeed', async (req: Request, res: Response) => {
  try {
    const { depositor, depositSeed } = req.params;
    const depositorStr = Array.isArray(depositor) ? depositor[0] : depositor;
    const depositSeedStr = Array.isArray(depositSeed) ? depositSeed[0] : depositSeed;

    const [depositPDA] = deriveDepositPDA(depositorStr, depositSeedStr);

    const accountInfo = await connection.getAccountInfo(depositPDA);

    if (!accountInfo) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    // Parse the account data
    // The structure matches our DepositAccount struct in the smart contract
    const data = accountInfo.data;
    const depositorPubkey = new PublicKey(data.slice(0, 32)).toBase58();
    const receiverPubkey = new PublicKey(data.slice(32, 64)).toBase58();
    const tokenMintPubkey = new PublicKey(data.slice(64, 96)).toBase58();
    const amount = Number(data.readBigUInt64LE(96));
    const lastProofTimestamp = Number(data.readBigInt64LE(104));
    const timeoutSeconds = Number(data.readBigUInt64LE(112));
    const bump = data.readUInt8(120);
    const isClosed = data.readUInt8(121) === 1;

    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - lastProofTimestamp;
    const isExpired = elapsed >= timeoutSeconds;

    res.json({
      success: true,
      deposit: {
        depositor: depositorPubkey,
        receiver: receiverPubkey,
        tokenMint: tokenMintPubkey,
        amount,
        lastProofTimestamp,
        timeoutSeconds,
        elapsed,
        isExpired,
        isClosed,
        bump,
      },
    });
  } catch (error: any) {
    console.error('Error fetching deposit:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch deposit' });
  }
});

// Get user's deposits
app.get('/api/deposits/:user', async (req: Request, res: Response) => {
  try {
    const { user } = req.params;
    const userPubkey = new PublicKey(user);

    // Get all accounts owned by the program
    const accounts = await connection.getProgramAccounts(PROGRAM_ID);

    const userDeposits = accounts
      .filter(account => {
        const data = account.account.data;
        const depositor = new PublicKey(data.slice(0, 32));
        return depositor.equals(userPubkey);
      })
      .map(account => {
        const data = account.account.data;
        const depositor = new PublicKey(data.slice(0, 32)).toBase58();
        const receiver = new PublicKey(data.slice(32, 64)).toBase58();
        const tokenMint = new PublicKey(data.slice(64, 96)).toBase58();
        const amount = Number(data.readBigUInt64LE(96));
        const lastProofTimestamp = Number(data.readBigInt64LE(104));
        const timeoutSeconds = Number(data.readBigUInt64LE(112));
        const isClosed = data.readUInt8(121) === 1;

        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - lastProofTimestamp;
        const isExpired = elapsed >= timeoutSeconds;

        return {
          address: account.pubkey.toBase58(),
          depositor,
          receiver,
          tokenMint,
          amount,
          lastProofTimestamp,
          timeoutSeconds,
          elapsed,
          isExpired,
          isClosed,
        };
      });

    res.json({
      success: true,
      deposits: userDeposits,
    });
  } catch (error: any) {
    console.error('Error fetching user deposits:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch deposits' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Dielemma backend server running on port ${PORT}`);
  console.log(`Solana RPC URL: ${RPC_URL}`);
  console.log(`Program ID: ${PROGRAM_ID.toBase58()}`);
});
