import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useLanguage } from '../i18n/LanguageContext';
import { isChainAvailable, BUILD_CONFIG } from '../config/buildConfig';

type Chain = 'bsc' | 'solana' | 'ethereum';
type Network = 'mainnet' | 'testnet' | 'devnet';

interface ChainSelectorProps {
  selectedChain: Chain;
  selectedNetwork: Network;
  onChainChange: (chain: Chain) => void;
  onNetworkChange?: (network: Network) => void;
}

// Chain Icon Components
const SolanaIcon = ({ size = 24, color = '#9945FF' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 128 128">
    <Defs>
      <LinearGradient id="solanaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#00FFA3" />
        <Stop offset="100%" stopColor="#DC1FFF" />
      </LinearGradient>
    </Defs>
    <Path
      d="M25.38 93.08a4.27 4.27 0 0 1 3-1.25h91.26a2.14 2.14 0 0 1 1.51 3.65l-17.77 17.77a4.27 4.27 0 0 1-3 1.25H9.12a2.14 2.14 0 0 1-1.51-3.65z"
      fill={color === '#b2bec3' ? color : 'url(#solanaGrad)'}
    />
    <Path
      d="M25.38 14.5a4.39 4.39 0 0 1 3-1.25h91.26a2.14 2.14 0 0 1 1.51 3.65L103.38 34.67a4.27 4.27 0 0 1-3 1.25H9.12a2.14 2.14 0 0 1-1.51-3.65z"
      fill={color === '#b2bec3' ? color : 'url(#solanaGrad)'}
    />
    <Path
      d="M102.62 53.54a4.27 4.27 0 0 0-3-1.25H8.36a2.14 2.14 0 0 0-1.51 3.65l17.77 17.77a4.27 4.27 0 0 0 3 1.25h91.26a2.14 2.14 0 0 0 1.51-3.65z"
      fill={color === '#b2bec3' ? color : 'url(#solanaGrad)'}
    />
  </Svg>
);

const BNBIcon = ({ size = 24, color = '#F0B90B' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 126.61 126.61">
    <G fill={color}>
      <Path d="M38.73 53.2l24.59-24.58 24.6 24.6 14.3-14.31L63.32 0l-38.9 38.9z" />
      <Path d="M0 63.31l14.3-14.31 14.31 14.31-14.31 14.3z" />
      <Path d="M38.73 73.41l24.59 24.59 24.6-24.6 14.31 14.29-.01.01-38.9 38.91-38.9-38.9-.02-.02z" />
      <Path d="M98 63.31l14.3-14.31 14.31 14.3-14.31 14.32z" />
      <Path d="M77.83 63.3l-14.51-14.52-10.73 10.73-1.24 1.23-2.54 2.54 14.51 14.53 14.51-14.51z" />
    </G>
  </Svg>
);

const EthereumIcon = ({ size = 24, color = '#627EEA' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 256 417">
    <G fill="none" fillRule="evenodd">
      <Path fill={color} d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z" opacity={0.8} />
      <Path fill={color} d="M127.962 0L0 212.32l127.962 75.639V154.158z" />
      <Path fill={color} d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.6L256 236.587z" opacity={0.8} />
      <Path fill={color} d="M127.962 416.905v-104.72L0 236.585z" />
      <Path fill={color} d="M127.961 287.958l127.96-75.637-127.96-58.162z" opacity={0.6} />
      <Path fill={color} d="M0 212.32l127.96 75.638v-133.8z" opacity={0.8} />
    </G>
  </Svg>
);

// Chain icon renderer
const ChainIcon = ({ chain, size = 24, disabled = false }: { chain: Chain; size?: number; disabled?: boolean }) => {
  const disabledColor = '#b2bec3';
  
  switch (chain) {
    case 'solana':
      return <SolanaIcon size={size} color={disabled ? disabledColor : '#9945FF'} />;
    case 'bsc':
      return <BNBIcon size={size} color={disabled ? disabledColor : '#F0B90B'} />;
    case 'ethereum':
      return <EthereumIcon size={size} color={disabled ? disabledColor : '#627EEA'} />;
    default:
      return <SolanaIcon size={size} color={disabled ? disabledColor : '#9945FF'} />;
  }
};

const CHAIN_CONFIGS: Record<Chain, { name: string; color: string; disabled: boolean }> = {
  bsc: { name: 'BNB Chain', color: '#F0B90B', disabled: true },
  solana: { name: 'Solana', color: '#9945FF', disabled: false },
  ethereum: { name: 'Ethereum', color: '#627EEA', disabled: true },
};

// Get chains filtered by build target
const getFilteredChains = (): Chain[] => {
  const allChains: Chain[] = ['bsc', 'solana', 'ethereum'];
  
  // For Seeker build, only show Solana
  if (BUILD_CONFIG.isSeeker) {
    return ['solana'];
  }
  
  // Default: show all chains
  return allChains;
};

const NETWORK_CONFIGS: Record<Network, { name: string; disabled: boolean; disabledReason?: string }> = {
  testnet: { name: 'Testnet', disabled: true, disabledReason: 'Coming soon' },
  mainnet: { name: 'Mainnet', disabled: true, disabledReason: 'Coming soon' },
  devnet: { name: 'Devnet', disabled: false },
};

export default function ChainSelector({ selectedChain, selectedNetwork, onChainChange, onNetworkChange }: ChainSelectorProps) {
  const { t } = useLanguage();
  const [modalVisible, setModalVisible] = React.useState(false);

  const currentConfig = CHAIN_CONFIGS[selectedChain];
  const currentNetworkConfig = NETWORK_CONFIGS[selectedNetwork];

  return (
    <>
      <TouchableOpacity
        style={styles.selector}
        onPress={() => setModalVisible(true)}
      >
        <ChainIcon chain={selectedChain} size={20} />
        <Text style={[styles.selectedChainText, { color: currentConfig.color }]}>
          {currentConfig.name}
        </Text>
        <View style={styles.networkBadge}>
          <Text style={styles.networkBadgeText}>{currentNetworkConfig.name}</Text>
        </View>
        <Ionicons name="chevron-down" size={16} color="#636e72" style={styles.chevron} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t.chainSelector.title}</Text>

            {/* Chain Selection */}
            <Text style={styles.sectionTitle}>区块链</Text>
            {getFilteredChains().map((chain) => {
              const config = CHAIN_CONFIGS[chain];
              const isDisabled = config.disabled;
              return (
                <TouchableOpacity
                  key={chain}
                  style={[
                    styles.chainOption,
                    selectedChain === chain && styles.chainOptionActive,
                    isDisabled && styles.chainOptionDisabled,
                  ]}
                  onPress={() => {
                    if (!isDisabled) {
                      onChainChange(chain);
                    }
                  }}
                  disabled={isDisabled}
                >
                  <ChainIcon chain={chain} size={24} disabled={isDisabled} />
                  <View style={styles.chainOptionTextContainer}>
                    <Text style={[
                      styles.chainOptionText,
                      selectedChain === chain && !isDisabled && styles.chainOptionTextActive,
                      isDisabled && styles.chainOptionTextDisabled,
                    ]}>
                      {config.name}
                    </Text>
                    {isDisabled && (
                      <Text style={styles.disabledReason}>{t.chainSelector.comingSoon}</Text>
                    )}
                  </View>
                  {selectedChain === chain && !isDisabled && (
                    <Ionicons name="checkmark" size={20} color="#50d56b" />
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Network Selection */}
            <Text style={styles.sectionTitle}>网络</Text>
            {(Object.keys(NETWORK_CONFIGS) as Network[]).map((network) => {
              const config = NETWORK_CONFIGS[network];
              const isDisabled = config.disabled;
              return (
                <TouchableOpacity
                  key={network}
                  style={[
                    styles.chainOption,
                    selectedNetwork === network && styles.chainOptionActive,
                    isDisabled && styles.chainOptionDisabled,
                  ]}
                  onPress={() => {
                    if (!isDisabled && onNetworkChange) {
                      onNetworkChange(network);
                    }
                  }}
                  disabled={isDisabled}
                >
                  <Ionicons name="cloud-outline" size={24} color={isDisabled ? '#b2bec3' : '#636e72'} />
                  <View style={styles.chainOptionTextContainer}>
                    <Text style={[
                      styles.chainOptionText,
                      selectedNetwork === network && !isDisabled && styles.chainOptionTextActive,
                      isDisabled && styles.chainOptionTextDisabled,
                    ]}>
                      {config.name}
                    </Text>
                    {isDisabled && config.disabledReason && (
                      <Text style={styles.disabledReason}>{config.disabledReason}</Text>
                    )}
                  </View>
                  {selectedNetwork === network && !isDisabled && (
                    <Ionicons name="checkmark" size={20} color="#50d56b" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedChainText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  networkBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  networkBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#43a047',
  },
  chevron: {
    marginLeft: 4,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#50d56b',
    marginLeft: 4,
  },
  networkIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#50d56b',
    marginLeft: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3436',
    marginBottom: 16,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#636e72',
    marginTop: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  chainOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  chainOptionActive: {
    backgroundColor: '#e8f8ec',
    borderWidth: 1,
    borderColor: '#50d56b',
  },
  chainOptionDisabled: {
    opacity: 0.5,
  },
  chainOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#636e72',
    marginLeft: 12,
  },
  chainOptionTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  chainOptionTextActive: {
    color: '#50d56b',
    fontWeight: '600',
  },
  chainOptionTextDisabled: {
    color: '#b2bec3',
  },
  disabledReason: {
    fontSize: 12,
    color: '#b2bec3',
    marginTop: 2,
  },
});
