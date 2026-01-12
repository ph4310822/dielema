import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Chain, Network } from '../types';

// ============ Type Definitions ============
export interface WalletConnection {
  address: string;
  chain: Chain;
  network: Network;
}

export interface EVMWalletState {
  isConnected: boolean;
  address: string | null;
}

export interface SolanaWalletState {
  isConnected: boolean;
  publicKey: PublicKey | null;
}

// ============ Chain Configuration ============
export const CHAIN_CONFIGS = {
  bsc: {
    testnet: { chainId: '0x61', chainName: 'BNB Smart Chain Testnet', rpcUrl: 'https://bsc-testnet-rpc.publicnode.com' },
    mainnet: { chainId: '0x38', chainName: 'BNB Smart Chain', rpcUrl: 'https://bsc-dataseed.binance.org' },
  },
  ethereum: {
    testnet: { chainId: '0xaa36a7', chainName: 'Sepolia Testnet', rpcUrl: 'https://rpc.sepolia.org' },
    mainnet: { chainId: '0x1', chainName: 'Ethereum Mainnet', rpcUrl: 'https://eth.llamarpc.com' },
  },
  solana: {
    devnet: { chainId: 'devnet', chainName: 'Solana Devnet', rpcUrl: clusterApiUrl('devnet') },
    mainnet: { chainId: 'mainnet-beta', chainName: 'Solana Mainnet', rpcUrl: clusterApiUrl('mainnet-beta') },
    testnet: { chainId: 'testnet', chainName: 'Solana Testnet', rpcUrl: clusterApiUrl('testnet') },
  },
};

// ============ Utility Functions ============
/**
 * Check if the chain is Solana
 */
export function isSolana(chain: Chain): boolean {
  return chain === 'solana';
}

/**
 * Check if the chain is EVM-based
 */
export function isEVM(chain: Chain): boolean {
  return chain === 'bsc' || chain === 'ethereum';
}

/**
 * Get the correct chain ID for the current chain and network
 */
export function getChainId(chain: Chain, network: Network): string {
  const config = CHAIN_CONFIGS[chain as keyof typeof CHAIN_CONFIGS];
  if (!config) return '0x1';

  const netConfig = config[network as keyof typeof config];
  return netConfig?.chainId || '0x1';
}

/**
 * Get RPC URL for the chain
 */
export function getRpcUrl(chain: Chain, network: Network): string {
  const config = CHAIN_CONFIGS[chain as keyof typeof CHAIN_CONFIGS];
  if (!config) return '';

  const netConfig = config[network as keyof typeof config];
  return netConfig?.rpcUrl || '';
}

/**
 * Validate address format based on chain
 */
export function isValidAddress(address: string, chain: Chain): boolean {
  if (isEVM(chain)) {
    // EVM addresses start with 0x and are 42 characters
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  } else if (isSolana(chain)) {
    // Solana addresses are base58 encoded, typically 32-44 characters
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Format address for display
 */
export function formatAddress(address: string, chain: Chain): string {
  if (isEVM(chain)) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  } else if (isSolana(chain)) {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }
  return address;
}

/**
 * Get token symbol for the chain
 */
export function getTokenSymbol(chain: Chain): string {
  switch (chain) {
    case 'bsc':
      return 'BNB';
    case 'ethereum':
      return 'ETH';
    case 'solana':
      return 'SOL';
    default:
      return 'BNB';
  }
}

/**
 * Convert amount to smallest unit based on chain
 */
export function amountToSmallestUnit(amount: number, chain: Chain): string {
  if (isEVM(chain)) {
    // EVM chains use 18 decimals
    return (amount * 1e18).toString();
  } else if (isSolana(chain)) {
    // Solana uses 9 decimals (lamports)
    return (amount * 1e9).toString();
  }
  return amount.toString();
}

/**
 * Convert from smallest unit to base unit based on chain
 */
export function amountFromSmallestUnit(amount: string, chain: Chain): number {
  if (isEVM(chain)) {
    return parseFloat(amount) / 1e18;
  } else if (isSolana(chain)) {
    return parseFloat(amount) / 1e9;
  }
  return parseFloat(amount);
}

// ============ EVM Wallet Functions ============

/**
 * Connect to EVM wallet (MetaMask, OKX, etc.)
 */
export async function connectEVMWallet(): Promise<string> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No EVM wallet found. Please install MetaMask or OKX Wallet.');
  }

  const accounts = await (window as any).ethereum.request({
    method: 'eth_requestAccounts',
  });

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts found');
  }

  return accounts[0];
}

/**
 * Get current EVM wallet address
 */
export async function getEVMWalletAddress(): Promise<string | null> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    return null;
  }

  const accounts = await (window as any).ethereum.request({
    method: 'eth_accounts',
  });

  return accounts && accounts.length > 0 ? accounts[0] : null;
}

/**
 * Switch EVM wallet to specific network
 */
