import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Deploying Dielemma to BSC Mainnet ===\n");
  console.log("⚠️  WARNING: This will deploy to BSC MAINNET!");
  console.log("⚠️  Make sure you have enough BNB for gas fees\n");

  // Confirm deployment
  // In production, you might want to add a confirmation prompt here

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Get balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "BNB\n");

  // Deploy contract
  console.log("Deploying Dielemma contract...");
  const Dielemma = await ethers.getContractFactory("Dielemma");
  const dielemma = await Dielemma.deploy();

  await dielemma.waitForDeployment();
  const address = await dielemma.getAddress();

  console.log("\n✅ Dielemma deployed to:", address);
  console.log("\nTransaction hash:", dielemma.deploymentTransaction()?.hash);

  // Get initial values
  console.log("\n=== Initial Contract State ===");
  console.log("Owner:", await dielemma.owner());
  console.log("Paused:", await dielemma.paused());
  console.log("Total deposits:", await dielemma.getTotalDeposits());

  // Update instructions
  console.log("\n=== Post-Deployment Instructions ===");
  console.log("\n1. Update your backend .env file with:");
  console.log(`   BSC_MAINNET_CONTRACT_ADDRESS=${address}`);
  console.log("\n2. Update shared/types/index.ts with:");
  console.log(`   contractAddress: { mainnet: '${address}' }`);
  console.log("\n3. Verify contract on BSCScan:");
  console.log(`   npx hardhat verify --network bsc ${address}`);
  console.log("\n4. View on BSCScan:");
  console.log(`   https://bscscan.com/address/${address}\n`);

  return address;
}

// Execute deployment
main()
  .then((address) => {
    console.log("Deployment completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
}
