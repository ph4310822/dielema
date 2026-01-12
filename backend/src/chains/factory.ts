/**
 * Chain service factory
 * Creates the appropriate chain service based on the chain type
 */

import { ChainType, CHAIN_CONFIGS, NetworkType } from '../../shared/types';
import { IChainService } from './base';
import { SolanaService } from './solana';
import { EvmService } from './evm';

export class ChainServiceFactory {
  /**
   * Get a chain service instance for the specified chain and network
   */
  static getService(chain: ChainType, network: NetworkType = NetworkType.TESTNET): IChainService {
    const config = CHAIN_CONFIGS[chain];

    if (!config) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    // Determine the RPC URL based on network
    const rpcUrl =
      network === NetworkType.MAINNET ? config.rpcUrls.mainnet :
      network === NetworkType.TESTNET ? config.rpcUrls.testnet :
      network === NetworkType.DEVNET ? config.rpcUrls.devnet :
      config.rpcUrls.local || '';

    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for ${chain} ${network}`);
    }

    // Get contract address or program ID
    const contractAddress =
      network === NetworkType.MAINNET ? config.contractAddress?.mainnet :
      network === NetworkType.TESTNET ? config.contractAddress?.testnet :
      config.contractAddress?.local || '';

    const programId = config.programId || '';

    // Create the appropriate service
    switch (chain) {
      case ChainType.SOLANA:
        if (!programId) {
          throw new Error('Solana program ID is required');
        }
        return new SolanaService(rpcUrl, programId, network);

      case ChainType.BSC:
      case ChainType.ETHEREUM:
      case ChainType.POLYGON:
      case ChainType.ARBITRUM:
      case ChainType.BASE:
        if (!contractAddress) {
          throw new Error(`Contract address is required for ${chain} ${network}`);
        }
        return new EvmService(rpcUrl, contractAddress, chain, network);

      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }
  }

  /**
   * Get all supported chains
   */
  static getSupportedChains(): ChainType[] {
    return Object.values(ChainType);
  }

  /**
   * Check if a chain is supported
   */
  static isSupported(chain: string): boolean {
    return Object.values(ChainType).includes(chain as ChainType);
  }
}
