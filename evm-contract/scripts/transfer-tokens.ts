import { ethers } from "hardhat";

async function main() {
  const RECIPIENT = "0x3385e9d21e9C0fD9f2382F9D7FFdf297af553d8B";
  const TOKEN_ADDRESS = "0x11443f26414Cf3990dD6BD051dEBa4428164a799";
  const AMOUNT = ethers.parseEther("100"); // 100 DLM tokens

  console.log("\n=== Transferring DLM Tokens ===\n");
  console.log("Recipient:", RECIPIENT);
  console.log("Amount:", ethers.formatEther(AMOUNT), "DLM");
  console.log("Token:", TOKEN_ADDRESS);

  const [signer] = await ethers.getSigners();
  console.log("Sender:", signer.address);

  // Get token contract
  const DielemmaToken = await ethers.getContractFactory("DielemmaToken");
  const token = DielemmaToken.attach(TOKEN_ADDRESS);

  // Check sender balance
  const senderBalance = await token.balanceOf(signer.address);
  console.log("\nSender balance:", ethers.formatEther(senderBalance), "DLM");

  if (senderBalance < AMOUNT) {
    console.error("Insufficient balance!");
    process.exit(1);
  }

  // Transfer tokens
  console.log("\nTransferring...");
  const tx = await token.transfer(RECIPIENT, AMOUNT);
  console.log("Transaction submitted:", tx.hash);

  console.log("Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("Transaction confirmed in block:", receipt?.blockNumber);

  // Verify new balances
  const newSenderBalance = await token.balanceOf(signer.address);
  const recipientBalance = await token.balanceOf(RECIPIENT);

  console.log("\n=== Transaction Complete ===");
  console.log("Sender balance:", ethers.formatEther(newSenderBalance), "DLM");
  console.log("Recipient balance:", ethers.formatEther(recipientBalance), "DLM");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
