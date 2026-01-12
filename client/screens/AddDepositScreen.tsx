import React, { useState } from 'react';
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
  amountToSmallestUnit,
} from '../utils/wallet';

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

    console.log('[AddDepositScreen] Inputs:', { receiver, amount, selectedDays, customDays });

    if (!validateInputs()) {
      console.log('[AddDepositScreen] Validation failed');
      return;
    }

    console.log('[AddDepositScreen] Validation passed, creating deposit...');
    setLoading(true);
    try {
      // Build request data based on chain
      const requestData = {
        chain,
        network,
        depositor: walletAddress,
        receiver,
        tokenAddress: isEVM(chain) ? '0x0000000000000000000000000000000000000000' : '',
        amount: amountToSmallestUnit(parseFloat(amount), chain),
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
          // Solana: Backend should return a serialized transaction
          Alert.alert('Coming Soon', 'Solana deposits will be available soon');
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
        {/* Token Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Token</Text>
          <Text style={styles.infoValue}>Native {getTokenSymbol()}</Text>
        </View>

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
              <Text style={styles.summaryLabel}>Amount:</Text>
              <Text style={styles.summaryValue}>
                {amount} {getTokenSymbol()}
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
});
