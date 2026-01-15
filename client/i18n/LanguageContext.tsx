import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { translations, Language, TranslationKey } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationKey;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Default to Chinese (zh) as no localStorage persistence
  const initialLanguage: Language = 'zh';

  console.log('[LanguageProvider] Initializing with language:', initialLanguage);
  console.log('[LanguageProvider] Available translations keys:', Object.keys(translations));

  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const [, forceUpdate] = useState({});

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    // Force re-render
    forceUpdate({});
  };

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
