// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title DielemmaToken - Official ERC20 Token for Dielemma Ecosystem
 * @author Dielemma Team
 * @dev Simple ERC20 token used for proof-of-life burning mechanism
 *
 * Users burn DLM tokens when calling proofOfLife() in the Dielemma contract.
 * This creates a cost associated with proving life, preventing spam and
 * aligning incentives.
 */
contract DielemmaToken is ERC20 {
    /// @dev Contract deployer and initial token recipient
    address public immutable owner;

    /**
     * @notice Initializes the token with name, symbol, and initial supply
     * @param initialSupply The total supply of tokens to mint (in wei)
     *
     * All initial tokens are minted to the deployer's address.
     * The deployer is responsible for distributing tokens to users.
     */
    constructor(uint256 initialSupply) ERC20("Dielemma", "DLM") {
        owner = msg.sender;
        _mint(msg.sender, initialSupply);
    }
}
