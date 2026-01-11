import { ethers } from "hardhat";

async function main() {
  const tokenAddress = process.env.TOKEN_ADDRESS;
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!tokenAddress || !contractAddress) {
    console.error("Missing required arguments");
    console.log(
      "Usage: TOKEN_ADDRESS=<address> CONTRACT_ADDRESS=<address> npx hardhat run scripts/set-official-token.ts --network <network>"
    );
    process.exit(1);
  }

  console.log("\n=== Setting Official Token Address ===\n");
  console.log("Token Address:", tokenAddress);
  console.log("Contract Address:", contractAddress);

  // Get contract instance
  const Dielemma = await ethers.getContractFactory("Dielemma");
  const dielemma = Dielemma.attach(contractAddress);

  // Verify the caller is the owner
  const owner = await dielemma.owner();
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();

  console.log("\nContract owner:", owner);
  console.log("Signer address:", signerAddress);

  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    console.error("\nError: Signer is not the contract owner!");
    console.log("Please run this script with the owner account.");
    process.exit(1);
  }

  // Set official token
  console.log("\nSetting official token...");
  const tx = await dielemma.setOfficialToken(tokenAddress);
  console.log("Transaction submitted:", tx.hash);

  console.log("Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("Transaction confirmed in block:", receipt?.blockNumber);

  // Verify
  const officialToken = await dielemma.officialToken();
  console.log("\nVerification:");
  console.log("Official Token:", officialToken);
  console.log("Success!" + (officialToken.toLowerCase() === tokenAddress.toLowerCase() ? " ✓" : " ✗"));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
