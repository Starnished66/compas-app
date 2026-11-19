import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, TurboModule, TurboModuleRegistry } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANGUAGE_OPTIONS, Language, LanguagePreference } from './languages';
import { resolveLanguage, translate, translatorFor, TranslationVariables } from './translate';

export { LANGUAGE_OPTIONS };
export type { Language, LanguagePreference } from './languages';
export { normalizeLanguageTag, resolveLanguage, translate } from './translate';
export type { TranslationVariables } from './translate';

const STORAGE_KEY = 'compas_remote.language';
const LANGUAGE_VALUES = new Set<string>(LANGUAGE_OPTIONS.map(({ value }) => value));

interface NativeLocale extends TurboModule {
  getConstants(): { localeIdentifier?: string };
}

function systemLanguage(): Language {
  try {
    // React Native's public I18nManager caches its constants at import time.
    const nativeLocale = TurboModuleRegistry.get<NativeLocale>('I18nManager')?.getConstants().localeIdentifier;
    return resolveLanguage('system', nativeLocale || Intl.DateTimeFormat().resolvedOptions().locale);
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

const I18nContext = createContext<I18nValue>({
  t: (source, variables) => translate(source, 'en', variables),
  language: 'en',
  languagePreference: 'system',
  setLanguage: async () => undefined,
});

function readPreference(value: string | null): LanguagePreference {
  return value && LANGUAGE_VALUES.has(value) ? value as LanguagePreference : 'system';
}

function selectLanguage(languagePreference: LanguagePreference) {
  return {
    languagePreference,
    language: languagePreference === 'system' ? systemLanguage() : languagePreference,
  };
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [selection, setSelection] = useState<ReturnType<typeof selectLanguage> | null>(null);
  const changedByUser = useRef(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).catch(() => null).then((stored) => {
      if (active && !changedByUser.current) setSelection(selectLanguage(readPreference(stored)));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setSelection((current) => {
        if (current?.languagePreference !== 'system') return current;
        const next = selectLanguage('system');
        return next.language === current.language ? current : next;
      });
    });
    return () => subscription.remove();
  }, []);

  const setLanguage = useCallback(async (preference: LanguagePreference) => {
    changedByUser.current = true;
    setSelection(selectLanguage(preference));
    writeQueue.current = writeQueue.current
      .then(() => AsyncStorage.setItem(STORAGE_KEY, preference))
      .catch(() => undefined);
    await writeQueue.current;
  }, []);

  const language = selection?.language;
  const t = useMemo(() => language ? translatorFor(language) : null, [language]);
  const value = useMemo(() => selection && t ? { ...selection, t, setLanguage } : null, [selection, t, setLanguage]);
  return value ? <I18nContext.Provider value={value}>{children}</I18nContext.Provider> : null;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
