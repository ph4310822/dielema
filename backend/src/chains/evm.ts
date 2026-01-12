/**
 * EVM chain service implementation (BSC, Ethereum, Polygon, Arbitrum, Base, etc.)
 * Handles all EVM-specific blockchain interactions using ethers.js
 */

import { ethers, Contract } from 'ethers';
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
} from '../../shared/types';

// Dielemma ABI - only the functions we need
const DIELEMMA_ABI = [
  // Write functions
  'function deposit(address receiver, address token, uint256 amount, uint256 timeoutSeconds) payable returns (uint256)',
  'function proofOfLife(uint256 depositId) external',
  'function withdraw(uint256 depositId) external',
  'function claim(uint256 depositId) external',
  'function setOfficialToken(address newOfficialToken) external',

  // Read functions
  'function getDeposit(uint256 depositId) external view returns (tuple(address depositor, address receiver, address token, uint256 amount, uint256 lastProofTimestamp, uint256 timeoutSeconds, bool isClosed) deposit, uint256 elapsed, bool isExpired)',
  'function getUserDeposits(address user) external view returns (uint256[] memory)',
  'function getReceiverDeposits(address receiver) external view returns (uint256[] memory)',
  'function getTotalDeposits() external view returns (uint256)',
  'function getOfficialToken() external view returns (address tokenAddress)',
  'function deposits(uint256 depositId) external view returns (address depositor, address receiver, address token, uint256 amount, uint256 lastProofTimestamp, uint256 timeoutSeconds, bool isClosed)',
  'function officialToken() external view returns (address)',

  // Events
  'event Deposited(uint256 indexed depositId, address indexed depositor, address indexed receiver, address token, uint256 amount, uint256 timeoutSeconds)',
  'event ProofOfLife(uint256 indexed depositId, address indexed depositor, uint256 timestamp)',
  'event TokenBurned(uint256 indexed depositId, address indexed user, uint256 amount)',
  'event Withdrawn(uint256 indexed depositId, address indexed depositor, uint256 amount)',
  'event Claimed(uint256 indexed depositId, address indexed receiver, uint256 amount)',
  'event OfficialTokenUpdated(address indexed oldToken, address indexed newToken)',
];

export class EvmService implements IChainService {
  private provider: ethers.JsonRpcProvider;
  private contract: Contract;
  private contractAddress: string;
  private chainType: ChainType;
  private network: string;

  constructor(
    rpcUrl: string,
    contractAddress: string,
    chainType: ChainType,
    network: string = 'testnet'
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contractAddress = contractAddress;
    this.chainType = chainType;
    this.network = network;
    this.contract = new Contract(contractAddress, DIELEMMA_ABI, this.provider);
  }

  getChainType(): string {
    return this.chainType;
  }

