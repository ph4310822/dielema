import { expect } from "chai";
import { ethers, SignerWithAddress } from "hardhat";
import { Dielemma, MockERC20, DielemmaToken } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Import contract types
describe("Dielemma Contract", function () {
  let dielemma: Dielemma;
  let dielemmaToken: DielemmaToken;
  let mockToken: MockERC20;
  let owner: SignerWithAddress;
  let depositor: SignerWithAddress;
  let receiver: SignerWithAddress;
  let other: SignerWithAddress;

  const ONE_DAY = 86400; // 24 hours in seconds
  const DEPOSIT_AMOUNT = ethers.parseEther("100");

  async function deployMockFixture() {
    // Deploy mock ERC20 token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Mock Token", "MTK");

    // Deploy DielemmaToken
    const DielemmaToken = await ethers.getContractFactory("DielemmaToken");
    dielemmaToken = await DielemmaToken.deploy(ethers.parseEther("1000000"));
    await dielemmaToken.waitForDeployment();

    // Set official token in Dielemma contract
    await dielemma.connect(owner).setOfficialToken(await dielemmaToken.getAddress());
  }

  beforeEach(async function () {
    [owner, depositor, receiver, other] = await ethers.getSigners();

    // Deploy Dielemma contract
    const Dielemma = await ethers.getContractFactory("Dielemma");
    dielemma = await Dielemma.deploy();
    await dielemma.waitForDeployment();

    // Deploy mock token
    await deployMockFixture();

    // Mint tokens to depositor
    await mockToken.mint(depositor.address, DEPOSIT_AMOUNT * 2n);
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await dielemma.owner()).to.equal(owner.address);
    });

    it("Should not be paused initially", async function () {
      expect(await dielemma.paused()).to.equal(false);
    });

    it("Should have zero deposits initially", async function () {
      expect(await dielemma.getTotalDeposits()).to.equal(0);
    });
  });

  describe("Deposit (Native Token)", function () {
    it("Should accept native token deposit", async function () {
      const depositTx = await dielemma.connect(depositor).deposit(
        receiver.address,
        ethers.ZeroAddress, // Zero address for native token
        DEPOSIT_AMOUNT,
        ONE_DAY,
        { value: DEPOSIT_AMOUNT }
      );

      // Get deposit ID from event
      const receipt = await depositTx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "Deposited"
      );
      const depositId = event?.args[0];

      // Verify deposit
      const depositData = await dielemma.getDeposit(depositId);
      expect(depositData.deposit.depositor).to.equal(depositor.address);
      expect(depositData.deposit.receiver).to.equal(receiver.address);
      expect(depositData.deposit.amount).to.equal(DEPOSIT_AMOUNT);
    });

    it("Should fail with zero amount", async function () {
      await expect(
        dielemma.connect(depositor).deposit(
          receiver.address,
          ethers.ZeroAddress,
          0,
          ONE_DAY
        )
      ).to.be.revertedWithCustomError(dielemma, "InvalidAmount");
    });

    it("Should fail with zero timeout", async function () {
      await expect(
        dielemma.connect(depositor).deposit(
          receiver.address,
          ethers.ZeroAddress,
          DEPOSIT_AMOUNT,
          0,
          { value: DEPOSIT_AMOUNT }
        )
      ).to.be.revertedWithCustomError(dielemma, "InvalidTimeout");
    });

    it("Should fail with invalid receiver", async function () {
      await expect(
        dielemma.connect(depositor).deposit(
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          DEPOSIT_AMOUNT,
          ONE_DAY,
          { value: DEPOSIT_AMOUNT }
        )
      ).to.be.revertedWithCustomError(dielemma, "InvalidReceiver");
    });

    it("Should fail when paused", async function () {
      await dielemma.connect(owner).togglePause();

      await expect(
        dielemma.connect(depositor).deposit(
          receiver.address,
          ethers.ZeroAddress,
          DEPOSIT_AMOUNT,
          ONE_DAY,
          { value: DEPOSIT_AMOUNT }
        )
      ).to.be.revertedWithCustomError(dielemma, "ContractPaused");
    });
  });

  describe("Deposit (ERC20 Token)", function () {
    beforeEach(async function () {
      // Approve contract to spend tokens
      await mockToken.connect(depositor).approve(await dielemma.getAddress(), DEPOSIT_AMOUNT);
    });

    it("Should accept ERC20 token deposit", async function () {
      const depositTx = await dielemma.connect(depositor).deposit(
        receiver.address,
        await mockToken.getAddress(),
        DEPOSIT_AMOUNT,
        ONE_DAY
      );

      // Get deposit ID from event
      const receipt = await depositTx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "Deposited"
      );
      const depositId = event?.args[0];

      // Verify deposit
      const depositData = await dielemma.getDeposit(depositId);
      expect(depositData.deposit.depositor).to.equal(depositor.address);
      expect(depositData.deposit.receiver).to.equal(receiver.address);
      expect(depositData.deposit.token).to.equal(await mockToken.getAddress());
      expect(depositData.deposit.amount).to.equal(DEPOSIT_AMOUNT);
    });
  });

  describe("Proof of Life", function () {
    let depositId: bigint;

    beforeEach(async function () {
      // Create a deposit first
      const depositTx = await dielemma.connect(depositor).deposit(
        receiver.address,
        ethers.ZeroAddress,
        DEPOSIT_AMOUNT,
        ONE_DAY,
        { value: DEPOSIT_AMOUNT }
      );

      const receipt = await depositTx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "Deposited"
      );
      depositId = event?.args[0];
    });

    it("Should allow depositor to update proof of life", async function () {
      // Transfer tokens from owner to depositor for testing
      await dielemmaToken.transfer(depositor.address, ethers.parseEther("10"));

      // Approve tokens for burning
      await dielemmaToken.connect(depositor).approve(await dielemma.getAddress(), ethers.parseEther("1"));

      const initialTimestamp = (await dielemma.getDeposit(depositId)).deposit.lastProofTimestamp;

      // Advance time
      await time.increase(3600); // 1 hour

      // Update proof of life
      await dielemma.connect(depositor).proofOfLife(depositId);

      const newTimestamp = (await dielemma.getDeposit(depositId)).deposit.lastProofTimestamp;
      expect(newTimestamp).to.be.gt(initialTimestamp);
    });

    it("Should fail when non-depositor tries to update", async function () {
      await expect(
        dielemma.connect(other).proofOfLife(depositId)
      ).to.be.revertedWithCustomError(dielemma, "NotDepositor");
    });

    it("Should fail when deposit is closed", async function () {
      // Withdraw first
      await dielemma.connect(depositor).withdraw(depositId);

      // Try to update proof of life
      await expect(
        dielemma.connect(depositor).proofOfLife(depositId)
      ).to.be.revertedWithCustomError(dielemma, "AlreadyClosed");
    });
  });

  describe("Withdraw", function () {
    let depositId: bigint;

    beforeEach(async function () {
      // Create a deposit first
      const depositTx = await dielemma.connect(depositor).deposit(
        receiver.address,
        ethers.ZeroAddress,
        DEPOSIT_AMOUNT,
        ONE_DAY,
        { value: DEPOSIT_AMOUNT }
      );

      const receipt = await depositTx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "Deposited"
      );
      depositId = event?.args[0];
    });

    it("Should allow depositor to withdraw", async function () {
      const initialBalance = await ethers.provider.getBalance(depositor.address);

      // Withdraw
      const tx = await dielemma.connect(depositor).withdraw(depositId);
      const receipt = await tx.wait();
      const gasUsed = receipt?.gasUsed || 0n;
      const gasPrice = receipt?.gasPrice || 0n;
      const gasCost = gasUsed * gasPrice;

      const finalBalance = await ethers.provider.getBalance(depositor.address);
      expect(finalBalance).to.be.closeTo(initialBalance + DEPOSIT_AMOUNT - gasCost, DEPOSIT_AMOUNT / 100n);

      // Verify deposit is closed
      const depositData = await dielemma.getDeposit(depositId);
      expect(depositData.deposit.isClosed).to.equal(true);
    });

    it("Should fail when non-depositor tries to withdraw", async function () {
      await expect(
        dielemma.connect(other).withdraw(depositId)
      ).to.be.revertedWithCustomError(dielemma, "NotDepositor");
    });

    it("Should fail when deposit is already closed", async function () {
      // Withdraw first time
      await dielemma.connect(depositor).withdraw(depositId);

      // Try to withdraw again
      await expect(
        dielemma.connect(depositor).withdraw(depositId)
      ).to.be.revertedWithCustomError(dielemma, "AlreadyClosed");
    });
  });

  describe("Claim", function () {
    let depositId: bigint;

    beforeEach(async function () {
      // Create a deposit first
      const depositTx = await dielemma.connect(depositor).deposit(
        receiver.address,
        ethers.ZeroAddress,
        DEPOSIT_AMOUNT,
        ONE_DAY,
        { value: DEPOSIT_AMOUNT }
      );

      const receipt = await depositTx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "Deposited"
      );
      depositId = event?.args[0];
    });

    it("Should allow receiver to claim after timeout", async function () {
      // Advance time beyond timeout
      await time.increase(ONE_DAY + 1);

      const initialBalance = await ethers.provider.getBalance(receiver.address);

      // Claim
      const tx = await dielemma.connect(receiver).claim(depositId);
      const receipt = await tx.wait();
      const gasUsed = receipt?.gasUsed || 0n;
      const gasPrice = receipt?.gasPrice || 0n;
      const gasCost = gasUsed * gasPrice;

      const finalBalance = await ethers.provider.getBalance(receiver.address);
      expect(finalBalance).to.be.closeTo(initialBalance + DEPOSIT_AMOUNT - gasCost, DEPOSIT_AMOUNT / 100n);

      // Verify deposit is closed
      const depositData = await dielemma.getDeposit(depositId);
      expect(depositData.deposit.isClosed).to.equal(true);
    });

    it("Should fail when non-receiver tries to claim", async function () {
      await expect(
        dielemma.connect(other).claim(depositId)
      ).to.be.revertedWithCustomError(dielemma, "NotReceiver");
    });

    it("Should fail before timeout expires", async function () {
      // Advance time but not enough
      await time.increase(3600); // 1 hour (less than 1 day)

      await expect(
        dielemma.connect(receiver).claim(depositId)
      ).to.be.revertedWithCustomError(dielemma, "NotExpired");
    });

    it("Should fail when deposit is already closed", async function () {
      // Withdraw first
      await dielemma.connect(depositor).withdraw(depositId);

      // Try to claim
      await expect(
        dielemma.connect(receiver).claim(depositId)
      ).to.be.revertedWithCustomError(dielemma, "AlreadyClosed");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to transfer ownership", async function () {
      await dielemma.connect(owner).transferOwnership(receiver.address);

      expect(await dielemma.owner()).to.equal(receiver.address);
    });

    it("Should fail when non-owner tries to transfer ownership", async function () {
      await expect(
        dielemma.connect(other).transferOwnership(other.address)
      ).to.be.revertedWithCustomError(dielemma, "Unauthorized");
    });

    it("Should allow owner to toggle pause", async function () {
      await dielemma.connect(owner).togglePause();
      expect(await dielemma.paused()).to.equal(true);

      await dielemma.connect(owner).togglePause();
      expect(await dielemma.paused()).to.equal(false);
    });

    it("Should fail when non-owner tries to toggle pause", async function () {
      await expect(
        dielemma.connect(other).togglePause()
      ).to.be.revertedWithCustomError(dielemma, "Unauthorized");
    });
  });

  describe("View Functions", function () {
    let depositId: bigint;

    beforeEach(async function () {
      const depositTx = await dielemma.connect(depositor).deposit(
        receiver.address,
        ethers.ZeroAddress,
        DEPOSIT_AMOUNT,
        ONE_DAY,
        { value: DEPOSIT_AMOUNT }
      );

      const receipt = await depositTx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "Deposited"
      );
      depositId = event?.args[0];
    });

    it("Should return correct deposit info", async function () {
      const depositData = await dielemma.getDeposit(depositId);

      expect(depositData.deposit.depositor).to.equal(depositor.address);
      expect(depositData.deposit.receiver).to.equal(receiver.address);
      expect(depositData.deposit.amount).to.equal(DEPOSIT_AMOUNT);
      expect(depositData.deposit.timeoutSeconds).to.equal(ONE_DAY);
      expect(depositData.isExpired).to.equal(false);
    });

    it("Should return user deposits", async function () {
      const userDeposits = await dielemma.getUserDeposits(depositor.address);
      expect(userDeposits).to.include(depositId);
    });

    it("Should return receiver deposits", async function () {
      const receiverDeposits = await dielemma.getReceiverDeposits(receiver.address);
      expect(receiverDeposits).to.include(depositId);
    });
  });

  describe("Token Burning - Proof of Life", function () {
    let depositId: bigint;
    const BURN_AMOUNT = ethers.parseEther("1");
    const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

    beforeEach(async function () {
      // Transfer tokens from owner to depositor for testing
      await dielemmaToken.transfer(depositor.address, ethers.parseEther("100"));

      // Create a deposit
      const depositTx = await dielemma.connect(depositor).deposit(
        receiver.address,
        ethers.ZeroAddress,
        DEPOSIT_AMOUNT,
        ONE_DAY,
        { value: DEPOSIT_AMOUNT }
      );

      const receipt = await depositTx.wait();
      const event = receipt?.logs.find((log: any) => log.fragment?.name === "Deposited");
      depositId = event?.args[0];
    });

    it("Should burn 1 token on proofOfLife", async function () {
      // Approve tokens
      await dielemmaToken.connect(depositor).approve(await dielemma.getAddress(), BURN_AMOUNT);

      // Check initial balance
      const initialBalance = await dielemmaToken.balanceOf(depositor.address);

      // Call proofOfLife
      await dielemma.connect(depositor).proofOfLife(depositId);

      // Check final balance
      const finalBalance = await dielemmaToken.balanceOf(depositor.address);
      expect(finalBalance).to.equal(initialBalance - BURN_AMOUNT);

      // Verify burn address received the tokens
      const burnAddressBalance = await dielemmaToken.balanceOf(BURN_ADDRESS);
      expect(burnAddressBalance).to.equal(BURN_AMOUNT);
    });

    it("Should fail when official token is not set", async function () {
      // Unset official token
      await dielemma.connect(owner).setOfficialToken(ethers.ZeroAddress);

      // Transfer tokens to depositor
      await dielemmaToken.transfer(depositor.address, ethers.parseEther("10"));

      // Approve tokens
      await dielemmaToken.connect(depositor).approve(await dielemma.getAddress(), BURN_AMOUNT);

      await expect(dielemma.connect(depositor).proofOfLife(depositId)).to.be.revertedWithCustomError(
        dielemma,
        "OfficialTokenNotSet"
      );
    });

    it("Should fail when user hasn't approved tokens", async function () {
      // ERC20's transferFrom will revert with ERC20InsufficientAllowance error
      // Our contract's BurnFailed is never reached because transferFrom reverts
      await expect(dielemma.connect(depositor).proofOfLife(depositId)).to.be.reverted;
    });

    it("Should fail when user doesn't have enough tokens", async function () {
      // Transfer 99.5 tokens from depositor to owner to leave them with only 0.5 tokens
      await dielemmaToken.connect(depositor).transfer(owner.address, ethers.parseEther("99.5"));

      // Approve 1 token (more than the 0.5 they have)
      await dielemmaToken.connect(depositor).approve(await dielemma.getAddress(), BURN_AMOUNT);

      // ERC20's transferFrom will revert with ERC20InsufficientBalance error
      await expect(dielemma.connect(depositor).proofOfLife(depositId)).to.be.reverted;
    });

    it("Should emit TokenBurned event", async function () {
      // Approve tokens
      await dielemmaToken.connect(depositor).approve(await dielemma.getAddress(), BURN_AMOUNT);

      await expect(dielemma.connect(depositor).proofOfLife(depositId))
        .to.emit(dielemma, "TokenBurned")
        .withArgs(depositId, depositor.address, BURN_AMOUNT);
    });

    it("Should emit TokenBurned event with correct parameters", async function () {
      // Approve tokens
      await dielemmaToken.connect(depositor).approve(await dielemma.getAddress(), BURN_AMOUNT);

      const tx = await dielemma.connect(depositor).proofOfLife(depositId);
      const receipt = await tx.wait();

      // Find TokenBurned event
      const tokenBurnedEvent = receipt?.logs.find((log: any) => log.fragment?.name === "TokenBurned");

      expect(tokenBurnedEvent).to.not.be.undefined;
      expect(tokenBurnedEvent?.args[0]).to.equal(depositId);
      expect(tokenBurnedEvent?.args[1]).to.equal(depositor.address);
      expect(tokenBurnedEvent?.args[2]).to.equal(BURN_AMOUNT);
    });

    it("Should allow multiple proofOfLife calls with token burning", async function () {
      // Approve enough tokens for multiple burns
      await dielemmaToken.connect(depositor).approve(await dielemma.getAddress(), ethers.parseEther("3"));

      const initialBalance = await dielemmaToken.balanceOf(depositor.address);

      // First proofOfLife
      await dielemma.connect(depositor).proofOfLife(depositId);
      let balance = await dielemmaToken.balanceOf(depositor.address);
      expect(balance).to.equal(initialBalance - BURN_AMOUNT);

      // Advance time
      await time.increase(3600);

      // Second proofOfLife
      await dielemma.connect(depositor).proofOfLife(depositId);
      balance = await dielemmaToken.balanceOf(depositor.address);
      expect(balance).to.equal(initialBalance - BURN_AMOUNT * 2n);

      // Advance time again
      await time.increase(3600);

      // Third proofOfLife
      await dielemma.connect(depositor).proofOfLife(depositId);
      balance = await dielemmaToken.balanceOf(depositor.address);
      expect(balance).to.equal(initialBalance - BURN_AMOUNT * 3n);
    });

    it("Should allow owner to update official token", async function () {
      const newToken = await dielemmaToken.getAddress();

      await expect(dielemma.connect(owner).setOfficialToken(newToken))
        .to.emit(dielemma, "OfficialTokenUpdated")
        .withArgs(await dielemma.getOfficialToken(), newToken);
    });

    it("Should fail when non-owner tries to set official token", async function () {
      await expect(
        dielemma.connect(other).setOfficialToken(await dielemmaToken.getAddress())
      ).to.be.revertedWithCustomError(dielemma, "Unauthorized");
    });

    it("Should return official token address from getOfficialToken", async function () {
      const officialToken = await dielemma.getOfficialToken();
      expect(officialToken).to.equal(await dielemmaToken.getAddress());
    });
  });
});
