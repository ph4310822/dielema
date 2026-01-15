/**
 * Base interface for all chain implementations
 * This ensures consistent API across different blockchain networks
 */

import { DepositRequest, ProofOfLifeRequest, WithdrawRequest, ClaimRequest, GetDepositRequest, TransactionResponse, DepositInfoResponse, GetBlockhashRequest, BlockhashResponse, GetTokenBalancesRequest, TokenBalancesResponse, GetClaimableRequest } from '../../shared/types';

export interface IChainService {
  /**
   * Get chain type identifier
   */
  getChainType(): string;

  /**
   * Create a deposit transaction/instruction
   */
  createDeposit(request: DepositRequest): Promise<TransactionResponse>;

  /**
   * Create a proof-of-life transaction/instruction
   */
  createProofOfLife(request: ProofOfLifeRequest): Promise<TransactionResponse>;

  /**
   * Create a withdraw transaction/instruction
   */
  createWithdraw(request: WithdrawRequest): Promise<TransactionResponse>;

  /**
   * Create a claim transaction/instruction
   */
  createClaim(request: ClaimRequest): Promise<TransactionResponse>;

  /**
   * Get deposit information
   */
  getDeposit(request: GetDepositRequest): Promise<DepositInfoResponse>;

  /**
   * Get all deposits for a user
   */
  getUserDeposits(user: string): Promise<DepositInfoResponse>;

  /**
   * Get claimable deposits for a receiver
   */
  getClaimableDeposits(request: GetClaimableRequest): Promise<DepositInfoResponse>;

  /**
   * Get latest blockhash for transaction building
   */
  getLatestBlockhash(request: GetBlockhashRequest): Promise<BlockhashResponse>;

  /**
   * Get token balances for a wallet
   */
  getTokenBalances(request: GetTokenBalancesRequest): Promise<TokenBalancesResponse>;

  /**
   * Get health/status of the chain connection
   */
  getHealth(): Promise<{ status: string; network: string; endpoint: string }>;
}
