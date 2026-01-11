# Dielemma EVM Smart Contract

Proof-of-life smart contract compatible with BSC, Ethereum, Polygon, Arbitrum, Base, and other EVM chains.

## Overview

The Dielemma contract allows users to deposit tokens and periodically prove they are alive. If they fail to do so within a configured timeout period, a designated receiver can claim the tokens.

This contract mirrors the functionality of the [Solana Dielemma program](../dielemma-program/).

## Features

- ✅ **Multi-chain support**: Works on BSC, Ethereum, Polygon, Arbitrum, Base, and any EVM-compatible chain
- ✅ **ERC20 + Native tokens**: Supports both ERC20 tokens and native tokens (BNB, ETH, MATIC, etc.)
- ✅ **Gas optimized**: Written in Solidity 0.8.20 with optimizer enabled
- ✅ **Pausable**: Owner can pause the contract in case of emergency
- ✅ **Event logging**: All actions emit events for easy indexing

## Contract Functions

### Core Functions

| Function | Description | Access |
|----------|-------------|--------|
| `deposit(receiver, token, amount, timeoutSeconds)` | Create a new deposit | Anyone |
| `proofOfLife(depositId)` | Reset the proof-of-life timer | Depositor only |
| `withdraw(depositId)` | Withdraw tokens (depositor can always withdraw) | Depositor only |
| `claim(depositId)` | Claim tokens if proof-of-life expired | Receiver only |

### View Functions

| Function | Description |
|----------|-------------|
| `getDeposit(depositId)` | Get deposit information with expiry status |
| `getUserDeposits(address)` | Get all deposit IDs for a user |
| `getReceiverDeposits(address)` | Get all claimable deposit IDs for a receiver |
| `getTotalDeposits()` | Get total number of deposits |
| `deposits(depositId)` | Get raw deposit data |

### Admin Functions

| Function | Description | Access |
|----------|-------------|--------|
| `transferOwnership(address)` | Transfer contract ownership | Owner only |
| `togglePause()` | Pause/unpause the contract | Owner only |

## Prerequisites

```bash
# Install Node.js dependencies
npm install

# Copy .env.example to .env
cp .env.example .env

# Edit .env and fill in:
# - PRIVATE_KEY (your deployer wallet private key)
# - RPC URLs
# - API keys for contract verification (optional)
```

## Getting API Keys

### BSCScan API Key (for contract verification)
1. Go to https://testnet.bscscan.com/ (testnet) or https://bscscan.com/ (mainnet)
2. Sign up and create an API key
3. Add to `.env`: `BSCSCAN_API_KEY=your_key`

### RPC Endpoints
- **BSC Testnet**: https://data-seed-prebsc-1-s1.binance.org:8545 (free public RPC)
- **BSC Mainnet**: https://bsc-dataseed.binance.org (free public RPC)
- **For production**, consider using:
  - [Ankr](https://www.ankr.com/)
  - [QuickNode](https://www.quicknode.com/)
  - [Infura](https://infura.io/)

## Deployment

### BSC Testnet (Recommended for testing)

```bash
# Compile contracts
npm run compile

# Deploy to BSC Testnet
npm run deploy:bsc:testnet

# Verify on BSCScan (requires API key in .env)
npm run verify:bsc:testnet -- <contract_address>
```

### BSC Mainnet

```bash
# Deploy to BSC Mainnet
npm run deploy:bsc:mainnet

# Verify on BSCScan
npm run verify:bsc:mainnet -- <contract_address>
```

### Other EVM Chains

```bash
# Ethereum Sepolia Testnet
npm run deploy:sepolia

# Polygon Amoy Testnet
npm run deploy:polygon:amoy

# Arbitrum Sepolia Testnet
npm run deploy:arbitrum:sepolia

# Base Sepolia Testnet
npm run deploy:base:sepolia
```

## Post-Deployment Setup

After deploying, update the following files:

### 1. Backend `.env` file
```bash
# In backend/.env
BSC_TESTNET_CONTRACT_ADDRESS=0x...  # Your deployed address
BSC_MAINNET_CONTRACT_ADDRESS=0x...   # For mainnet
```

### 2. Shared types
```typescript
// In shared/types/index.ts
[ChainType.BSC]: {
  // ...
  contractAddress: {
    testnet: '0x...',  // Your deployed address
    mainnet: '0x...',   // For mainnet
  },
}
```

## Testing

```bash
# Run all tests
npm test

# Run tests with gas reporting
REPORT_GAS=true npm test

# Run test coverage
npm run test:coverage
```

## Local Development

```bash
# Start local Hardhat node (forks BSC Testnet)
npm run node

# In another terminal, deploy to local network
npx hardhat run scripts/deploy-bsc-testnet.ts --network localhost
```

## Architecture

```
evm-contract/
├── contracts/
│   └── Dielemma.sol          # Main smart contract
├── scripts/
│   ├── deploy-bsc-testnet.ts # BSC Testnet deployment
│   ├── deploy-bsc-mainnet.ts # BSC Mainnet deployment
│   └── deploy-*.ts           # Other chain deployments
├── test/
│   └── Dielemma.test.ts      # Contract tests
├── hardhat.config.ts         # Hardhat configuration
├── package.json
├── tsconfig.json
└── .env.example              # Environment variables template
```

## Gas Optimization

The contract is optimized for low gas costs:
- Compiler optimizer enabled (200 runs)
- Packed struct data layout
- Efficient storage operations
- Custom errors (saves gas on revert)

## Security Considerations

1. **Private Key Security**:
   - Never commit `.env` with a real private key
   - Use a dedicated deployment wallet, never your main wallet
   - Consider using a hardware wallet for mainnet deployments

2. **Contract Security**:
   - Contract includes pause functionality for emergencies
   - Owner can transfer ownership if needed
   - All functions have proper access control

3. **Testing**:
   - Always test on testnet before mainnet deployment
   - Review all deployment parameters before confirming

## Troubleshooting

### "Insufficient funds for gas"
- Ensure your deployment wallet has enough native tokens (BNB for BSC)
- Testnet: Get BNB from https://testnet.bnbchain.org/faucet-smart

### "Contract verification failed"
- Ensure you have the correct API key in `.env`
- Check that the contract address is correct
- Wait a few seconds after deployment before verifying

### "Network error"
- Check your RPC URL is correct and accessible
- Try using a different RPC endpoint

## Contract Addresses

Add your deployed addresses here:

| Chain | Network | Address | BscScan/Etherscan |
|-------|---------|---------|-------------------|
| BSC | Testnet | *Deploy to get address* | - |
| BSC | Mainnet | *Deploy to get address* | - |
| Ethereum | Sepolia | *Deploy to get address* | - |
| Polygon | Amoy | *Deploy to get address* | - |

## License

MIT
