import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';

import MobileContainer from './components/MobileContainer';
import AppNavigator from './navigation/AppNavigator';
import { LanguageProvider } from './i18n/LanguageContext';
import { Chain, Network } from './types';

export default function App() {
  const [chain, setChain] = useState<Chain>('bsc');
  const [network, setNetwork] = useState<Network>('testnet');

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
}
