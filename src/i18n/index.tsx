import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { catalogs, LANGUAGE_OPTIONS, Language } from './catalogs';
import { resolveLanguage, translate, TranslationVariables } from './translate';

export { LANGUAGE_OPTIONS };
export type { Language } from './catalogs';
export { normalizeLanguageTag, resolveLanguage, translate } from './translate';
export type { TranslationVariables } from './translate';
export type LanguagePreference = Language | 'system';

const STORAGE_KEY = 'compas_remote.language';
const LANGUAGE_VALUES = new Set<string>(Object.keys(catalogs));

function systemLanguage(): Language {
  try {
    const localeIdentifier = (I18nManager.getConstants() as unknown as { localeIdentifier?: string }).localeIdentifier;
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    return resolveLanguage('system', localeIdentifier || intlLocale);
  } catch {
    return 'en';
  }
}

type I18nValue = {
  t: (source: string, variables?: TranslationVariables) => string;
  language: Language;
  languagePreference: LanguagePreference;
  setLanguage: (preference: LanguagePreference) => Promise<void>;
};

const fallbackValue: I18nValue = {
  t: (source, variables) => translate(source, 'en', variables),
  language: 'en',
  languagePreference: 'system',
  setLanguage: async () => undefined,
};

const I18nContext = createContext<I18nValue>(fallbackValue);

function readPreference(value: string | null): LanguagePreference | null {
  if (value === 'system') return 'system';
  return value && LANGUAGE_VALUES.has(value) ? value as Language : null;
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>('system');
  const [deviceLanguage, setDeviceLanguage] = useState(systemLanguage);
  const revision = useRef(0);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      const preference = readPreference(stored);
      if (active && revision.current === 0 && preference) setLanguagePreference(preference);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const refreshSystemLanguage = () => {
      const next = systemLanguage();
      setDeviceLanguage((current) => current === next ? current : next);
    };
    refreshSystemLanguage();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshSystemLanguage();
    });
    return () => subscription.remove();
  }, []);

  const language = languagePreference === 'system' ? deviceLanguage : languagePreference;
  const t = useCallback((source: string, variables?: TranslationVariables) => translate(source, language, variables), [language]);
  const setLanguage = useCallback(async (preference: LanguagePreference) => {
    revision.current += 1;
    setLanguagePreference(preference);
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(async () => {
        await AsyncStorage.setItem(STORAGE_KEY, preference);
      })
      .catch(() => undefined);
    await writeQueue.current;
  }, []);

  const value = useMemo(() => ({ t, language, languagePreference, setLanguage }), [t, language, languagePreference, setLanguage]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
