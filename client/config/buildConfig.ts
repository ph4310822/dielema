import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Build target types
export type AndroidClientTarget = 'default' | 'seeker';

// Get the build target from environment variable
// Use EXPO_PUBLIC_ prefix for Expo to expose it to the client
const getAndroidClientTarget = (): AndroidClientTarget => {
  const target = process.env.EXPO_PUBLIC_ANDROID_CLIENT_TARGET;
  if (target === 'seeker') {
    return 'seeker';
  }
  return 'default';
};

// Build configuration
export const BUILD_CONFIG = {
  // Current build target
  target: getAndroidClientTarget(),
  
  // Check if running on Android
  isAndroid: Platform.OS === 'android',
  
  // Check if running on iOS
  isIOS: Platform.OS === 'ios',
  
  // Check if running on web
  isWeb: Platform.OS === 'web',
  
  // Check if this is a Seeker build
  isSeeker: getAndroidClientTarget() === 'seeker',
  
  // Check if should use mobile wallet adapter (Android only, non-web)
  shouldUseMobileWalletAdapter: Platform.OS === 'android',
};

// Chain availability based on build target
export const getAvailableChains = () => {
  if (BUILD_CONFIG.isSeeker) {
    // Seeker build only supports Solana
    return ['solana'] as const;
  }
  // Default build supports all chains
  return ['bsc', 'solana', 'ethereum'] as const;
};

// Check if a chain is available for current build
export const isChainAvailable = (chain: string): boolean => {
  const availableChains = getAvailableChains();
  return availableChains.includes(chain as any);
};

// Get default chain based on build target
export const getDefaultChain = () => {
  if (BUILD_CONFIG.isSeeker) {
    return 'solana';
  }
  return 'solana'; // Default to Solana for now
};

export default BUILD_CONFIG;
