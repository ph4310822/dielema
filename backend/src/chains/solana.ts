/**
 * Solana chain service implementation
 * Handles all Solana-specific blockchain interactions
 */

import { Connection, PublicKey, TransactionInstruction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { IChainService } from './base';
import {
  ChainType,
  DepositRequest,
  ProofOfLifeRequest,
  WithdrawRequest,
  ClaimRequest,
  GetDepositRequest,
  TransactionResponse,
  DepositInfoResponse,
  DepositAccount,
  DepositState,
} from '../../../shared/types';

export class SolanaService implements IChainService {
  private connection: Connection;
  private programId: PublicKey;
  private network: string;

  constructor(rpcUrl: string, programId: string, network: string = 'devnet') {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.programId = new PublicKey(programId);
    this.network = network;
  }

  getChainType(): string {
    return ChainType.SOLANA;
  }

  // Helper: Derive deposit PDA
  private deriveDepositPDA(depositor: string, depositSeed: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('deposit'),
        new PublicKey(depositor).toBuffer(),
        Buffer.from(depositSeed),
      ],
      this.programId
    );
  }

  // Helper: Derive deposit token account PDA
  private deriveTokenAccountPDA(depositPDA: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('token_account'), depositPDA.toBuffer()],
      this.programId
    );
  }

  async createDeposit(request: DepositRequest): Promise<TransactionResponse> {
    try {
      const { depositor, receiver, tokenAddress, amount, timeoutSeconds } = request;

      // Validate inputs
      if (!depositor || !receiver || !tokenAddress || BigInt(amount) <= 0n || timeoutSeconds <= 0) {
        return {
          success: false,
          chain: ChainType.SOLANA,
          error: 'Invalid input parameters',
        };
      }

      const depositorPubkey = new PublicKey(depositor);
      const receiverPubkey = new PublicKey(receiver);
      const tokenMintPubkey = new PublicKey(tokenAddress);

      // Generate deposit seed (using current timestamp)
      const depositSeed = `${Date.now()}`;

      // Derive PDAs
      const [depositPDA] = this.deriveDepositPDA(depositor, depositSeed);
      const [tokenAccountPDA] = this.deriveTokenAccountPDA(depositPDA);

      // Build instruction data
      const instructionData = Buffer.alloc(1 + 32 + 8 + 8);
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
          { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: true }, // Placeholder for user's ATA
          { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
          { pubkey: tokenMintPubkey, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data: instructionData,
      });

      return {
        success: true,
        chain: ChainType.SOLANA,
        depositId: depositSeed,
        data: {
          programId: this.programId.toBase58(),
          keys: instruction.keys.map(k => ({
            pubkey: k.pubkey.toBase58(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          instructionData: instructionData.toString('base64'),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        chain: ChainType.SOLANA,
        error: error.message || 'Failed to create deposit instruction',
      };
    }
  }

  async createProofOfLife(request: ProofOfLifeRequest): Promise<TransactionResponse> {
    try {
      const { depositId, depositor } = request;

      if (!depositId || !depositor) {
        return {
          success: false,
          chain: ChainType.SOLANA,
          error: 'Invalid input parameters',
        };
      }

      const depositorPubkey = new PublicKey(depositor);
      const [depositPDA] = this.deriveDepositPDA(depositor, depositId);

      // Build instruction data
      const instructionData = Buffer.alloc(1 + 4 + depositId.length);
      instructionData.writeUInt8(1, 0); // Instruction type: ProofOfLife = 1
      instructionData.writeUInt32LE(depositId.length, 1);
      instructionData.write(depositId, 5);

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: depositorPubkey, isSigner: true, isWritable: false },
          { pubkey: depositPDA, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data: instructionData,
      });

      return {
        success: true,
        chain: ChainType.SOLANA,
        depositId,
        data: {
          programId: this.programId.toBase58(),
          keys: instruction.keys.map(k => ({
            pubkey: k.pubkey.toBase58(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          instructionData: instructionData.toString('base64'),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        chain: ChainType.SOLANA,
        error: error.message || 'Failed to create proof-of-life instruction',
      };
    }
  }

  async createWithdraw(request: WithdrawRequest): Promise<TransactionResponse> {
    try {
      const { depositId, depositor } = request;

      if (!depositId || !depositor) {
        return {
          success: false,
          chain: ChainType.SOLANA,
          error: 'Invalid input parameters',
        };
      }

      const depositorPubkey = new PublicKey(depositor);
      const [depositPDA] = this.deriveDepositPDA(depositor, depositId);
      const [tokenAccountPDA] = this.deriveTokenAccountPDA(depositPDA);

      // Build instruction data
      const instructionData = Buffer.alloc(1 + 4 + depositId.length);
      instructionData.writeUInt8(2, 0); // Instruction type: Withdraw = 2
      instructionData.writeUInt32LE(depositId.length, 1);
      instructionData.write(depositId, 5);

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: depositorPubkey, isSigner: true, isWritable: false },
          { pubkey: depositPDA, isSigner: false, isWritable: true },
          { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: true }, // Placeholder
          { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data: instructionData,
      });

      return {
        success: true,
        chain: ChainType.SOLANA,
        depositId,
        data: {
          programId: this.programId.toBase58(),
          keys: instruction.keys.map(k => ({
            pubkey: k.pubkey.toBase58(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          instructionData: instructionData.toString('base64'),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        chain: ChainType.SOLANA,
        error: error.message || 'Failed to create withdraw instruction',
      };
    }
  }

  async createClaim(request: ClaimRequest): Promise<TransactionResponse> {
    try {
      const { depositId, receiver, depositor } = request;

      if (!depositId || !receiver || !depositor) {
        return {
          success: false,
          chain: ChainType.SOLANA,
          error: 'Invalid input parameters',
        };
      }

      const receiverPubkey = new PublicKey(receiver);
      const depositorPubkey = new PublicKey(depositor);
      const [depositPDA] = this.deriveDepositPDA(depositor, depositId);
      const [tokenAccountPDA] = this.deriveTokenAccountPDA(depositPDA);

      // Build instruction data
      const instructionData = Buffer.alloc(1 + 4 + depositId.length);
      instructionData.writeUInt8(3, 0); // Instruction type: Claim = 3
      instructionData.writeUInt32LE(depositId.length, 1);
      instructionData.write(depositId, 5);

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: receiverPubkey, isSigner: true, isWritable: false },
          { pubkey: depositPDA, isSigner: false, isWritable: true },
          { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: true }, // Placeholder
          { pubkey: tokenAccountPDA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data: instructionData,
      });

      return {
        success: true,
        chain: ChainType.SOLANA,
        depositId,
        data: {
          programId: this.programId.toBase58(),
          keys: instruction.keys.map(k => ({
            pubkey: k.pubkey.toBase58(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          instructionData: instructionData.toString('base64'),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        chain: ChainType.SOLANA,
        error: error.message || 'Failed to create claim instruction',
      };
    }
  }

  async getDeposit(request: GetDepositRequest): Promise<DepositInfoResponse> {
    try {
      const { depositId, depositor } = request;

      if (!depositId || !depositor) {
        return { success: false, error: 'Invalid input parameters' };
      }

      const [depositPDA] = this.deriveDepositPDA(depositor, depositId);
      const accountInfo = await this.connection.getAccountInfo(depositPDA);

      if (!accountInfo) {
        return { success: false, error: 'Deposit not found' };
      }

      // Parse the account data
      const data = accountInfo.data;
      const depositorPubkey = new PublicKey(data.slice(0, 32)).toBase58();
      const receiverPubkey = new PublicKey(data.slice(32, 64)).toBase58();
      const tokenMintPubkey = new PublicKey(data.slice(64, 96)).toBase58();
      const amount = data.readBigUInt64LE(96).toString();
      const lastProofTimestamp = Number(data.readBigInt64LE(104));
      const timeoutSeconds = Number(data.readBigUInt64LE(112));
      const isClosed = data.readUInt8(121) === 1;

      const now = Math.floor(Date.now() / 1000);
      const elapsed = now - lastProofTimestamp;
      const isExpired = elapsed >= timeoutSeconds;

      return {
        success: true,
        deposit: {
          depositor: depositorPubkey,
          receiver: receiverPubkey,
          tokenAddress: tokenMintPubkey,
          amount,
          lastProofTimestamp,
          timeoutSeconds,
          isClosed,
          depositId,
        },
        elapsed,
        isExpired,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to fetch deposit',
      };
    }
  }

  async getUserDeposits(user: string): Promise<DepositInfoResponse> {
    try {
      const userPubkey = new PublicKey(user);

      // Get all accounts owned by the program
      const accounts = await this.connection.getProgramAccounts(this.programId);

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
          const amount = data.readBigUInt64LE(96).toString();
          const lastProofTimestamp = Number(data.readBigInt64LE(104));
          const timeoutSeconds = Number(data.readBigUInt64LE(112));
          const isClosed = data.readUInt8(121) === 1;
          const depositId = account.pubkey.toBase58(); // Use PDA as deposit ID

          const now = Math.floor(Date.now() / 1000);
          const elapsed = now - lastProofTimestamp;
          const isExpired = elapsed >= timeoutSeconds;

          return {
            depositor,
            receiver,
            tokenAddress: tokenMint,
            amount,
            lastProofTimestamp,
            timeoutSeconds,
            isClosed,
            depositId,
            elapsed,
            isExpired,
          } as DepositAccount;
        });

      return {
        success: true,
        deposit: userDeposits[0], // For backwards compatibility
        deposits: userDeposits,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to fetch deposits',
      };
    }
  }

  async getHealth(): Promise<{ status: string; network: string; endpoint: string }> {
    return {
      status: 'ok',
      network: this.network,
      endpoint: this.connection.rpcEndpoint,
    };
  }
}
