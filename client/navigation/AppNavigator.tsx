import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import HomeScreen from '../screens/HomeScreen';
import AddDepositScreen from '../screens/AddDepositScreen';
import ProofOfLifeScreen from '../screens/ProofOfLifeScreen';
import { Chain } from '../types';

export type RootStackParamList = {
  Home: {
    chain?: Chain;
    network?: string;
  };
  AddDeposit: {
    chain: Chain;
    network: string;
    walletAddress: string;
  };
  ProofOfLife: {
    depositIndex: number;
    chain: Chain;
    network: string;
    walletAddress: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

interface AppNavigatorProps {
  chain: Chain;
  network: string;
  onChainChange: (chain: Chain) => void;
}

export default function AppNavigator({ chain, network, onChainChange }: AppNavigatorProps) {
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
