# Dielemma Smart Contract - Deployment Guide

## Quick Deploy with Solana Playground (Recommended)

The easiest way to deploy the Dielemma smart contract is using Solana Playground:

### Steps:

1. **Go to Solana Playground**
   - Visit: https://solana-playground.com/

2. **Create New Project**
   - Click "Create" → "New Project"
   - Name it: `dielemma`

3. **Copy the Contract Code**
   - Copy the contents of `src/lib.rs` from this project
   - Paste it into the Playground editor

4. **Update the Program ID**
   - In Playground, the program ID will be automatically generated
   - Or use our existing program ID: `4k2WMWgqn4ma9fSwgfyDuZ4HpzzJTiCbdxgAhbL6n7ra`
   - To use our ID, update the `declare_id!` line with this ID

5. **Build**
   - Click "Build" button
   - The contract will compile automatically

6. **Deploy to Devnet**
   - Click "Deploy" button
   - Select "Devnet"
   - The contract will be deployed and you'll get the new program ID

7. **Save the Program ID**
   - After deployment, copy the program ID
   - Update the backend `.env` file with: `SOLANA_PROGRAM_ID=<your-program-id>`

## Alternative: Manual Deployment with CLI

If you want to deploy using the Solana CLI locally:

### Prerequisites:
```bash
# Install Solana tools
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install build tools
cargo install solana-program-build

# Or use Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

### Build and Deploy:
```bash
cd dielemma-program

# Build the program
cargo build-sbf

# Or with Anchor
anchor build

# Deploy to devnet
solana program deploy target/deploy/dielemma_program.so --url devnet

# Get the program ID
solana program show <program-id> --url devnet
```

## Program ID

The current program ID is: `4k2WMWgqn4ma9fSwgfyDuZ4HpzzJTiCbdxgAhbL6n7ra`

Keypair location: `target/deploy/dielemma-program-keypair.json`

## Verify Deployment

After deployment, verify the contract is deployed:

```bash
solana program show 4k2WMWgqn4ma9fSwgfyDuZ4HpzzJTiCbdxgAhbL6n7ra --url devnet
```

## Update Backend Configuration

After deployment, update your backend configuration:

```bash
cd backend
# Update .env file
echo "SOLANA_PROGRAM_ID=<deployed-program-id>" >> .env
```

## Testing the Contract

Once deployed, you can test the contract using the backend API:

```bash
cd backend
npm run dev

# Test the health endpoint
curl http://localhost:3000/api/health
```

## Contract Features

The Dielemma contract supports the following instructions:

1. **Deposit** - Deposit tokens with a receiver and timeout
2. **Proof of Life** - Reset the proof-of-life timer
3. **Withdraw** - User can withdraw their deposited tokens anytime
4. **Claim** - Receiver can claim if proof-of-life expires
5. **Close Account** - Close the deposit account after withdrawal/claim

## Next Steps

1. ✅ Deploy the contract (this guide)
2. ⏳ Write tests for the contract
3. ⏳ Implement client UI screens
4. ⏳ Integrate wallet adapter in the client
