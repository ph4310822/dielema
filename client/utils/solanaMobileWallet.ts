import { Platform, NativeModules } from 'react-native';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import Constants from 'expo-constants';
import { BUILD_CONFIG } from '../config/buildConfig';

// Import MWA - uses the real module in dev builds
let mwaModule: any = null;
try {
  mwaModule = require('@solana-mobile/mobile-wallet-adapter-protocol-web3js');
  // #region agent log
  console.log('[MobileWallet] DEBUG: MWA module loaded, keys:', mwaModule ? Object.keys(mwaModule) : null, '__isMwaStub:', mwaModule?.__isMwaStub);
  // #endregion
} catch (e) {
  console.log('[MobileWallet] MWA module not available');
}

// App identity for Mobile Wallet Adapter
const APP_IDENTITY = {
  name: 'Dielema',
  uri: 'https://dielema.app',
  icon: 'favicon.ico',
};

// Store the authorized wallet public key
let authorizedPublicKey: PublicKey | null = null;

// Mobile Wallet Adapter module reference
let mwaTransact: any = null;
let mwaChecked = false;
let mwaAvailable = false;

// Check if we're in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

// Check if native MWA module exists (only available in dev builds)
function checkNativeModuleExists(): boolean {
  try {
    // This is a safe check that won't throw
    return !!NativeModules?.SolanaMobileWalletAdapter;
  } catch {
    return false;
  }
}

/**
 * Try to get the MWA transact function
 * Returns null if not available (Expo Go, iOS, Web, etc.)
 */
function getMWATransact(): any | null {
  if (mwaChecked) {
    return mwaTransact;
  }
  
  mwaChecked = true;
  
  // Only available on Android
  if (!BUILD_CONFIG.isAndroid) {
    console.log('[MobileWallet] Not on Android, MWA skipped');
    mwaAvailable = false;
    return null;
  }
  
  // In Expo Go, native modules aren't available
  if (isExpoGo) {
    console.log('[MobileWallet] Expo Go detected, MWA not available');
    console.log('[MobileWallet] Create a development build to use Mobile Wallet Adapter');
    mwaAvailable = false;
    return null;
  }
  
  // Check if native module is registered
  const nativeModuleExists = checkNativeModuleExists();
  if (!nativeModuleExists) {
    console.log('[MobileWallet] Native module not found');
    mwaAvailable = false;
    return null;
  }
  
  // Use the pre-imported module (Metro substitutes stub in Expo Go, real module in dev builds)
  try {
    if (mwaModule && mwaModule.transact && typeof mwaModule.transact === 'function') {
      mwaTransact = mwaModule.transact;
      mwaAvailable = true;
      console.log('[MobileWallet] Mobile Wallet Adapter ready');
      return mwaTransact;
    } else {
      // Stub module or invalid module
      console.log('[MobileWallet] MWA module is stub or invalid');
      mwaAvailable = false;
      return null;
    }
  } catch (error: any) {
    console.log('[MobileWallet] Failed to load MWA:', error?.message);
    mwaAvailable = false;
    return null;
  }
}

/**
 * Check if Mobile Wallet Adapter is available
 */
export async function isMobileWalletAdapterAvailable(): Promise<boolean> {
  getMWATransact();
  return mwaAvailable;
}

/**
 * Check if we should use Mobile Wallet Adapter (sync)
 */
export function shouldUseMobileWalletAdapter(): boolean {
  return BUILD_CONFIG.shouldUseMobileWalletAdapter && mwaAvailable;
}

/**
 * Connect using Solana Mobile Wallet Adapter
 */