export async function switchEVMNetwork(chain: Chain, network: Network): Promise<void> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No EVM wallet found');
  }

  const chainId = getChainId(chain, network);

  try {
    await (window as any).ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    });
  } catch (switchError: any) {
    // This error code indicates that the chain has not been added to MetaMask
    if (switchError.code === 4902) {
      const config = CHAIN_CONFIGS[chain as keyof typeof CHAIN_CONFIGS];
      const netConfig = config[network as keyof typeof config];

      await (window as any).ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId,
          chainName: netConfig.chainName,
          nativeCurrency: {
            name: getTokenSymbol(chain),
            symbol: getTokenSymbol(chain),
            decimals: 18,
          },
          rpcUrls: [netConfig.rpcUrl],
          blockExplorerUrls: chain === 'bsc'
            ? network === 'testnet'
              ? ['https://testnet.bscscan.com']
              : ['https://bscscan.com']
            : network === 'testnet'
              ? ['https://sepolia.etherscan.io']
              : ['https://etherscan.io'],
        }],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Get current chain ID from EVM wallet
 */
export async function getEVMChainId(): Promise<string | null> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    return null;
  }

  try {
    const chainId = await (window as any).ethereum.request({ method: 'eth_chainId' });
    return chainId;
  } catch {
    return null;
  }
}

/**
 * Check if EVM wallet is on correct network
 */
export async function checkEVMNetwork(chain: Chain, network: Network): Promise<boolean> {
  const currentChainId = await getEVMChainId();
  const expectedChainId = getChainId(chain, network);
  return currentChainId === expectedChainId;
}

/**
 * Send transaction using EVM wallet
 */
export async function sendEVMTransaction(txParams: any): Promise<string> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No EVM wallet found');
  }

  const txHash = await (window as any).ethereum.request({
    method: 'eth_sendTransaction',
    params: [txParams],
  });

  return txHash;
}

// ============ Solana Wallet Functions ============

/**
 * Connect to Solana wallet (Phantom, etc.)
 */
export async function connectSolanaWallet(): Promise<string> {
  console.log('[wallet] connectSolanaWallet called');
  if (typeof window === 'undefined') {
    throw new Error('Window object not available');
  }

  const provider = (window as any).solana;
  console.log('[wallet] Solana provider:', provider ? 'found' : 'not found');
  console.log('[wallet] isPhantom:', provider?.isPhantom);

  if (!provider?.isPhantom) {
    throw new Error('No Solana wallet found. Please install Phantom wallet.');
  }

  console.log('[wallet] Calling provider.connect()...');
  const response = await provider.connect();
  console.log('[wallet] Connect response:', response);

  const publicKey = response.publicKey.toString();
  console.log('[wallet] Public key:', publicKey);

  return publicKey;
}

/**
 * Get current Solana wallet address
 */
export async function getSolanaWalletAddress(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const provider = (window as any).solana;

  if (!provider?.isPhantom) {
    return null;
  }

  try {
    if (provider.isConnected) {
      const publicKey = provider.publicKey?.toString();
      return publicKey || null;
    }
  } catch (error) {
    console.error('Error getting Solana wallet:', error);
  }

  return null;
}

/**
 * Disconnect Solana wallet
 */
export async function disconnectSolanaWallet(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const provider = (window as any).solana;

  if (!provider?.isPhantom) {
    return;
  }

  try {
    await provider.disconnect();
  } catch (error) {
    console.error('Error disconnecting Solana wallet:', error);
  }
}

/**
 * Send transaction using Solana wallet
 */
export async function sendSolanaTransaction(transaction: any): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Window object not available');
  }

  const provider = (window as any).solana;

  if (!provider?.isPhantom) {
    throw new Error('No Solana wallet found. Please install Phantom wallet.');
  }

  const connection = new Connection(getRpcUrl('solana', 'devnet'), 'confirmed');

  // Sign and send transaction
  const { signature } = await provider.signAndSendTransaction(transaction);

  // Wait for confirmation
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}

// ============ Unified Wallet Functions ============

/**
 * Connect to wallet based on chain
 */
export async function connectWallet(chain: Chain): Promise<string> {
  if (isSolana(chain)) {
    return connectSolanaWallet();
  } else {
    return connectEVMWallet();
  }
}

/**
 * Get current wallet address based on chain
 */
export async function getWalletAddress(chain: Chain): Promise<string | null> {
  if (isSolana(chain)) {
    return getSolanaWalletAddress();
  } else {
    return getEVMWalletAddress();
  }
}

/**
 * Check if wallet is on correct network
 */
export async function checkWalletNetwork(chain: Chain, network: Network): Promise<boolean> {
  if (isSolana(chain)) {
    // Solana wallets don't have network switching in the same way
    // We assume the user is on the correct network for the RPC URL they're using
    return true;
  } else {
    return checkEVMNetwork(chain, network);
  }
}

/**
 * Switch wallet to correct network if needed
 */
export async function ensureCorrectNetwork(chain: Chain, network: Network): Promise<void> {
  if (isSolana(chain)) {
    // Solana doesn't need network switching
    return;
  }

  const isCorrect = await checkEVMNetwork(chain, network);
  if (!isCorrect) {
    await switchEVMNetwork(chain, network);
  }
}
