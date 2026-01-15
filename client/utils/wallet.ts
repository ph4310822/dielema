import { Connection, PublicKey, clusterApiUrl, Transaction } from '@solana/web3.js';
import { Chain, Network } from '../types';
import {
  isMobileWalletAdapterAvailable,
  connectMobileWallet,
  getMobileWalletAddress,
  isMobileWalletConnected,
  disconnectMobileWallet,
  signAndSendMobileTransaction,
  signTransaction as signTransactionWrapper,
} from './solanaMobileWallet';
import { BUILD_CONFIG } from '../config/buildConfig';

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
  // #region agent log
  fetch('http://127.0.0.1:7247/ingest/41be2666-eece-4516-8405-3624718a9213',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'wallet.ts:108',message:'formatAddress called',data:{address,addressType:typeof address,chain},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
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
 * Connect to Solana wallet
 * On Android (dev build): Uses Solana Mobile Wallet Adapter
 * On Android (Expo Go) / Web / iOS: Uses Phantom browser extension or deeplink
 */
export async function connectSolanaWallet(): Promise<string> {
  console.log('[wallet] connectSolanaWallet called');
  console.log('[wallet] Platform:', BUILD_CONFIG.isAndroid ? 'Android' : BUILD_CONFIG.isIOS ? 'iOS' : 'Web');
  
  // Check if Mobile Wallet Adapter is available (Android dev build only)
  if (BUILD_CONFIG.isAndroid) {
    const mwaAvailable = await isMobileWalletAdapterAvailable();
    if (mwaAvailable) {
      console.log('[wallet] Using Mobile Wallet Adapter (Android dev build)');
      return connectMobileWallet();
    }
    console.log('[wallet] Mobile Wallet Adapter not available, falling back to deeplink/browser');
  }
  
  // Use browser extension (Phantom) on web, or deeplink on mobile
  console.log('[wallet] Using browser wallet (Phantom)');
  
  if (typeof window === 'undefined') {
    // On native without MWA, we can't connect via window.solana
    // For Expo Go, show a helpful message
    if (BUILD_CONFIG.isAndroid || BUILD_CONFIG.isIOS) {
      throw new Error(
        'Mobile Wallet Adapter not available in Expo Go.\n\n' +
        'To test on mobile:\n' +
        '1. Create a development build: npx expo run:android\n' +
        '2. Or test on web: npx expo start --web'
      );
    }
    throw new Error('Window object not available');
  }

  const provider = (window as any).solana;
  console.log('[wallet] Solana provider:', provider ? 'found' : 'not found');
  console.log('[wallet] isPhantom:', provider?.isPhantom);

  // Guard against undefined provider
  if (!provider) {
    if (BUILD_CONFIG.isAndroid || BUILD_CONFIG.isIOS) {
      // On mobile, window.solana won't exist even in dev builds
      // Provide guidance on how to connect
      throw new Error(
        'No Solana wallet found.\n\n' +
        'On Android/iOS, you have two options:\n\n' +
        '1. Use Phantom Wallet App:\n' +
        '   • Install Phantom from app store\n' +
        '   • Open this URL in Phantom: ' + (typeof window !== 'undefined' ? window.location.href : 'your app URL') + '\n\n' +
        '2. Use Mobile Wallet Adapter:\n' +
        '   • Currently not available in this build\n' +
        '   • Requires native Android module setup\n\n' +
        '3. For development:\n' +
        '   • Test on web: npx expo start --web\n' +
        '   • Install Phantom browser extension'
      );
    }
    throw new Error('No Solana wallet found. Please install Phantom wallet extension.');
  }

  console.log('[wallet] Calling provider.connect()...');
  const response = await provider.connect();
  console.log('[wallet] Connect response:', response);

  // #region agent log
  fetch('http://127.0.0.1:7247/ingest/41be2666-eece-4516-8405-3624718a9213',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'wallet.ts:337',message:'Phantom connect response',data:{response:JSON.stringify(response),hasPublicKey:!!response?.publicKey,publicKeyType:typeof response?.publicKey,publicKeyToString:response?.publicKey?.toString?.(),hasBn:!!(response?.publicKey as any)?._bn},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  const publicKey = response.publicKey.toString();
  console.log('[wallet] Public key:', publicKey);

  // #region agent log
  fetch('http://127.0.0.1:7247/ingest/41be2666-eece-4516-8405-3624718a9213',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'wallet.ts:345',message:'PublicKey extracted',data:{publicKey,publicKeyLength:publicKey?.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  return publicKey;
}

/**
 * Get current Solana wallet address
 */
export async function getSolanaWalletAddress(): Promise<string | null> {
  // Check Mobile Wallet Adapter first on Android
  if (BUILD_CONFIG.isAndroid && isMobileWalletConnected()) {
    const mobileAddress = getMobileWalletAddress();
    if (mobileAddress) {
      return mobileAddress;
    }
  }
  
  // Check browser extension (Phantom)
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
  // Disconnect Mobile Wallet Adapter on Android if connected
  if (BUILD_CONFIG.isAndroid && isMobileWalletConnected()) {
    disconnectMobileWallet();
    return;
  }
  
  // Disconnect browser extension (Phantom)
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
export async function sendSolanaTransaction(transaction: Transaction, network: Network = 'mainnet'): Promise<string> {
  // Use Mobile Wallet Adapter on Android if connected via MWA
  if (BUILD_CONFIG.isAndroid && isMobileWalletConnected()) {
    console.log('[wallet] Sending transaction via Mobile Wallet Adapter');
    return signAndSendMobileTransaction(transaction);
  }

  // Use browser extension (Phantom) on web/iOS
  if (typeof window === 'undefined') {
    throw new Error('Window object not available');
  }

  const provider = (window as any).solana;

  const connection = new Connection(getRpcUrl('solana', network), 'confirmed');

  console.log('[wallet] Sending transaction to Phantom...');

  // Get recent blockhash BEFORE signing (for confirmation timeout)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = provider.publicKey;

  // Log transaction info (basic validation)
  console.log('[wallet] Transaction instructions:', transaction.instructions.length);
  console.log('[wallet] Fee payer:', transaction.feePayer?.toBase58() || 'not set');
  console.log('[wallet] Blockhash:', transaction.recentBlockhash.slice(0, 8) + '...');

  // Step 1: Sign the transaction (without sending)
  console.log('[wallet] Requesting signature from wallet...');
  const signedTransaction = await signTransactionWrapper(transaction, provider);
  console.log('[wallet] Transaction signed successfully');

  // Step 2: Simulate the transaction to catch errors before broadcasting
  console.log('[wallet] Simulating transaction to check for errors...');
  try {
    // Simulate using the original unsigned transaction - this validates the instruction logic
    // The simulation will fail if there are account data issues (like old vs new program format)
    const simulation = await connection.simulateTransaction(transaction);

    if (simulation.value.err) {
      console.error('[wallet] ❌ Simulation FAILED! Transaction would fail if submitted.');
      console.error('[wallet] Error:', JSON.stringify(simulation.value.err, null, 2));
      console.error('[wallet] Logs:');
      simulation.value.logs?.forEach((log: string) => console.error('  ', log));

      // Provide helpful error message
      throw new Error(
        `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}\n\n` +
        `This usually means:\n` +
        `• The deposit was created with an OLD program version and needs to be withdrawn & recreated\n` +
        `• The account data is corrupted or invalid\n` +
        `• The instruction parameters are incorrect`
      );
    }

    console.log('[wallet] ✅ Simulation successful!');
    console.log('[wallet] Units consumed:', simulation.value.unitsConsumed);
  } catch (simError: any) {
    console.error('[wallet] ❌ Simulation error:', simError.message);
    throw new Error(`Transaction validation failed: ${simError.message}`);
  }

  // Step 3: Send the signed transaction to the network
  console.log('[wallet] Broadcasting signed transaction to network...');
  const signature = await connection.sendRawTransaction(signedTransaction.serialize());

  console.log('[wallet] Transaction submitted:', signature);
  console.log('[wallet] Waiting for confirmation...');

  // Wait for confirmation with timeout
  try {
    // Use the same blockhash we set before signing for confirmation
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      'confirmed'
    );

    console.log('[wallet] Confirmation result:', confirmation.value);

    if (confirmation.value.err) {
      console.error('[wallet] Transaction failed:', confirmation.value.err);
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('[wallet] Transaction confirmed successfully');
  } catch (error: any) {
    console.error('[wallet] Confirmation error:', error);

    // Check if transaction actually succeeded despite confirmation error
    const status = await connection.getSignatureStatus(signature);
    if (status.value && status.value.confirmationStatus) {
      console.log('[wallet] Transaction status from RPC:', status.value.confirmationStatus);
      if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
        console.log('[wallet] Transaction was confirmed despite error');
        return signature;
      }
    }

    throw error;
  }

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