export async function connectMobileWallet(): Promise<string> {
  console.log('[MobileWallet] Connecting...');
  
  const transact = getMWATransact();
  if (!transact) {
    throw new Error(
      'Mobile Wallet Adapter is not available.\n\n' +
      'You are running in Expo Go which doesn\'t support native modules.\n\n' +
      'Options:\n' +
      '• Create a development build: npx expo run:android\n' +
      '• Test on web instead: npx expo start --web'
    );
  }
  
  // #region agent log
  console.log('[MobileWallet] DEBUG: Before transact(), transact type:', typeof transact, 'mwaModule keys:', mwaModule ? Object.keys(mwaModule) : null);
  // #endregion
  
  let authResult: any;
  try {
    authResult = await transact(async (wallet: any) => {
      // #region agent log
      console.log('[MobileWallet] DEBUG: Inside transact callback, wallet type:', typeof wallet, 'wallet keys:', wallet ? Object.keys(wallet) : null);
      // #endregion
      
      const result = await wallet.authorize({
        cluster: 'devnet',
        identity: APP_IDENTITY,
      });
      
      // #region agent log
      console.log('[MobileWallet] DEBUG: After authorize, result keys:', result ? Object.keys(result) : null, 'hasAccounts:', !!result?.accounts);
      // #endregion
      
      return result;
    });
  } catch (transactError: any) {
    // #region agent log
    console.log('[MobileWallet] DEBUG: transact() error:', transactError?.message, 'stack:', transactError?.stack?.substring?.(0, 500));
    // #endregion
    throw transactError;
  }
  
  // #region agent log
  console.log('[MobileWallet] DEBUG: authResult received, keys:', authResult ? Object.keys(authResult) : null, 'accounts:', authResult?.accounts?.length);
  console.log('[MobileWallet] DEBUG: first account:', authResult?.accounts?.[0]);
  console.log('[MobileWallet] DEBUG: first account keys:', authResult?.accounts?.[0] ? Object.keys(authResult.accounts[0]) : null);
  // #endregion
  
  // MWA returns 'address' (base64 encoded), not 'publicKey'
  const addressBase64 = authResult.accounts[0].address;
  // #region agent log
  console.log('[MobileWallet] DEBUG: addressBase64:', addressBase64, 'type:', typeof addressBase64);
  // #endregion
  
  // Decode base64 to bytes
  const publicKeyBytes = Uint8Array.from(atob(addressBase64), c => c.charCodeAt(0));
  // #region agent log
  console.log('[MobileWallet] DEBUG: publicKeyBytes decoded, length:', publicKeyBytes.length, 'isUint8Array:', publicKeyBytes instanceof Uint8Array);
  // #endregion
  
  try {
    authorizedPublicKey = new PublicKey(publicKeyBytes);
    // #region agent log
    console.log('[MobileWallet] DEBUG: PublicKey created successfully:', authorizedPublicKey?.toBase58());
    // #endregion
  } catch (pkError: any) {
    // #region agent log
    console.log('[MobileWallet] DEBUG: PublicKey constructor error:', pkError?.message, 'stack:', pkError?.stack?.substring?.(0, 300));
    // #endregion
    throw pkError;
  }
  
  const address = authorizedPublicKey.toBase58();
  console.log('[MobileWallet] Connected:', address);
  
  return address;
}

/**
 * Get connected wallet address
 */
export function getMobileWalletAddress(): string | null {
  return authorizedPublicKey?.toBase58() || null;
}

/**
 * Check if connected via MWA
 */
export function isMobileWalletConnected(): boolean {
  return authorizedPublicKey !== null;
}

/**
 * Disconnect wallet
 */
export function disconnectMobileWallet(): void {
  authorizedPublicKey = null;
  console.log('[MobileWallet] Disconnected');
}

/**
 * Sign and send transaction
 */
export async function signAndSendMobileTransaction(
  transaction: Transaction | VersionedTransaction
): Promise<string> {
  if (!authorizedPublicKey) {
    throw new Error('Wallet not connected');
  }
  
  const transact = getMWATransact();
  if (!transact) {
    throw new Error('Mobile Wallet Adapter not available');
  }
  
  const result = await transact(async (wallet: any) => {
    await wallet.authorize({
      cluster: 'devnet',
      identity: APP_IDENTITY,
    });
    
    const signed = await wallet.signAndSendTransactions({
      transactions: [transaction],
    });
    
    return signed[0];
  });
  
  const signature = typeof result === 'string' 
    ? result 
    : Buffer.from(result).toString('base64');
  
  console.log('[MobileWallet] Transaction sent:', signature);
  return signature;
}

/**
 * Sign transaction without sending
 */
export async function signMobileTransaction(
  transaction: Transaction | VersionedTransaction
): Promise<Transaction | VersionedTransaction> {
  if (!authorizedPublicKey) {
    throw new Error('Wallet not connected');
  }
  
  const transact = getMWATransact();
  if (!transact) {
    throw new Error('Mobile Wallet Adapter not available');
  }
  
  const result = await transact(async (wallet: any) => {
    await wallet.authorize({
      cluster: 'devnet',
      identity: APP_IDENTITY,
    });
    
    const signed = await wallet.signTransactions({
      transactions: [transaction],
    });
    
    return signed[0];
  });
  
  return result;
}

/**
 * Sign a message
 */
export async function signMobileMessage(message: Uint8Array): Promise<Uint8Array> {
  if (!authorizedPublicKey) {
    throw new Error('Wallet not connected');
  }
  
  const transact = getMWATransact();
  if (!transact) {
    throw new Error('Mobile Wallet Adapter not available');
  }
  
  const result = await transact(async (wallet: any) => {
    await wallet.authorize({
      cluster: 'devnet',
      identity: APP_IDENTITY,
    });
    
    const signed = await wallet.signMessages({
      addresses: [authorizedPublicKey!.toBytes()],
      payloads: [message],
    });
    
    return signed[0];
  });
  
  return result;
}

export default {
  isMobileWalletAdapterAvailable,
  shouldUseMobileWalletAdapter,
  connectMobileWallet,
  getMobileWalletAddress,
  isMobileWalletConnected,
  disconnectMobileWallet,
  signAndSendMobileTransaction,
  signMobileTransaction,
  signMobileMessage,
};
