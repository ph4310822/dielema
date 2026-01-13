// ERC-20 ABI for token operations (only the functions we need)
const ERC20_ABI = [
  // balanceOf
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
  // approve
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
  // allowance
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
];

// DLM Token addresses from backend shared types
const DLM_TOKEN_ADDRESSES: Record<string, string> = {
  bsc_testnet: '0x11443f26414Cf3990dD6BD051dEBa4428164a799',
  solana_devnet: '9iJpLnJ4VkPjDopdrCz4ykgT1nkYNA3jD3GcsGauu4gm', // DLM token on Solana devnet
  // Add other chains as needed
};

const DLM_CONTRACT_ADDRESS: Record<string, string> = {
  bsc_testnet: '0xa23453F2bC8d23a8162fB7d61C2E62c79A2C2837', // Deployed 2025-01-11 with token burning
};

// Get DLM token address for chain/network
export const getDLMTokenAddress = (chain: string, network: string): string => {
  const key = `${chain}_${network}`;
  const address = DLM_TOKEN_ADDRESSES[key] || '';
  console.log('[DLM Token] getDLMTokenAddress:', { key, address });
  return address;
};

// Get Dielemma contract address for approval
export const getContractAddress = (chain: string, network: string): string => {
  const key = `${chain}_${network}`;
  const address = DLM_CONTRACT_ADDRESS[key] || '';
  console.log('[DLM Token] getContractAddress:', { key, address });
  return address;
};

// Encode function call for ERC-20
export const encodeFunctionCall = (functionName: string, params: any[]): string => {
  // Method ID: first 4 bytes of keccak256(functionName + types)
  const methodIds: Record<string, string> = {
    balanceOf: '0x70a08231',
    approve: '0x095ea7b3',
    allowance: '0xdd62ed3e',
  };

  const methodId = methodIds[functionName];
  if (!methodId) {
    throw new Error(`Unknown function: ${functionName}`);
  }

  // Encode parameters
  let encoded = methodId;

  if (functionName === 'balanceOf') {
    // address (32 bytes, padded to left)
    const address = params[0].toLowerCase().replace('0x', '');
    encoded += '0'.repeat(64 - address.length) + address;
  } else if (functionName === 'approve') {
    // address (32 bytes)
    const spender = params[0].toLowerCase().replace('0x', '');
    encoded += '0'.repeat(64 - spender.length) + spender;
    // uint256 (32 bytes)
    const value = BigInt(params[1]).toString(16).padStart(64, '0');
    encoded += value;
  } else if (functionName === 'allowance') {
    // owner address
    const owner = params[0].toLowerCase().replace('0x', '');
    encoded += '0'.repeat(64 - owner.length) + owner;
    // spender address
    const spender = params[1].toLowerCase().replace('0x', '');
    encoded += '0'.repeat(64 - spender.length) + spender;
  }

  return encoded;
};

// Fetch DLM token balance
export const getDLMBalance = async (
  walletAddress: string,
  chain: string,
  network: string
): Promise<{ balance: string; formatted: string }> => {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No wallet connected');
  }

  const tokenAddress = getDLMTokenAddress(chain, network);
  if (!tokenAddress) {
    throw new Error('DLM token not configured for this network');
  }

  try {
    // Call balanceOf(address)
    const data = encodeFunctionCall('balanceOf', [walletAddress]);

    const result = await (window as any).ethereum.request({
      method: 'eth_call',
      params: [
        {
          to: tokenAddress,
          data: data,
        },
        'latest',
      ],
    });

    // Parse result (hex string to decimal)
    const balance = BigInt(result).toString();
    const formatted = (Number(result) / 1e18).toFixed(2);

    console.log('[DLM Token] Balance:', { balance, formatted });
    return { balance, formatted };
  } catch (error) {
    console.error('[DLM Token] Failed to fetch balance:', error);
    throw error;
  }
};

// Check if user has approved the contract to spend tokens
export const getAllowance = async (
  ownerAddress: string,
  chain: string,
  network: string
): Promise<{ allowance: string; isApproved: boolean }> => {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No wallet connected');
  }

  const tokenAddress = getDLMTokenAddress(chain, network);
  const contractAddress = getContractAddress(chain, network);

  if (!tokenAddress || !contractAddress) {
    throw new Error('Token or contract not configured');
  }

  try {
    // Call allowance(owner, spender)
    const data = encodeFunctionCall('allowance', [ownerAddress, contractAddress]);

    const result = await (window as any).ethereum.request({
      method: 'eth_call',
      params: [
        {
          to: tokenAddress,
          data: data,
        },
        'latest',
      ],
    });

    const allowance = BigInt(result).toString();
    const isApproved = BigInt(result) >= BigInt(1e18); // At least 1 DLM approved

    console.log('[DLM Token] Allowance:', { allowance, isApproved });
    return { allowance, isApproved };
  } catch (error) {
    console.error('[DLM Token] Failed to fetch allowance:', error);
    throw error;
  }
};

// Approve DLM token spending
export const approveDLM = async (
  chain: string,
  network: string,
  amount?: string
): Promise<string> => {
  console.log('[DLM Token] approveDLM START', { chain, network });

  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No wallet connected');
  }

  const tokenAddress = getDLMTokenAddress(chain, network);
  const contractAddress = getContractAddress(chain, network);

  console.log('[DLM Token] Addresses:', {
    token: tokenAddress,
    contract: contractAddress,
    tokenValid: tokenAddress && tokenAddress.startsWith('0x') && tokenAddress.length === 42,
    contractValid: contractAddress && contractAddress.startsWith('0x') && contractAddress.length === 42,
  });

  if (!tokenAddress || !tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
    throw new Error(`Invalid token address: ${tokenAddress}`);
  }

  if (!contractAddress || !contractAddress.startsWith('0x') || contractAddress.length !== 42) {
    throw new Error(`Invalid contract address: ${contractAddress}`);
  }

  // Approve unlimited amount (2^256 - 1) or specific amount
  const approvalAmount = amount || '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

  try {
    // Get the from address
    const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
    const fromAddress = accounts[0];

    // Encode approve(spender, amount)
    const data = encodeFunctionCall('approve', [contractAddress, approvalAmount]);

    console.log('[DLM Token] Transaction params:', {
      from: fromAddress,
      to: tokenAddress,
      dataLength: data.length,
      dataPreview: data.substring(0, 50) + '...',
    });

    const txHash = await (window as any).ethereum.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from: fromAddress,
          to: tokenAddress,
          data: data,
        },
      ],
    });

    console.log('[DLM Token] Approval tx:', txHash);
    return txHash;
  } catch (error) {
    console.error('[DLM Token] Approval failed:', error);
    throw error;
  }
};
