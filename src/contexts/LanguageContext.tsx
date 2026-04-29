import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'ko' | 'en' | 'ja' | 'th' | 'zh-TW';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider = ({ children }: LanguageProviderProps) => {
  // Detect browser language: 'ko' for Korean, otherwise 'en'
  const getDefaultLanguage = (): Language => {
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage === 'ko' || savedLanguage === 'en' || savedLanguage === 'ja' || savedLanguage === 'th' || savedLanguage === 'zh-TW') {
      return savedLanguage as Language;
    }

    // Detect browser language
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('ko')) return 'ko';
    if (browserLang.startsWith('ja')) return 'ja';
    if (browserLang.startsWith('zh')) return 'zh-TW';
    if (browserLang.startsWith('th')) return 'th';
    return 'en';
  };

  const [language, setLanguage] = useState<Language>(getDefaultLanguage());

  // Save to localStorage when language changes
  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  const value = {
    language,
    setLanguage,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
