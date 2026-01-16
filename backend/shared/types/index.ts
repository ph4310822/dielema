/**
 * Shared types and interfaces for Dielemma multi-chain support
 *
 * These types are designed to work across:
 * - Solana (Rust program)
 * - BSC (Solidity contract)
 * - Other EVM chains (Ethereum, Polygon, etc.)
 * - Future: Solana (already implemented)
 */

/**
 * Supported blockchain networks
 */
export enum ChainType {
  SOLANA = 'solana',
  BSC = 'bsc',
  ETHEREUM = 'ethereum',
  POLYGON = 'polygon',
  ARBITRUM = 'arbitrum',
  BASE = 'base',
}

/**
 * Network environments
 */
export enum NetworkType {
  MAINNET = 'mainnet',
  TESTNET = 'testnet',
  DEVNET = 'devnet',
  LOCAL = 'local',
}

/**
 * Deposit state
 */
export enum DepositState {
  ACTIVE = 'active',
  WITHDRAWN = 'withdrawn',
  CLAIMED = 'claimed',
}

/**
 * Deposit account data structure (shared across chains)
 * This mirrors the on-chain state structure
 */
export interface DepositAccount {
  // Common fields (present in all chain implementations)
  depositor: string;           // Address of the depositor
  receiver: string;            // Address of the receiver
  amount: string;              // Amount deposited (as string to handle big numbers)
  lastProofTimestamp: number;  // Unix timestamp of last proof-of-life
  timeoutSeconds: number;      // Timeout period in seconds

  // Chain-specific fields
  tokenAddress?: string;       // Token address (EVM chains) or Token mint (Solana)
  depositId?: string;          // Unique deposit identifier

  // State tracking
  isClosed: boolean;           // Whether tokens have been withdrawn/claimed

  // EVM-specific
  depositIndex?: number;       // Index in the deposits array (EVM)
  elapsed?: number;            // Time elapsed since last proof
  isExpired?: boolean;         // Whether proof-of-life has expired
}

/**
 * Deposit request (client -> backend)
 */
export interface DepositRequest {
  chain: ChainType;
  network?: NetworkType;
  depositor: string;
  receiver: string;
  tokenAddress: string;
  amount: string;
  timeoutSeconds: number;
}

/**
 * Proof of life request
 */
export interface ProofOfLifeRequest {
  chain: ChainType;
  network?: NetworkType;
  depositId: string;           // Unique deposit identifier
  depositor: string;           // Must be the depositor
  // EVM specific
  depositIndex?: number;       // Deposit index for EVM chains
}

/**
 * Withdraw request
 */
export interface WithdrawRequest {
  chain: ChainType;
  network?: NetworkType;
  depositId: string;
  depositor: string;
  depositIndex?: number;       // Deposit index for EVM chains
}

/**
 * Claim request
 */
export interface ClaimRequest {
  chain: ChainType;
  network?: NetworkType;
  depositId: string;
  receiver: string;            // Must be the receiver
  depositIndex?: number;       // Deposit index for EVM chains
  depositor?: string;          // Solana requires depositor address to derive PDA
}

/**
 * Get deposit info request
 */
export interface GetDepositRequest {
  chain: ChainType;
  network?: NetworkType;
  depositId: string;
  depositIndex?: number;
  depositor?: string;          // Solana requires depositor address to derive PDA
}

/**
 * Deposit info response
 */
export interface DepositInfoResponse {
  success: boolean;
  deposit?: DepositAccount;
  deposits?: DepositAccount[]; // Multiple deposits (for getUserDeposits)
  elapsed?: number;            // Time elapsed since last proof
  isExpired?: boolean;         // Whether proof-of-life has expired
  error?: string;
}

/**
 * Transaction/instruction response
 * Used for both Solana instructions and EVM transactions
 */
export interface TransactionResponse {
  success: boolean;
  chain: ChainType;
  data?: {
    // EVM-specific
    to?: string;               // Contract address
    data?: string;             // Transaction data (hex)
    value?: string;            // Native token amount to send
    gasEstimate?: string;      // Estimated gas

    // Solana-specific
    programId?: string;        // Program ID
    keys?: Array<{
      pubkey: string;
      isSigner: boolean;
      isWritable: boolean;
    }>;
    instructionData?: string;  // Base64 encoded instruction data
  };
  depositId?: string;
  depositIndex?: number;
  error?: string;
}

/**
 * Chain configuration
 */
