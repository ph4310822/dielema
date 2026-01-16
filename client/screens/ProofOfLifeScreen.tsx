import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/native';
import { PublicKey } from '@solana/web3.js';

import { RootStackParamList, Chain, Network } from '../types';
import {
  getDLMBalance,
  getAllowance,
  approveDLM,
} from '../utils/dlmToken';
import { useLanguage } from '../i18n/LanguageContext';
import {
  checkWalletNetwork,
  sendEVMTransaction,
  isSolana,
  isEVM,
} from '../utils/wallet';
import {
  getConnection,
  buildProofOfLifeTransaction,
  fetchDepositAccount,
} from '../utils/solanaProgram';
import {
  isMobileWalletConnected,
  signAndSendMobileTransaction,
} from '../utils/solanaMobileWallet';
import { BUILD_CONFIG } from '../config/buildConfig';

type ProofOfLifeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ProofOfLife'>;

interface ProofOfLifeScreenProps {
  navigation: ProofOfLifeScreenNavigationProp;
  route: {
    params: {
      depositIndex: number;
      chain: Chain;
      network: Network;
      walletAddress: string;
      depositAddress?: string; // Solana PDA address
    };
  };
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

type Step = 'check' | 'approve' | 'proof' | 'success';

export default function ProofOfLifeScreen({ navigation, route }: ProofOfLifeScreenProps) {
  const { t } = useLanguage();
  const { depositIndex, chain, network, walletAddress, depositAddress } = route.params;

  const [step, setStep] = useState<Step>('check');
  const [loading, setLoading] = useState(false);
  const [dlmBalance, setDlmBalance] = useState<string>('0');
  const [isApproved, setIsApproved] = useState(false);
  const [txHash, setTxHash] = useState<string>('');

  useEffect(() => {
    checkTokenStatus();
  }, []);

  const checkTokenStatus = async () => {
    console.log('[ProofOfLife] Checking token status...');

    if (isSolana(chain)) {
      // Solana: Check DLM token balance for proof of life burning
      console.log('[ProofOfLife] Solana chain detected, checking DLM balance...');
      setLoading(true);

      try {
        // Import Solana token helper
        const { getTokenBalance } = require('../utils/solanaTokens');

        // DLM token mint address (mainnet)
        const dlmMintAddress = 'dVA6zfXBRieUCPS8GR4hve5ugmp5naPvKGFquUDpump';

        // Get DLM balance
        const dlmBalance = await getTokenBalance(walletAddress, dlmMintAddress, network);
        setDlmBalance(dlmBalance.toString());

        console.log('[ProofOfLife] Solana DLM balance:', dlmBalance);

        // Check if user has at least 1 DLM
        if (dlmBalance < 1) {
          Alert.alert(
            'Insufficient DLM Tokens',
            'You need at least 1 DLM token to submit proof of life on Solana.\n\nCurrent balance: ' +
              dlmBalance.toString() +
              ' DLM',
            [
              { text: 'Cancel', onPress: () => navigation.goBack(), style: 'cancel' },
              {
                text: 'Buy $DLM',
                onPress: () => Linking.openURL('https://pump.fun/coin/dVA6zfXBRieUCPS8GR4hve5ugmp5naPvKGFquUDpump')
              },
            ]
          );
          return;
        }

        // Solana doesn't require approval (user signs transaction directly)
        setStep('proof');
        setIsApproved(true);
      } catch (error: any) {
        console.error('[ProofOfLife] Failed to check Solana DLM balance:', error);
        Alert.alert('Error', 'Failed to check DLM token balance: ' + (error.message || 'Unknown error'));
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      // Check DLM balance (EVM only)
      const balanceResult = await getDLMBalance(walletAddress, chain, network);
      setDlmBalance(balanceResult.formatted);

      // Check if already approved
      const allowanceResult = await getAllowance(walletAddress, chain, network);
      setIsApproved(allowanceResult.isApproved);

      console.log('[ProofOfLife] Token status:', {
        balance: balanceResult.formatted,
        isApproved: allowanceResult.isApproved,
      });

      // Determine next step
      if (parseFloat(balanceResult.formatted) < 1) {
        Alert.alert(
          'Insufficient DLM Tokens',
          'You need at least 1 DLM token to submit proof of life.\n\nCurrent balance: ' +
            balanceResult.formatted +
            ' DLM',
          [
            { text: 'Cancel', onPress: () => navigation.goBack(), style: 'cancel' },
            {
              text: 'Buy $DLM',
              onPress: () => Linking.openURL('https://pump.fun/coin/dVA6zfXBRieUCPS8GR4hve5ugmp5naPvKGFquUDpump')
            },
          ]
        );
        return;
      }

      if (allowanceResult.isApproved) {
        setStep('proof');
      } else {
        setStep('approve');
      }
    } catch (error: any) {
      console.error('[ProofOfLife] Failed to check token status:', error);
      Alert.alert('Error', 'Failed to check DLM token status: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    console.log('[ProofOfLife] Approving DLM tokens...');
    setLoading(true);
    try {
      const approvalTx = await approveDLM(chain, network);
      console.log('[ProofOfLife] Approval tx submitted:', approvalTx);

      Alert.alert(
        'Approval Submitted!',
        'Your approval transaction has been submitted. Checking status...',
        [
          {
            text: 'OK',
            onPress: async () => {
              // Re-check allowance after approval
              setLoading(true);
              try {
                // Wait a moment for transaction to propagate
                await new Promise(resolve => setTimeout(resolve, 2000));

                const allowanceResult = await getAllowance(walletAddress, chain, network);
                console.log('[ProofOfLife] Allowance after approval:', allowanceResult);

                if (allowanceResult.isApproved) {
                  setIsApproved(true);
                  setStep('proof');
                } else {
                  Alert.alert(
                    'Approval Pending',
                    'The approval is still processing. Please wait a few seconds and try again.',
                    [{ text: 'OK' }]
                  );
                }
              } catch (error: any) {
                console.error('[ProofOfLife] Failed to check allowance:', error);
                Alert.alert('Error', 'Failed to verify approval. Please try again.');
              } finally {
                setLoading(false);
              }
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('[ProofOfLife] Approval failed:', error);
      Alert.alert('Approval Failed', error.message || 'Failed to approve DLM tokens');
    } finally {
      setLoading(false);
    }
  };

  const handleProofOfLife = async () => {
    console.log('[ProofOfLife] Submitting proof of life...');

    setLoading(true);
    try {
      if (isSolana(chain)) {
        // Direct Solana proof of life - no backend needed
        if (!depositAddress) {
          Alert.alert('Error', 'Deposit address not found');
          setLoading(false);
          return;
        }

        console.log('[ProofOfLife] 1. Building Solana proof of life transaction');

        const connection = getConnection(network);
        const depositorPubkey = new PublicKey(walletAddress);
        const depositPubkey = new PublicKey(depositAddress);

        console.log('[ProofOfLife] 2. connection instructed');

        // Fetch deposit seed from contract
        console.log('[ProofOfLife] Fetching deposit seed from contract...');
        let depositSeed: string | null = null;
        try {
          const depositAccount = await fetchDepositAccount(connection, depositAddress);
          if (depositAccount && depositAccount.depositSeed) {
            depositSeed = depositAccount.depositSeed;
            console.log('[ProofOfLife] Deposit seed fetched from contract:', depositSeed);
          }
        } catch (error) {
          console.error('[ProofOfLife] Failed to fetch deposit seed from contract:', error);
        }

        if (!depositSeed) {
          console.log('[ProofOfLife] 7. deposit seed not found anywhere.');
          Alert.alert(
            'Error',
            'Deposit seed not found. This deposit was created before seed storage was implemented.\n\nPlease withdraw and recreate the deposit.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
          setLoading(false);
          return;
        }


        console.log('[ProofOfLife] Using deposit seed:', depositSeed);

        // DEBUG: Verify all parameters before calling the function
        console.log('[ProofOfLife] DEBUG - About to call buildProofOfLifeTransaction with:');
        console.log('[ProofOfLife] DEBUG - connection:', connection ? 'exists' : 'MISSING');
        console.log('[ProofOfLife] DEBUG - depositorPubkey:', depositorPubkey.toBase58());
        console.log('[ProofOfLife] DEBUG - depositPubkey:', depositPubkey.toBase58());
        console.log('[ProofOfLife] DEBUG - depositSeed:', depositSeed);
        console.log('[ProofOfLife] DEBUG - buildProofOfLifeTransaction function:', typeof buildProofOfLifeTransaction);

        console.log('[ProofOfLife] Calling buildProofOfLifeTransaction...');
        // Build the proof of life transaction with the correct seed
        const transaction = await buildProofOfLifeTransaction(
          connection,
          depositorPubkey,
          depositPubkey,
          depositSeed,
          network
        );
        console.log('[ProofOfLife] Transaction built successfully');

        // Use Mobile Wallet Adapter on Android, window.solana on web/iOS
        let signature: string;
        let blockhash: string;
        let lastValidBlockHeight: number;

        console.log('[ProofOfLife] Platform check:', BUILD_CONFIG.isAndroid ? 'Android' : 'Other');
        console.log('[ProofOfLife] Wallet connected:', isMobileWalletConnected());

        if (BUILD_CONFIG.isAndroid && isMobileWalletConnected()) {
          console.log('[ProofOfLife] Using Mobile Wallet Adapter (Android)');
          console.log('[ProofOfLife] Sending transaction via MWA...');

          try {
            // MWA handles both signing and sending
            signature = await signAndSendMobileTransaction(transaction);
            console.log('[ProofOfLife] Transaction sent via MWA, signature:', signature);
          } catch (error: any) {
            console.error('[ProofOfLife] MWA transaction failed:', error);
            throw error;
          }

          // Get blockhash for confirmation after sending
          const latest = await connection.getLatestBlockhash();
          blockhash = latest.blockhash;
          lastValidBlockHeight = latest.lastValidBlockHeight;
        } else {
          console.log('[ProofOfLife] Using Phantom wallet (web/iOS)');

          // Import sendSolanaTransaction for non-MWA platforms
          const { sendSolanaTransaction } = await import('../utils/wallet');

          // Sign and send via Phantom
          signature = await sendSolanaTransaction(transaction, network);
          console.log('[ProofOfLife] Transaction sent via Phantom, signature:', signature);

          // Get blockhash for confirmation
          const latest = await connection.getLatestBlockhash();
          blockhash = latest.blockhash;
          lastValidBlockHeight = latest.lastValidBlockHeight;
        }

        // Confirm transaction
        console.log('[ProofOfLife] Confirming transaction...');
        const confirmation = await connection.confirmTransaction(
          {
            signature,
            blockhash,
            lastValidBlockHeight,
          },
          'confirmed'
        );

        if (confirmation.value.err) {
          console.error('[ProofOfLife] Transaction failed:', confirmation.value.err);
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        console.log('[ProofOfLife] Solana proof submitted:', signature);
        setTxHash(signature);
        setStep('success');

        // Navigate back after delay
        setTimeout(() => {
          navigation.goBack();
        }, 3000);
      } else {
        // EVM: Use backend API
        const isCorrectNetwork = await checkWalletNetwork(chain, network);
        if (!isCorrectNetwork) {
          Alert.alert(
            'Wrong Network',
            `Please switch to ${chain.toUpperCase()} ${network}`,
            [{ text: 'OK' }]
          );
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_URL}/api/proof-of-life`, {
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
        console.log('[ProofOfLife] API response:', result);

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

          console.log('[ProofOfLife] Transaction params:', txParams);

          const proofTx = await sendEVMTransaction(txParams);

          console.log('[ProofOfLife] Proof submitted:', proofTx);
          setTxHash(proofTx);
          setStep('success');

          // Navigate back after delay
          setTimeout(() => {
            navigation.goBack();
          }, 3000);
        } else {
          Alert.alert('Error', result.error || 'Failed to create proof of life transaction');
        }
      }
    } catch (error: any) {
      console.error('[ProofOfLife] Failed to submit proof:', error);
      Alert.alert('Error', error.message || 'Failed to submit proof of life');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#2d3436" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.proofOfLife.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Deposit Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{t.proofOfLife.depositInfo} #{depositIndex}</Text>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={20} color="#636e72" />
            <Text style={styles.infoText}>{t.proofOfLife.extendTime}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={20} color="#636e72" />
            <Text style={styles.infoText}>{t.proofOfLife.proofCost}</Text>
          </View>
        </View>

        {/* Loading state */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#50d56b" />
            <Text style={styles.loadingText}>{t.common.loading}</Text>
          </View>
        )}

        {/* Check Step */}
        {step === 'check' && !loading && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t.proofOfLife.checkStatus}</Text>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>{t.proofOfLife.currentBalance}</Text>
              <Text style={styles.balanceValue}>{dlmBalance} DLM</Text>
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={checkTokenStatus}>
              <Text style={styles.buttonText}>{t.common.loading}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Approve Step */}
        {step === 'approve' && !loading && (
          <View style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <Ionicons name="shield-checkmark-outline" size={60} color="#fdcb6e" />
            </View>
            <Text style={styles.stepTitle}>Token Approval Required</Text>
            <Text style={styles.stepDescription}>
              You need to approve the Dielemma contract to spend 1 DLM token on your behalf.
              This is a one-time approval for each deposit.
            </Text>

            <View style={styles.stepsList}>
              <View style={styles.stepItem}>
                <Ionicons name="checkmark-circle" size={20} color="#00b894" />
                <Text style={styles.stepText}>You have {dlmBalance} DLM tokens</Text>
              </View>
              <View style={styles.stepItem}>
                <Ionicons name="ellipse-outline" size={20} color="#636e72" />
                <Text style={styles.stepText}>Approve contract to spend 1 DLM</Text>
              </View>
              <View style={styles.stepItem}>
                <Ionicons name="ellipse-outline" size={20} color="#636e72" />
                <Text style={styles.stepText}>Submit proof of life</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={handleApprove}>
              <Text style={styles.buttonText}>Approve DLM Spending</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Proof Step */}
        {step === 'proof' && !loading && (
          <View style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <Ionicons name="pulse" size={60} color="#50d56b" />
            </View>
            <Text style={styles.stepTitle}>Submit Proof of Life</Text>
            <Text style={styles.stepDescription}>
              Ready to extend your deposit timer! This will burn 1 DLM token and reset your timer.
            </Text>

            <View style={styles.stepsList}>
              <View style={styles.stepItem}>
                <Ionicons name="checkmark-circle" size={20} color="#00b894" />
                <Text style={styles.stepText}>You have {dlmBalance} DLM tokens</Text>
              </View>
              <View style={styles.stepItem}>
                <Ionicons name="checkmark-circle" size={20} color="#00b894" />
                <Text style={styles.stepText}>Contract approved ✓</Text>
              </View>
              <View style={styles.stepItem}>
                <Ionicons name="ellipse-outline" size={20} color="#636e72" />
                <Text style={styles.stepText}>Submit proof of life transaction</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={handleProofOfLife}>
              <Text style={styles.buttonText}>Submit Proof of Life</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <View style={styles.stepContainer}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={80} color="#00b894" />
            </View>
            <Text style={styles.successTitle}>Proof Submitted!</Text>
            <Text style={styles.successDescription}>
              Your deposit timer has been extended by 7 days.
            </Text>
            {txHash && (
              <View style={styles.txHashContainer}>
                <Text style={styles.txHashLabel}>Transaction:</Text>
                <Text style={styles.txHashValue} numberOfLines={1}>
                  {txHash}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dfe6e9',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3436',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3436',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#636e72',
    marginLeft: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#636e72',
    marginTop: 12,
  },
  stepContainer: {
    alignItems: 'center',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2d3436',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  stepDescription: {
    fontSize: 14,
    color: '#636e72',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  balanceCard: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#50d56b',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2d3436',
  },
  stepsList: {
    alignSelf: 'flex-start',
    width: '100%',
    marginBottom: 24,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepText: {
    fontSize: 14,
    color: '#636e72',
    marginLeft: 12,
  },
  primaryButton: {
    backgroundColor: '#50d56b',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#50d56b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  successIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e3f9e5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00b894',
    marginBottom: 8,
  },
  successDescription: {
    fontSize: 16,
    color: '#636e72',
    textAlign: 'center',
    marginBottom: 16,
  },
  txHashContainer: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    width: '100%',
  },
  txHashLabel: {
    fontSize: 12,
    color: '#636e72',
    marginBottom: 4,
  },
  txHashValue: {
    fontSize: 12,
    color: '#2d3436',
    fontFamily: 'monospace',
  },
});
