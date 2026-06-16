import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export const SUPPORTED_LANGUAGES = ['uk', 'ru', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const STORAGE_KEY = 'app-language'

export function getStoredLanguage(): SupportedLanguage | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
      return stored as SupportedLanguage
    }
  } catch (_) {}
  return null
}

export function setStoredLanguage(lang: SupportedLanguage): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch (_) {}
}

/** Detect initial language at module load — synchronous, no network. */
function detectInitialLang(): SupportedLanguage {
  const stored = getStoredLanguage()
  if (stored) return stored
  try {
    const nav = (navigator.language || 'uk').slice(0, 2).toLowerCase() as SupportedLanguage
    if (SUPPORTED_LANGUAGES.includes(nav)) return nav
  } catch (_) {}
  return 'uk'
}

/**
 * Dynamic-import a locale on first need. Vite turns each branch into its
 * own tiny chunk (~3-4 KB gz per locale) so the initial page only ships
 * the language the user actually reads.
 */
async function loadLocale(lang: SupportedLanguage): Promise<Record<string, any>> {
  switch (lang) {
    case 'ru':
      return (await import('./locales/ru.json')).default
    case 'en':
      return (await import('./locales/en.json')).default
    case 'uk':
    default:
      return (await import('./locales/uk.json')).default
  }
}

const initialLang = detectInitialLang()

i18n.use(initReactI18next).init({
  // Start with the detected lang only; other languages are added via
  // i18n.addResourceBundle the first time `changeLanguageWithLoad` flips
  // to them. fallbackLng intentionally matches initialLang so missing
  // keys don't fall back to a locale we haven't loaded yet.
  resources: {},
  lng: initialLang,
  fallbackLng: initialLang,
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
})

// Kick the initial locale load. UI mounts; first render with i18n may
// fall back to keys for a tick until this resolves — acceptable because
// the locale is tiny and Vite preloads the chunk.
void loadLocale(initialLang).then((translation) => {
  i18n.addResourceBundle(initialLang, 'translation', translation)
  i18n.changeLanguage(initialLang)
})

/**
 * Switch UI language: lazy-load the new locale's resources if we haven't
 * fetched them yet, then flip i18next + persist to localStorage.
 */
export async function changeLanguageWithLoad(lang: SupportedLanguage): Promise<void> {
  if (!i18n.hasResourceBundle(lang, 'translation')) {
    const translation = await loadLocale(lang)
    i18n.addResourceBundle(lang, 'translation', translation)
  }
  await i18n.changeLanguage(lang)
  setStoredLanguage(lang)
}

export default i18n
