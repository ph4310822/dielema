import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../i18n/LanguageContext';

export interface Deposit {
  depositIndex: number;
  depositor: string;
  receiver: string;
  tokenAddress?: string;  // EVM
  tokenMint?: string;     // Solana
  amount: string | number;
  lastProofTimestamp: number;
  timeoutSeconds: number;
  isClosed: boolean;
  elapsed?: number;
  isExpired?: boolean;
  depositAddress?: string; // Solana PDA address
  decimals?: number; // Token decimals for proper amount display
  tokenSymbol?: string; // Token symbol for display
}

interface DepositCardProps {
  deposit: Deposit;
  onProofOfLife: (depositIndex: number) => void;
  onWithdraw: (depositIndex: number) => void;
}

export default function DepositCard({ deposit, onProofOfLife, onWithdraw }: DepositCardProps) {
  const { t } = useLanguage();
  
  // Handle both EVM (string with 18 decimals) and Solana (variable decimals) amounts
  const formatAmount = () => {
    const amountNum = typeof deposit.amount === 'string' ? parseFloat(deposit.amount) : deposit.amount;

    // Use provided decimals if available, otherwise fallback to defaults
    if (deposit.decimals !== undefined) {
      return (amountNum / Math.pow(10, deposit.decimals)).toFixed(4);
    }

    // Fallback: if it's a very large number, it's likely in smallest units (lamports/wei)
    if (amountNum >= 1e9) {
      // Solana native token uses 9 decimals, EVM uses 18
      const decimals = deposit.tokenMint || deposit.tokenAddress?.includes('So11111111111111111111111111111111111111112') ? 9 : 18;
      return (amountNum / Math.pow(10, decimals)).toFixed(4);
    }

    // Already in base units
    return amountNum.toFixed(4);
  };
  const amount = formatAmount();

  // State for real-time elapsed time
  const [currentElapsed, setCurrentElapsed] = useState<number>(deposit.elapsed || 0);

  // Update elapsed time every second
  useEffect(() => {
    if (!deposit.lastProofTimestamp || deposit.isClosed) return;

    const calculateElapsed = () => {
      const now = Math.floor(Date.now() / 1000);
      return now - deposit.lastProofTimestamp;
    };

    // Set initial elapsed time
    setCurrentElapsed(calculateElapsed());

    // Update every second
    const interval = setInterval(() => {
      setCurrentElapsed(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [deposit.lastProofTimestamp, deposit.isClosed]);

  // Format elapsed time as hh:mm:ss
  const formatElapsedTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format timeout as dd hh:mm:ss
  const formatTimeout = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 0) {
      return `${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  };

  const elapsedFormatted = formatElapsedTime(currentElapsed);
  const timeoutFormatted = formatTimeout(deposit.timeoutSeconds);

  const getStatus = () => {
    if (deposit.isClosed) return { text: t.depositCard.closed, color: '#636e72', bgColor: '#dfe6e9' };
    if (deposit.isExpired) return { text: t.depositCard.expired, color: '#d63031', bgColor: '#fab1a0' };
    return { text: t.depositCard.active, color: '#00b894', bgColor: '#55efc4' };
  };

  const status = getStatus();

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>#{deposit.depositIndex}</Text>
        <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
        </View>
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Ionicons name="cash-outline" size={16} color="#636e72" />
          <Text style={styles.detailText}>
            {amount} {deposit.tokenSymbol || t.depositCard.amount}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={16} color="#636e72" />
          <Text style={styles.detailText}>{elapsedFormatted} {t.depositCard.elapsed}</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={16} color="#636e72" />
          <Text style={styles.detailText}>{timeoutFormatted} {t.depositCard.timeout}</Text>
        </View>
      </View>

      {!deposit.isClosed && (
        <View style={styles.actions}>
          {!deposit.isExpired && (
            <TouchableOpacity
              style={[styles.button, styles.proofButton]}
              onPress={() => onProofOfLife(deposit.depositIndex)}
            >
              <Ionicons name="pulse" size={18} color="#fff" />
              <Text style={styles.buttonText}>{t.depositCard.proofOfLife}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, styles.withdrawButton]}
            onPress={() => onWithdraw(deposit.depositIndex)}
          >
            <Ionicons name="arrow-down-circle-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>{t.depositCard.withdraw}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3436',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  details: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#636e72',
    marginLeft: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  proofButton: {
    backgroundColor: '#50d56b',
  },
  withdrawButton: {
    backgroundColor: '#fdcb6e',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
