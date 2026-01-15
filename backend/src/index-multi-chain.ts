import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

console.log('[DEBUG] Loading Dielemma backend...');

// Import shared types and chain services
import {
  ChainType,
  NetworkType,
  DepositRequest,
  ProofOfLifeRequest,
  WithdrawRequest,
  ClaimRequest,
  GetDepositRequest,
  CHAIN_CONFIGS,
} from '../shared/types';
import { ChainServiceFactory } from './chains/factory';

console.log('[DEBUG] Types and factory imported successfully');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log('[DEBUG] Express app created, PORT:', PORT);

// Default chain configuration (can be overridden per request)
const DEFAULT_CHAIN: ChainType = (process.env.DEFAULT_CHAIN as ChainType) || ChainType.SOLANA;
const DEFAULT_NETWORK: NetworkType = (process.env.DEFAULT_NETWORK as NetworkType) || NetworkType.TESTNET;

// Extend Express Request type
interface ChainRequest extends Request {
  chainContext?: {
    chain: ChainType;
    network: NetworkType;
  };
}

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:8082'];

// Middleware
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(express.json());

// Middleware to validate chain parameter
const validateChain = (req: ChainRequest, res: Response, next: any) => {
  const chain = (req.body?.chain || req.params?.chain || req.query?.chain || DEFAULT_CHAIN) as ChainType;
  const network = (req.body?.network || req.params?.network || req.query?.network || DEFAULT_NETWORK) as NetworkType;

  if (!ChainServiceFactory.isSupported(chain)) {
    return res.status(400).json({
      error: `Unsupported chain: ${chain}`,
      supportedChains: ChainServiceFactory.getSupportedChains(),
    });
  }

  req.chainContext = { chain, network };
  next();
};

// Health check
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const query = req.query as any;
    const selectedChain = (query.chain as ChainType) || DEFAULT_CHAIN;
    const selectedNetwork = (query.network as NetworkType) || DEFAULT_NETWORK;

    const service = ChainServiceFactory.getService(selectedChain, selectedNetwork);
    const health = await service.getHealth();

    res.json({
      ...health,
      chain: selectedChain,
      network: selectedNetwork,
      supportedChains: ChainServiceFactory.getSupportedChains(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Health check failed' });
  }
});

// Get supported chains
app.get('/api/chains', (req: Request, res: Response) => {
  const chains = ChainServiceFactory.getSupportedChains().map(chainType => {
    const config = CHAIN_CONFIGS[chainType];
    return {
      chain: chainType,
      chainId: config.chainId,
      rpcUrls: config.rpcUrls,
      programId: config.programId,
      contractAddress: config.contractAddress,
      blockExplorer: config.blockExplorer,
      nativeCurrency: config.nativeCurrency,
    };
  });

  res.json({
    success: true,
    defaultChain: DEFAULT_CHAIN,
    defaultNetwork: DEFAULT_NETWORK,
    chains,
  });
});

// Create deposit instruction/transaction
app.post('/api/deposit', validateChain, async (req: ChainRequest, res: Response) => {
  try {
    const { chain, network } = req.chainContext!;
    const { depositor, receiver, tokenAddress, amount, timeoutSeconds } = req.body;

    if (!depositor || !receiver || !tokenAddress || !amount || timeoutSeconds === undefined) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const request: DepositRequest = {
      chain,
      network,
      depositor,
      receiver,
      tokenAddress,
      amount: amount.toString(),
      timeoutSeconds,
    };

    const service = ChainServiceFactory.getService(chain, network);
    const result = await service.createDeposit(request);

    res.json(result);
  } catch (error: any) {
    console.error('Error creating deposit:', error);
    res.status(500).json({ error: error.message || 'Failed to create deposit' });
  }
});

// Create proof-of-life instruction/transaction
app.post('/api/proof-of-life', validateChain, async (req: ChainRequest, res: Response) => {
  try {
    const { chain, network } = req.chainContext!;
    const { depositId, depositIndex, depositor } = req.body;

    if (!depositId && depositIndex === undefined) {
      return res.status(400).json({ error: 'depositId or depositIndex is required' });
    }

    const request: ProofOfLifeRequest = {
      chain,
      network,
      depositId: depositId || '',
      depositIndex,
      depositor,
    };

    const service = ChainServiceFactory.getService(chain, network);
    const result = await service.createProofOfLife(request);

    res.json(result);
  } catch (error: any) {
    console.error('Error creating proof-of-life:', error);
    res.status(500).json({ error: error.message || 'Failed to create proof-of-life' });
  }
});

