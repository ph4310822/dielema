import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  console.log('[Test App] Rendering');

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Test App is Working!</Text>
      <Text style={styles.subtext}>If you can see this, React is rendering correctly.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#50d56b',
    padding: 20,
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  subtext: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
});
