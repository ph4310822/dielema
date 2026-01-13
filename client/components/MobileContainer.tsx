import React from 'react';
import { View, StyleSheet, Platform, StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

interface MobileContainerProps {
  children: React.ReactNode;
}

export default function MobileContainer({ children }: MobileContainerProps) {
  // On web, wrap in a fixed-width container centered on screen
  // On native, just return the children as-is (full screen)
  if (Platform.OS === 'web') {
    return (
      <View style={styles.desktopWrapper}>
        <View style={styles.mobileContainer}>
          {children}
        </View>
      </View>
    );
  }

  // On native, use SafeAreaView to handle status bar and system UI insets
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  desktopWrapper: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  },
  mobileContainer: {
    width: 375,
    height: '100vh',
    backgroundColor: '#f5f5f5',
    overflow: 'hidden',
    boxShadow: '0 0 40px rgba(0,0,0,0.15)',
  },
});
