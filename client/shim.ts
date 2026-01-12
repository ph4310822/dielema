// Polyfills for browser compatibility with Solana/crypto libraries
// This file MUST be imported first in index.ts

import 'react-native-get-random-values';

import { Buffer } from 'buffer';

// Polyfill Buffer globally
if (typeof global !== 'undefined') {
  (global as any).Buffer = Buffer;
}

if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
}

// Polyfill process for web
if (typeof process === 'undefined') {
  (global as any).process = { env: {} };
}

// TextEncoder/TextDecoder polyfill for older browsers
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('text-encoding');
  (global as any).TextEncoder = TextEncoder;
  (global as any).TextDecoder = TextDecoder;
}

export {};
