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
}
