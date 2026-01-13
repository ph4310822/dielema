export type Chain = 'bsc' | 'solana' | 'ethereum';
export type Network = 'mainnet' | 'testnet' | 'devnet';

export interface Deposit {
  depositIndex: number;
  depositor: string;
  receiver: string;
  tokenAddress: string;
  amount: string;
  lastProofTimestamp: number;
  timeoutSeconds: number;
  isClosed: boolean;
  elapsed?: number;
  isExpired?: boolean;
  decimals?: number; // Token decimals for proper amount display
  tokenSymbol?: string; // Token symbol for display
  depositSeed?: string; // Original deposit seed for Solana operations (proof of life, withdraw, claim)
  depositAddress?: string; // Deposit PDA address for Solana
}
