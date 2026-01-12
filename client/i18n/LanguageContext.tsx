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
  get: (): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      }
    } catch (error) {
      console.error('Failed to get from storage:', error);
    }
    return null;
  },
  set: (value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
      }
    } catch (error) {
      console.error('Failed to save to storage:', error);
    }
  },
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Load language preference synchronously
  const savedLanguage = storage.get();
  const initialLanguage: Language = (savedLanguage === 'en' || savedLanguage === 'zh') ? savedLanguage : 'zh';

  console.log('[LanguageProvider] Initializing with language:', initialLanguage);
  console.log('[LanguageProvider] Available translations keys:', Object.keys(translations));

  const [language, setLanguageState] = useState<Language>(initialLanguage);

  // Use the translations object directly as the initial state
  const [, forceUpdate] = useState({});

  const loadLanguage = () => {
    const saved = storage.get();
    if (saved === 'en' || saved === 'zh') {
      setLanguageState(saved);
    }
  };

  const setLanguage = (lang: Language) => {
    storage.set(lang);
    setLanguageState(lang);
    // Force re-render
    forceUpdate({});
  };

  // Check for saved language on mount
  useEffect(() => {
    loadLanguage();
  }, []);

  const value: LanguageContextType = {
    language,
    setLanguage,
    t: translations[language],
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
