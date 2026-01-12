import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import HomeScreen from '../screens/HomeScreen';
import AddDepositScreen from '../screens/AddDepositScreen';
import ProofOfLifeScreen from '../screens/ProofOfLifeScreen';
import { Chain, Network } from '../types';

export type RootStackParamList = {
  Home: {
    chain?: Chain;
    network?: Network;
  };
  AddDeposit: {
    chain: Chain;
    network: Network;
    walletAddress: string;
  };
  ProofOfLife: {
    depositIndex: number;
    chain: Chain;
    network: Network;
    walletAddress: string;
    depositAddress?: string; // Solana PDA address
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

interface AppNavigatorProps {
  chain: Chain;
  network: Network;
  onChainChange: (chain: Chain) => void;
  onNetworkChange: (network: Network) => void;
}

export default function AppNavigator({ chain, network, onChainChange, onNetworkChange }: AppNavigatorProps) {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen
          name="Home"
          children={(props) => (
            <HomeScreen
              {...props}
              chain={chain}
              network={network}
              onChainChange={onChainChange}
              onNetworkChange={onNetworkChange}
            />
          )}
        />
        <Stack.Screen
          name="AddDeposit"
          component={AddDepositScreen}
        />
        <Stack.Screen
          name="ProofOfLife"
          component={ProofOfLifeScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
