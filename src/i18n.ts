import i18next from 'i18next';
import fr from './locales/fr-CA.ts';
import en from './locales/en.ts';

export type Locale = 'fr-CA' | 'en';
export type TranslationKey = keyof typeof fr;
export type TranslationParams = Record<string, string | number>;
export type Message = { key: TranslationKey; params?: TranslationParams };
const STORAGE_KEY = 'hunter-language';

export function preferredLocale(stored: string | null): Locale {
  // The requested default is Québec French, even on English-language devices.
  return stored === 'en' ? 'en' : 'fr-CA';
}
function initialLocale(): Locale {
  try { return preferredLocale(localStorage.getItem(STORAGE_KEY)); } catch { return 'fr-CA'; }
}
export const i18n = i18next.createInstance();
void i18n.init({
  resources: { 'fr-CA': { translation: fr }, en: { translation: en } },
  lng: initialLocale(), fallbackLng: 'fr-CA', supportedLngs: ['fr-CA', 'en'],
  load: 'currentOnly', initAsync: false,
  // Values go into DOM textContent or Phaser text, never translated HTML.
  interpolation: { escapeValue: false },
});
export const locale = (): Locale => i18n.language === 'en' ? 'en' : 'fr-CA';
export const t = (key: TranslationKey, params?: TranslationParams): string => String(i18n.t(key, params));

export async function changeLocale(next: Locale) {
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Language switching still works without storage. */ }
  if (locale() !== next) await i18n.changeLanguage(next);
}
export function onLocaleChange(callback: () => void): () => void {
  i18n.on('languageChanged', callback);
  return () => i18n.off('languageChanged', callback);
}

/** Localize shared HTML, metadata, and the language button on either page. */
export function localizeDocument() {
  document.documentElement.lang = locale();
  const credits = document.body.dataset.page === 'credits';
  document.title = t(credits ? 'creditsTitle' : 'siteTitle');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('description'));
  for (const [data, attribute] of [['i18n', null], ['i18nTitle', 'title'], ['i18nLabel', 'aria-label']] as const) {
    const selector = `[data-${data.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}]`;
    document.querySelectorAll<HTMLElement>(selector).forEach(element => {
      const value = t(element.dataset[data] as TranslationKey);
      if (attribute) element.setAttribute(attribute, value);
      else element.textContent = value;
    });
  }
  for (const id of ['language', 'difficulty-language']) {
    const button = document.getElementById(id);
    if (!button) continue;
    button.textContent = locale() === 'fr-CA' ? 'English' : 'Français';
    button.lang = locale() === 'fr-CA' ? 'en' : 'fr-CA';
    button.setAttribute('aria-label', t('switchLanguage'));
    button.title = t('switchLanguage');
  }
  document.querySelector('canvas')?.setAttribute('aria-label', t('canvasLabel'));
}
export function bindLanguageControl() {
  localizeDocument();
  onLocaleChange(localizeDocument);
  for (const id of ['language', 'difficulty-language']) document.getElementById(id)?.addEventListener('click', () => void changeLocale(locale() === 'fr-CA' ? 'en' : 'fr-CA'));
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY || event.key === null) void i18n.changeLanguage(preferredLocale(event.newValue));
  });
}
