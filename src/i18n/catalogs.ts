import type { Language } from './languages';

export type TranslationValue = string | Partial<Record<Intl.LDMLPluralRule, string>>;
export type TranslationCatalog = Record<string, TranslationValue>;

const loaders: Record<Language, () => TranslationCatalog> = {
  en: () => (require('./catalogs/en') as typeof import('./catalogs/en')).en,
  es: () => (require('./catalogs/es') as typeof import('./catalogs/es')).es,
  de: () => (require('./catalogs/de') as typeof import('./catalogs/de')).de,
  fr: () => (require('./catalogs/fr') as typeof import('./catalogs/fr')).fr,
  it: () => (require('./catalogs/it') as typeof import('./catalogs/it')).it,
  ru: () => (require('./catalogs/ru') as typeof import('./catalogs/ru')).ru,
  fi: () => (require('./catalogs/fi') as typeof import('./catalogs/fi')).fi,
  ja: () => (require('./catalogs/ja') as typeof import('./catalogs/ja')).ja,
  nl: () => (require('./catalogs/nl') as typeof import('./catalogs/nl')).nl,
  pt_BR: () => (require('./catalogs/pt_BR') as typeof import('./catalogs/pt_BR')).pt_BR,
  pt_PT: () => (require('./catalogs/pt_PT') as typeof import('./catalogs/pt_PT')).pt_PT,
  uk: () => (require('./catalogs/uk') as typeof import('./catalogs/uk')).uk,
  vi: () => (require('./catalogs/vi') as typeof import('./catalogs/vi')).vi,
  zh_CN: () => (require('./catalogs/zh_CN') as typeof import('./catalogs/zh_CN')).zh_CN,
};

export function loadCatalog(language: Language): TranslationCatalog {
  return loaders[language]();
}