export interface ChainConfig {
  chain: ChainType;
  chainId: number;             // EVM chain ID or 0 for Solana
  rpcUrls: {
    mainnet?: string;
    testnet?: string;
    devnet?: string;
    local?: string;
  };
  programId?: string;          // Solana program ID
  contractAddress?: {          // EVM contract address
    mainnet?: string;
    testnet?: string;
    local?: string;
  };
  officialTokenAddress?: {     // Official token address for proof-of-life burning (EVM chains)
    mainnet?: string;
    testnet?: string;
    local?: string;
  };
  blockExplorer?: {
    mainnet?: string;
    testnet?: string;
  };
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

/**
 * Get latest blockhash request
 */
export interface GetBlockhashRequest {
  chain: ChainType;
  network?: NetworkType;
}

/**
 * Get latest blockhash response
 */
export interface BlockhashResponse {
  success: boolean;
  blockhash?: string;
  lastValidBlockHeight?: number;
  error?: string;
}

/**
 * Get token balances request
 */
export interface GetTokenBalancesRequest {
  chain: ChainType;
  network?: NetworkType;
  walletAddress: string;
}

/**
 * Token balance info
 */
export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
  balanceRaw: string;
  uiAmount: string;
  logoURI?: string;
  isNative?: boolean;
}

/**
 * Get token balances response
 */
export interface TokenBalancesResponse {
  success: boolean;
  balances?: TokenBalance[];
  error?: string;
}

/**
 * Get claimable deposits request
 */
export interface GetClaimableRequest {
  chain: ChainType;
  network?: NetworkType;
  receiverAddress: string;
}

/**
 * Chain configurations map
 */
export const CHAIN_CONFIGS: Record<ChainType, ChainConfig> = {
  [ChainType.SOLANA]: {
    chain: ChainType.SOLANA,
    chainId: 0,
    rpcUrls: {
      mainnet: 'https://api.mainnet-beta.solana.com',
      testnet: 'https://api.testnet.solana.com',
      devnet: 'https://api.devnet.solana.com',
      local: 'http://localhost:8899',
    },
    programId: '3uT7JEnRZ4pc4bwYvJ9PHsw579YLfNBr3xQvTiXBkGyC',
    nativeCurrency: {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9,
    },
  },
  [ChainType.BSC]: {
    chain: ChainType.BSC,
    chainId: 56,
    rpcUrls: {
      mainnet: 'https://bsc-dataseed.binance.org',
      testnet: 'https://bsc-testnet-rpc.publicnode.com',
      local: 'http://localhost:8545',
    },
    contractAddress: {
      mainnet: '', // To be filled after deployment
      testnet: '0xa23453F2bC8d23a8162fB7d61C2E62c79A2C2837', // Deployed 2025-01-11 with token burning
      local: '',
    },
    officialTokenAddress: {
      mainnet: '', // To be filled after deployment
      testnet: '0x11443f26414Cf3990dD6BD051dEBa4428164a799', // DLM token - Deployed 2025-01-11
      local: '',
    },
    blockExplorer: {
      mainnet: 'https://bscscan.com',
      testnet: 'https://testnet.bscscan.com',
    },
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
  },
  [ChainType.ETHEREUM]: {
    chain: ChainType.ETHEREUM,
    chainId: 1,
    rpcUrls: {
      mainnet: 'https://eth.llamarpc.com',
      testnet: 'https://sepolia.infura.io/v3/',
      local: 'http://localhost:8545',
    },
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  [ChainType.POLYGON]: {
    chain: ChainType.POLYGON,
    chainId: 137,
    rpcUrls: {
      mainnet: 'https://polygon-rpc.com',
      testnet: 'https://rpc-amoy.polygon.technology',
      local: 'http://localhost:8545',
    },
    nativeCurrency: {
      name: 'Polygon',
      symbol: 'MATIC',
      decimals: 18,
    },
  },
  [ChainType.ARBITRUM]: {
    chain: ChainType.ARBITRUM,
    chainId: 42161,
    rpcUrls: {
      mainnet: 'https://arb1.arbitrum.io/rpc',
      testnet: 'https://sepolia-rollup.arbitrum.io/rpc',
      local: 'http://localhost:8545',
    },
    nativeCurrency: {
      name: 'Arbitrum',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  [ChainType.BASE]: {
    chain: ChainType.BASE,
    chainId: 8453,
    rpcUrls: {
      mainnet: 'https://mainnet.base.org',
      testnet: 'https://sepolia.base.org',
      local: 'http://localhost:8545',
    },
    nativeCurrency: {
      name: 'Base',
      symbol: 'ETH',
      decimals: 18,
    },
  },
};
