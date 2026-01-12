import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Modal,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/native';

import { RootStackParamList, Chain, Network } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import {
  ensureCorrectNetwork,
  checkWalletNetwork,
  sendEVMTransaction,
  isSolana,
  isEVM,
  getTokenSymbol,
} from '../utils/wallet';
import {
  getAllTokenBalances,
  TokenBalance,
  amountToSmallestUnit as solAmountToSmallestUnit,
} from '../utils/solanaTokens';

type AddDepositScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AddDeposit'>;

interface AddDepositScreenProps {
  navigation: AddDepositScreenNavigationProp;
  route: {
    params: {
      chain: Chain;
      network: Network;
      walletAddress: string;
    };
  };
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const getDayOptions = (t: any) => [
  { label: `1 ${t.addDeposit.days}`, days: 1 },
  { label: `7 ${t.addDeposit.days}`, days: 7 },
  { label: `30 ${t.addDeposit.days}`, days: 30 },
  { label: `90 ${t.addDeposit.days}`, days: 90 },
];

export default function AddDepositScreen({ navigation, route }: AddDepositScreenProps) {
  const { t } = useLanguage();
  const { chain, network, walletAddress } = route.params;
  console.log('[AddDepositScreen] Screen mounted with params:', { chain, network, walletAddress });

  const DAY_OPTIONS = getDayOptions(t);

  // Check network on mount (EVM only)
  React.useEffect(() => {
    const checkNetwork = async () => {
      if (isEVM(chain)) {
        const isCorrect = await checkWalletNetwork(chain, network);
        if (!isCorrect) {
          Alert.alert(
            'Wrong Network',
            `Please switch to ${getTokenSymbol(chain)} ${network}`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Switch Network',
                onPress: () => ensureCorrectNetwork(chain, network),
              },
            ]
          );
        }
      }
      // Solana doesn't need network checking
    };
    checkNetwork();
  }, [chain, network]);

  const [receiver, setReceiver] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedDays, setSelectedDays] = useState(DAY_OPTIONS[1]); // Default: 7 days
  const [customDays, setCustomDays] = useState('');
  const [loading, setLoading] = useState(false);

  // Token selection state (for Solana)
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);

  // Fetch tokens on mount for Solana
  useEffect(() => {
    if (isSolana(chain)) {
      fetchTokens();
    }
  }, [chain, network, walletAddress]);

  const fetchTokens = async () => {
    console.log('[AddDepositScreen] Fetching tokens...');
    setLoadingTokens(true);
    try {
      const tokenBalances = await getAllTokenBalances(walletAddress, network);
      console.log('[AddDepositScreen] Tokens fetched:', tokenBalances);
      setTokens(tokenBalances);
      // Select first token by default (usually SOL)
      if (tokenBalances.length > 0 && !selectedToken) {
        setSelectedToken(tokenBalances[0]);
      }
    } catch (error) {
      console.error('[AddDepositScreen] Error fetching tokens:', error);
    } finally {
      setLoadingTokens(false);
    }
  };

  const getTimeoutSeconds = () => {
    const days = selectedDays === null ? parseInt(customDays) : selectedDays.days;
    return days * 86400;
  };

  const validateInputs = () => {
    console.log('[AddDepositScreen] Validating inputs...');

    if (!receiver) {
      console.log('[AddDepositScreen] Validation failed: No receiver address');
      Alert.alert('Error', 'Please enter receiver address');
      return false;
    }

    // Validate address format based on chain
    if (isEVM(chain)) {
      if (!receiver.startsWith('0x') || receiver.length !== 42) {
        console.log('[AddDepositScreen] Validation failed: Invalid EVM address format');
        Alert.alert('Error', 'Invalid EVM address. Must start with 0x and be 42 characters');
        return false;
      }
    } else if (isSolana(chain)) {
      // Solana addresses are base58, typically 32-44 characters
      if (receiver.length < 32 || receiver.length > 44) {
        console.log('[AddDepositScreen] Validation failed: Invalid Solana address format');
        Alert.alert('Error', 'Invalid Solana address');
        return false;
      }
    }

    if (!amount || parseFloat(amount) <= 0) {
      console.log('[AddDepositScreen] Validation failed: Invalid amount');
      Alert.alert('Error', 'Please enter a valid amount');
      return false;
    }
    if (selectedDays === null && (!customDays || parseInt(customDays) <= 0)) {
      console.log('[AddDepositScreen] Validation failed: Invalid days');
      Alert.alert('Error', 'Please enter valid days');
      return false;
    }

    console.log('[AddDepositScreen] All validations passed');
    return true;
  };

  const createDeposit = async () => {
    console.log('[AddDepositScreen] createDeposit called');

    // Check network before creating deposit (EVM only)
    if (isEVM(chain)) {
      const isCorrectNetwork = await checkWalletNetwork(chain, network);
      if (!isCorrectNetwork) {
        Alert.alert(
          'Wrong Network!',
          `Please switch to ${getTokenSymbol(chain)} ${network}`,
          [{ text: 'OK' }]
        );
        return;
      }
    }

    // For Solana, check if token is selected
    if (isSolana(chain) && !selectedToken) {
      Alert.alert('Error', 'Please select a token');
      return;
    }

    console.log('[AddDepositScreen] Inputs:', { receiver, amount, selectedDays, customDays, selectedToken });

    if (!validateInputs()) {
      console.log('[AddDepositScreen] Validation failed');
      return;
    }

    console.log('[AddDepositScreen] Validation passed, creating deposit...');
    setLoading(true);
    try {
      // Build request data based on chain
      let tokenAddress = '';
      let amountValue = '';

      if (isEVM(chain)) {
        tokenAddress = '0x0000000000000000000000000000000000000000'; // Native token
        amountValue = (parseFloat(amount) * 1e18).toString();
      } else if (isSolana(chain) && selectedToken) {
        tokenAddress = selectedToken.mint;
        amountValue = solAmountToSmallestUnit(parseFloat(amount), selectedToken.decimals).toString();
      } else {
        Alert.alert('Error', 'Unsupported chain');
        return;
      }

      const requestData = {
        chain,
        network,
        depositor: walletAddress,
        receiver,
        tokenAddress,
        amount: amountValue,
        timeoutSeconds: getTimeoutSeconds(),
      };
      console.log('[AddDepositScreen] Request data:', requestData);

      const response = await fetch(`${API_URL}/api/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      console.log('[AddDepositScreen] Response status:', response.status);
      const result = await response.json();
      console.log('[AddDepositScreen] Response result:', result);

      if (result.success) {
        console.log('[AddDepositScreen] Deposit created successfully, data:', result.data);

        if (isEVM(chain)) {
          // EVM: Send transaction via MetaMask
          if (result.data && (window as any).ethereum) {
            try {
              // Convert decimal value to hex for MetaMask
              let valueHex = '0x0';
              if (result.data.value) {
                if (!result.data.value.startsWith('0x')) {
                  const valueBigInt = BigInt(result.data.value);
                  valueHex = '0x' + valueBigInt.toString(16);
                  console.log('[AddDepositScreen] Converted value from', result.data.value, 'to', valueHex);
                } else {
                  valueHex = result.data.value;
                }
              }

              const txParams: any = {
                from: walletAddress,
                to: result.data.to,
                data: result.data.data,
                value: valueHex,
              };

              if (result.data.gasEstimate) {
                txParams.gas = result.data.gasEstimate;
                console.log('[AddDepositScreen] Using gas estimate:', result.data.gasEstimate);
              }

              console.log('[AddDepositScreen] Transaction params:', txParams);
              const txHash = await sendEVMTransaction(txParams);
              console.log('[AddDepositScreen] Transaction sent:', txHash);
              Alert.alert('Success!', `Transaction sent: ${txHash}`);
              navigation.goBack();
            } catch (txError: any) {
              console.error('[AddDepositScreen] Transaction failed:', txError);
              Alert.alert('Error', txError?.message || 'Transaction failed');
            }
          } else {
            console.error('[AddDepositScreen] No ethereum wallet found');
            Alert.alert('Error', 'No wallet found. Please install MetaMask.');
          }
        } else if (isSolana(chain)) {
          // Solana: Sign and send transaction using Phantom
          try {
            if (!result.data || !result.data.programId) {
              throw new Error('Invalid transaction data from backend');
            }

            const { Transaction, SystemProgram } = await import('@solana/web3.js');

            // Build transaction from backend response
            const tx = new Transaction();
            tx.add({
              keys: result.data.keys.map((k: any) => ({
                pubkey: new PublicKey(k.pubkey),
                isSigner: k.isSigner,
                isWritable: k.isWritable,
              })),
              programId: new PublicKey(result.data.programId),
              data: Buffer.from(result.data.instructionData, 'base64'),
            });

            // Sign and send via Phantom
            const provider = (window as any).solana;
            if (!provider?.signAndSendTransaction) {
              throw new Error('Phantom wallet not found');
            }

            const { signature } = await provider.signAndSendTransaction(tx);
            console.log('[AddDepositScreen] Solana transaction sent:', signature);
            Alert.alert('Success!', `Deposit created: ${signature}`);
            navigation.goBack();
          } catch (txError: any) {
            console.error('[AddDepositScreen] Solana transaction failed:', txError);
            Alert.alert('Error', txError?.message || 'Solana transaction failed');
          }
        } else {
          Alert.alert('Error', 'Unsupported chain');
        }
      } else {
        console.error('[AddDepositScreen] Deposit creation failed:', result);
        Alert.alert('Error', result.error || 'Failed to create deposit');
      }
    } catch (error: any) {
      console.error('[AddDepositScreen] Exception caught:', error);
      Alert.alert('Error', error.message || 'Failed to create deposit');
    } finally {
      console.log('[AddDepositScreen] Setting loading to false');
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
        <Text style={styles.headerTitle}>{t.addDeposit.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Token Selection - For Solana */}
        {isSolana(chain) ? (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Select Token</Text>
            <TouchableOpacity
              style={styles.tokenSelector}
              onPress={() => setTokenModalVisible(true)}
              disabled={loadingTokens}
            >
              {loadingTokens ? (
                <ActivityIndicator color="#50d56b" />
              ) : selectedToken ? (
                <>
                  {selectedToken.logoURI && (
                    <Image
                      source={{ uri: selectedToken.logoURI }}
                      style={styles.tokenLogo}
                    />
                  )}
                  <View style={styles.tokenInfo}>
                    <Text style={styles.tokenSymbol}>{selectedToken.symbol}</Text>
                    <Text style={styles.tokenBalance}>
                      Balance: {selectedToken.uiAmount}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={20} color="#636e72" />
                </>
              ) : (
                <>
                  <Ionicons name="wallet-outline" size={20} color="#636e72" />
                  <Text style={styles.tokenPlaceholder}>Select a token</Text>
                  <Ionicons name="chevron-down" size={20} color="#636e72" />
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          /* Token Info - For EVM */
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Token</Text>
            <Text style={styles.infoValue}>Native {getTokenSymbol(chain)}</Text>
          </View>
        )}

        {/* Receiver Address */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t.addDeposit.receiverLabel}</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#b2bec3" />
            <TextInput
              style={styles.input}
              placeholder={t.addDeposit.receiverPlaceholder}
              placeholderTextColor="#b2bec3"
              value={receiver}
              onChangeText={setReceiver}
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Amount */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t.addDeposit.amountLabel}</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="cash-outline" size={20} color="#b2bec3" />
            <TextInput
              style={styles.input}
              placeholder={t.addDeposit.amountPlaceholder}
              placeholderTextColor="#b2bec3"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Timeout */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t.addDeposit.daysLabel}</Text>
          <View style={styles.dayOptions}>
            {DAY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.days}
                style={[
                  styles.dayButton,
                  selectedDays?.days === option.days && styles.dayButtonActive,
                ]}
                onPress={() => {
                  setSelectedDays(option);
                  setCustomDays('');
                }}
              >
                <Text
                  style={[
                    styles.dayButtonText,
                    selectedDays?.days === option.days && styles.dayButtonTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[
                styles.dayButton,
                selectedDays === null && styles.dayButtonActive,
              ]}
              onPress={() => setSelectedDays(null)}
            >
              <Text
                style={[
                  styles.dayButtonText,
                  selectedDays === null && styles.dayButtonTextActive,
                ]}
              >
                Custom
              </Text>
            </TouchableOpacity>
          </View>

          {selectedDays === null && (
            <View style={styles.inputContainer}>
              <Ionicons name="calendar-outline" size={20} color="#b2bec3" />
              <TextInput
                style={styles.input}
                placeholder={t.addDeposit.days}
                placeholderTextColor="#b2bec3"
                value={customDays}
                onChangeText={setCustomDays}
                keyboardType="numeric"
              />
            </View>
          )}

          {selectedDays && (
            <View style={styles.timeoutInfo}>
              <Ionicons name="information-circle-outline" size={16} color="#50d56b" />
              <Text style={styles.timeoutInfoText}>
                Timeout: {getTimeoutSeconds() / 86400} days ({getTimeoutSeconds()} seconds)
              </Text>
            </View>
          )}
        </View>

        {/* Summary */}
        {amount && (selectedDays || customDays) && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Token:</Text>
              <Text style={styles.summaryValue}>
                {isSolana(chain) ? selectedToken?.symbol || 'Select token' : getTokenSymbol(chain)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount:</Text>
              <Text style={styles.summaryValue}>
                {amount}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Timeout:</Text>
              <Text style={styles.summaryValue}>
                {getTimeoutSeconds() / 86400} days
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Receiver:</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {receiver.slice(0, 10)}...{receiver.slice(-8)}
              </Text>
            </View>
          </View>
        )}

        {/* Create Button */}
        <TouchableOpacity
          style={[styles.createButton, loading && styles.buttonDisabled]}
          onPress={createDeposit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.createButtonText}>{t.addDeposit.createDeposit}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Token Selector Modal - For Solana */}
      <Modal
        visible={tokenModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTokenModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTokenModalVisible(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Token</Text>
              <TouchableOpacity onPress={() => setTokenModalVisible(false)}>
                <Ionicons name="close" size={24} color="#2d3436" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.tokenList}>
              {tokens.map((token) => (
                <TouchableOpacity
                  key={token.mint}
                  style={[
                    styles.tokenItem,
                    selectedToken?.mint === token.mint && styles.tokenItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedToken(token);
                    setTokenModalVisible(false);
                  }}
                >
                  {token.logoURI && (
                    <Image source={{ uri: token.logoURI }} style={styles.tokenLogo} />
                  )}
                  <View style={styles.tokenItemInfo}>
                    <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                    <Text style={styles.tokenName}>{token.name}</Text>
                  </View>
                  <View style={styles.tokenBalanceContainer}>
                    <Text style={styles.tokenBalance}>{token.uiAmount}</Text>
                  </View>
                  {selectedToken?.mint === token.mint && (
                    <Ionicons name="checkmark-circle" size={20} color="#50d56b" />
                  )}
                </TouchableOpacity>
              ))}

              {tokens.length === 0 && !loadingTokens && (
                <View style={styles.emptyState}>
                  <Ionicons name="wallet-outline" size={60} color="#b2bec3" />
                  <Text style={styles.emptyStateText}>No tokens found</Text>
                  <Text style={styles.emptyStateSubtext}>
                    Make sure you have tokens in your wallet
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
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
    backgroundColor: '#ede9fe',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 12,
    color: '#50d56b',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3436',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#636e72',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dfe6e9',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#2d3436',
    marginLeft: 8,
    paddingVertical: 12,
  },
  dayOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  dayButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dfe6e9',
  },
  dayButtonActive: {
    backgroundColor: '#50d56b',
    borderColor: '#50d56b',
  },
  dayButtonText: {
    fontSize: 14,
    color: '#636e72',
    fontWeight: '500',
  },
  dayButtonTextActive: {
    color: '#fff',
  },
  timeoutInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#e3f9e5',
    borderRadius: 6,
  },
  timeoutInfoText: {
    fontSize: 12,
    color: '#00b894',
    marginLeft: 4,
  },
  summaryCard: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#dfe6e9',
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2d3436',
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#636e72',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3436',
    maxWidth: 200,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#50d56b',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#50d56b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  // Token selector styles
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dfe6e9',
  },
  tokenLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
  },
  tokenInfo: {
    flex: 1,
  },
  tokenSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3436',
  },
  tokenBalance: {
    fontSize: 12,
    color: '#636e72',
    marginTop: 2,
  },
  tokenPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: '#b2bec3',
    marginLeft: 12,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#dfe6e9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3436',
  },
  tokenList: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  tokenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  tokenItemSelected: {
    backgroundColor: '#e8f8ec',
    borderWidth: 1,
    borderColor: '#50d56b',
  },
  tokenItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  tokenName: {
    fontSize: 12,
    color: '#636e72',
    marginTop: 2,
  },
  tokenBalanceContainer: {
    marginRight: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3436',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#636e72',
    textAlign: 'center',
  },
});
