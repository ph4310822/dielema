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
  uri: 'https://dielema.icu',
  icon: 'favicon.ico',
};

// Store the authorized wallet public key
let authorizedPublicKey: PublicKey | null = null;
// Store the auth token for subsequent operations
let authToken: string | null = null;

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
    const exists = !!NativeModules?.SolanaMobileWalletAdapter;
    console.log('[MobileWallet] Native module check:', exists ? '✅ Found' : '❌ Not found');
    return exists;
  } catch (error: any) {
    console.log('[MobileWallet] Native module check failed:', error?.message);
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
      // Check if this is explicitly marked as a stub
      if ((mwaModule as any).__isMwaStub) {
        console.log('[MobileWallet] MWA module is explicitly marked as stub');
        mwaAvailable = false;
        return null;
      }

      // If we have transact and native module exists, it's valid
      // Log module structure for debugging
      const moduleKeys = Object.keys(mwaModule);
      console.log('[MobileWallet] MWA module loaded with exports:', moduleKeys);
      console.log('[MobileWallet] Native module check passed, transact function available');

      mwaTransact = mwaModule.transact;
      mwaAvailable = true;
      console.log('[MobileWallet] ✅ Mobile Wallet Adapter available');
      return mwaTransact;
    } else {
      // Stub module or invalid module
      console.log('[MobileWallet] MWA module not found or transact function missing');
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
        cluster: 'mainnet-beta',
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

  // Save only the auth_token for subsequent operations
  authToken = authResult.auth_token;
  console.log('[MobileWallet] Auth token saved:', authToken?.substring(0, 20) + '...');

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
  authToken = null;
  console.log('[MobileWallet] Disconnected');
}

/**
 * Sign and send transaction
 * Uses signTransactions (sign only) then broadcasts ourselves
 */
