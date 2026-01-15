import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';

import MobileContainer from './components/MobileContainer';
import AppNavigator from './navigation/AppNavigator';
import { LanguageProvider } from './i18n/LanguageContext';
import { Chain, Network } from './types';

export default function App() {
  const [chain, setChain] = useState<Chain>('solana');
  const [network, setNetwork] = useState<Network>('mainnet');

  useEffect(() => {
    console.log('[App] Mounted');
    console.log('[App] Chain:', chain, 'Network:', network);
  }, [chain, network]);

  try {
    return (
      <LanguageProvider>
        <MobileContainer>
          <StatusBar style="auto" />
          <AppNavigator
            chain={chain}
            network={network}
            onChainChange={setChain}
            onNetworkChange={setNetwork}
          />
        </MobileContainer>
      </LanguageProvider>
    );
  } catch (error) {
    console.error('[App] Render error:', error);
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Error loading app</Text></View>;
  }
}
