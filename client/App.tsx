import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';

import MobileContainer from './components/MobileContainer';
import AppNavigator from './navigation/AppNavigator';
import { Chain } from './types';

export default function App() {
  const [chain, setChain] = useState<Chain>('bsc');
  const [network, setNetwork] = useState<string>('testnet');

  return (
    <MobileContainer>
      <StatusBar style="auto" />
      <AppNavigator
        chain={chain}
        network={network}
        onChainChange={setChain}
      />
    </MobileContainer>
  );
}