// Create withdraw instruction/transaction
app.post('/api/withdraw', validateChain, async (req: ChainRequest, res: Response) => {
  try {
    const { chain, network } = req.chainContext!;
    const { depositId, depositIndex, depositor } = req.body;

    if (!depositId && depositIndex === undefined) {
      return res.status(400).json({ error: 'depositId or depositIndex is required' });
    }

    const request: WithdrawRequest = {
      chain,
      network,
      depositId: depositId || '',
      depositIndex,
      depositor,
    };

    const service = ChainServiceFactory.getService(chain, network);
    const result = await service.createWithdraw(request);

    res.json(result);
  } catch (error: any) {
    console.error('Error creating withdraw:', error);
    res.status(500).json({ error: error.message || 'Failed to create withdraw' });
  }
});

// Create claim instruction/transaction
app.post('/api/claim', validateChain, async (req: ChainRequest, res: Response) => {
  try {
    const { chain, network } = req.chainContext!;
    const { depositId, depositIndex, receiver } = req.body;

    if (!depositId && depositIndex === undefined) {
      return res.status(400).json({ error: 'depositId or depositIndex is required' });
    }

    const request: ClaimRequest = {
      chain,
      network,
      depositId: depositId || '',
      depositIndex,
      receiver,
    };

    const service = ChainServiceFactory.getService(chain, network);
    const result = await service.createClaim(request);

    res.json(result);
  } catch (error: any) {
    console.error('Error creating claim:', error);
    res.status(500).json({ error: error.message || 'Failed to create claim' });
  }
});

// Get deposit info
app.get('/api/deposit', validateChain, async (req: ChainRequest, res: Response) => {
  try {
    const { chain, network } = req.chainContext!;
    const query = req.query as any;
    const { depositId, depositIndex } = query;

    if (!depositId && depositIndex === undefined) {
      return res.status(400).json({ error: 'depositId or depositIndex is required' });
    }

    const request: GetDepositRequest = {
      chain,
      network,
      depositId: depositId || '',
      depositIndex: depositIndex ? Number(depositIndex) : undefined,
    };

    const service = ChainServiceFactory.getService(chain, network);
    const result = await service.getDeposit(request);

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching deposit:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch deposit' });
  }
});

// Get user deposits
app.get('/api/deposits/:user', validateChain, async (req: ChainRequest, res: Response) => {
  try {
    const { chain, network } = req.chainContext!;
    const { user } = req.params;

    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'User address is required' });
    }

    const service = ChainServiceFactory.getService(chain, network);
    const result = await service.getUserDeposits(user);

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching user deposits:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch deposits' });
  }
});

// Get claimable deposits (Solana only)
app.get('/api/claimable/:receiverAddress', validateChain, async (req: ChainRequest, res: Response) => {
  try {
    const { chain, network } = req.chainContext!;
    const { receiverAddress } = req.params;

    if (!receiverAddress || typeof receiverAddress !== 'string') {
      return res.status(400).json({ error: 'Receiver address is required' });
    }

    const service = ChainServiceFactory.getService(chain, network);
    const result = await service.getClaimableDeposits({ chain, network, receiverAddress });

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching claimable deposits:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch claimable deposits' });
  }
});

// Get latest blockhash
app.get('/api/blockhash', validateChain, async (req: ChainRequest, res: Response) => {
  try {
    const { chain, network } = req.chainContext!;

    const service = ChainServiceFactory.getService(chain, network);
    const result = await service.getLatestBlockhash({ chain, network });

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching latest blockhash:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch latest blockhash' });
  }
});

// Get token balances
app.get('/api/balances/:walletAddress', validateChain, async (req: ChainRequest, res: Response) => {
  try {
    const { chain, network } = req.chainContext!;
    const { walletAddress } = req.params;

    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const service = ChainServiceFactory.getService(chain, network);
    const result = await service.getTokenBalances({ chain, network, walletAddress });

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching token balances:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch token balances' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('Dielemma Backend Server Starting...');
  console.log(`Port: ${PORT}`);
  console.log(`Default Chain: ${DEFAULT_CHAIN || 'solana'}`);
  console.log(`Default Network: ${DEFAULT_NETWORK || 'testnet'}`);
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
