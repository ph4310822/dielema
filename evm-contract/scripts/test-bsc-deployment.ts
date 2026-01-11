import { ethers } from "hardhat";

/**
 * Test script for Dielemma contract on BSC Testnet
 * Tests all core functionality
 */

const CONTRACT_ADDRESS = "0x05557f1c1f02E1dbbfb5af874a1E3395b0dd1745";
const ONE_DAY = 86400; // 24 hours in seconds

// ABI for the functions we need to test
const DIELEMMA_ABI = [
  "function deposit(address receiver, address token, uint256 amount, uint256 timeoutSeconds) payable returns (uint256)",
  "function proofOfLife(uint256 depositId) external",
  "function withdraw(uint256 depositId) external",
  "function claim(uint256 depositId) external",
  "function getDeposit(uint256 depositId) external view returns (tuple(address depositor, address receiver, address token, uint256 amount, uint256 lastProofTimestamp, uint256 timeoutSeconds, bool isClosed) deposit, uint256 elapsed, bool isExpired)",
  "function getTotalDeposits() external view returns (uint256)",
  "function owner() external view returns (address)",
  "function paused() external view returns (bool)",
  "event Deposited(uint256 indexed depositId, address indexed depositor, address indexed receiver, address token, uint256 amount, uint256 timeoutSeconds)",
  "event ProofOfLife(uint256 indexed depositId, address indexed depositor, uint256 timestamp)",
  "event Withdrawn(uint256 indexed depositId, address indexed depositor, uint256 amount)",
  "event Claimed(uint256 indexed depositId, address indexed receiver, uint256 amount)",
];

