# Dielemma Solana Contract - Quick Deployment Guide

## Contract Status: ✅ UPDATED

The Solana contract has been updated to match the BSC contract's proof of life functionality.

## New Features

1. **Token Burning for Proof of Life**
   - Users must burn 1 official token per proof of life
   - Prevents spam and adds value to the proof mechanism

2. **Official Token Mint Configuration**
   - Admin can set the official token mint address
   - Stored in each deposit account

3. **Enhanced Security**
   - Validates official token before allowing proof of life
   - Prevents unauthorized proof submissions

## Updated Instructions

The contract now supports 6 instructions:

| Instruction | Description | Accounts Required |
|-------------|-------------|-------------------|
| `Deposit` | Create deposit with receiver and timeout | 8 accounts |
| `ProofOfLife` | Burn 1 token and reset timer | 7 accounts |
| `Withdraw` | Withdraw tokens (depositor only) | 5 accounts |
| `Claim` | Claim if expired (receiver only) | 5 accounts |
| `CloseAccount` | Close deposit account | 4 accounts |
| `SetOfficialToken` | Set official token mint (admin) | 2 accounts |

## Deployment Options

### Option 1: Solana Playground (Recommended)

**Steps:**

1. Go to https://solana-playground.com/
2. Create new project named "dielemma"
3. Copy contract code from `src/lib.rs`
4. Paste into Playground editor
5. Click "Build"
6. Click "Deploy" → Select "Devnet"
7. Copy the Program ID

**After Deployment:**
```bash
cd /Users/peter/workspace/dielema/backend
echo "SOLANA_PROGRAM_ID=<new-program-id>" >> .env
```

### Option 2: Build Locally

**Prerequisites:**
```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install build tools
cargo install cargo-build-sbf --git https://github.com/anza-xyz/solana --tag v1.18.20
```

**Build and Deploy:**
```bash
cd /Users/peter/workspace/dielema/dielemma-program

# Build
cargo build-sbf

# Deploy
solana program deploy target/deploy/dielemma_program.so --url devnet
```

## Current Wallet Info

- **Address:** `7xV57PAzfn8F3CDqYJYAEALAQQpRSMQBdVdQLk4rHMoF`
- **Balance:** 2 SOL
- **Network:** Devnet

## Verify Deployment

```bash
solana program show <program-id> --url devnet
```

## Contract Changes Summary

### File: `src/lib.rs`

1. **Added Imports**
   - `burn` and `close_account` from spl_token
   - Burn address constant

2. **Updated DepositAccount Structure**
   - Added `official_token_mint: Pubkey` field
   - Account size: 122 → 154 bytes

3. **Updated ProofOfLife Instruction**
   - Now requires burning 1 token
   - Additional accounts for token operations
   - Validates official token mint is set

4. **New SetOfficialToken Instruction**
   - Admin function to set official token mint
   - Can be called by contract admin

5. **Updated Process Functions**
   - `process_proof_of_life`: Added token burning logic
   - `process_deposit`: Initialize official_token_mint
   - `process_set_official_token`: New function

## Testing the Contract

### 1. Set Official Token Mint (Admin)
```typescript
await program.methods
  .setOfficialToken(new PublicKey("token_mint_address"))
  .accounts({
    admin: adminWallet.publicKey,
    officialTokenMint: tokenMint,
  })
  .rpc();
```

### 2. Create Deposit
```typescript
await program.methods
  .deposit(
    receiverPubkey,
    new BN(1000000),  // amount
    new BN(86400)     // timeout (24 hours)
  )
  .accounts({
    depositor: userWallet.publicKey,
    // ... other accounts
  })
  .rpc();
```

### 3. Proof of Life (with token burning)
```typescript
await program.methods
  .proofOfLife(depositSeed)
  .accounts({
    depositor: userWallet.publicKey,
    depositAccount: depositPDA,
    depositorTokenAccount: userTokenAccount,
    burnTokenAccount: burnTokenPDA,
    officialTokenMint: officialMint,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

## Support

For issues or questions:
1. Check the deployment logs
2. Verify all accounts are correct
3. Ensure you have sufficient SOL for fees
4. Make sure token accounts are initialized

## Next Steps

1. ✅ Deploy contract to devnet
2. ⏳ Set official token mint
3. ⏳ Test deposit creation
4. ⏳ Test proof of life with token burning
5. ⏳ Update backend API
6. ⏳ Deploy to mainnet (when ready)

---

**Contract Version:** 2.0
**Last Updated:** 2025-01-11
**Program ID:** TBD (after deployment)
