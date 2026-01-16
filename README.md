# Dielemma - Multi-Chain Proof-of-Life Smart Contract

A proof-of-life smart contract platform supporting multiple blockchain networks (Solana, BSC, Ethereum, Polygon, Arbitrum, Base, and more).

## Overview

Users deposit tokens and must periodically prove they are alive. If they fail to do so within a configured timeout period, a designated receiver can claim the tokens.

**Use cases:**
- Inheritance planning
- Dead man's switch
- Proof of life for encrypted data releases
- Time-locked payments with life verification

## Architecture

```
dielemma/
├── dielemma-program/          # Solana smart contract (Rust)
├── evm-contract/              # EVM smart contracts (Solidity)
│   ├── contracts/
│   │   ├── Dielemma.sol      # Main contract for BSC, ETH, Polygon, etc.
│   │   └── MockERC20.sol     # Mock token for testing
│   ├── scripts/              # Deployment scripts
│   ├── test/                 # Contract tests
│   └── hardhat.config.ts     # Hardhat configuration
├── backend/                   # Multi-chain backend API
│   └── src/
│       ├── chains/           # Chain-specific services
│       │   ├── base.ts       # Base interface
│       ��   ├── solana.ts     # Solana implementation
│       │   ├── evm.ts        # EVM implementation
│       │   └── factory.ts    # Chain service factory
│       └── index-multi-chain.ts  # Multi-chain API server
├── client/                    # Frontend application
└── shared/                    # Shared types and interfaces
    └── types/
        └── index.ts          # Common types for all chains
```

## Supported Chains

| Chain | Status | Contract Address | Network |
|-------|--------|------------------|---------|
| Solana | ✅ Deployed | `3uT7JEnRZ4pc4bwYvJ9PHsw579YLfNBr3xQvTiXBkGyC` | Devnet |
| BSC | 🚀 Ready | *Deploy to get address* | Testnet/Mainnet |
| Ethereum | 🚀 Ready | *Deploy to get address* | Sepolia |
| Polygon | 🚀 Ready | *Deploy to get address* | Amoy |
| Arbitrum | 🚀 Ready | *Deploy to get address* | Sepolia |
| Base | 🚀 Ready | *Deploy to get address* | Sepolia |

## Quick Start

### 1. Clone and Install

```bash
# Install backend dependencies
cd backend
npm install

# Install EVM contract dependencies
cd ../evm-contract
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Environment Setup

Create `.env` files in each directory:

**Backend** (`backend/.env`):
```bash
PORT=3000
DEFAULT_CHAIN=solana
DEFAULT_NETWORK=testnet

# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PROGRAM_ID=3uT7JEnRZ4pc4bwYvJ9PHsw579YLfNBr3xQvTiXBkGyC

# BSC Configuration (after deployment)
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545
BSC_MAINNET_RPC=https://bsc-dataseed.binance.org
BSC_TESTNET_CONTRACT_ADDRESS=0x...
BSC_MAINNET_CONTRACT_ADDRESS=0x...
```

**EVM Contract** (`evm-contract/.env`):
```bash
PRIVATE_KEY=your_private_key_here
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545
BSC_MAINNET_RPC=https://bsc-dataseed.binance.org
BSCSCAN_API_KEY=your_bscscan_api_key
```

### 3. Deploy Smart Contracts

#### Solana (Already Deployed)

The Solana program is already deployed to devnet. See [dielemma-program/DEPLOYMENT.md](dielemma-program/DEPLOYMENT.md) for details.

#### BSC/EVM Chains

```bash
cd evm-contract

# Deploy to BSC Testnet
npm run deploy:bsc:testnet

# Deploy to BSC Mainnet
npm run deploy:bsc:mainnet

# Deploy to other EVM chains
npm run deploy:sepolia          # Ethereum Sepolia
npm run deploy:polygon:amoy     # Polygon Amoy
npm run deploy:arbitrum:sepolia # Arbitrum Sepolia
npm run deploy:base:sepolia     # Base Sepolia
```

After deployment, update the contract addresses in:
- `backend/.env`
- `shared/types/index.ts`

### 4. Start the Backend

```bash
cd backend

# Option 1: Use original Solana-only backend
npm run dev

# Option 2: Use new multi-chain backend
npx ts-node src/index-multi-chain.ts
```

The API will be available at `http://localhost:3000`

### 5. Start the Client

```bash
cd client
npx expo start --web
npx expo run:android
```

### 6. Build Android App

To build a signed release APK for Android:

```bash
cd client/android
./gradlew assembleRelease
```

The signed APK will be generated at:
```
client/android/app/build/outputs/apk/release/app-release.apk
```

**Note:** The app is automatically signed using the keystore configured in `android/keystore.properties`. Make sure this file exists and contains valid credentials before building.

