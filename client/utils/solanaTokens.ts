import { Connection, PublicKey } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress
} from '@solana/spl-token';

export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
  balanceRaw: bigint;
  uiAmount: string;
  logoURI?: string;
  isNative?: boolean;
}

// Common Solana tokens with their metadata
export const COMMON_TOKENS: Record<string, { symbol: string; name: string; decimals: number; logoURI?: string }> = {
  // Native SOL
  'So11111111111111111111111111111111111111112': {
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  },
  // DLM Token (Dielemma)
  'dVA6zfXBRieUCPS8GR4hve5ugmp5naPvKGFquUDpump': {
    symbol: 'DLM',
    name: 'Dielemma',
    decimals: 6,
  },
  // USDC
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  // USDT
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
  },
  // Wrapped SOL
  'So111111111111111111111111111111111111111111': {
    symbol: 'WSOL',
    name: 'Wrapped SOL',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So111111111111111111111111111111111111111111/logo.png',
  },
  // Raydium
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': {
    symbol: 'RAY',
    name: 'Raydium',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png',
  },
  // Bonk
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': {
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png',
  },
  // Jupiter
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': {
    symbol: 'JUP',
    name: 'Jupiter',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN/logo.png',
  },
};

// Devnet tokens (for testing)
export const DEVNET_TOKENS: Record<string, { symbol: string; name: string; decimals: number; logoURI?: string }> = {
  // USDC on devnet
  'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr': {
    symbol: 'USDC',
    name: 'USD Coin (Devnet)',
    decimals: 6,
  },
};

/**
 * Get the RPC URL for a network
 */
export function getRpcUrl(network: string): string {
  switch (network) {
    case 'devnet':
      return 'https://api.devnet.solana.com';
    case 'testnet':
      return 'https://api.testnet.solana.com';
    case 'mainnet':
      return 'https://mainnet.helius-rpc.com/?api-key=2c795199-fdd7-4dd9-9eaf-d900a41016a3';
      // return 'https://api.mainnet-beta.solana.com';
    default:
      return 'https://api.devnet.solana.com';
  }
}

/**
 * Get SOL balance for a wallet
 */
export async function getSOLBalance(walletAddress: string, network: string): Promise<number> {
  try {
    const connection = new Connection(getRpcUrl(network), 'confirmed');
    const pubkey = new PublicKey(walletAddress);
    const balance = await connection.getBalance(pubkey);
    // SOL has 9 decimals
    return balance / 1e9;
  } catch (error) {
    console.error('Error fetching SOL balance:', error);
    return 0;
  }
}

/**
 * Get all token accounts for a wallet
 */
export async function getTokenAccounts(
  walletAddress: string,
  network: string
): Promise<{ mint: string; balance: bigint; decimals: number }[]> {
  try {
    const connection = new Connection(getRpcUrl(network), 'confirmed');
    const pubkey = new PublicKey(walletAddress);

    // Fetch from both Token and Token-2022 programs
    const [legacyTokenAccounts, token2022Accounts] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    // Combine both sets of accounts
    const allAccounts = [...legacyTokenAccounts.value, ...token2022Accounts.value];

    return allAccounts.map(account => {
      const parsed = account.account.data.parsed;
      return {
        mint: parsed.info.mint,
        balance: BigInt(parsed.info.tokenAmount.amount),
        decimals: parsed.info.tokenAmount.decimals,
      };
    });
  } catch (error) {
    console.error('Error fetching token accounts:', error);
    return [];
  }
}

/**
 * Get token metadata (symbol, name, etc.)
 */
export function getTokenMetadata(mint: string, network: string): {
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
} {
  const commonToken = COMMON_TOKENS[mint] || DEVNET_TOKENS[mint];
  if (commonToken) {
    return commonToken;
  }

  // Return defaults for unknown tokens
  return {
    symbol: 'TOKEN',
    name: 'Unknown Token',
    decimals: 0,
  };
}

/**
 * Get all token balances for a wallet
 */