export async function signAndSendMobileTransaction(
  transaction: Transaction | VersionedTransaction
): Promise<string> {
  console.log('[MobileWallet] signAndSendMobileTransaction called');
  console.log('[MobileWallet] authorizedPublicKey:', authorizedPublicKey?.toBase58() || 'null');

  if (!authorizedPublicKey) {
    throw new Error('Wallet not connected. Please connect your wallet first.');
  }

  const transact = getMWATransact();
  if (!transact) {
    throw new Error('Mobile Wallet Adapter not available');
  }

  console.log('[MobileWallet] Starting transact...');
  const signedTransaction = await transact(async (wallet: any) => {
    console.log('[MobileWallet] Inside transact callback');

    // Reauthorize if we have an auth token (session refresh)
    if (authToken) {
      try {
        console.log('[MobileWallet] Reauthorizing with existing token:', authToken.substring(0, 20) + '...');
        const reauthResult = await wallet.reauthorize({
          cluster: 'mainnet-beta',
          identity: APP_IDENTITY,
          auth_token: authToken,
        });
        console.log('[MobileWallet] Reauthorize successful, updating token');
        authToken = reauthResult.auth_token;
      } catch (reauthError: any) {
        console.log('[MobileWallet] Reauthorize failed (token may be expired):', reauthError?.message);
        // Fall through to authorize below
      }
    }

    // If reauthorize failed or we don't have a token, do fresh authorize
    if (!authToken) {
      try {
        console.log('[MobileWallet] Authorizing fresh session...');
        const authResult = await wallet.authorize({
          cluster: 'mainnet-beta',
          identity: APP_IDENTITY,
        });
        authToken = authResult.auth_token;
        console.log('[MobileWallet] New auth token saved:', authToken!.substring(0, 20) + '...');
      } catch (authError: any) {
        console.error('[MobileWallet] Authorize failed:', authError?.message);
        throw authError;
      }
    }

    console.log('[MobileWallet] About to call signTransactions');
    console.log('[MobileWallet] Transaction type:', transaction.constructor.name);
    console.log('[MobileWallet] Transaction instructions:', (transaction as any).instructions?.length);

    // Sign only (don't send)
    let signedTransactions;
    try {
      console.log('[MobileWallet] Calling wallet.signTransactions...');
      signedTransactions = await wallet.signTransactions({
        transactions: [transaction],
      });
      console.log('[MobileWallet] ✅ signTransactions completed');
    } catch (signError: any) {
      console.error('[MobileWallet] ❌ signTransactions failed:', signError?.message);
      console.error('[MobileWallet] Error details:', signError);
      throw signError;
    }

    console.log('[MobileWallet] signedTransactions type:', typeof signedTransactions);
    console.log('[MobileWallet] signedTransactions value:', signedTransactions);
    console.log('[MobileWallet] signedTransactions length:', signedTransactions?.length);

    if (!signedTransactions || signedTransactions.length === 0) {
      throw new Error('No signed transaction returned from wallet');
    }

    console.log('[MobileWallet] Returning signed transaction[0]');
    return signedTransactions[0];
  });

  console.log('[MobileWallet] ✅ Exiting transact block');
  console.log('[MobileWallet] signedTransaction type:', signedTransaction?.constructor?.name);
  console.log('[MobileWallet] signedTransaction:', signedTransaction);

  // Broadcast the signed transaction ourselves
  const { Connection } = await import('@solana/web3.js');

  // Use RPC endpoint from env variable or fallbacks
  // Priority: EXPO_PUBLIC_SOLANA_RPC_ENDPOINT -> Fallback endpoints
  const PRIMARY_RPC = process.env.EXPO_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
  // const PRIMARY_RPC = 'https://api.mainnet-beta.solana.com';

  const RPC_ENDPOINTS = [
    PRIMARY_RPC,
    'https://solana-api.projectserum.com',
    'https://rpc.ankr.com/solana',
  ];

  // Remove duplicates while preserving order
  const UNIQUE_ENDPOINTS = Array.from(new Set(RPC_ENDPOINTS));

  console.log('[MobileWallet] RPC endpoints configured:', UNIQUE_ENDPOINTS.length);
  console.log('[MobileWallet] Primary RPC:', PRIMARY_RPC);

  let connection: any = null;
  let lastError: any = null;

  // Try each RPC endpoint until one works
  for (const endpoint of UNIQUE_ENDPOINTS) {
    try {
      console.log('[MobileWallet] Trying RPC endpoint:', endpoint);
      connection = new Connection(endpoint, {
        commitment: 'confirmed',
        httpHeaders: {
          'Content-Type': 'application/json',
        },
        wsEndpoint: undefined, // Disable websocket for mobile
      });

      // Test the connection by getting a blockhash
      console.log('[MobileWallet] Testing connection...');
      await connection.getLatestBlockhash();
      console.log('[MobileWallet] ✅ Connection successful!');
      break; // This endpoint works, use it
    } catch (testError: any) {
      console.log('[MobileWallet] ❌ Endpoint failed:', testError?.message);
      lastError = testError;
      connection = null;
    }
  }

  if (!connection) {
    throw new Error(
      'Network request failed. Please check your internet connection and try again.\n\n' +
      'Error: ' + (lastError?.message || 'Cannot connect to Solana network')
    );
  }

  console.log('[MobileWallet] Broadcasting transaction to network...');

  let signature: string;
  try {
    // Serialize the signed transaction WITHOUT updating blockhash
    // The signature is tied to the original blockhash, changing it invalidates the signature
    console.log('[MobileWallet] Serializing signed transaction...');
    const serializedTx = signedTransaction.serialize();
    console.log('[MobileWallet] Serialized successfully, length:', serializedTx.length);

    // Send to network with preflight check
    console.log('[MobileWallet] Sending to Solana mainnet with simulation...');
    signature = await connection.sendRawTransaction(
      serializedTx,
      {
        skipPreflight: false,  // Run simulation first to catch errors
      }
    );
    console.log('[MobileWallet] ✅ Transaction sent successfully, signature:', signature);
  } catch (broadcastError: any) {
    console.error('[MobileWallet] ❌ Broadcast failed:', broadcastError?.message);
    console.error('[MobileWallet] Full error:', JSON.stringify(broadcastError, null, 2));

    // Parse simulation errors to provide helpful feedback
    if (broadcastError?.message?.includes('Transaction simulation failed')) {
      // Try to extract more details from the error
      const logs = broadcastError?.logs || [];
      console.error('[MobileWallet] Simulation logs:', logs);

      throw new Error(
        `Transaction simulation failed:\n${logs.join('\n')}\n\n` +
        `This usually means:\n` +
        `• Account data mismatch (old vs new program format)\n` +
        `• Insufficient funds or balance\n` +
        `• Invalid account permissions\n` +
        `• Account does not exist`
      );
    } else if (broadcastError?.message?.includes('insufficient')) {
      throw new Error('Insufficient funds for this transaction.');
    } else if (broadcastError?.message?.includes('Network request failed') || broadcastError?.message?.includes('failed to fetch')) {
      throw new Error(
        'Network error: Cannot reach Solana network.\n\n' +
        'Please check:\n' +
        '• Your internet connection\n' +
        '• VPN or firewall settings\n' +
        '• Try again in a moment'
      );
    } else {
      throw new Error(`Failed to broadcast transaction: ${broadcastError?.message || 'Unknown error'}`);
    }
  }

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
    // Use reauthorize with the saved auth token
    if (authToken) {
      try {
        console.log('[MobileWallet] Attempting reauthorize with saved token');
        await wallet.reauthorize({
          cluster: 'devnet',
          identity: APP_IDENTITY,
          auth_token: authToken,
        });
        console.log('[MobileWallet] Reauthorize successful');
      } catch (reauthError: any) {
        console.log('[MobileWallet] Reauthorize failed, trying authorize:', reauthError?.message);
        const authResult = await wallet.authorize({
          cluster: 'mainnet-beta',
          identity: APP_IDENTITY,
        });
        authToken = authResult.auth_token;
        console.log('[MobileWallet] New auth token saved:', authToken?.substring(0, 20) + '...');
      }
    } else {
      console.log('[MobileWallet] No saved token, authorizing fresh');
      const authResult = await wallet.authorize({
        cluster: 'devnet',
        identity: APP_IDENTITY,
      });
      authToken = authResult.auth_token;
      console.log('[MobileWallet] Auth token saved:', authToken?.substring(0, 20) + '...');
    }

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
    // Use reauthorize with the saved auth token
    if (authToken) {
      try {
        console.log('[MobileWallet] Attempting reauthorize with saved token');
        await wallet.reauthorize({
          cluster: 'devnet',
          identity: APP_IDENTITY,
          auth_token: authToken,
        });
        console.log('[MobileWallet] Reauthorize successful');
      } catch (reauthError: any) {
        console.log('[MobileWallet] Reauthorize failed, trying authorize:', reauthError?.message);
        const authResult = await wallet.authorize({
          cluster: 'mainnet-beta',
          identity: APP_IDENTITY,
        });
        authToken = authResult.auth_token;
        console.log('[MobileWallet] New auth token saved:', authToken?.substring(0, 20) + '...');
      }
    } else {
      console.log('[MobileWallet] No saved token, authorizing fresh');
      const authResult = await wallet.authorize({
        cluster: 'devnet',
        identity: APP_IDENTITY,
      });
      authToken = authResult.auth_token;
      console.log('[MobileWallet] Auth token saved:', authToken?.substring(0, 20) + '...');
    }

    const signed = await wallet.signMessages({
      addresses: [authorizedPublicKey!.toBytes()],
      payloads: [message],
    });

    return signed[0];
  });

  return result;
}

