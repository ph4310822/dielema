#!/bin/bash

# Dielemma Smart Contract Deployment Script
# This script builds and deploys the Dielemma program to Solana devnet

set -e

echo "🚀 Dielemma Smart Contract Deployment"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
PROGRAM_NAME="dielemma_program"
CLUSTER="devnet"

# Check if Solana CLI is installed
if ! command -v solana &> /dev/null; then
    echo -e "${RED}❌ Solana CLI not found${NC}"
    echo "Please install Solana CLI:"
    echo "  sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""
    exit 1
fi

echo -e "${GREEN}✓ Solana CLI found${NC}"
solana --version

# Check if cargo is installed
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}❌ Cargo not found${NC}"
    echo "Please install Rust:"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

echo -e "${GREEN}✓ Cargo found${NC}"

# Configure Solana for devnet
echo ""
echo "📡 Configuring Solana CLI for devnet..."
solana config set --url devnet

# Show current configuration
echo ""
echo "Current Solana Configuration:"
solana config get

# Check for build tools
echo ""
echo "🔧 Checking for build tools..."

if command -v cargo-build-sbf &> /dev/null; then
    echo -e "${GREEN}✓ cargo-build-sbf found${NC}"
    BUILD_CMD="cargo-build-sbf"
elif command -v anchor &> /dev/null; then
    echo -e "${GREEN}✓ Anchor found${NC}"
    BUILD_CMD="anchor build"
else
    echo -e "${YELLOW}⚠️  No build tools found${NC}"
    echo ""
    echo "Please install one of the following:"
    echo ""
    echo "Option 1: Install Solana build tools"
    echo "  cargo install solana-build-bpf"
    echo ""
    echo "Option 2: Install Anchor"
    echo "  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force"
    echo "  avm install latest"
    echo "  avm use latest"
    echo ""
    echo "Option 3: Use Solana Playground (Easiest)"
    echo "  1. Go to https://solana-playground.com/"
    echo "  2. Create a new project"
    echo "  3. Copy src/lib.rs from this project"
    echo "  4. Click Build and Deploy"
    exit 1
fi

# Build the program
echo ""
echo "🔨 Building the program..."
cd "$(dirname "$0")"
$BUILD_CMD

# Check if build was successful
if [ ! -f "target/deploy/${PROGRAM_NAME}.so" ]; then
    echo -e "${RED}❌ Build failed - program file not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Build successful${NC}"

# Get the keypair
KEYPAIR_FILE="target/deploy/${PROGRAM_NAME}-keypair.json"

if [ ! -f "$KEYPAIR_FILE" ]; then
    echo "🔑 Generating new program keypair..."
    solana-keygen new --outfile "$KEYPAIR_FILE" --no-bip39-passphrase
fi

PROGRAM_ID=$(solana-keygen pubkey "$KEYPAIR_FILE")
echo ""
echo "📋 Program ID: $PROGRAM_ID"

# Deploy the program
echo ""
echo "🚀 Deploying to devnet..."
echo ""

solana program deploy "target/deploy/${PROGRAM_NAME}.so" \
    --keypair "$KEYPAIR_FILE" \
    --program-id "$PROGRAM_ID" \
    --priority-fee 5000

echo ""
echo -e "${GREEN}✅ Deployment successful!${NC}"
echo ""
echo "Program ID: $PROGRAM_ID"
echo ""
echo "Update your backend configuration:"
echo "  cd backend"
echo "  echo \"SOLANA_PROGRAM_ID=$PROGRAM_ID\" >> .env"
echo ""
echo "Verify deployment:"
echo "  solana program show $PROGRAM_ID --url devnet"
