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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp, useFocusEffect } from '@react-navigation/native';

import ChainSelector from '../components/ChainSelector';
import DepositCard, { Deposit } from '../components/DepositCard';
import { RootStackParamList, Chain } from '../types';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp;
  chain: Chain;
  network: string;
  onChainChange: (chain: Chain) => void;
}

const API_URL = 'http://localhost:3000';

export default function HomeScreen({ navigation, chain, network, onChainChange }: HomeScreenProps) {
  const [walletAddress, setWalletAddress] = useState('');
  const [connected, setConnected] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (connected && walletAddress) {
      fetchUserDeposits(walletAddress);
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
    try {
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const accounts = await (window as any).ethereum.request({
          method: 'eth_requestAccounts',
        });
        setWalletAddress(accounts[0]);
        setConnected(true);
        fetchUserDeposits(accounts[0]);
      } else {
        Alert.alert('Error', 'Please install MetaMask to use this app');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to connect wallet');
    }
  };

  const disconnectWallet = () => {
    setConnected(false);
    setWalletAddress('');
    setDeposits([]);
  };

  const fetchUserDeposits = async (address: string) => {
    try {
      const response = await fetch(
        `${API_URL}/api/deposits/${address}?chain=${chain}&network=${network}`
      );
      const result = await response.json();

      if (result.success && result.deposits) {
        setDeposits(result.deposits);
      }
    } catch (error) {
      console.error('Failed to fetch deposits:', error);
    }
  };

  const handleProofOfLife = async (depositIndex: number) => {
    navigation.navigate('ProofOfLife', {
      depositIndex,
      chain,
      network,
      walletAddress,
    });
  };

  const handleWithdraw = async (depositIndex: number) => {
    console.log('[HomeScreen] Withdrawing from deposit:', depositIndex);
    setLoading(true);
    try {
      // Check network first
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const chainId = await (window as any).ethereum.request({ method: 'eth_chainId' });
        console.log('[HomeScreen] Current chainId:', chainId);
        if (chainId !== '0x61') {
          Alert.alert(
            'Wrong Network',
            'Please switch to BSC Testnet (Chain ID: 97) to withdraw',
            [{ text: 'OK' }]
          );
          setLoading(false);
          return;
        }
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

      if (result.success && result.data && (window as any).ethereum) {
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

        const txHash = await (window as any).ethereum.request({
          method: 'eth_sendTransaction',
          params: [txParams],
        });

        console.log('[HomeScreen] Withdraw successful:', txHash);
        Alert.alert('Success!', `Withdrawn! Transaction: ${txHash}`);
        await fetchUserDeposits(walletAddress);
      } else {
        console.error('[HomeScreen] Withdraw failed:', result);
        Alert.alert('Error', result.error || 'Failed to withdraw');
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
        <ChainSelector selectedChain={chain} onChainChange={onChainChange} />
        {connected && (
          <TouchableOpacity style={styles.disconnectButton} onPress={disconnectWallet}>
            <Ionicons name="log-out-outline" size={20} color="#6c5ce7" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {!connected ? (
          <View style={styles.welcomeContainer}>
            <View style={styles.iconContainer}>
              <Ionicons name="wallet-outline" size={80} color="#6c5ce7" />
            </View>
            <Text style={styles.welcomeTitle}>Welcome to Dielemma</Text>
            <Text style={styles.welcomeSubtitle}>
              Proof of Life Smart Contract
            </Text>
            <Text style={styles.welcomeDescription}>
              Connect your wallet to create time-locked deposits that require periodic proof of life.
            </Text>
            <TouchableOpacity style={styles.connectButton} onPress={connectWallet}>
              <Text style={styles.connectButtonText}>Connect Wallet</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.connectedContainer}>
            <View style={styles.walletCard}>
              <View style={styles.walletInfo}>
                <Text style={styles.walletLabel}>Connected</Text>
                <Text style={styles.walletAddress}>
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </Text>
              </View>
              <View style={styles.balanceIndicator}>
                <Ionicons name="checkmark-circle" size={20} color="#00b894" />
              </View>
            </View>

            {deposits.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="add-circle-outline" size={80} color="#b2bec3" />
                <Text style={styles.emptyStateTitle}>No Deposits</Text>
                <Text style={styles.emptyStateDescription}>
                  Create your first time-locked deposit
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
                  <Text style={styles.addButtonText}>Add Deposit</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.depositsContainer}>
                <View style={styles.depositsHeader}>
                  <Text style={styles.depositsTitle}>Your Deposits</Text>
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
                {deposits.map((deposit) => (
                  <DepositCard
                    key={deposit.depositIndex}
                    deposit={deposit}
                    onProofOfLife={handleProofOfLife}
                    onWithdraw={handleWithdraw}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6c5ce7" />
        </View>
      )}
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
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2d3436',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#6c5ce7',
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
    backgroundColor: '#6c5ce7',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#6c5ce7',
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
    backgroundColor: '#6c5ce7',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#6c5ce7',
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
    backgroundColor: '#6c5ce7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6c5ce7',
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
});