/**
 * Sign a single transaction (wrapper for compatibility)
 * This automatically uses MWA on Android or falls back to provider on web/iOS
 */
export async function signTransaction(
  transaction: Transaction | VersionedTransaction,
  provider?: any
): Promise<Transaction | VersionedTransaction> {
  // Use Mobile Wallet Adapter on Android if connected
  if (BUILD_CONFIG.isAndroid && isMobileWalletConnected()) {
    console.log('[MobileWallet] Using MWA to sign transaction');
    return signMobileTransaction(transaction);
  }

  // Fall back to provider (web/iOS)
  if (!provider) {
    throw new Error('No wallet provider available');
  }

  console.log('[MobileWallet] Using provider to sign transaction');
  return provider.signTransaction(transaction);
}

/**
 * Sign multiple transactions (wrapper for compatibility)
 */
export async function signAllTransactions(
  transactions: (Transaction | VersionedTransaction)[],
  provider?: any
): Promise<(Transaction | VersionedTransaction)[]> {
  // Use Mobile Wallet Adapter on Android if connected
  if (BUILD_CONFIG.isAndroid && isMobileWalletConnected()) {
    console.log('[MobileWallet] Using MWA to sign transactions');
    const signed = [];
    for (const tx of transactions) {
      signed.push(await signMobileTransaction(tx));
    }
    return signed;
  }

  // Fall back to provider (web/iOS)
  if (!provider) {
    throw new Error('No wallet provider available');
  }

  console.log('[MobileWallet] Using provider to sign transactions');
  return provider.signAllTransactions(transactions);
}

/**
 * Sign and send transaction (wrapper for compatibility)
 */
export async function signAndSendTransaction(
  transaction: Transaction | VersionedTransaction,
  provider?: any
): Promise<string> {
  // Use Mobile Wallet Adapter on Android if connected
  if (BUILD_CONFIG.isAndroid && isMobileWalletConnected()) {
    console.log('[MobileWallet] Using MWA to sign and send transaction');
    return signAndSendMobileTransaction(transaction);
  }

  // Fall back to provider (web/iOS)
  if (!provider) {
    throw new Error('No wallet provider available');
  }

  console.log('[MobileWallet] Using provider to sign and send transaction');
  return provider.signAndSendTransaction(transaction);
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
  signTransaction,
  signAllTransactions,
  signAndSendTransaction,
};
