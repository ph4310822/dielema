import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useLanguage, Language } from '../i18n/LanguageContext';

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, language === 'zh' && styles.buttonActive]}
        onPress={() => setLanguage('zh')}
      >
        <Text style={[styles.buttonText, language === 'zh' && styles.buttonTextActive]}>
          中文
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, language === 'en' && styles.buttonActive]}
        onPress={() => setLanguage('en')}
      >
        <Text style={[styles.buttonText, language === 'en' && styles.buttonTextActive]}>
          EN
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    padding: 4,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 50,
    alignItems: 'center',
  },
  buttonActive: {
    backgroundColor: '#50d56b',
  },
  buttonText: {
    fontSize: 14,
    color: '#636e72',
    fontWeight: '600',
  },
  buttonTextActive: {
    color: '#fff',
  },
});
