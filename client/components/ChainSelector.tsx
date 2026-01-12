import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../i18n/LanguageContext';

type Chain = 'bsc' | 'solana' | 'ethereum' | 'polygon';
type Network = 'mainnet' | 'testnet' | 'devnet';

interface ChainSelectorProps {
  selectedChain: Chain;
  selectedNetwork: Network;
  onChainChange: (chain: Chain) => void;
  onNetworkChange?: (network: Network) => void;
}

const CHAIN_CONFIGS: Record<Chain, { name: string; icon: keyof typeof Ionicons.glyphMap; color: string; disabled: boolean }> = {
  bsc: { name: 'BNB Chain', icon: 'diamond-outline', color: '#F0B90B', disabled: false },
  solana: { name: 'Solana', icon: 'radio-button-on-outline', color: '#9945FF', disabled: true },
  ethereum: { name: 'Ethereum', icon: 'planet-outline', color: '#627EEA', disabled: true },
  polygon: { name: 'Polygon', icon: 'hexagon-outline', color: '#8247E5', disabled: true },
};

const NETWORK_CONFIGS: Record<Network, { name: string; disabled: boolean; disabledReason?: string }> = {
  testnet: { name: 'Testnet', disabled: false },
  mainnet: { name: 'Mainnet', disabled: true, disabledReason: 'Coming soon' },
  devnet: { name: 'Devnet', disabled: true, disabledReason: 'Coming soon' },
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
        <Ionicons name={currentConfig.icon} size={20} color={currentConfig.color} />
        <View style={styles.networkIndicator} />
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
            {(Object.keys(CHAIN_CONFIGS) as Chain[]).map((chain) => {
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
                  <Ionicons name={config.icon} size={24} color={isDisabled ? '#b2bec3' : config.color} />
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
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