export async function getAllTokenBalances(
  walletAddress: string,
  network: string
): Promise<TokenBalance[]> {
  console.log('[solanaTokens] Fetching token balances for:', walletAddress, 'network:', network);

  const connection = new Connection(getRpcUrl(network), 'confirmed');
  const pubkey = new PublicKey(walletAddress);

  const balances: TokenBalance[] = [];

  try {
    // Get SOL balance - always include native SOL at the top
    const solBalance = await connection.getBalance(pubkey);
    const solMint = 'So11111111111111111111111111111111111111112';
    const solMetadata = getTokenMetadata(solMint, network);
    balances.push({
      mint: solMint,
      symbol: solMetadata.symbol,
      name: solMetadata.name,
      decimals: solMetadata.decimals,
      balance: solBalance / 1e9,
      balanceRaw: BigInt(solBalance),
      uiAmount: (solBalance / 1e9).toFixed(4),
      logoURI: solMetadata.logoURI,
      isNative: true,
    });

    // Get all token accounts from both Token and Token-2022 programs
    const [legacyTokenAccounts, token2022Accounts] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    // Combine both sets of accounts
    const allAccounts = [...legacyTokenAccounts.value, ...token2022Accounts.value];

    for (const account of allAccounts) {
      const parsed = account.account.data.parsed;
      const balance = BigInt(parsed.info.tokenAmount.amount);

      // Only include tokens with non-zero balance
      if (balance > 0n) {
        const metadata = getTokenMetadata(parsed.info.mint, network);
        balances.push({
          mint: parsed.info.mint,
          symbol: metadata.symbol,
          name: metadata.name,
          decimals: parsed.info.tokenAmount.decimals,
          balance: Number(balance) / Math.pow(10, parsed.info.tokenAmount.decimals),
          balanceRaw: balance,
          uiAmount: parsed.info.tokenAmount.uiAmountString || '0',
          logoURI: metadata.logoURI,
        });
      }
    }

    console.log('[solanaTokens] Found balances:', balances.length);
    return balances;
  } catch (error) {
    console.error('[solanaTokens] Error fetching token balances:', error);
    return [];
  }
}

/**
 * Get token balance for a specific token
 * Tries both Token and Token-2022 programs
 */
export async function getTokenBalance(
  walletAddress: string,
  tokenMint: string,
  network: string
): Promise<number> {
  try {
    const connection = new Connection(getRpcUrl(network), 'confirmed');
    const pubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(tokenMint);

    // Try Token-2022 program first (newer tokens like DLM use this)
    try {
      const ata2022 = await getAssociatedTokenAddress(mintPubkey, pubkey, false, TOKEN_2022_PROGRAM_ID);
      const accountInfo2022 = await connection.getAccountInfo(ata2022);
      if (accountInfo2022) {
        const data = accountInfo2022.data;
        const amount = data.readBigUInt64LE(64);
        const mintInfo = await connection.getTokenSupply(mintPubkey);
        const decimals = mintInfo.value.decimals;
        console.log(`[solanaTokens] Found ${tokenMint} in Token-2022 program, balance:`, Number(amount) / Math.pow(10, decimals));
        return Number(amount) / Math.pow(10, decimals);
      }
    } catch (e) {
      console.log('[solanaTokens] Token-2022 ATA not found, trying legacy Token program');
    }

    // Try legacy Token program
    const ata = await getAssociatedTokenAddress(mintPubkey, pubkey, false, TOKEN_PROGRAM_ID);
    const accountInfo = await connection.getAccountInfo(ata);
    if (accountInfo) {
      const data = accountInfo.data;
      const amount = data.readBigUInt64LE(64);
      const mintInfo = await connection.getTokenSupply(mintPubkey);
      const decimals = mintInfo.value.decimals;
      console.log(`[solanaTokens] Found ${tokenMint} in legacy Token program, balance:`, Number(amount) / Math.pow(10, decimals));
      return Number(amount) / Math.pow(10, decimals);
    }

    console.log(`[solanaTokens] No balance found for ${tokenMint}`);
    return 0;
  } catch (error) {
    console.error('[solanaTokens] Error fetching token balance:', error);
    return 0;
  }
}

/**
 * Convert amount to smallest unit (lamports for SPL tokens)
 */
export function amountToSmallestUnit(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

/**
 * Convert amount from smallest unit to base unit
 */
export function amountFromSmallestUnit(amount: bigint | string, decimals: number): number {
  const amountBigInt = typeof amount === 'string' ? BigInt(amount) : amount;
  return Number(amountBigInt) / Math.pow(10, decimals);
}

/**
 * Validate Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Associated Token Account address
 */
export async function getATA(walletAddress: string, tokenMint: string): Promise<string> {
  const walletPubkey = new PublicKey(walletAddress);
  const mintPubkey = new PublicKey(tokenMint);
  const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey, false, TOKEN_PROGRAM_ID);
  return ata.toBase58();
}
