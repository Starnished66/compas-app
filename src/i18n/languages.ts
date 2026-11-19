export type Language = 'en' | 'es' | 'de' | 'fr' | 'it' | 'ru' | 'fi' | 'ja' | 'nl' | 'pt_BR' | 'pt_PT' | 'uk' | 'vi' | 'zh_CN';
export type LanguagePreference = Language | 'system';

export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: LanguagePreference; label: string }> = [
  { value: 'system', label: 'System default' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'it', label: 'Italiano' },
  { value: 'ru', label: 'Русский' },
  { value: 'fi', label: 'Suomi' },
  { value: 'ja', label: '日本語' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'pt_BR', label: 'Português (Brasil)' },
  { value: 'pt_PT', label: 'Português (Portugal)' },
  { value: 'uk', label: 'Українська' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'zh_CN', label: '简体中文' },
];
