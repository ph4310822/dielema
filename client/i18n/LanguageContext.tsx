import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { translations, Language, TranslationKey } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationKey;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = '@dielema_language';

// Simple storage helper that works on web
const storage = {
  get: async (key: string): Promise<string | null> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (error) {
      console.error('Failed to get from storage:', error);
    }
    return null;
  },
  set: async (key: string, value: string): Promise<void> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (error) {
      console.error('Failed to save to storage:', error);
    }
  },
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('zh');
  const [translationsObj, setTranslationsObj] = useState<TranslationKey>(translations.zh);

  useEffect(() => {
    // Load saved language preference
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const savedLanguage = await storage.get(LANGUAGE_STORAGE_KEY);
      if (savedLanguage === 'en' || savedLanguage === 'zh') {
        setLanguageState(savedLanguage);
        setTranslationsObj(translations[savedLanguage]);
      }
    } catch (error) {
      console.error('Failed to load language preference:', error);
    }
  };

  const setLanguage = async (lang: Language) => {
    try {
      await storage.set(LANGUAGE_STORAGE_KEY, lang);
      setLanguageState(lang);
      setTranslationsObj(translations[lang]);
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }
  };

  const value: LanguageContextType = {
    language,
    setLanguage,
    t: translationsObj,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
