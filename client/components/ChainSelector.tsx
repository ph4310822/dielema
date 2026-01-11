import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Chain = 'bsc' | 'solana' | 'ethereum' | 'polygon';

interface ChainSelectorProps {
  selectedChain: Chain;
  onChainChange: (chain: Chain) => void;
}

const CHAIN_CONFIGS: Record<Chain, { name: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  bsc: { name: 'BSC', icon: 'diamond-outline', color: '#F0B90B' },
  solana: { name: 'Solana', icon: 'radio-button-on-outline', color: '#9945FF' },
  ethereum: { name: 'Ethereum', icon: 'planet-outline', color: '#627EEA' },
  polygon: { name: 'Polygon', icon: 'hexagon-outline', color: '#8247E5' },
};

export default function ChainSelector({ selectedChain, onChainChange }: ChainSelectorProps) {
  const [modalVisible, setModalVisible] = React.useState(false);

  const currentConfig = CHAIN_CONFIGS[selectedChain];

  return (
    <>
      <TouchableOpacity
        style={styles.selector}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name={currentConfig.icon} size={20} color={currentConfig.color} />
        <View style={styles.indicator} />
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
            <Text style={styles.modalTitle}>Select Chain</Text>
            {(Object.keys(CHAIN_CONFIGS) as Chain[]).map((chain) => {
              const config = CHAIN_CONFIGS[chain];
              return (
                <TouchableOpacity
                  key={chain}
                  style={[
                    styles.chainOption,
                    selectedChain === chain && styles.chainOptionActive,
                  ]}
                  onPress={() => {
                    onChainChange(chain);
                    setModalVisible(false);
                  }}
                >
                  <Ionicons name={config.icon} size={24} color={config.color} />
                  <Text style={[
                    styles.chainOptionText,
                    selectedChain === chain && styles.chainOptionTextActive,
                  ]}>
                    {config.name}
                  </Text>
                  {selectedChain === chain && (
                    <Ionicons name="checkmark" size={20} color="#6c5ce7" />
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
    backgroundColor: '#6c5ce7',
    marginLeft: 4,
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
  chainOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  chainOptionActive: {
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: '#6c5ce7',
  },
  chainOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#636e72',
    marginLeft: 12,
  },
  chainOptionTextActive: {
    color: '#6c5ce7',
    fontWeight: '600',
  },
});
