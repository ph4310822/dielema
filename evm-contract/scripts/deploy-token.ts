import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Deploying DielemmaToken ===\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "BNB\n");

  // Deploy token with 1,000,000 tokens (1e6 * 1e18 = 1e24)
  const INITIAL_SUPPLY = ethers.parseEther("1000000");

  console.log("Deploying DielemmaToken...");
  const DielemmaToken = await ethers.getContractFactory("DielemmaToken");
  const token = await DielemmaToken.deploy(INITIAL_SUPPLY);

  await token.waitForDeployment();
  const address = await token.getAddress();

  console.log("\nDielemmaToken deployed to:", address);
  console.log("Transaction hash:", token.deploymentTransaction()?.hash);
  console.log("\nInitial Supply:", ethers.formatEther(INITIAL_SUPPLY), "DLM");
  console.log("Owner:", await token.owner());

  console.log("\n=== Post-Deployment Instructions ===");
  console.log("\n1. Update .env file:");
  console.log(`   DIELEMMA_TOKEN_ADDRESS=${address}`);
  console.log("\n2. Set official token in Dielemma contract:");
  console.log(
    `   TOKEN_ADDRESS=${address} CONTRACT_ADDRESS=<your_contract_address> npx hardhat run scripts/set-official-token.ts --network <network>`
  );
  console.log("\n3. Verify on BSCScan:");
  console.log(`   npx hardhat verify --network <network> ${address} ${INITIAL_SUPPLY}`);
  console.log(`   https://<network>.bscscan.com/address/${address}\n`);

  return address;
}

main()
  .then(() => {
    console.log("Deployment completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