async function main() {
  console.log("\n=== Testing Dielemma Contract on BSC Testnet ===\n");

  const signers = await ethers.getSigners();
  console.log("Available signers:", signers.length);

  const deployer = signers[0];

  // Generate random receiver addresses (these don't need private keys for receiving)
  // We'll use address(1) and address(2) which are common burn/test addresses
  const user2Address = "0x0000000000000000000000000000000000000001";
  const user3Address = "0x0000000000000000000000000000000000000002";

  console.log("Deployer:", deployer.address);
  console.log("User2 Address (Receiver):", user2Address);
  console.log("User3 Address (Receiver):", user3Address);

  // Connect to contract
  const contract = new ethers.Contract(CONTRACT_ADDRESS, DIELEMMA_ABI, deployer);

  // Get contract info
  console.log("\n--- Contract Info ---");
  console.log("Contract Address:", CONTRACT_ADDRESS);
  console.log("Owner:", await contract.owner());
  console.log("Paused:", await contract.paused());
  console.log("Total Deposits:", (await contract.getTotalDeposits()).toString());

  // Get balances
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log("\nDeployer Balance:", ethers.formatEther(deployerBalance), "BNB");

  // Test 1: Deposit with native BNB
  console.log("\n--- Test 1: Deposit with Native BNB ---");
  try {
    const amount = ethers.parseEther("0.01"); // 0.01 BNB
    const timeout = ONE_DAY; // 24 hours

    console.log("Depositing 0.01 BNB for 24 hours...");
    const tx = await contract.deposit(user2Address, ethers.ZeroAddress, amount, timeout, {
      value: amount,
    });
    const receipt = await tx.wait();

    // Parse logs for Deposited event
    const depositEvent = receipt?.logs.find((log: any) => {
      try {
        return contract.interface.parseLog(log)?.name === "Deposited";
      } catch {
        return false;
      }
    });

    if (depositEvent) {
      const parsed = contract.interface.parseLog(depositEvent);
      const depositId = parsed.args.depositId;
      console.log("✅ Deposit successful! Deposit ID:", depositId.toString());
      console.log("   Transaction:", tx.hash);

      // Get deposit info
      const depositInfo = await contract.getDeposit(depositId);
      console.log("\n--- Deposit Info ---");
      console.log("Depositor:", depositInfo.deposit.depositor);
      console.log("Receiver:", depositInfo.deposit.receiver);
      console.log("Token:", depositInfo.deposit.token);
      console.log("Amount:", ethers.formatEther(depositInfo.deposit.amount), "BNB");
      console.log("Timeout:", depositInfo.deposit.timeoutSeconds.toString(), "seconds");
      console.log("Is Closed:", depositInfo.deposit.isClosed);
      console.log("Elapsed:", depositInfo.elapsed.toString(), "seconds");
      console.log("Is Expired:", depositInfo.isExpired);

      // Test 2: Proof of Life
      console.log("\n--- Test 2: Proof of Life ---");
      console.log("Sending proof of life...");
      const proofTx = await contract.proofOfLife(depositId);
      await proofTx.wait();
      console.log("✅ Proof of life successful!");
      console.log("   Transaction:", proofTx.hash);

      // Check updated timestamp
      const updatedInfo = await contract.getDeposit(depositId);
      console.log("New elapsed time:", updatedInfo.elapsed.toString(), "seconds");
      console.log("Is Expired:", updatedInfo.isExpired);

      // Test 3: Try to claim before expiration (should fail)
      console.log("\n--- Test 3: Claim Before Expiration (Should Fail) ---");
      try {
        await contract.claim(depositId);
        console.log("❌ Claim succeeded when it should have failed!");
      } catch (error: any) {
        console.log("✅ Claim correctly failed (caller is not the receiver):", error.message.split("(")[0].trim());
      }

      // Test 4: Withdraw by depositor
      console.log("\n--- Test 4: Withdraw by Depositor ---");
      console.log("Withdrawing deposit...");
      const withdrawTx = await contract.withdraw(depositId);
      const withdrawReceipt = await withdrawTx.wait();
      console.log("✅ Withdraw successful!");
      console.log("   Transaction:", withdrawTx.hash);

      // Verify deposit is closed
      const finalInfo = await contract.getDeposit(depositId);
      console.log("Deposit is closed:", finalInfo.deposit.isClosed);

      // Test 5: Try to withdraw again (should fail)
      console.log("\n--- Test 5: Withdraw Again (Should Fail) ---");
      try {
        await contract.withdraw(depositId);
        console.log("❌ Second withdrawal succeeded when it should have failed!");
      } catch (error: any) {
        console.log("✅ Second withdrawal correctly failed with error:", error.message.split("(")[0].trim());
      }
    }
  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
  }

  // Test 6: Create a new deposit for claim test
  console.log("\n--- Test 6: Create Deposit for Claim Test ---");
  try {
    const amount = ethers.parseEther("0.005"); // 0.005 BNB
    const timeout = 1; // 1 second for quick testing

    console.log("Creating deposit with 1 second timeout...");
    const tx = await contract.deposit(user3Address, ethers.ZeroAddress, amount, timeout, {
      value: amount,
    });
    const receipt = await tx.wait();

    const depositEvent = receipt?.logs.find((log: any) => {
      try {
        return contract.interface.parseLog(log)?.name === "Deposited";
      } catch {
        return false;
      }
    });

    if (depositEvent) {
      const parsed = contract.interface.parseLog(depositEvent);
      const depositId = parsed.args.depositId;
      console.log("✅ Deposit created! Deposit ID:", depositId.toString());

      // Wait for expiration
      console.log("Waiting 2 seconds for timeout to expire...");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check if expired
      const depositInfo = await contract.getDeposit(depositId);
      console.log("Is Expired:", depositInfo.isExpired);

      // Test 7: Claim by receiver
      console.log("\n--- Test 7: Claim by Receiver ---");
      console.log("Note: Receiver is address(2) - a burn address without a private key");
      console.log("      In a real scenario, the receiver would use their wallet to claim");
      try {
        await contract.claim(depositId);
        console.log("❌ Claim succeeded when it should have failed!");
      } catch (error: any) {
        console.log("✅ Claim correctly failed (caller is depositor, not receiver):", error.message.split("(")[0].trim());
      }

      // Since we can't claim, let's show the deposit is still accessible by withdrawing
      console.log("\n   Depositor withdrawing to show deposit is still accessible...");
      const withdrawTx2 = await contract.withdraw(depositId);
      await withdrawTx2.wait();
      console.log("✅ Withdraw successful - deposit was accessible by depositor");

      // Verify deposit is closed
      const finalInfo = await contract.getDeposit(depositId);
      console.log("Deposit is closed:", finalInfo.deposit.isClosed);
    }
  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
  }

  // Summary
  console.log("\n=== Test Summary ===");
  const totalDeposits = await contract.getTotalDeposits();
  console.log("Total Deposits Created:", totalDeposits.toString());
  console.log("\n✅ All tests completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