**Verify the signature:**
```bash
# On macOS with Android SDK
$ANDROID_SDK_ROOT/build-tools/36.0.0/apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

**Install on device:**
```bash
adb install app/build/outputs/apk/release/app-release.apk
```

## API Endpoints

The multi-chain backend supports the following endpoints:

### Health & Info

```
GET /api/health?chain=solana&network=testnet
GET /api/chains
```

### Deposit Operations

```
POST /api/deposit
POST /api/proof-of-life
POST /api/withdraw
POST /api/claim
GET /api/deposit?depositId=xxx&chain=solana
GET /api/deposits/:user?chain=solana
```

All endpoints support `chain` and `network` parameters to specify the target blockchain.

### Example Request

```bash
curl -X POST http://localhost:3000/api/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "chain": "bsc",
    "network": "testnet",
    "depositor": "0x...",
    "receiver": "0x...",
    "tokenAddress": "0x...",
    "amount": "1000000000000000000",
    "timeoutSeconds": 86400
  }'
```

## Contract Functions

### Common Functions (All Chains)

| Function | Parameters | Description |
|----------|------------|-------------|
| `deposit` | receiver, token, amount, timeout | Create a new deposit |
| `proofOfLife` | depositId/depositIndex | Reset the timer |
| `withdraw` | depositId/depositIndex | Withdraw (depositor only) |
| `claim` | depositId/depositIndex | Claim after timeout (receiver only) |
| `getDeposit` | depositId/depositIndex | Get deposit info |

### Chain-Specific Details

#### Solana

- Uses **deposit seeds** (unique identifiers) instead of indices
- PDAs (Program Derived Addresses) for deposit accounts
- Supports SPL tokens
- Instructions built with Borsh serialization

#### EVM Chains (BSC, Ethereum, etc.)

- Uses **deposit indices** (array-based storage)
- Supports ERC20 and native tokens
- Transactions encoded with ethers.js
- Lower gas costs with packed structs

## Development

### Backend Structure

```
backend/src/
├── chains/
│   ├── base.ts       # IChainService interface
│   ├── solana.ts     # SolanaService
│   ├── evm.ts        # EvmService
│   └── factory.ts    # ChainServiceFactory
└── index-multi-chain.ts  # Express server
```

### Adding a New Chain

1. Create a new chain service in `backend/src/chains/[chain].ts`
2. Implement the `IChainService` interface
3. Add chain config to `shared/types/index.ts`
4. Register in `ChainServiceFactory`

```typescript
// Example: Adding Avalanche
export class AvalancheService implements IChainService {
  // Implement all required methods
}
```

## Testing

### Smart Contract Tests

```bash
cd evm-contract
npm test
```

### Backend Tests

```bash
cd backend
npm test
```

## Deployment Checklist

### Pre-Deployment

- [ ] Audit the smart contract code
- [ ] Test on testnet with real transactions
- [ ] Verify all edge cases are handled
- [ ] Prepare deployment documentation

### Deployment Steps

1. **Deploy Contract**
   ```bash
   cd evm-contract
   npm run deploy:bsc:testnet
   ```

2. **Verify Contract**
   ```bash
   npm run verify:bsc:testnet <contract_address>
   ```

3. **Update Backend Configuration**
   ```bash
   # backend/.env
   BSC_TESTNET_CONTRACT_ADDRESS=0x...
   ```

4. **Update Shared Types**
   ```typescript
   // shared/types/index.ts
   contractAddress: { testnet: '0x...' }
   ```

5. **Test API**
   ```bash
   curl http://localhost:3000/api/health?chain=bsc&network=testnet
   ```

## Gas Fees (Estimated)

| Operation | BSC | Ethereum | Polygon |
|-----------|-----|----------|---------|
| Deposit (ERC20) | ~150k gas | ~150k gas | ~150k gas |
| Deposit (Native) | ~200k gas | ~200k gas | ~200k gas |
| Proof of Life | ~50k gas | ~50k gas | ~50k gas |
| Withdraw | ~100k gas | ~100k gas | ~100k gas |
| Claim | ~100k gas | ~100k gas | ~100k gas |

## Security Considerations

1. **Private Keys**: Never commit `.env` files with real private keys
2. **Contract Audits**: Professional audit recommended for mainnet
3. **Access Control**: Owner can pause contract in emergencies
4. **Testing**: Comprehensive testing on testnet before mainnet

## Troubleshooting

### Backend Issues

**"Unsupported chain" error**
- Check that the chain is properly registered in `shared/types/index.ts`
- Verify the chain service implementation exists

**"Contract address is required" error**
- Deploy the contract first
- Update the contract address in `.env` and `shared/types/index.ts`

### Contract Deployment Issues

**"Insufficient funds" error**
- Ensure your wallet has enough native tokens for gas
- Get testnet tokens from the appropriate faucet

**"Verification failed" error**
- Check API key is correct in `.env`
- Wait a few seconds after deployment before verifying
- Ensure all constructor parameters are correct

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Resources

- [Solana Documentation](https://docs.solana.com/)
- [BSC Documentation](https://docs.bnbchain.org/)
- [Hardhat Documentation](https://hardhat.org/)
- [Ethers.js Documentation](https://docs.ethers.org/)


## Solana contract deployed on devnet:
Program ID: 5DT8TiEhEHasUXLaVUhsGpt3UAVCDUgVqsT3JkYcZJjv

## Solana contract deployed on mainnet:
Program ID: 3uT7JEnRZ4pc4bwYvJ9PHsw579YLfNBr3xQvTiXBkGyC