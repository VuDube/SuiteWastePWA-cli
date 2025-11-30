import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
const resources = {};

// List of locales to load from /locales/<lng>/translation.json at runtime
const _i18n_locales = ['en', 'zu', 'af'];

/**
 * Load a locale file from the public folder and add it to i18next resource bundles.
 * This is intentionally non-blocking for app startup; errors are caught and logged.
 */
function loadLocale(lng) {
  // eslint-disable-next-line no-void
  void (async () => {
    try {
      const resp = await fetch(`/locales/${lng}/translation.json`);
      if (!resp.ok) {
        throw new Error(`Failed to fetch locale "${lng}": ${resp.status} ${resp.statusText}`);
      }
      const data = await resp.json();
      // addResourceBundle(namespace='translation'), overwrite true to ensure updates replace any placeholder
      i18n.addResourceBundle(lng, 'translation', data, true, true);
    } catch (err) {
      // Don't block startup on missing locale files; log for debugging
      // eslint-disable-next-line no-console
      console.error('i18n: error loading locale', lng, err);
    }
  })();
}

// Kick off non-blocking loads for all configured locales
_i18n_locales.forEach((lng) => loadLocale(lng));
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: ['en', 'zu', 'af'],
    fallbackLng: 'en',
    debug: import.meta.env.DEV,
    detection: {
      order: ['queryString', 'cookie', 'localStorage', 'sessionStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage', 'cookie'],
    },
    react: {
      useSuspense: true,
    },
  });
export default i18n;