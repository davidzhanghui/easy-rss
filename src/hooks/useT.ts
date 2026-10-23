import { translate, type I18nKey } from '../i18n';
import { useSettingsStore } from '../stores/appStore';

/** Reactive translator bound to the current language setting. */
export function useT(): (key: I18nKey) => string {
  const lang = useSettingsStore((s) => s.language);
  return (key: I18nKey) => translate(lang, key);
}
