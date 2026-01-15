import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Image,
  Linking,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp, useFocusEffect } from '@react-navigation/native';

import ChainSelector from '../components/ChainSelector';
import DepositCard, { Deposit } from '../components/DepositCard';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { RootStackParamList, Chain, Network } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import {
  connectWallet as connectWalletUtil,
  getWalletAddress,
  checkWalletNetwork,
  ensureCorrectNetwork,
  sendEVMTransaction,
  sendSolanaTransaction,
  isSolana,
  isEVM,
  formatAddress,
} from '../utils/wallet';
import {
  getConnection,
  getUserDeposits,
  getClaimableDeposits,
  buildWithdrawTransaction,
  buildClaimTransaction,
  fetchDepositAccount,
  SolanaDeposit,
  clearClaimableDepositsCache,
  clearAllDepositsCache,
} from '../utils/solanaProgram';
import { getTokenMetadata } from '../utils/solanaTokens';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp;
  chain: Chain;
  network: Network;
  onChainChange: (chain: Chain) => void;
  onNetworkChange: (network: Network) => void;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function HomeScreen({ navigation, chain, network, onChainChange, onNetworkChange }: HomeScreenProps) {
  const { t } = useLanguage();
  const [walletAddress, setWalletAddress] = useState('');
  const [connected, setConnected] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [claimableDeposits, setClaimableDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'deposits' | 'claimable'>('deposits');
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  useEffect(() => {
    if (connected && walletAddress) {
      fetchUserDeposits(walletAddress);
      if (isSolana(chain)) {
        fetchClaimableDeposits(walletAddress);
      }
    }
  }, [chain, network, connected]);

  // Refresh deposits when screen comes into focus (e.g., after ProofOfLife)
  useFocusEffect(
    useCallback(() => {
      if (connected && walletAddress) {
        console.log('[HomeScreen] Screen focused, refreshing deposits...');
        fetchUserDeposits(walletAddress);
      }
    }, [connected, walletAddress, chain, network])
  );

  const connectWallet = async () => {
    console.log('[HomeScreen] connectWallet called, chain:', chain, 'network:', network);

    try {
      // Check if wallet is on correct network first
      const isCorrectNetwork = await checkWalletNetwork(chain, network);
      console.log('[HomeScreen] isCorrectNetwork:', isCorrectNetwork);

      if (!isCorrectNetwork && isEVM(chain)) {
        Alert.alert(
          t.wallet.wrongNetwork,
          t.wallet.switchToTestnet,
          [
            { text: t.common.cancel, style: 'cancel' },
            {
              text: 'Switch',
              onPress: async () => {
                try {
                  await ensureCorrectNetwork(chain, network);
                  // After switching, connect wallet
                  const address = await connectWalletUtil(chain);
                  setWalletAddress(address);
                  setConnected(true);
                  fetchUserDeposits(address);
                } catch (error: any) {
                  Alert.alert(t.common.error, error.message || 'Failed to switch network');
                }
              },
            },
          ]
        );
        return;
      }

      console.log('[HomeScreen] Calling connectWallet for chain:', chain);
      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/41be2666-eece-4516-8405-3624718a9213',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HomeScreen.tsx:102',message:'Before connectWalletUtil',data:{chain},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const address = await connectWalletUtil(chain);
      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/41be2666-eece-4516-8405-3624718a9213',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HomeScreen.tsx:107',message:'Address received from connectWalletUtil',data:{address,addressType:typeof address,addressLength:address?.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      console.log('[HomeScreen] Wallet address received:', address);

      // Clear cache to ensure fresh data on new connection
      if (isSolana(chain)) {
        clearAllDepositsCache();
      }

      setWalletAddress(address);
      setConnected(true);
      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/41be2666-eece-4516-8405-3624718a9213',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HomeScreen.tsx:115',message:'Before fetchUserDeposits',data:{address},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      fetchUserDeposits(address);
    } catch (error: any) {
      console.error('[HomeScreen] connectWallet error:', error);
      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/41be2666-eece-4516-8405-3624718a9213',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HomeScreen.tsx:119',message:'connectWallet error caught',data:{errorMessage:error?.message,errorName:error?.name,errorStack:error?.stack?.substring?.(0,500)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const walletName = isSolana(chain) ? 'Phantom' : 'MetaMask';
      Alert.alert(
        t.common.error,
        error.message || `Please install ${walletName} wallet to use this app`
      );
    }
  };

  const disconnectWallet = () => {
    setConnected(false);
    setWalletAddress('');
    setDeposits([]);
  };

  const fetchUserDeposits = async (address: string) => {
    try {
      if (isSolana(chain)) {
        // Direct Solana RPC call - no backend needed
        console.log('[HomeScreen] Fetching Solana deposits directly from RPC');
        const connection = getConnection(network);
        const solanaDeposits = await getUserDeposits(connection, address);

        // Convert SolanaDeposit to Deposit format for UI compatibility
        const formattedDeposits: Deposit[] = solanaDeposits.map((d, index) => {
          const tokenMetadata = getTokenMetadata(d.tokenMint, network);

          // Use on-chain seed
          const depositSeed = d.depositSeed;

          return {
            depositIndex: index,
            depositor: d.depositor,
            receiver: d.receiver,
            tokenAddress: d.tokenMint, // Map tokenMint to tokenAddress for compatibility
            amount: d.amount.toString(), // Keep bigint as string to preserve precision
            lastProofTimestamp: d.lastProofTimestamp,
            timeoutSeconds: d.timeoutSeconds,
            elapsed: d.elapsed,
            isExpired: d.isExpired,
            isClosed: d.isClosed,
            decimals: tokenMetadata.decimals,
            tokenSymbol: tokenMetadata.symbol,
            // Store the PDA address and seed for later use
            depositAddress: d.address,
            depositSeed, // Now includes on-chain seed from SolanaDeposit
          };
        });

        console.log('[HomeScreen] Solana deposits fetched:', formattedDeposits.length);
        setDeposits(formattedDeposits);
      } else {
        // EVM: Use backend API
        const response = await fetch(
          `${API_URL}/api/deposits/${address}?chain=${chain}&network=${network}`
        );
        const result = await response.json();

        if (result.success && result.deposits) {
          setDeposits(result.deposits);
        }
      }
    } catch (error) {
      console.error('Failed to fetch deposits:', error);
    }
  };

  const fetchClaimableDeposits = async (address: string) => {
    try {
      if (!isSolana(chain)) return;

      console.log('[HomeScreen] Fetching claimable deposits for receiver:', address);
      const connection = getConnection(network);
      const claimable = await getClaimableDeposits(connection, address);

      // Convert to Deposit format and filter for expired only
      const formattedClaimable: Deposit[] = claimable
        .filter(d => d.isExpired && !d.isClosed)
        .map((d, index) => ({
          depositIndex: index,
          depositor: d.depositor,
          receiver: d.receiver,
          tokenAddress: d.tokenMint, // Map tokenMint to tokenAddress
          amount: d.amount.toString(), // Keep bigint as string
          lastProofTimestamp: d.lastProofTimestamp,
          timeoutSeconds: d.timeoutSeconds,
          elapsed: d.elapsed,
          isExpired: d.isExpired,
          isClosed: d.isClosed,
          depositAddress: d.address,
          depositSeed: d.depositSeed, // Include on-chain deposit seed
        }));

      console.log('[HomeScreen] Claimable deposits:', formattedClaimable.length);
      setClaimableDeposits(formattedClaimable);
    } catch (error) {
      console.error('Failed to fetch claimable deposits:', error);
    }
  };

  const handleClaim = async (depositIndex: number) => {
    console.log('[HomeScreen] Claiming deposit:', depositIndex);
    setLoading(true);
    try {
      const deposit = claimableDeposits[depositIndex];
      if (!deposit || !deposit.depositAddress) {
        Alert.alert('Error', 'Deposit not found');
        setLoading(false);
        return;
      }

      if (!isSolana(chain)) {
        Alert.alert('Error', 'Claim is only available for Solana');
        setLoading(false);
        return;
      }

      console.log('[HomeScreen] Building Solana claim transaction');
      const { PublicKey } = await import('@solana/web3.js');

      const connection = getConnection(network);
      const receiverPubkey = new PublicKey(walletAddress);
      const depositorPubkey = new PublicKey(deposit.depositor);
      const depositPubkey = new PublicKey(deposit.depositAddress);
      const tokenMintPubkey = new PublicKey(deposit.tokenMint || deposit.tokenAddress);

      // Get the deposit seed
      let depositSeed: string | null = deposit.depositSeed || null;

      if (!depositSeed) {
        console.log('[HomeScreen] Deposit seed not found, fetching from contract...');
        try {
          const depositAccount = await fetchDepositAccount(connection, deposit.depositAddress);
          if (depositAccount && depositAccount.depositSeed) {
            depositSeed = depositAccount.depositSeed;
            console.log('[HomeScreen] Deposit seed fetched from contract:', depositSeed);
          }
        } catch (error) {
          console.error('[HomeScreen] Failed to fetch deposit seed:', error);
        }
      }

      if (!depositSeed) {
        console.log('[HomeScreen] Deposit seed not found');
        Alert.alert(
          'Error',
          'Deposit seed not found. This deposit was created before seed storage was implemented.\n\nPlease use a CLI tool to claim or contact support.',
          [{ text: 'OK' }]
        );
        setLoading(false);
        return;
      }

      console.log('[HomeScreen] Using deposit seed:', depositSeed);

      // Build the claim transaction with the correct seed
      const transaction = await buildClaimTransaction(
        connection,
        receiverPubkey,
        depositorPubkey,
        depositPubkey,
        tokenMintPubkey,
        depositSeed // Use the actual deposit seed, not timestamp
      );

      // Sign and send
      const signature = await sendSolanaTransaction(transaction);

      console.log('[HomeScreen] Claim successful:', signature);
      Alert.alert('Success!', `Claimed! Transaction: ${signature}`);

      // Clear cache and refresh both lists
      clearClaimableDepositsCache(walletAddress);
      await fetchUserDeposits(walletAddress);
      await fetchClaimableDeposits(walletAddress);
    } catch (error: any) {
      console.error('[HomeScreen] Claim error:', error);
      Alert.alert('Error', error.message || 'Failed to claim');
    } finally {
      setLoading(false);
    }
  };

  const handleProofOfLife = async (depositIndex: number) => {
    const deposit = deposits[depositIndex];
    navigation.navigate('ProofOfLife', {
      depositIndex,
      chain,
      network,
      walletAddress,
      depositAddress: deposit?.depositAddress, // Pass Solana PDA address
    });
  };

  const handleWithdraw = async (depositIndex: number) => {
    console.log('[HomeScreen] Withdrawing from deposit:', depositIndex);
    setLoading(true);
    try {
      if (isSolana(chain)) {
        // Direct Solana withdrawal - no backend needed
        const deposit = deposits[depositIndex];
        if (!deposit || !deposit.depositAddress) {
          Alert.alert('Error', 'Deposit not found');
          setLoading(false);
          return;
        }

        console.log('[HomeScreen] Solana withdraw - building transaction');
        const { PublicKey } = await import('@solana/web3.js');

        const connection = getConnection(network);
        const depositorPubkey = new PublicKey(walletAddress);
        const depositPubkey = new PublicKey(deposit.depositAddress);
        const tokenMintPubkey = new PublicKey(deposit.tokenMint || deposit.tokenAddress);

        // Get the deposit seed from contract
        let depositSeed: string | null = deposit.depositSeed || null;

        if (!depositSeed) {
          console.log('[HomeScreen] Deposit seed not found, fetching from contract...');
          try {
            const depositAccount = await fetchDepositAccount(connection, deposit.depositAddress);
            if (depositAccount && depositAccount.depositSeed) {
              depositSeed = depositAccount.depositSeed;
              console.log('[HomeScreen] Deposit seed fetched from contract:', depositSeed);
            }
          } catch (error) {
            console.error('[HomeScreen] Failed to fetch deposit seed:', error);
          }
        }

        if (!depositSeed) {
          console.log('[HomeScreen] Deposit seed not found');
          Alert.alert(
            'Error',
            'Deposit seed not found. This deposit was created before seed storage was implemented.\n\nPlease use a CLI tool to withdraw or contact support.',
            [{ text: 'OK' }]
          );
          setLoading(false);
          return;
        }

        console.log('[HomeScreen] Using deposit seed:', depositSeed);

        // Build the withdraw transaction with the correct seed
        const transaction = await buildWithdrawTransaction(
          connection,
          depositorPubkey,
          depositPubkey,
          tokenMintPubkey,
          depositSeed // Use the actual deposit seed, not timestamp
        );

        // Sign and send
        const signature = await sendSolanaTransaction(transaction);

        console.log('[HomeScreen] Solana withdraw successful:', signature);
        Alert.alert('Success!', `Withdrawn! Transaction: ${signature}`);
        await fetchUserDeposits(walletAddress);
      } else {
        // EVM: Use backend API
        const isCorrectNetwork = await checkWalletNetwork(chain, network);
        if (!isCorrectNetwork) {
          Alert.alert(
            t.wallet.wrongNetwork,
            t.wallet.switchToTestnet,
            [{ text: 'OK' }]
          );
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_URL}/api/withdraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chain,
            network,
            depositIndex,
            depositor: walletAddress,
          }),
        });

        const result = await response.json();
        console.log('[HomeScreen] Withdraw API response:', result);

        if (result.success && result.data) {
          // Convert value to hex if needed
          let valueHex = result.data.value || '0x0';
          if (valueHex && !valueHex.startsWith('0x')) {
            valueHex = '0x' + BigInt(valueHex).toString(16);
          }

          const txParams: any = {
            from: walletAddress,
            to: result.data.to,
            data: result.data.data,
            value: valueHex,
          };

          if (result.data.gasEstimate) {
            txParams.gas = result.data.gasEstimate;
          }

          console.log('[HomeScreen] Withdraw transaction params:', txParams);
          const txHash = await sendEVMTransaction(txParams);

          console.log('[HomeScreen] Withdraw successful:', txHash);
          Alert.alert('Success!', `Withdrawn! Transaction: ${txHash}`);
          await fetchUserDeposits(walletAddress);
        } else {
          console.error('[HomeScreen] Withdraw failed:', result);
          Alert.alert('Error', result.error || 'Failed to withdraw');
        }
      }
    } catch (error: any) {
      console.error('[HomeScreen] Withdraw error:', error);
      Alert.alert('Error', error.message || 'Failed to withdraw');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <ChainSelector
          selectedChain={chain}
          selectedNetwork={network}
          onChainChange={onChainChange}
          onNetworkChange={onNetworkChange}
        />
        <View style={styles.headerActions}>
          <LanguageSwitcher />
          {connected && (
            <TouchableOpacity style={styles.disconnectButton} onPress={disconnectWallet}>
              <Ionicons name="log-out-outline" size={20} color="#50d56b" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {!connected ? (
          <View style={styles.welcomeContainer}>
            <View style={styles.iconContainer}>
              <Image source={require('../assets/icon.png')} style={styles.logo} />
            </View>
            <Text style={styles.projectName}>死了么 Dielema</Text>
            <Text style={styles.welcomeTitle}>{t.home.welcomeTitle}</Text>
            <Text style={styles.welcomeSubtitle}>
              {t.home.welcomeSubtitle}
            </Text>
            <Text style={styles.welcomeDescription}>
              {t.home.welcomeDescription}
            </Text>


            <TouchableOpacity style={styles.connectButton} onPress={connectWallet}>
              <Text style={styles.connectButtonText}>{t.home.connectWallet}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.buyDLMButtonSmall}
              onPress={() => Linking.openURL('https://pump.fun/coin/dVA6zfXBRieUCPS8GR4hve5ugmp5naPvKGFquUDpump')}
            >
              <Text style={styles.buyDLMButtonSmallText}>{t.home.buyDLM}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.howItWorksLink} onPress={() => setShowHowItWorks(true)}>
              <Text style={styles.howItWorksLinkText}>{t.home.howItWorks}</Text>
              <Ionicons name="information-circle-outline" size={16} color="#50d56b" />
            </TouchableOpacity>

            {/* Social Links */}
            <View style={styles.socialLinksContainer}>
              <TouchableOpacity
                style={styles.socialButton}
                onPress={() => Linking.openURL('https://x.com/dielema_icu')}
              >
                <Ionicons name="logo-twitter" size={24} color="#1DA1F2" />
                <Text style={styles.socialButtonText}>@dielema_icu</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.socialButton}
                onPress={() => Linking.openURL('https://t.me/dielema_icu')}
              >
                <Ionicons name="paper-plane-outline" size={24} color="#0088cc" />
                <Text style={styles.socialButtonText}>@dielema_icu</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.connectedContainer}>
            <View style={styles.walletCard}>
              <View style={styles.walletInfo}>
                <Text style={styles.walletLabel}>{t.home.connected}</Text>
                <Text style={styles.walletAddress}>
                  {formatAddress(walletAddress, chain)}
                </Text>
              </View>
              <View style={styles.balanceIndicator}>
                <Ionicons name="checkmark-circle" size={20} color="#00b894" />
              </View>
            </View>

            {/* Tab Switcher for Solana - show both deposits and claimable */}
            {isSolana(chain) && (
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'deposits' && styles.tabActive]}
                  onPress={() => setActiveTab('deposits')}
                >
                  <Text style={[styles.tabText, activeTab === 'deposits' && styles.tabTextActive]}>
                    {t.home.yourDeposits} ({deposits.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'claimable' && styles.tabActive]}
                  onPress={() => setActiveTab('claimable')}
                >
                  <Text style={[styles.tabText, activeTab === 'claimable' && styles.tabTextActive]}>
                    {t.home.claimable} ({claimableDeposits.length})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Deposits Tab */}
            {(activeTab === 'deposits' || !isSolana(chain)) && (
              deposits.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="add-circle-outline" size={80} color="#b2bec3" />
                  <Text style={styles.emptyStateTitle}>{t.home.noDeposits}</Text>
                  <Text style={styles.emptyStateDescription}>
                    {t.home.noDepositsDescription}
                  </Text>
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() =>
                      navigation.navigate('AddDeposit', {
                        chain,
                        network,
                        walletAddress,
                      })
                    }
                  >
                    <Ionicons name="add" size={28} color="#fff" />
                    <Text style={styles.addButtonText}>{t.home.addDeposit}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.depositsContainer}>
                  {!isSolana(chain) && (
                    <View style={styles.depositsHeader}>
                      <Text style={styles.depositsTitle}>{t.home.yourDeposits}</Text>
                      <TouchableOpacity
                        style={styles.smallAddButton}
                        onPress={() =>
                          navigation.navigate('AddDeposit', {
                            chain,
                            network,
                            walletAddress,
                          })
                        }
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  )}
                  {isSolana(chain) && (
                    <TouchableOpacity
                      style={styles.addButtonSmall}
                      onPress={() =>
                        navigation.navigate('AddDeposit', {
                          chain,
                          network,
                          walletAddress,
                        })
                      }
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                      <Text style={styles.addButtonSmallText}>New Deposit</Text>
                    </TouchableOpacity>
                  )}
                  {deposits.map((deposit) => (
                    <DepositCard
                      key={deposit.depositIndex}
                      deposit={deposit}
                      onProofOfLife={handleProofOfLife}
                      onWithdraw={handleWithdraw}
                    />
                  ))}
                </View>
              )
            )}

            {/* Claimable Tab (Solana only) */}
            {isSolana(chain) && activeTab === 'claimable' && (
              claimableDeposits.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="gift-outline" size={80} color="#b2bec3" />
                  <Text style={styles.emptyStateTitle}>No Claimable Deposits</Text>
                  <Text style={styles.emptyStateDescription}>
                    When someone names you as a receiver and their proof-of-life expires, their deposits will appear here.
                  </Text>
                </View>
              ) : (
                <View style={styles.depositsContainer}>
                  {claimableDeposits.map((deposit) => (
                    <View key={`claimable-${deposit.depositIndex}`} style={styles.claimableCard}>
                      <View style={styles.claimableHeader}>
                        <Text style={styles.claimableTitle}>From: {formatAddress(deposit.depositor, chain)}</Text>
                        <View style={styles.expiredBadge}>
                          <Text style={styles.expiredBadgeText}>Expired</Text>
                        </View>
                      </View>
                      <View style={styles.claimableDetails}>
                        <Text style={styles.claimableAmount}>
                          {(Number(deposit.amount) / 1e9).toFixed(4)} tokens
                        </Text>
                        <Text style={styles.claimableInfo}>
                          Expired {Math.floor(deposit.elapsed! / 86400)} days ago
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.claimButton}
                        onPress={() => handleClaim(deposit.depositIndex)}
                      >
                        <Ionicons name="gift" size={18} color="#fff" />
                        <Text style={styles.claimButtonText}>Claim Tokens</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )
            )}
          </View>
        )}
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#50d56b" />
        </View>
      )}

      {/* How It Works Modal */}
      <Modal
        visible={showHowItWorks}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowHowItWorks(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.home.howItWorksTitle}</Text>
              <TouchableOpacity onPress={() => setShowHowItWorks(false)}>
                <Ionicons name="close" size={24} color="#636e72" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalText}>{t.home.howItWorksContent}</Text>
            <TouchableOpacity
              style={styles.buyDLMButton}
              onPress={() => Linking.openURL('https://pump.fun/coin/dVA6zfXBRieUCPS8GR4hve5ugmp5naPvKGFquUDpump')}
            >
              <Ionicons name="cart" size={20} color="#fff" />
              <Text style={styles.buyDLMButtonText}>{t.home.buyDLM}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dfe6e9',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  disconnectButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 70,
    backgroundColor: '#e8f8ec',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  logo: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
  },
  projectName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#50d56b',
    marginBottom: 16,
  },
  socialLinksContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 40,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  socialButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3436',
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2d3436',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#50d56b',
    marginBottom: 32,
  },
  welcomeDescription: {
    fontSize: 14,
    color: '#636e72',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 20,
  },
  connectButton: {
    backgroundColor: '#50d56b',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#50d56b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buyDLMButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6c5ce7',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 12,
    shadowColor: '#6c5ce7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  buyDLMButtonSmallText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  connectedContainer: {
    flex: 1,
  },
  walletCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  walletInfo: {
    flex: 1,
  },
  walletLabel: {
    fontSize: 12,
    color: '#636e72',
    marginBottom: 4,
  },
  walletAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3436',
  },
  balanceIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e3f9e5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2d3436',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyStateDescription: {
    fontSize: 14,
    color: '#636e72',
    marginBottom: 32,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#50d56b',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#50d56b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  depositsContainer: {
    flex: 1,
  },
  depositsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  depositsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3436',
  },
  smallAddButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#50d56b',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#50d56b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#50d56b',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#636e72',
  },
  tabTextActive: {
    color: '#fff',
  },
  // Add button small (for tabs view)
  addButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#50d56b',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    marginBottom: 12,
  },
  addButtonSmallText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Claimable deposit styles
  claimableCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#fdcb6e',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  claimableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  claimableTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3436',
  },
  expiredBadge: {
    backgroundColor: '#ffeaa7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  expiredBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d68910',
  },
  claimableDetails: {
    marginBottom: 12,
  },
  claimableAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3436',
    marginBottom: 4,
  },
  claimableInfo: {
    fontSize: 12,
    color: '#636e72',
  },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fdcb6e',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // How It Works link
  howItWorksLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  howItWorksLinkText: {
    fontSize: 14,
    color: '#50d56b',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3436',
    flex: 1,
  },
  modalText: {
    fontSize: 15,
    color: '#636e72',
    lineHeight: 22,
    marginBottom: 24,
  },
  buyDLMButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#50d56b',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
    shadowColor: '#50d56b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  buyDLMButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
