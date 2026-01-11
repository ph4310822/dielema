import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';

import MobileContainer from './components/MobileContainer';
import AppNavigator from './navigation/AppNavigator';
import { Chain } from './types';
import { LanguageProvider } from './i18n/LanguageContext';

export default function App() {
  const [chain, setChain] = useState<Chain>('bnbTestnet');
  const [network, setNetwork] = useState<string>('testnet');

  return (
    <LanguageProvider>
      <MobileContainer>
        <StatusBar style="auto" />
        <AppNavigator
          chain={chain}
          network={network}
          onChainChange={setChain}
        />
      </MobileContainer>
    </LanguageProvider>
  );
}
