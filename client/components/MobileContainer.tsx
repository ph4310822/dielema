import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

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

  return <>{children}</>;
}

const styles = StyleSheet.create({
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
