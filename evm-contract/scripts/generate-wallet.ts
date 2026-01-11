import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Generating Deployment Wallet ===\n");
  
  // Generate a random wallet
  const wallet = ethers.Wallet.createRandom();
  
  console.log("Wallet Address:", wallet.address);
  console.log("Private Key:", wallet.privateKey);
  console.log("\nIMPORTANT:");
  console.log("1. Save the private key securely");
  console.log("2. Fund this address with testnet BNB from:");
  console.log("   https://testnet.bnbchain.org/faucet-smart");
  console.log("   https://www.bnbchain.org/en/testnet-faucet");
  console.log("\n3. Add to .env file:");
  console.log(`   PRIVATE_KEY=${wallet.privateKey}`);
  console.log("\n4. Then run: npm run deploy:bsc:testnet\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
