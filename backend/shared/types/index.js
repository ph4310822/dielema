"use strict";
/**
 * Shared types and interfaces for Dielemma multi-chain support
 *
 * These types are designed to work across:
 * - Solana (Rust program)
 * - BSC (Solidity contract)
 * - Other EVM chains (Ethereum, Polygon, etc.)
 * - Future: Solana (already implemented)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAIN_CONFIGS = exports.DepositState = exports.NetworkType = exports.ChainType = void 0;
/**
 * Supported blockchain networks
 */
var ChainType;
(function (ChainType) {
    ChainType["SOLANA"] = "solana";
    ChainType["BSC"] = "bsc";
    ChainType["ETHEREUM"] = "ethereum";
    ChainType["POLYGON"] = "polygon";
    ChainType["ARBITRUM"] = "arbitrum";
    ChainType["BASE"] = "base";
})(ChainType || (exports.ChainType = ChainType = {}));
/**
 * Network environments
 */
var NetworkType;
(function (NetworkType) {
    NetworkType["MAINNET"] = "mainnet";
    NetworkType["TESTNET"] = "testnet";
    NetworkType["DEVNET"] = "devnet";
    NetworkType["LOCAL"] = "local";
})(NetworkType || (exports.NetworkType = NetworkType = {}));
/**
 * Deposit state
 */
var DepositState;
(function (DepositState) {
    DepositState["ACTIVE"] = "active";
    DepositState["WITHDRAWN"] = "withdrawn";
    DepositState["CLAIMED"] = "claimed";
})(DepositState || (exports.DepositState = DepositState = {}));
/**
 * Chain configurations map
 */
exports.CHAIN_CONFIGS = {
    [ChainType.SOLANA]: {
        chain: ChainType.SOLANA,
        chainId: 0,
        rpcUrls: {
            mainnet: 'https://api.mainnet-beta.solana.com',
            testnet: 'https://api.testnet.solana.com',
            devnet: 'https://api.devnet.solana.com',
            local: 'http://localhost:8899',
        },
        programId: '4k2WMWgqn4ma9fSwgfyDuZ4HpzzJTiCbdxgAhbL6n7ra',
        nativeCurrency: {
            name: 'Solana',
            symbol: 'SOL',
            decimals: 9,
        },
    },
    [ChainType.BSC]: {
        chain: ChainType.BSC,
        chainId: 56,
        rpcUrls: {
            mainnet: 'https://bsc-dataseed.binance.org',
            testnet: 'https://bsc-testnet-rpc.publicnode.com',
            local: 'http://localhost:8545',
        },
        contractAddress: {
            mainnet: '', // To be filled after deployment
            testnet: '0xa23453F2bC8d23a8162fB7d61C2E62c79A2C2837', // Deployed 2025-01-11 with token burning
            local: '',
        },
        officialTokenAddress: {
            mainnet: '', // To be filled after deployment
            testnet: '0x11443f26414Cf3990dD6BD051dEBa4428164a799', // DLM token - Deployed 2025-01-11
            local: '',
        },
        blockExplorer: {
            mainnet: 'https://bscscan.com',
            testnet: 'https://testnet.bscscan.com',
        },
        nativeCurrency: {
            name: 'BNB',
            symbol: 'BNB',
            decimals: 18,
        },
    },
    [ChainType.ETHEREUM]: {
        chain: ChainType.ETHEREUM,
        chainId: 1,
        rpcUrls: {
            mainnet: 'https://eth.llamarpc.com',
            testnet: 'https://sepolia.infura.io/v3/',
            local: 'http://localhost:8545',
        },
        nativeCurrency: {
            name: 'Ethereum',
            symbol: 'ETH',
            decimals: 18,
        },
    },
    [ChainType.POLYGON]: {
        chain: ChainType.POLYGON,
        chainId: 137,
        rpcUrls: {
            mainnet: 'https://polygon-rpc.com',
            testnet: 'https://rpc-amoy.polygon.technology',
            local: 'http://localhost:8545',
        },
        nativeCurrency: {
            name: 'Polygon',
            symbol: 'MATIC',
            decimals: 18,
        },
    },
    [ChainType.ARBITRUM]: {
        chain: ChainType.ARBITRUM,
        chainId: 42161,
        rpcUrls: {
            mainnet: 'https://arb1.arbitrum.io/rpc',
            testnet: 'https://sepolia-rollup.arbitrum.io/rpc',
            local: 'http://localhost:8545',
        },
        nativeCurrency: {
            name: 'Arbitrum',
            symbol: 'ETH',
            decimals: 18,
        },
    },
    [ChainType.BASE]: {
        chain: ChainType.BASE,
        chainId: 8453,
        rpcUrls: {
            mainnet: 'https://mainnet.base.org',
            testnet: 'https://sepolia.base.org',
            local: 'http://localhost:8545',
        },
        nativeCurrency: {
            name: 'Base',
            symbol: 'ETH',
            decimals: 18,
        },
    },
};
