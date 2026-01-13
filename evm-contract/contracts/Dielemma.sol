// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Dielemma - Don't take your keys to the grave. (EVM Compatible)
 * @dev Works on BSC, Ethereum, Polygon, Arbitrum, Base, and other EVM chains
 *
 * Users deposit tokens and must periodically prove they are alive.
 * If they fail to do so within the configured timeout period, the receiver can claim the tokens.
 *
 * This contract mirrors the functionality of the Solana Dielemma program.
 */
interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/**
 * @dev Deposit structure representing a single deposit
 */
struct Deposit {
    address depositor;           // Address of the depositor
    address receiver;            // Address who can claim if proof-of-life expires
    address token;               // Token address (address(0) for native token)
    uint256 amount;              // Amount of tokens deposited
    uint256 lastProofTimestamp;  // Unix timestamp of last proof-of-life
    uint256 timeoutSeconds;      // Timeout period in seconds
    bool isClosed;               // Whether tokens have been withdrawn/claimed
}

/**
 * @title Dielemma
 * @author Dielemma Team
 */
contract Dielemma {
    // ============================================
    // State Variables
    // ============================================

    /// @dev Array of all deposits
    Deposit[] public deposits;

    /// @dev Mapping from user address to their deposit indices
    mapping(address => uint256[]) public userDeposits;

    /// @dev Mapping from receiver address to deposit indices they can claim
    mapping(address => uint256[]) public receiverDeposits;

    /// @dev Deposit count for generating unique IDs
    uint256 public depositCount;

    /// @dev Contract owner (for emergency functions, if needed)
    address public owner;

    /// @dev Whether the contract is paused
    bool public paused;

    /// @dev Official Dielemma token address for proof-of-life burning
    address public officialToken;

    // ============================================
    // Events
    // ============================================

    event Deposited(
        uint256 indexed depositId,
        address indexed depositor,
        address indexed receiver,
        address token,
        uint256 amount,
        uint256 timeoutSeconds
    );

    event ProofOfLife(
        uint256 indexed depositId,
        address indexed depositor,
        uint256 timestamp
    );

    event Withdrawn(
        uint256 indexed depositId,
        address indexed depositor,
        uint256 amount
    );

    event Claimed(
        uint256 indexed depositId,
        address indexed receiver,
        uint256 amount
    );

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    event PauseToggled(bool paused);

    event OfficialTokenUpdated(address indexed oldToken, address indexed newToken);

    event TokenBurned(uint256 indexed depositId, address indexed user, uint256 amount);

    // ============================================
    // Errors
    // ============================================

    error InvalidAmount();
    error InvalidTimeout();
    error InvalidReceiver();
    error InvalidToken();
    error DepositNotFound();
    error NotDepositor();
    error NotReceiver();
    error NotExpired();
    error AlreadyClosed();
    error ContractPaused();
    error TransferFailed();
    error Unauthorized();
    error OfficialTokenNotSet();
    error BurnFailed();

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    // ============================================
    // Constructor
    // ============================================

    constructor() {
        owner = msg.sender;
        paused = false;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ============================================
    // Core Functions
    // ============================================

    /**
     * @notice Deposit tokens with a receiver and proof-of-life timeout
     * @dev Supports both ERC20 tokens and native tokens (BNB/ETH/etc)
     * @param receiver Address who can claim if proof-of-life expires
     * @param token Token address (address(0) for native token)
     * @param amount Amount of tokens to deposit
     * @param timeoutSeconds Timeout period in seconds
     * @return depositId The ID of the newly created deposit
     */
    function deposit(
        address receiver,
        address token,
        uint256 amount,
        uint256 timeoutSeconds
    ) external payable whenNotPaused returns (uint256 depositId) {
        // Validation
        if (amount == 0) revert InvalidAmount();
        if (timeoutSeconds == 0) revert InvalidTimeout();
        if (receiver == address(0) || receiver == msg.sender) revert InvalidReceiver();

        // Handle token amount check
        if (token == address(0)) {
            // Native token
            if (msg.value != amount) revert InvalidAmount();
        } else {
            // ERC20 token - check allowance
            uint256 allowance = IERC20(token).allowance(msg.sender, address(this));
            if (allowance < amount) revert InvalidAmount();
        }

        // Create deposit
        depositId = depositCount++;
        deposits.push(Deposit({
            depositor: msg.sender,
            receiver: receiver,
            token: token,
            amount: amount,
            lastProofTimestamp: block.timestamp,
            timeoutSeconds: timeoutSeconds,
            isClosed: false
        }));

        // Update mappings
        userDeposits[msg.sender].push(depositId);
        receiverDeposits[receiver].push(depositId);

        // Transfer tokens to contract
        if (token == address(0)) {
            // Native token - already received via msg.value
        } else {
            // Transfer ERC20 tokens
            bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
            if (!success) revert TransferFailed();
        }

        emit Deposited(depositId, msg.sender, receiver, token, amount, timeoutSeconds);
    }

    /**
     * @notice Proof of life - resets the timer and burns 1 official token
     * @dev Only the depositor can call this function
     * @dev Requires burning 1 official token to the burn address
     * @param depositId The ID of the deposit
     */
    function proofOfLife(uint256 depositId) external whenNotPaused {
        if (depositId >= deposits.length) revert DepositNotFound();

        Deposit storage deposit = deposits[depositId];

        // Check if deposit exists and belongs to sender
        if (deposit.depositor != msg.sender) revert NotDepositor();
        if (deposit.isClosed) revert AlreadyClosed();

        // Check if official token is set
        if (officialToken == address(0)) revert OfficialTokenNotSet();

        // Burn 1 token (1e18 for 18 decimals)
        uint256 burnAmount = 1e18;
        address burnAddress = 0x000000000000000000000000000000000000dEaD;

        // Transfer 1 token from user to burn address
        // User must have approved Dielemma contract to spend their tokens
        bool success = IERC20(officialToken).transferFrom(msg.sender, burnAddress, burnAmount);
        if (!success) revert BurnFailed();

        // Update timestamp
        deposit.lastProofTimestamp = block.timestamp;

        emit ProofOfLife(depositId, msg.sender, block.timestamp);
        emit TokenBurned(depositId, msg.sender, burnAmount);
    }

    /**
     * @notice Withdraw deposited tokens (depositor can always withdraw)
     * @dev Only the depositor can call this function
     * @param depositId The ID of the deposit
     */
    function withdraw(uint256 depositId) external whenNotPaused {
        if (depositId >= deposits.length) revert DepositNotFound();

        Deposit storage deposit = deposits[depositId];

        // Verify depositor
        if (deposit.depositor != msg.sender) revert NotDepositor();
        if (deposit.isClosed) revert AlreadyClosed();

        // Mark as closed
        deposit.isClosed = true;

        // Transfer tokens back to depositor
        _transferToken(deposit.token, msg.sender, deposit.amount);

        emit Withdrawn(depositId, msg.sender, deposit.amount);
    }

    /**
     * @notice Claim tokens if proof-of-life has expired (receiver only)
     * @dev Only the designated receiver can claim, and only if timeout has expired
     * @param depositId The ID of the deposit
     */
    function claim(uint256 depositId) external whenNotPaused {
        if (depositId >= deposits.length) revert DepositNotFound();

        Deposit storage deposit = deposits[depositId];

        // Verify receiver
        if (deposit.receiver != msg.sender) revert NotReceiver();
        if (deposit.isClosed) revert AlreadyClosed();

        // Check if proof-of-life has expired
        uint256 elapsed = block.timestamp - deposit.lastProofTimestamp;
        if (elapsed < deposit.timeoutSeconds) revert NotExpired();

        // Mark as closed
        deposit.isClosed = true;

        // Transfer tokens to receiver
        _transferToken(deposit.token, msg.sender, deposit.amount);

        emit Claimed(depositId, msg.sender, deposit.amount);
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get deposit information
     * @param depositId The ID of the deposit
     * @return deposit The deposit structure
     * @return elapsed Time elapsed since last proof-of-life
     * @return isExpired Whether proof-of-life has expired
     */
    function getDeposit(uint256 depositId)
        external
        view
        returns (
            Deposit memory deposit,
            uint256 elapsed,
            bool isExpired
        )
    {
        if (depositId >= deposits.length) revert DepositNotFound();

        deposit = deposits[depositId];
        elapsed = block.timestamp - deposit.lastProofTimestamp;
        isExpired = elapsed >= deposit.timeoutSeconds;
    }

    /**
     * @notice Get all deposits for a user
     * @param user The user address
     * @return depositIds Array of deposit IDs
     */
    function getUserDeposits(address user) external view returns (uint256[] memory depositIds) {
        return userDeposits[user];
    }

    /**
     * @notice Get all deposits where the user is the receiver
     * @param receiver The receiver address
     * @return depositIds Array of deposit IDs
     */
    function getReceiverDeposits(address receiver) external view returns (uint256[] memory depositIds) {
        return receiverDeposits[receiver];
    }

    /**
     * @notice Get total number of deposits
     * @return count Total deposit count
     */
    function getTotalDeposits() external view returns (uint256 count) {
        return depositCount;
    }

    /**
     * @notice Get the official token address
     * @return tokenAddress The address of the official token
     */
    function getOfficialToken() external view returns (address tokenAddress) {
        return officialToken;
    }

    // ============================================
    // Admin Functions
    // ============================================

    /**
     * @notice Transfer ownership of the contract
     * @dev Only the owner can call this function
     * @param newOwner The address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidReceiver();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice Toggle pause state
     * @dev Only the owner can call this function
     */
    function togglePause() external onlyOwner {
        paused = !paused;
        emit PauseToggled(paused);
    }

    /**
     * @notice Set or update the official token address
     * @dev Only the owner can call this function
     * @param newOfficialToken The address of the new official token
     */
    function setOfficialToken(address newOfficialToken) external onlyOwner {
        address oldToken = officialToken;
        officialToken = newOfficialToken;
        emit OfficialTokenUpdated(oldToken, newOfficialToken);
    }

    // ============================================
    // Internal Functions
    // ============================================

    /**
     * @dev Internal function to transfer tokens (native or ERC20)
     * @param token Token address (address(0) for native token)
     * @param recipient Recipient address
     * @param amount Amount to transfer
     */
    function _transferToken(address token, address recipient, uint256 amount) internal {
        if (token == address(0)) {
            // Transfer native token
            (bool success, ) = recipient.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            // Transfer ERC20 token
            bool success = IERC20(token).transfer(recipient, amount);
            if (!success) revert TransferFailed();
        }
    }

    // ============================================
    // Receive Function
    // ============================================

    /**
     * @dev Accept native token deposits
     * Note: Native tokens should be deposited through the deposit() function
     * This is a fallback to prevent accidental direct transfers
     */
    receive() external payable {
        // Direct transfers are rejected - use deposit() function
        revert("Use deposit() function");
    }
}
