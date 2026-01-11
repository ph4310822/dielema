# Dielemma - Deploy Smart Contract

Due to Solana build toolchain complexity, here are three deployment options ranked from easiest to most complex:

## Option 1: Solana Playground (Recommended - Easiest) 🚀

**5 minutes | No installation required**

1. Go to https://solana-playground.com/
2. Click "Create" → "New Project" → Name it "dielemma"
3. Copy the entire contents of `dielemma-program/src/lib.rs`
4. Paste it into the Playground editor
5. Click "Build" (will compile automatically)
6. Click "Deploy" → Select "Devnet"
7. Copy the deployed Program ID
8. Update backend config: `cd backend && echo "SOLANA_PROGRAM_ID=<new-id>" >> .env`

That's it! Your contract is now deployed to devnet.

---

## Option 2: One-Click Deploy Script 📜

**10 minutes | Requires tool installation**

```bash
cd dielemma-program
./deploy.sh
```

The script will:
- Check for Solana CLI and build tools
- If missing, provide installation instructions
- Build the program
- Deploy to devnet
- Output the new program ID

---

## Option 3: Manual CLI Deployment ⚙️

**20+ minutes | Requires full toolchain setup**

### Prerequisites

```bash
# 1. Install Solana CLI (if not already installed)
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# 2. Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 3. Install build tools (choose one)
# Option A: Solana build tools
cargo install solana-build-bpf

# Option B: Anchor framework
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

### Deploy

```bash
cd dielemma-program

# Build
cargo-build-bpf    # or: anchor build

# Deploy
solana program deploy target/deploy/dielemma_program.so \
  --keypair target/deploy/dielemma-program-keypair.json \
  --url devnet

# Verify
solana program show <program-id> --url devnet
```

---

## Current Program ID

**Before deployment:** `45BVWUn3fdnLwikmk9WZjcXjLBQNiBprsYKKhV1NhCQj`

**After deployment:** You'll get a new program ID that needs to be updated in:
- `backend/.env` → `SOLANA_PROGRAM_ID=<new-id>`
- Client code (if hardcoded)

---

## Verification

After deployment, test the contract:

```bash
# Test backend
cd backend
npm run dev
curl http://localhost:3000/api/health

# Should return:
# {
#   "status": "ok",
#   "network": "devnet",
#   "programId": "<your-deployed-program-id>"
# }
```

---

## Troubleshooting

### "cargo-build-bpf not found"
Install build tools: `cargo install solana-build-bpf`

### "Program ID mismatch"
Update the `declare_id!` in `src/lib.rs` with your new program ID

### "Deployment failed"
- Check you're on devnet: `solana config get`
- Ensure you have devnet SOL: `solana airdrop 2`
- Verify program file exists: `ls target/deploy/dielemma_program.so`

---

## Need Help?

- Solana Docs: https://docs.solana.com/
- Solana Playground: https://solana-playground.com/
- Discord: https://discord.gg/solana
