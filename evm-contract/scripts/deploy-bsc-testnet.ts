import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Deploying Dielemma to BSC Testnet ===\n");

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

  console.log("\n��� Dielemma deployed to:", address);
  console.log("\nTransaction hash:", dielemma.deploymentTransaction()?.hash);

  // Get initial values
  console.log("\n=== Initial Contract State ===");
  console.log("Owner:", await dielemma.owner());
  console.log("Paused:", await dielemma.paused());
  console.log("Total deposits:", await dielemma.getTotalDeposits());

  // Update .env file with the new contract address
  console.log("\n=== Post-Deployment Instructions ===");
  console.log("\n1. Update your backend .env file with:");
  console.log(`   BSC_TESTNET_CONTRACT_ADDRESS=${address}`);
  console.log("\n2. Update shared/types/index.ts with:");
  console.log(`   contractAddress: { testnet: '${address}' }`);
  console.log("\n3. Verify contract on BSCScan:");
  console.log(`   npx hardhat verify --network bscTestnet ${address}`);
  console.log("\n4. View on BSCScan:");
  console.log(`   https://testnet.bscscan.com/address/${address}\n`);

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