  /**
   * Create a deposit transaction data
   * Returns the transaction data that the client can sign and send
   */
  async createDeposit(request: DepositRequest): Promise<TransactionResponse> {
    try {
      const { receiver, tokenAddress, amount, timeoutSeconds } = request;

      // Validate inputs
      if (!receiver || !tokenAddress || BigInt(amount) <= 0n || timeoutSeconds <= 0) {
        return {
          success: false,
          chain: this.chainType,
          error: 'Invalid input parameters',
        };
      }

      // Check if it's native token (zero address)
      const isNativeToken = tokenAddress === '0x0000000000000000000000000000000000000000' ||
                           tokenAddress === '0x0';

      // Encode the function call
      const iface = new ethers.Interface(DIELEMMA_ABI);
      const data = iface.encodeFunctionData('deposit', [
        receiver,
        tokenAddress,
        amount,
        timeoutSeconds,
      ]);

      // Estimate gas
      let gasEstimate: bigint;
      let value: string = '0';

      if (isNativeToken) {
        // For native token, we need to send the amount with the transaction
        try {
          gasEstimate = await this.contract.deposit.estimateGas(
            receiver,
            tokenAddress,
            amount,
            timeoutSeconds,
            { value: amount }
          );
          value = amount;
        } catch {
          // Fallback gas estimate
          gasEstimate = 200000n;
        }
      } else {
        // For ERC20 tokens
        try {
          gasEstimate = await this.contract.deposit.estimateGas(
            receiver,
            tokenAddress,
            amount,
            timeoutSeconds
          );
        } catch {
          // Fallback gas estimate
          gasEstimate = 150000n;
        }
      }

      return {
        success: true,
        chain: this.chainType,
        data: {
          to: this.contractAddress,
          data: data,
          value: value,
          gasEstimate: gasEstimate.toString(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        chain: this.chainType,
        error: error.message || 'Failed to create deposit transaction',
      };
    }
  }

  /**
   * Create a proof-of-life transaction data
   */
  async createProofOfLife(request: ProofOfLifeRequest): Promise<TransactionResponse> {
    try {
      const { depositIndex } = request;

      if (depositIndex === undefined) {
        return {
          success: false,
          chain: this.chainType,
          error: 'depositIndex is required for EVM chains',
        };
      }

      // Encode the function call
      const iface = new ethers.Interface(DIELEMMA_ABI);
      const data = iface.encodeFunctionData('proofOfLife', [depositIndex]);

      // Estimate gas
      let gasEstimate: bigint;
      try {
        gasEstimate = await this.contract.proofOfLife.estimateGas(depositIndex);
      } catch {
        gasEstimate = 50000n;
      }

      return {
        success: true,
        chain: this.chainType,
        depositIndex,
        data: {
          to: this.contractAddress,
          data: data,
          gasEstimate: gasEstimate.toString(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        chain: this.chainType,
        error: error.message || 'Failed to create proof-of-life transaction',
      };
    }
  }

  /**
   * Create a withdraw transaction data
   */
  async createWithdraw(request: WithdrawRequest): Promise<TransactionResponse> {
    try {
      const { depositIndex } = request;

      if (depositIndex === undefined) {
        return {
          success: false,
          chain: this.chainType,
          error: 'depositIndex is required for EVM chains',
        };
      }

      // Encode the function call
      const iface = new ethers.Interface(DIELEMMA_ABI);
      const data = iface.encodeFunctionData('withdraw', [depositIndex]);

      // Estimate gas
      let gasEstimate: bigint;
      try {
        gasEstimate = await this.contract.withdraw.estimateGas(depositIndex);
      } catch {
        gasEstimate = 100000n;
      }

      return {
        success: true,
        chain: this.chainType,
        depositIndex,
        data: {
          to: this.contractAddress,
          data: data,
          gasEstimate: gasEstimate.toString(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        chain: this.chainType,
        error: error.message || 'Failed to create withdraw transaction',
      };
    }
  }

  /**
   * Create a claim transaction data
   */
  async createClaim(request: ClaimRequest): Promise<TransactionResponse> {
    try {
      const { depositIndex } = request;

      if (depositIndex === undefined) {
        return {
          success: false,
          chain: this.chainType,
          error: 'depositIndex is required for EVM chains',
        };
      }

      // Encode the function call
      const iface = new ethers.Interface(DIELEMMA_ABI);
      const data = iface.encodeFunctionData('claim', [depositIndex]);

      // Estimate gas
      let gasEstimate: bigint;
      try {
        gasEstimate = await this.contract.claim.estimateGas(depositIndex);
      } catch {
        gasEstimate = 100000n;
      }

      return {
        success: true,
        chain: this.chainType,
        depositIndex,
        data: {
          to: this.contractAddress,
          data: data,
          gasEstimate: gasEstimate.toString(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        chain: this.chainType,
        error: error.message || 'Failed to create claim transaction',
      };
    }
  }

  /**
   * Get deposit information
   */
  async getDeposit(request: GetDepositRequest): Promise<DepositInfoResponse> {
    try {
      const { depositIndex } = request;

      if (depositIndex === undefined) {
        return { success: false, error: 'depositIndex is required for EVM chains' };
      }

      // Call the contract
      const result = await this.contract.getDeposit(depositIndex);

      const [deposit, elapsed, isExpired] = result;

      return {
        success: true,
        deposit: {
          depositor: deposit.depositor,
          receiver: deposit.receiver,
          tokenAddress: deposit.token,
          amount: deposit.amount.toString(),
          lastProofTimestamp: Number(deposit.lastProofTimestamp),
          timeoutSeconds: Number(deposit.timeoutSeconds),
          isClosed: deposit.isClosed,
          depositIndex,
        },
        elapsed: Number(elapsed),
        isExpired,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to fetch deposit',
      };
    }
  }

  /**
   * Get all deposits for a user
   */
  async getUserDeposits(user: string): Promise<DepositInfoResponse> {
    try {
      // Get all deposit indices for the user
      const depositIndices = await this.contract.getUserDeposits(user);

      // Fetch each deposit
      const deposits: DepositAccount[] = [];
      for (const index of depositIndices) {
        try {
          const result = await this.contract.getDeposit(index);
          const [deposit, elapsed, isExpired] = result;

          deposits.push({
            depositor: deposit.depositor,
            receiver: deposit.receiver,
            tokenAddress: deposit.token,
            amount: deposit.amount.toString(),
            lastProofTimestamp: Number(deposit.lastProofTimestamp),
            timeoutSeconds: Number(deposit.timeoutSeconds),
            isClosed: deposit.isClosed,
            depositIndex: Number(index),
            elapsed: Number(elapsed),
            isExpired,
          });
        } catch {
          // Skip failed deposits
          continue;
        }
      }

      return {
        success: true,
        deposit: deposits[0], // For backwards compatibility
        deposits,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to fetch deposits',
      };
    }
  }

  /**
   * Get health/status of the chain connection
   */
  async getHealth(): Promise<{ status: string; network: string; endpoint: string }> {
    try {
      const network = await this.provider.getNetwork();
      return {
        status: 'ok',
        network: this.network,
        endpoint: this.provider._getConnection().url,
      };
    } catch {
      return {
        status: 'error',
        network: this.network,
        endpoint: this.provider._getConnection().url,
      };
    }
  }
}
